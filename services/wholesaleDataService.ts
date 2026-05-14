import { supabase } from './supabaseClient';
import { WSCustomer, WSProduct, WSDelivery, WSPayment, WSLedgerEntry } from '../types/wholesale';

// Safe UUID generator — uses native crypto.randomUUID when available
// (HTTPS / modern browsers), falls back to a v4 generator built on
// crypto.getRandomValues, and finally to Math.random. Index.tsx installs
// the same polyfill globally; this is a belt-and-braces local copy so the
// service module is self-sufficient even if the polyfill is bypassed.
function safeUUID(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
      return (crypto as any).randomUUID();
    }
  } catch { /* fall through */ }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof (crypto as any).getRandomValues === 'function') {
    (crypto as any).getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex: string[] = [];
  for (let i = 0; i < 256; i++) hex.push((i + 0x100).toString(16).slice(1));
  return (
    hex[bytes[0]] + hex[bytes[1]] + hex[bytes[2]] + hex[bytes[3]] + '-' +
    hex[bytes[4]] + hex[bytes[5]] + '-' +
    hex[bytes[6]] + hex[bytes[7]] + '-' +
    hex[bytes[8]] + hex[bytes[9]] + '-' +
    hex[bytes[10]] + hex[bytes[11]] + hex[bytes[12]] + hex[bytes[13]] + hex[bytes[14]] + hex[bytes[15]]
  );
}

export const wholesaleDataService = {
  async fetchAllWholesaleCustomers(): Promise<WSCustomer[]> {
    // Phase 11 (2026-05-14): switched from a direct SELECT (subject to RLS
    // and header-flow oddities) to a SECURITY DEFINER RPC that does its
    // own OWNER check internally. Single source of truth, can't be silently
    // blocked by RLS. Returns { success, customers } or { success:false, error }.
    try {
      const { data, error } = await supabase.rpc('list_ws_customers', { p_include_inactive: true });
      if (error) {
        console.error('[wholesale] list_ws_customers RPC error:', error);
        // Fall back to the legacy SELECT for older databases that don't have the RPC.
        const fallback = await supabase
          .from('ws_wholesale_customers')
          .select('*')
          .eq('deleted', false)
          .order('name');
        if (fallback.error) {
          console.error('[wholesale] fallback SELECT also failed:', fallback.error);
          return [];
        }
        console.log('[wholesale] fallback SELECT returned', fallback.data?.length || 0, 'rows');
        return fallback.data || [];
      }
      if (data && (data as any).success === false) {
        console.error('[wholesale] list_ws_customers refused:', (data as any).error);
        return [];
      }
      const rows = ((data as any)?.customers as WSCustomer[]) || [];
      console.log('[wholesale] list_ws_customers returned', rows.length, 'customers');
      return rows;
    } catch (err) {
      console.error('[wholesale] fetchAllWholesaleCustomers crashed:', err);
      return [];
    }
  },

  // Phase 9 (2026-05-13): all wholesale writes go through atomic RPCs
  // matching the retail pattern. The old bare upserts skipped period
  // lock, idempotency, audit logging, and version OCC. RPCs handle all
  // four invariants on the server.
  async saveWholesaleCustomer(customer: WSCustomer): Promise<WSCustomer | null> {
    // Strip empty id so the DB generates one (avoids client-side UUID dependency).
    const payload: any = { ...customer };
    if (!payload.id || payload.id === '__new__') delete payload.id;

    const { data, error } = await supabase.rpc('save_ws_customer', { p_customer: payload });
    if (error) {
      console.error('Error saving wholesale customer to cloud:', error);
      throw new Error(error.message || 'Failed to save customer');
    }
    // RPC now returns { success, customer } on OK or { success:false, error_stage, error } on fail.
    if (data && (data as any).success === false) {
      const stage = (data as any).error_stage || 'unknown';
      const msg = (data as any).error || 'Unknown error';
      throw new Error(`[${stage}] ${msg}`);
    }
    return (data as any)?.customer || null;
  },

  async fetchAllProducts(): Promise<WSProduct[]> {
    try {
      const { data, error } = await supabase
        .from('ws_products')
        .select('*')
        .eq('deleted', false)
        .order('name');
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching wholesale products:', err);
      return [];
    }
  },

  async saveDeliveryEntries(entries: WSDelivery[]): Promise<WSDelivery[] | null> {
    if (!entries || entries.length === 0) return [];
    // Generated `total_amount` column is computed server-side; strip it.
    const payload = entries.map(entry => {
      const { total_amount, ...rest } = entry as any;
      return {
        ...rest,
        client_request_id: rest.client_request_id || rest.id || safeUUID(),
      };
    });
    const { data, error } = await supabase.rpc('save_ws_delivery_batch', { p_entries: payload });
    if (error) {
      console.error('Error saving wholesale deliveries to cloud:', error);
      throw new Error(error.message || 'Failed to save delivery');
    }
    return ((data as any)?.results || []).map((r: any) => r.delivery as WSDelivery);
  },

  async savePayment(payment: WSPayment): Promise<WSPayment | null> {
    const payload = {
      ...payment,
      client_request_id: payment.client_request_id || payment.id || safeUUID(),
    };
    const { data, error } = await supabase.rpc('save_ws_payment', { p_payment: payload });
    if (error) {
      console.error('Error saving wholesale payment to cloud:', error);
      throw new Error(error.message || 'Failed to save payment');
    }
    return (data as any)?.payment || null;
  },

  // Phase 2 fix (2026-05-09): the previous offline-fallback called an
  // `addToQueue` symbol that does not exist anywhere in the codebase, so
  // any delete attempted offline crashed with a ReferenceError and the
  // caller was told the delete had succeeded. We now refuse the delete
  // when offline and surface the real network error otherwise.
  async deleteDelivery(id: string): Promise<boolean> {
    if (!navigator.onLine) {
      console.warn('deleteDelivery refused: device is offline');
      return false;
    }
    try {
      const { data, error } = await supabase.rpc('soft_delete_ws_delivery', { p_id: id });
      if (error) throw error;
      return !!(data as any)?.success;
    } catch (err) {
      console.error('Error deleting wholesale delivery from cloud:', err);
      return false;
    }
  },

  async deletePayment(id: string): Promise<boolean> {
    if (!navigator.onLine) {
      console.warn('deletePayment refused: device is offline');
      return false;
    }
    try {
      const { data, error } = await supabase.rpc('soft_delete_ws_payment', { p_id: id });
      if (error) throw error;
      return !!(data as any)?.success;
    } catch (err) {
      console.error('Error deleting wholesale payment from cloud:', err);
      return false;
    }
  },

  async fetchLedger(customerId?: string, fromDate?: string, toDate?: string): Promise<WSLedgerEntry[]> {
    try {
      let delQuery = supabase.from('ws_deliveries').select('*, ws_products(name)').eq('deleted', false);
      let payQuery = supabase.from('ws_payments').select('*').eq('deleted', false);

      if (customerId) {
        delQuery = delQuery.eq('customer_id', customerId);
        payQuery = payQuery.eq('customer_id', customerId);
      }
      if (fromDate) {
        delQuery = delQuery.gte('date', fromDate);
        payQuery = payQuery.gte('date', fromDate);
      }
      if (toDate) {
        delQuery = delQuery.lte('date', toDate);
        payQuery = payQuery.lte('date', toDate);
      }

      const [delRes, payRes] = await Promise.all([delQuery, payQuery]);
      
      if (delRes.error) throw delRes.error;
      if (payRes.error) throw payRes.error;

      const ledger: WSLedgerEntry[] = [];

      (delRes.data || []).forEach((d: any) => {
        ledger.push({
          id: d.id,
          date: d.date,
          customer_id: d.customer_id,
          type: 'delivery',
          product_id: d.product_id,
          product_name: d.ws_products?.name || 'Unknown Product',
          quantity: d.quantity,
          rate: d.rate,
          amount: d.total_amount || (d.quantity * d.rate),
          note: d.note,
          is_adjustment: d.is_adjustment,
          adjustment_note: d.adjustment_note,
          created_at: d.created_at
        });
      });

      (payRes.data || []).forEach((p: any) => {
        ledger.push({
          id: p.id,
          date: p.date,
          customer_id: p.customer_id,
          type: 'payment',
          amount: p.amount,
          note: p.note,
          created_at: p.created_at
        });
      });

      return ledger.sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
    } catch (err) {
      console.error('Error fetching wholesale ledger:', err);
      return [];
    }
  },

  async getCustomerBalance(customerId: string): Promise<number> {
    try {
      const { data: customer, error: custErr } = await supabase
        .from('ws_wholesale_customers')
        .select('opening_balance')
        .eq('id', customerId)
        .eq('deleted', false)
        .single();
      
      if (custErr) throw custErr;

      const { data: deliveries, error: delErr } = await supabase
        .from('ws_deliveries')
        .select('total_amount, quantity, rate')
        .eq('customer_id', customerId)
        .eq('deleted', false);
      
      if (delErr) throw delErr;

      const { data: payments, error: payErr } = await supabase
        .from('ws_payments')
        .select('amount')
        .eq('customer_id', customerId)
        .eq('deleted', false);
      
      if (payErr) throw payErr;

      const totalDelivered = (deliveries || []).reduce((sum, d) => sum + (d.total_amount || (d.quantity * d.rate)), 0);
      const totalPaid = (payments || []).reduce((sum, p) => sum + p.amount, 0);

      return (customer?.opening_balance || 0) + totalDelivered - totalPaid;
    } catch (err) {
      console.error('Error getting customer balance:', err);
      return 0;
    }
  },

  async fetchDashboardSummary(): Promise<{
    totalOutstanding: number,
    todayMilkLiters: number,
    todayYogurtKg: number,
    todayCash: number,
    topCustomers: { name: string, balance: number }[]
  }> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data: customers } = await supabase.from('ws_wholesale_customers').select('*').eq('active', true).eq('deleted', false);
      const { data: deliveries } = await supabase.from('ws_deliveries').select('*, ws_products(name)').eq('deleted', false);
      const { data: payments } = await supabase.from('ws_payments').select('*').eq('deleted', false);

      const balances = new Map<string, number>();
      let totalOutstanding = 0;

      (customers || []).forEach(c => {
        const cDels = (deliveries || []).filter(d => d.customer_id === c.id);
        const cPays = (payments || []).filter(p => p.customer_id === c.id);
        
        const totalDel = cDels.reduce((sum, d) => sum + (d.total_amount || (d.quantity * d.rate)), 0);
        const totalPay = cPays.reduce((sum, p) => sum + p.amount, 0);
        const bal = (c.opening_balance || 0) + totalDel - totalPay;
        
        balances.set(c.id, bal);
        totalOutstanding += bal;
      });

      const topCustomers = (customers || [])
        .map(c => ({ name: c.name, balance: balances.get(c.id) || 0 }))
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 5);

      const todayDeliveries = (deliveries || []).filter(d => d.date === today);
      const todayMilkLiters = todayDeliveries
        .filter(d => d.ws_products?.name?.toLowerCase().includes('milk'))
        .reduce((sum, d) => sum + d.quantity, 0);
      const todayYogurtKg = todayDeliveries
        .filter(d => d.ws_products?.name?.toLowerCase().includes('yogurt'))
        .reduce((sum, d) => sum + d.quantity, 0);

      const todayCash = (payments || [])
        .filter(p => p.date === today)
        .reduce((sum, p) => sum + p.amount, 0);

      return {
        totalOutstanding,
        todayMilkLiters,
        todayYogurtKg,
        todayCash,
        topCustomers
      };
    } catch (err) {
      console.error('Error fetching dashboard summary:', err);
      return { totalOutstanding: 0, todayMilkLiters: 0, todayYogurtKg: 0, todayCash: 0, topCustomers: [] };
    }
  },

  async getNextInvoiceNumber(): Promise<string | null> {
    try {
      const { data, error } = await supabase.rpc('get_next_invoice_number');
      
      if (error) throw error;
      if (typeof data !== 'number') throw new Error('Invoice counter did not return a number');
      
      const invoiceNumber = data as number;
      return `INV-${invoiceNumber.toString().padStart(4, '0')}`;
    } catch (err) {
      console.error('Error getting invoice number:', err);
      return null;
    }
  }
};
