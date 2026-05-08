
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Users, LogOut, Settings, ReceiptText, Activity, Scale,
  Loader2, Container, ClipboardList, CreditCard,
  Power, Fuel, X, Calculator,
  UserX, Zap, BarChart3, MessageCircle, Home, MoreHorizontal, Wallet, Warehouse, ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase, isCloudConnected, testConnection } from './services/supabaseClient';
import {
  Customer, Rider, Delivery, Payment, PriceRecord, Expense,
  UserRole, RiderLoad, RiderClosingRecord, MonthlyArchive, AuditLog, BaseEntity,
  PaymentMode
} from './types';

// Phase 1 fix (2026-05-09): translate Supabase / Postgres error codes into
// human-readable text. The OCC trigger raises `P0001` ("Concurrency Conflict:
// Stale data update blocked"); previously the app swallowed this and the
// losing device kept showing its stale value, causing ledger drift between
// Owner and Rider devices. We now surface it explicitly so the user knows to
// reload before trusting the number on screen.
const explainSupabaseError = (err: any): string => {
  const code = err?.code || '';
  const msg = (err?.message || String(err) || '').toString();
  if (code === 'P0001' || /Concurrency Conflict/i.test(msg)) {
    return 'Sync conflict: another device just updated this record. Tap the refresh button at the top right and try again. (Your last entry was NOT saved.)';
  }
  if (code === '23505' || /duplicate key/i.test(msg)) {
    return 'Duplicate record blocked by the server. Please refresh and check before re-entering.';
  }
  if (/Failed to fetch|NetworkError|network/i.test(msg)) {
    return 'No internet connection to the cloud. Your entry was NOT saved. Reconnect and try again.';
  }
  return msg || 'Unknown error.';
};
import { getStoredData, saveToStore, generateId } from './services/dataStore';
import { relationalDataService } from './services/relationalDataService';

// Components
import Dashboard from './components/Dashboard';
import CustomerManagement from './components/CustomerManagement';
import DeliveryEntry from './components/DeliveryEntry';
import PriceManagement from './components/PriceManagement';
import StaffManagement from './components/StaffManagement';
import ExpenseManagement from './components/ExpenseManagement';
import Reports from './components/Ledger';
import RiderClosing from './components/RiderClosing';
import ArchiveManager from './components/ArchiveManager';
import DispatchHub from './components/DispatchHub';
import BillingTracker from './components/BillingTracker';
import DailyLog from './components/DailyLog';
import Analytics from './components/Analytics';
import RiderCalculator from './components/RiderCalculator';
import NotTakenToday from './components/NotTakenToday';
import SessionIntelligence from './components/SessionIntelligence';
import BusinessInsights from './components/BusinessInsights';
import DailyWhatsAppUpdates from './components/DailyWhatsAppUpdates';
import SyncStatusBar from './components/SyncStatusBar';
import SyncSpinner from './components/SyncSpinner';
import IntegrityStatusBadge from './components/IntegrityStatusBadge';
import FinancialSummary from './components/FinancialSummary';
import WholesaleHub from './components/wholesale/WholesaleHub';
import LiveReconcile from './components/LiveReconcile';


let storageWarningShownThisSession = false;

const checkStorageHealth = async (): Promise<{
  isLow: boolean;
  percentUsed: number;
  remainingMB: number;
}> => {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;
      if (quota === 0) return { isLow: false, percentUsed: 0, remainingMB: 999 };
      const percentUsed = (used / quota) * 100;
      const remainingMB = (quota - used) / (1024 * 1024);
      // Only warn when critically full (>90% AND less than 2MB left)
      const isLow = percentUsed > 90 && remainingMB < 2;
      return { isLow, percentUsed, remainingMB };
    }
    return { isLow: false, percentUsed: 0, remainingMB: 999 };
  } catch {
    return { isLow: false, percentUsed: 0, remainingMB: 999 };
  }
};

const App: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isCalcOpen, setIsCalcOpen] = useState(false);
  const [calcSelectedCustomer, setCalcSelectedCustomer] = useState<Customer | null>(null);
  
  const [integrityStatus, setIntegrityStatus] = useState<'verified' | 'syncing' | 'conflict' | 'warning'>('verified');

  // Auth & Global Filter
  const [currentUser, setCurrentUser] = useState<{role: UserRole, id?: string} | null>(null);
  const [globalFilterRiderId, setGlobalFilterRiderId] = useState<string>('all');
  const [pinInput, setPinInput] = useState('');
  const [loginError, setLoginError] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Business State
  const [customers, setCustomers] = useState<Customer[]>(() => getStoredData('customers', []));
  const [riders, setRiders] = useState<Rider[]>(() => getStoredData('riders', []));
  const [deliveries, setDeliveries] = useState<Delivery[]>(() => getStoredData('deliveries', []));
  const [payments, setPayments] = useState<Payment[]>(() => getStoredData('payments', []));
  const [prices, setPrices] = useState<PriceRecord[]>(() => getStoredData('prices', []));
  const [expenses, setExpenses] = useState<Expense[]>(() => getStoredData('expenses', []));
  const [riderLoads, setRiderLoads] = useState<RiderLoad[]>(() => getStoredData('riderLoads', []));
  
  // Large data — never stored in localStorage, always fetched from Supabase
  const [archives, setArchives] = useState<MonthlyArchive[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [closingRecords, setClosingRecords] = useState<RiderClosingRecord[]>([]);
  
  const parseDateParts = (dateStr: string) => {
    const parts = (dateStr || '').substring(0, 10).split('-');
    return {
      year: parseInt(parts[0], 10) || 0,
      month: (parseInt(parts[1], 10) || 1) - 1, // 0-indexed month
      day: parseInt(parts[2], 10) || 0
    };
  };
  
  



  // Refs to avoid stale closures
  const customersRef = useRef<Customer[]>(customers);
  useEffect(() => { customersRef.current = customers; }, [customers]);

  const setSyncing = useCallback((isSyncing: boolean, newLastSynced?: string) => {
    window.dispatchEvent(new CustomEvent('sync-status-change', { detail: { syncing: isSyncing, lastSynced: newLastSynced } }));
  }, []);

  useEffect(() => {
    const handleStorageWarning = () => {
      // Triggered by QuotaExceededError in dataStore.ts
      if (!storageWarningShownThisSession) {
        storageWarningShownThisSession = true;
        setIntegrityStatus('warning');
      }
    };
    window.addEventListener('storage_warning', handleStorageWarning);
    return () => window.removeEventListener('storage_warning', handleStorageWarning);
  }, []);

  useEffect(() => {
    if (activeTab === 'setup' && currentUser?.role === UserRole.OWNER) {
      checkStorageHealth().then(health => {
        if (health.isLow && !storageWarningShownThisSession) {
          storageWarningShownThisSession = true;
          setIntegrityStatus('warning');
        }
      });
    }
  }, [activeTab, currentUser]);

  const balances = useMemo(() => {
    const localBalances: Record<string, number> = {};
    customers.forEach(c => {
      // Ensure openingBalance is a number and handled precisely
      const startBal = Number(c.openingBalance) || 0;

      // Filter active records for this customer
      const customerDeliveries = (deliveries || [])
        .filter(d => d.customerId === c.id && !d.deleted);
      
      const customerPayments = (payments || [])
        .filter(p => p.customerId === c.id && !p.deleted);
      
      // Strict de-duplication at calculation time to prevent ghost amounts
      const uniqueDeliveries = Array.from(new Map(customerDeliveries.map(d => [d.id, d])).values());
      const uniquePayments = Array.from(new Map(customerPayments.map(p => [p.id, p])).values());
      
      const totalD = uniqueDeliveries
        .reduce((sum, d) => {
          const val = Number(d.totalAmount);
          return sum + (isNaN(val) ? 0 : val);
        }, 0);
        
      const totalP = uniquePayments
        .reduce((sum, p) => {
          const val = Number(p.amount);
          return sum + (isNaN(val) ? 0 : val);
        }, 0);
      
      // Result is rounded to 2 decimal places to avoid floating point drift
      localBalances[c.id] = Math.round((startBal + totalD - totalP) * 100) / 100;
    });
    return localBalances;
  }, [customers, deliveries, payments]);

  const fetchCloudData = useCallback(async () => {
    if (!isCloudConnected()) return;
    setSyncing(true);
    setIntegrityStatus('syncing');
    try {
      const p = await relationalDataService.fetchAll();
      
      const sanitize = <T extends BaseEntity>(arr: T[]) => {
        const unique = Array.from(new Map((arr || []).map(item => [item.id, item])).values());
        return unique.filter(item => !item.deleted);
      };
      
      const secureCustomers = sanitize(p.customers);
      
      // Update opening balances from server view if available
      if (p.serverBalances && Object.keys(p.serverBalances).length > 0) {
        secureCustomers.forEach(c => {
           c.openingBalance = p.serverBalances[c.id] !== undefined ? p.serverBalances[c.id] : c.openingBalance;
        });
      }

      setCustomers(secureCustomers);
      setRiders(sanitize(p.riders));
      setDeliveries(sanitize(p.deliveries));
      setPayments(sanitize(p.payments));
      setPrices(sanitize(p.prices));
      setExpenses(sanitize(p.expenses));
      setRiderLoads(sanitize(p.riderLoads));
      setClosingRecords(sanitize(p.closingRecords));
      setArchives(sanitize(p.archives));
      setAuditLogs(sanitize(p.auditLogs));

      saveToStore('customers', sanitize(p.customers));
      saveToStore('riders', sanitize(p.riders));
      saveToStore('deliveries', sanitize(p.deliveries));
      saveToStore('payments', sanitize(p.payments));
      saveToStore('prices', sanitize(p.prices));
      saveToStore('expenses', sanitize(p.expenses));
      saveToStore('riderLoads', sanitize(p.riderLoads));
      // archives, auditLogs, closingRecords — NOT saved to localStorage
      
      setIntegrityStatus('verified');
      setSyncing(false, new Date().toLocaleTimeString());
    } catch (err) {
      console.error('fetchCloudData error:', err);
      setIntegrityStatus('conflict');
      setSyncing(false);
    }
  }, [setSyncing]);

  const fetchCloudDataRef = useRef(fetchCloudData);

  useEffect(() => {
    fetchCloudDataRef.current = fetchCloudData;
  }, [fetchCloudData]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveToStore('customers', customers);
      saveToStore('riders', riders);
      saveToStore('deliveries', deliveries);
      saveToStore('payments', payments);
      saveToStore('prices', prices);
      saveToStore('expenses', expenses);
      saveToStore('riderLoads', riderLoads);
      // Large records never touch localStorage
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [customers, riders, deliveries, payments, prices, expenses, riderLoads]);

  // Phase 2 (2026-05-09): month-close is now ATOMIC via the
  // close_month_transactional Postgres function. The previous client-side
  // version did 8 separate writes that could half-finish if the network
  // dropped or a rider's device pushed a delivery mid-close, corrupting
  // the ledger irreversibly. The new flow:
  //   1) call preview_month_close (read-only) and show the Owner the
  //      counts + top 10 balance changes for sanity check.
  //   2) require an Owner-typed confirmation phrase.
  //   3) call close_month_transactional which runs everything in a single
  //      Postgres transaction. Either it ALL succeeds or NOTHING changes.
  //   4) re-fetch from the cloud so every device sees identical state.
  const onCloseMonth = useCallback(async (year: number, month: number) => {
    const monthName = new Date(year, month).toLocaleString('default', { month: 'long' });

    setLoading(true);
    try {
      const { data: preview, error: prevErr } = await supabase.rpc('preview_month_close', {
        p_year: year,
        p_month: month
      });
      if (prevErr) throw prevErr;

      if (preview?.already_closed) {
        alert(`${monthName} ${year} is ALREADY CLOSED. The system refused to close it again.\n\nIf the active ledger still shows entries from that month, press the refresh button at the top right and they should disappear.`);
        return;
      }

      const fmt = (n: any) => `Rs. ${Math.round(Number(n) || 0).toLocaleString('en-PK')}`;
      const topLines: string[] = (preview?.top_changes || [])
        .slice(0, 5)
        .map((t: any) => `  • ${t.name}: ${fmt(t.old_balance)} → ${fmt(t.new_balance)}  (Δ ${fmt(t.change)})`);

      const summary =
        `PREVIEW — Close ${monthName} ${year}\n\n` +
        `This will archive:\n` +
        `  • ${preview?.deliveries_count ?? 0} deliveries (${fmt(preview?.deliveries_total)})\n` +
        `  • ${preview?.payments_count ?? 0} payments (${fmt(preview?.payments_total)})\n` +
        `  • ${preview?.expenses_count ?? 0} expenses (${fmt(preview?.expenses_total)})\n\n` +
        `Top 5 customer balance changes:\n` +
        (topLines.length ? topLines.join('\n') : '  (none)') +
        `\n\nThe action is ATOMIC and IRREVERSIBLE.\n\n` +
        `To confirm, click OK. To cancel, click Cancel.`;

      if (!window.confirm(summary)) return;

      // Second-stage typed confirmation — last line of defence against accidental clicks.
      const phrase = `CLOSE ${monthName.toUpperCase()}`;
      const typed = window.prompt(`Final confirmation. Type the exact phrase to proceed:\n\n${phrase}`);
      if (typed?.trim() !== phrase) {
        alert('Confirmation phrase did not match. Month-close ABORTED. No changes were made.');
        return;
      }

      const { data: result, error: closeErr } = await supabase.rpc('close_month_transactional', {
        p_year: year,
        p_month: month,
        p_performed_by: currentUser?.role || 'Owner'
      });
      if (closeErr) throw closeErr;

      // Re-fetch authoritative state from the server. The RPC already
      // wrote everything atomically; locally-cached arrays are now stale.
      await fetchCloudData();

      alert(
        `SUCCESS: ${monthName} ${year} archived.\n\n` +
        `  • Customers updated: ${result?.customers_updated ?? 0}\n` +
        `  • Deliveries archived: ${result?.deliveries_archived ?? 0}\n` +
        `  • Payments archived: ${result?.payments_archived ?? 0}\n` +
        `  • Expenses archived: ${result?.expenses_archived ?? 0}\n\n` +
        `Other devices will refresh automatically via realtime sync.`
      );
    } catch (err: any) {
      console.error("Close Month Error:", err);
      const msg = err?.message || '';
      if (err?.code === 'P0002' || /MONTH_ALREADY_CLOSED/i.test(msg)) {
        alert(`${monthName} ${year} was already closed by another session. No changes were made.`);
      } else {
        alert(`MONTH-CLOSE FAILED — and because the new flow is atomic, NOTHING was changed in the database.\n\n${explainSupabaseError(err)}\n\nYou can safely retry once the issue is resolved.`);
      }
    } finally {
      setLoading(false);
    }
  }, [currentUser, fetchCloudData]);

  const reconcileBalancesWithArchives = useCallback(async () => {
    if (!archives || archives.length === 0) {
      alert("No archives found to reconcile with.");
      return;
    }
    
    const confirmMain = window.confirm("Retrieve data from archives and adjust Ledger balances? This will ensure active balances match the last closed period snapshots.");
    if (!confirmMain) return;

    setLoading(true);
    try {
      // 1. Sort archives by date descending
      const sortedArchives = [...archives].sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          return b.month - a.month;
      });

      const customersToUpdate: Customer[] = [];

      customers.forEach(customer => {
          // Find the latest archive that contains this customer
          const latestArc = sortedArchives.find(a => a.closingBalances && a.closingBalances[customer.id] !== undefined);
          if (latestArc) {
              const archivedBal = latestArc.closingBalances[customer.id];
              // We adjust the customer's base opening balance if it differs from the last archived closing
              if (Math.abs(customer.openingBalance - archivedBal) > 0.01) {
                  customersToUpdate.push({
                      ...customer,
                      openingBalance: archivedBal,
                      updatedAt: new Date().toISOString(),
                      version: (customer.version || 0) + 1
                  });
              }
          }
      });

      if (customersToUpdate.length > 0) {
          const { error } = await supabase.from('dp_customers').upsert(customersToUpdate.map(c => relationalDataService.toSnakeCase(c)));
          if (error) throw error;
          
          setCustomers(prev => prev.map(c => {
              const updated = customersToUpdate.find(u => u.id === c.id);
              return updated || c;
          }));
          
          alert(`Success: Adjusted ${customersToUpdate.length} customer balances from archives.`);
      } else {
          alert("Success: All ledger balances are already perfectly synced with archives.");
      }
    } catch (err) {
      console.error("Reconcile error:", err);
      alert(`Reconcile failed.\n\n${explainSupabaseError(err)}`);
    } finally {
      setLoading(false);
    }
  }, [archives, customers]);

  const handleManualAdjustment = useCallback(async (adj: { customerId: string, type: 'DEBIT' | 'CREDIT', amount: number, note: string }) => {
    if (!currentUser || currentUser.role !== UserRole.OWNER) {
      alert("Permission Denied: Only Owner can perform professional adjustments.");
      return;
    }

    setLoading(true);
    try {
      const timestamp = new Date().toISOString();
      const date = timestamp.split('T')[0];
      const id = generateId();

      if (adj.type === 'DEBIT') {
        const newDelivery: Delivery = {
          id,
          customerId: adj.customerId,
          date,
          liters: 0,
          priceAtTime: 0,
          totalAmount: adj.amount,
          riderId: 'system',
          isLocked: false,
          isAdjustment: true,
          adjustmentNote: adj.note,
          updatedAt: timestamp,
          version: 1
        };
        const { error } = await supabase.from('dp_deliveries').upsert(relationalDataService.toSnakeCase(newDelivery));
        if (error) throw error;
        setDeliveries(prev => [...prev, newDelivery]);
      } else {
        const newPayment: Payment = {
          id,
          customerId: adj.customerId,
          date,
          amount: adj.amount,
          mode: PaymentMode.CASH,
          isAdjustment: true,
          adjustmentNote: adj.note,
          updatedAt: timestamp,
          version: 1
        };
        const { error } = await supabase.from('dp_payments').upsert(relationalDataService.toSnakeCase(newPayment));
        if (error) throw error;
        setPayments(prev => [...prev, newPayment]);
      }
      
      const auditEntry: AuditLog = {
        id: generateId(),
        action: 'CREATE',
        entityId: id,
        entityType: adj.type === 'DEBIT' ? 'Delivery' : 'Payment',
        performedBy: currentUser.id,
        timestamp: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        newValue: { type: 'MANUAL_ADJUSTMENT', ...adj }
      };
      await supabase.from('dp_audit_logs').upsert(relationalDataService.toSnakeCase(auditEntry));
      setAuditLogs(prev => [...prev, auditEntry]);

      alert(`Success: ${adj.type} adjustment of Rs. ${adj.amount} recorded.`);
    } catch (err) {
      console.error("Adjustment error:", err);
      alert(`Adjustment NOT saved.\n\n${explainSupabaseError(err)}`);
    } finally {
      setLoading(false);
    }
  }, [currentUser, setDeliveries, setPayments]);

  useEffect(() => {
    if (!isCloudConnected() || !currentUser) return;

    const handleChange = async (table: string, payload: any) => {
      const record = relationalDataService.toCamelCase(payload.new || {});
      const isDelete = payload.eventType === 'DELETE' || record.deleted;

      switch (table) {
        case 'dp_deliveries':
          setDeliveries(prev => {
            if (isDelete) return prev.filter(d => d.id !== record.id);
            const exists = prev.find(d => d.id === record.id);
            if (exists) return prev.map(d => d.id === record.id ? record as unknown as Delivery : d);
            return [...prev, record as unknown as Delivery];
          });
          break;
        case 'dp_payments':
          setPayments(prev => {
            if (isDelete) return prev.filter(p => p.id !== record.id);
            const exists = prev.find(p => p.id === record.id);
            if (exists) return prev.map(p => p.id === record.id ? record as unknown as Payment : p);
            return [...prev, record as unknown as Payment];
          });
          break;
        case 'dp_customers':
          setCustomers(prev => {
            if (isDelete) return prev.filter(c => c.id !== record.id);
            const exists = prev.find(c => c.id === record.id);
            if (exists) return prev.map(c => c.id === record.id ? record as unknown as Customer : c);
            return [...prev, record as unknown as Customer];
          });
          break;
        case 'dp_riders':
          setRiders(prev => {
            if (isDelete) return prev.filter(r => r.id !== record.id);
            const exists = prev.find(r => r.id === record.id);
            if (exists) return prev.map(r => r.id === record.id ? record as unknown as Rider : r);
            return [...prev, record as unknown as Rider];
          });
          break;
        case 'dp_rider_loads':
          setRiderLoads(prev => {
            if (isDelete) return prev.filter(l => l.id !== record.id);
            const exists = prev.find(l => l.id === record.id);
            if (exists) return prev.map(l => l.id === record.id ? record as unknown as RiderLoad : l);
            return [...prev, record as unknown as RiderLoad];
          });
          break;
        case 'dp_expenses':
          setExpenses(prev => {
            if (isDelete) return prev.filter(e => e.id !== record.id);
            const exists = prev.find(e => e.id === record.id);
            if (exists) return prev.map(e => e.id === record.id ? record as unknown as Expense : e);
            return [...prev, record as unknown as Expense];
          });
          break;
      }
      
      setSyncing(false, new Date().toLocaleTimeString());
      setIntegrityStatus('verified');
    };

    const channel = supabase
      .channel('db-live-sync')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'dp_deliveries' },
        (payload) => handleChange('dp_deliveries', payload))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'dp_payments' },
        (payload) => handleChange('dp_payments', payload))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'dp_customers' },
        (payload) => handleChange('dp_customers', payload))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'dp_riders' },
        (payload) => handleChange('dp_riders', payload))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'dp_rider_loads' },
        (payload) => handleChange('dp_rider_loads', payload))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'dp_expenses' },
        (payload) => handleChange('dp_expenses', payload))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIntegrityStatus('verified');
        }
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setIntegrityStatus('conflict');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser, setSyncing]);

  useEffect(() => {
    const cleanLegacyStorage = () => {
      const legacyKeys = ['archives', 'auditLogs', 'closingRecords'];
      legacyKeys.forEach(key => {
        if (localStorage.getItem(key)) {
          localStorage.removeItem(key);
          console.log('Cleared legacy localStorage key:', key);
        }
      });
      localStorage.removeItem('storage_warning');
    };

    const initialize = async () => {
      cleanLegacyStorage(); // First thing — free up space
      setLoading(true);
      try {
        const connected = await testConnection();
        if (!connected) {
          console.warn('Cannot reach Supabase. Check internet connection.');
          setIntegrityStatus('conflict');
          setLoading(false);
          return;
        }

        await fetchCloudDataRef.current();

        setIntegrityStatus('verified');
      } catch (err) {
        console.error('Startup error:', err);
        setIntegrityStatus('conflict');
      } finally {
        setLoading(false);
      }
    };
    initialize();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(false);
    try {
      const trimmedPin = pinInput.trim();
      
      const { data, error } = await supabase.rpc('verify_pin', { pin: trimmedPin });
      if (error) throw error;
      
      if (data && data.success) {
        if (data.role === 'OWNER') {
          setCurrentUser({ role: UserRole.OWNER }); 
          await fetchCloudData(); 
          return;
        } else if (data.role === 'RIDER') {
          setCurrentUser({ role: UserRole.RIDER, id: data.id });
          setGlobalFilterRiderId(data.id);
          await fetchCloudData();
          setActiveTab('milk');
          return;
        }
      }
      
      console.warn("Login Failed: No matching rider found for PIN");
      setLoginError(true);
    } catch (err) { 
      console.error("Critical Login Error:", err);
      setLoginError(true); 
    } finally { 
      setIsLoggingIn(false); 
      setPinInput(''); 
    }
  };

  const handleSetDeliveries: React.Dispatch<React.SetStateAction<Delivery[]>> = (val) => {
    setDeliveries(val);
  };

  const handleSetPayments: React.Dispatch<React.SetStateAction<Payment[]>> = (val) => {
    setPayments(val);
  };

  const performLogout = () => { setCurrentUser(null); setActiveTab('dashboard'); };
  const openCalculatorWithCustomer = (customer: Customer) => { setCalcSelectedCustomer(customer); setIsCalcOpen(true); };

  const renderContent = () => {
    if (loading) return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-50">
         <motion.div
           initial={{ scale: 0.8, opacity: 0 }}
           animate={{ scale: 1, opacity: 1 }}
           transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
         >
           <Loader2 className="text-blue-600 animate-spin mb-4" size={48} />
         </motion.div>
         <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-600 animate-pulse">Verifying Ledger Integrity...</p>
      </div>
    );
    if (!currentUser) return null;
    const effectiveRiderId = currentUser.role === UserRole.OWNER ? (globalFilterRiderId === 'all' ? undefined : globalFilterRiderId) : currentUser.id;

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.2 }}
          className="h-full"
        >
          {(() => {
            switch (activeTab) {
              case 'dashboard': return <Dashboard customers={customers} deliveries={deliveries} payments={payments} expenses={expenses} riders={riders} lockedMonths={[]} onCloseMonth={onCloseMonth} role={currentUser.role} closingRecords={closingRecords} balances={balances} riderFilterId={globalFilterRiderId} setActiveTab={setActiveTab} />;
              case 'intelligence': return <SessionIntelligence riders={riders} customers={customers} deliveries={deliveries} payments={payments} riderLoads={riderLoads} role={currentUser.role} />;
              case 'milk': return <DeliveryEntry customers={customers} deliveries={deliveries} setDeliveries={handleSetDeliveries} prices={prices} riders={riders} payments={payments} setPayments={handleSetPayments} archives={archives} riderId={effectiveRiderId} role={currentUser.role} balances={balances} onOpenCalc={openCalculatorWithCustomer} riderLoads={riderLoads} setAuditLogs={setAuditLogs} />;
              case 'billing': return <BillingTracker customers={customers} payments={payments} setPayments={handleSetPayments} balances={balances} role={currentUser.role} riders={riders} riderFilterId={globalFilterRiderId} archives={archives} deliveries={deliveries} prices={prices} />;
              case 'dispatch': return <DispatchHub riderLoads={riderLoads} setRiderLoads={setRiderLoads} riders={riders} role={currentUser.role} riderFilterId={globalFilterRiderId} archives={archives} />;
              case 'audit': return <RiderClosing riders={riders} customers={customers} deliveries={deliveries} setDeliveries={handleSetDeliveries} payments={payments} setPayments={handleSetPayments} expenses={expenses} closingRecords={closingRecords} setClosingRecords={setClosingRecords} riderLoads={riderLoads} setRiderLoads={setRiderLoads} role={currentUser.role} setActiveTab={setActiveTab} riderFilterId={globalFilterRiderId} />;
              case 'expenses': return <ExpenseManagement expenses={expenses} setExpenses={setExpenses} riders={riders} role={currentUser.role} riderFilterId={globalFilterRiderId} archives={archives} />;
              case 'log': return <DailyLog deliveries={deliveries} payments={payments} customers={customers} riders={riders} riderFilterId={globalFilterRiderId} role={currentUser.role} />;
              case 'ledger': return <Reports customers={customers} deliveries={deliveries} payments={payments} riders={riders} archives={archives} riderFilterId={globalFilterRiderId} auditLogs={auditLogs} onSyncArchives={reconcileBalancesWithArchives} onAddAdjustment={handleManualAdjustment} />;
              case 'customers': return <CustomerManagement customers={customers} setCustomers={setCustomers} riders={riders} deliveries={deliveries} payments={payments} balances={balances} role={currentUser.role} riderFilterId={globalFilterRiderId} />;
              case 'analytics': return <Analytics customers={customers} deliveries={deliveries} payments={payments} riders={riders} riderFilterId={globalFilterRiderId} balances={balances} />;
              case 'insights': return <BusinessInsights archives={archives} deliveries={deliveries} payments={payments} customers={customers} riders={riders} riderFilterId={globalFilterRiderId} />;
              case 'finance': return <FinancialSummary customers={customers} deliveries={deliveries} payments={payments} balances={balances} role={currentUser.role} />;
              case 'wholesale': return <WholesaleHub />;
              case 'reconcile': return <LiveReconcile customers={customers} balances={balances} role={currentUser.role} />;
              case 'notTaken': return <NotTakenToday customers={customers} deliveries={deliveries} riders={riders} riderFilterId={globalFilterRiderId} archives={archives} />;
              case 'dailyUpdates': return <DailyWhatsAppUpdates customers={customers} deliveries={deliveries} payments={payments} riders={riders} role={currentUser.role} riderFilterId={globalFilterRiderId} />;
              case 'setup': return (
                  <div className="p-8 space-y-8">
                    <StaffManagement riders={riders} setRiders={setRiders} role={currentUser.role} riderId={effectiveRiderId} customers={customers} balances={balances} />
                    <PriceManagement prices={prices} setPrices={setPrices} customers={customers} deliveries={deliveries} setDeliveries={handleSetDeliveries} />
                    <ArchiveManager archives={archives} riders={riders} customers={customers} onCloseMonth={onCloseMonth} role={currentUser.role} />
                    <div className="bg-red-50 p-10 rounded-[3rem] border-4 border-red-100 flex flex-col items-center text-center gap-6">
                      <LogOut size={48} className="text-red-500" />
                      <button onClick={performLogout} className="w-full py-6 bg-red-600 text-white rounded-[2rem] font-black uppercase text-sm tracking-widest shadow-2xl active:scale-95 transition-all">Sign Out</button>
                    </div>
                  </div>
              );
              default: return null;
            }
          })()}
        </motion.div>
      </AnimatePresence>
    );
  };

  if (!currentUser) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center p-6">
        <form onSubmit={handleLogin} className="bg-white p-12 rounded-[4rem] shadow-2xl w-full max-md space-y-8 animate-in zoom-in-95">
          <div className="text-center space-y-4">
             <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">Gujjar Milk Shop</h2>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Official Appp - Secure Access</p>
          </div>
          <div className="space-y-4">
            <input 
              type="password" placeholder="PIN" disabled={isLoggingIn}
              className={`w-full p-6 bg-slate-50 border-4 ${loginError ? 'border-red-100' : 'border-slate-100'} rounded-3xl text-center text-4xl tracking-[0.5em] font-black outline-none focus:border-blue-600 transition-all`}
              value={pinInput} onChange={e => setPinInput(e.target.value)} autoFocus
            />
            {loginError && <p className="text-center text-red-500 text-[10px] font-black uppercase">Invalid PIN. Access Denied.</p>}
          </div>
          <button type="submit" disabled={isLoggingIn} className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-xl hover:bg-blue-600 transition-all shadow-xl flex items-center justify-center">
             {isLoggingIn ? <Loader2 className="animate-spin" /> : 'Open Vault'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden safe-top safe-bottom bg-slate-50">
      {currentUser && (
        <SyncStatusBar 
          isOnline={isCloudConnected()} 
        />
      )}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 h-20 flex items-center px-6 sticky top-0 z-[60] safe-top">
        <div className="flex flex-col flex-1">
           <h1 className="text-sm font-black text-slate-900 uppercase tracking-tighter leading-none">
             {currentUser.role === UserRole.OWNER ? 'Gujjar Milk Shop HQ' : riders.find(r => r.id === currentUser.id)?.name}
           </h1>
           <div className="flex items-center gap-2 mt-1">
             <IntegrityStatusBadge initialStatus={integrityStatus} role={currentUser.role} />
           </div>
        </div>
        <motion.button 
          whileTap={{ scale: 0.9 }}
          onClick={() => fetchCloudData()} 
          className="p-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all shadow-sm"
        >
          <SyncSpinner />
        </motion.button>
      </header>
      
      {integrityStatus === 'warning' && currentUser.role === UserRole.OWNER && (
        <div className="bg-red-600 text-white px-4 py-3 text-xs font-bold flex flex-col gap-1 items-center justify-center text-center z-50">
          <span>CRITICAL STORAGE WARNING: Device storage is almost full.</span>
          <span className="font-normal">Please go to Setup &gt; Archives and CLOSE the previous month immediately to prevent data loss.</span>
        </div>
      )}

      <main className="flex-1 overflow-y-auto pb-44 scrollbar-hide">
        {renderContent()}
      </main>

      <motion.button 
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsCalcOpen(true)}
        className="fixed bottom-24 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-2xl flex items-center justify-center z-[110] transition-all border-4 border-white no-print"
      >
        <Calculator size={24} />
      </motion.button>

      <RiderCalculator 
        isOpen={isCalcOpen} 
        onClose={() => { setIsCalcOpen(false); setCalcSelectedCustomer(null); }} 
        selectedCustomer={calcSelectedCustomer}
        prices={prices}
        balances={balances}
      />
      
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-200 px-4 py-3 pb-8 flex justify-around items-center z-[70] safe-bottom shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
        {(currentUser.role === UserRole.OWNER ? [
            { id: 'dashboard', label: 'Home', icon: Home },
            { id: 'milk', label: 'Entry', icon: ClipboardList },
        ] : [{ id: 'milk', label: 'Entry', icon: ClipboardList }]).map(item => (
          <motion.button 
            key={item.id} 
            whileTap={{ scale: 0.95 }}
            onClick={() => { setActiveTab(item.id); setIsMoreMenuOpen(false); }} 
            className={`flex flex-col items-center gap-1 transition-all flex-1 ${activeTab === item.id ? 'text-blue-600' : 'text-slate-400'}`}
          >
            <div className={`p-2 rounded-xl transition-all duration-300 ${activeTab === item.id ? 'bg-blue-600/10' : 'bg-transparent'}`}>
              <item.icon size={20} className={activeTab === item.id ? 'fill-blue-600' : ''} />
            </div>
            <span className={`text-[8px] font-bold uppercase tracking-tight`}>{item.label}</span>
          </motion.button>
        ))}
        <motion.button 
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsMoreMenuOpen(true)} 
          className={`flex flex-col items-center gap-1 transition-all flex-1 ${isMoreMenuOpen ? 'text-blue-600' : 'text-slate-400'}`}
        >
            <div className={`p-2 rounded-xl transition-all duration-300 ${isMoreMenuOpen ? 'bg-blue-600/10' : 'bg-transparent'}`}>
              <MoreHorizontal size={20} />
            </div>
            <span className={`text-[8px] font-bold uppercase tracking-tight`}>More</span>
        </motion.button>
      </nav>

      <AnimatePresence>
        {isMoreMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[80]" 
              onClick={() => setIsMoreMenuOpen(false)} 
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[2.5rem] p-6 pb-12 z-[90] shadow-2xl max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="sheet-handle" />
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xl font-black text-slate-900 tracking-tighter uppercase italic">Operations</h3>
                 <button onClick={() => setIsMoreMenuOpen(false)} className="p-2 bg-slate-100 rounded-full text-slate-400"><X size={18}/></button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                 {(currentUser.role === UserRole.OWNER ? [
                    { id: 'intelligence', label: 'Live Pulse', icon: Zap },
                    { id: 'billing', label: 'Payments', icon: CreditCard },
                    { id: 'dispatch', label: 'Issuance', icon: Container },
                    { id: 'audit', label: 'Closing', icon: Scale },
                    { id: 'expenses', label: 'Expenses', icon: Fuel },
                    { id: 'log', label: 'History', icon: ReceiptText },
                    { id: 'ledger', label: 'Ledger', icon: ClipboardList },
                    { id: 'notTaken', label: 'Missing', icon: UserX },
                    { id: 'dailyUpdates', label: 'Updates', icon: MessageCircle },
                    { id: 'customers', label: 'Clients', icon: Users },
                    { id: 'analytics', label: 'Trends', icon: Activity },
                    { id: 'finance', label: 'Finance', icon: Wallet },
                    { id: 'insights', label: 'Insights', icon: BarChart3 },
                    { id: 'wholesale', label: 'Wholesale', icon: Warehouse },
                    { id: 'reconcile', label: 'Reconcile', icon: ShieldCheck },
                    { id: 'setup', label: 'Setup', icon: Settings },
                 ] : [{id: 'setup', label: 'Sign Out', icon: Power}]).map(item => (
                    <motion.button 
                      key={item.id} 
                      whileTap={{ scale: 0.95 }}
                      onClick={() => { if (item.id === 'setup' && currentUser.role !== UserRole.OWNER) performLogout(); else setActiveTab(item.id); setIsMoreMenuOpen(false); }} 
                      className={`flex flex-col items-center justify-center p-4 rounded-3xl transition-all border border-slate-100 ${activeTab === item.id ? 'bg-blue-600 text-white shadow-lg border-blue-600' : 'bg-slate-50 text-slate-600'}`}
                    >
                        <item.icon size={22} className="mb-2" />
                        <span className="text-[9px] font-bold uppercase text-center leading-tight">{item.label}</span>
                    </motion.button>
                 ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
