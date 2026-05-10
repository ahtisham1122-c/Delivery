// Phase 7 (2026-05-10): Monthly per-customer statement screen.
// Continuous-ledger replacement for the old "Close Month" workflow.
// Pick any month, optionally narrow to a single rider or customer,
// and get a clean printable / WhatsApp-able statement showing
// opening balance, every delivery, every payment, and closing balance.
//
// All numbers come from the server `customer_monthly_statement` RPC
// so they match what other devices and the database itself would
// report. No client aggregation. Works for any historical month
// going back to the dawn of the ledger (Phase 6 keeps everything).

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Calendar, Users, User, Loader2, FileText, Printer, MessageCircle, Download, AlertTriangle
} from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { formatPKR } from '../services/dataStore';
import { Customer, Rider, UserRole } from '../types';
import { exportService } from '../services/exportService';

interface DeliveryRow {
  id: string;
  date: string;
  liters: number;
  price_at_time: number;
  total_amount: number;
  is_adjustment?: boolean;
  adjustment_note?: string;
  rider_id?: string;
}
interface PaymentRow {
  id: string;
  date: string;
  amount: number;
  mode?: string;
  note?: string;
  is_adjustment?: boolean;
  adjustment_note?: string;
}
interface StatementCustomer {
  id: string;
  name: string;
  urdu_name?: string | null;
  phone?: string | null;
  payment_cycle?: string;
  rider_id?: string;
  rider_name?: string | null;
  opening_balance: number;
  closing_balance: number;
  total_deliveries_amt: number;
  total_payments_amt: number;
  deliveries: DeliveryRow[];
  payments: PaymentRow[];
}
interface StatementResult {
  year: number;
  month: number;
  start_date: string;
  end_date: string;
  count: number;
  customers: StatementCustomer[];
}

interface Props {
  customers: Customer[];
  riders: Rider[];
  riderFilterId: string;        // 'all' | rider id
  role: UserRole;
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const MonthlyStatement: React.FC<Props> = ({ customers, riders, riderFilterId, role }) => {
  // Default to PREVIOUS month — the most common report.
  const today = new Date();
  const prevDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  const [year, setYear] = useState<number>(prevDate.getFullYear());
  const [month, setMonth] = useState<number>(prevDate.getMonth());
  const [customerFilter, setCustomerFilter] = useState<string>(''); // '' = all in scope

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StatementResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The rider filter is ALREADY enforced for Riders by the global
  // bar (riderFilterId is locked to their id). Owner can pick any
  // rider, but we always honour whatever's set.
  const effectiveRiderFilter = riderFilterId === 'all' ? null : riderFilterId;

  // Customer dropdown is scoped to the current rider filter.
  const candidateCustomers = useMemo(() => {
    return customers
      .filter(c => !c.deleted && (!effectiveRiderFilter || c.riderId === effectiveRiderFilter))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, effectiveRiderFilter]);

  // Reset customer filter if the rider filter changes such that the
  // currently-picked customer is no longer in scope.
  useEffect(() => {
    if (customerFilter && !candidateCustomers.find(c => c.id === customerFilter)) {
      setCustomerFilter('');
    }
  }, [candidateCustomers, customerFilter]);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('customer_monthly_statement', {
        p_year: year,
        p_month: month,
        p_rider_id: effectiveRiderFilter,
        p_customer_id: customerFilter || null,
        p_include_zero: false,
      });
      if (rpcErr) throw rpcErr;
      setResult(data as StatementResult);
    } catch (err: any) {
      setError(err?.message || 'Failed to load statement.');
    } finally {
      setLoading(false);
    }
  }, [year, month, effectiveRiderFilter, customerFilter]);

  // Auto-load on mount + whenever the filters meaningfully change.
  useEffect(() => { generate(); /* eslint-disable-next-line */ }, [year, month, effectiveRiderFilter, customerFilter]);

  // Year picker: -1 to +1 around today.
  const yearOptions = useMemo(() => {
    const y = today.getFullYear();
    return [y - 2, y - 1, y, y + 1];
    // eslint-disable-next-line
  }, []);

  const monthLabel = `${MONTH_NAMES[month]} ${year}`;
  const riderLabel = effectiveRiderFilter
    ? (riders.find(r => r.id === effectiveRiderFilter)?.name || 'Selected rider')
    : 'All riders';

  const totals = useMemo(() => {
    const c = result?.customers || [];
    return {
      customers: c.length,
      deliveries: c.reduce((s, x) => s + (Number(x.total_deliveries_amt) || 0), 0),
      payments: c.reduce((s, x) => s + (Number(x.total_payments_amt) || 0), 0),
      opening: c.reduce((s, x) => s + (Number(x.opening_balance) || 0), 0),
      closing: c.reduce((s, x) => s + (Number(x.closing_balance) || 0), 0),
    };
  }, [result]);

  const printAll = () => {
    // The print stylesheet in index.html shows only #print-root.
    // We render a print-ready DOM into a hidden node briefly.
    window.print();
  };

  // WhatsApp message for ONE customer (current viewer) — most common use.
  const whatsappFor = (c: StatementCustomer) => {
    const phone = (c.phone || '').replace(/[^\d]/g, '');
    if (!phone) {
      alert('No phone number on file for this customer.');
      return;
    }
    const wa = phone.startsWith('92') ? phone : (phone.startsWith('0') ? '92' + phone.slice(1) : '92' + phone);
    const lines: string[] = [];
    lines.push(`*Gujjar Milk Shop — ${monthLabel} statement*`);
    lines.push(`*${c.name}*`);
    lines.push('');
    lines.push(`Opening:  Rs. ${formatPKR(c.opening_balance)}`);
    if (c.deliveries.length) {
      const totalLitres = c.deliveries.reduce((s, d) => s + (Number(d.liters) || 0), 0);
      lines.push(`Deliveries: ${c.deliveries.length} (${totalLitres.toFixed(1)} L) = Rs. ${formatPKR(c.total_deliveries_amt)}`);
    }
    if (c.payments.length) {
      lines.push(`Paid:        Rs. ${formatPKR(c.total_payments_amt)}`);
    }
    lines.push(`*Closing: Rs. ${formatPKR(c.closing_balance)}* ${c.closing_balance > 0 ? '(owing)' : c.closing_balance < 0 ? '(advance)' : ''}`);
    const url = `https://wa.me/${wa}?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(url, '_blank');
  };

  const exportXlsx = () => {
    if (!result) return;
    try {
      // Flatten per-customer rows for one easy XLSX dump.
      const flat = result.customers.map(c => ({
        Customer: c.name,
        Rider: c.rider_name || '',
        Phone: c.phone || '',
        'Opening Balance': c.opening_balance,
        'Total Deliveries (Rs.)': c.total_deliveries_amt,
        'Total Payments (Rs.)': c.total_payments_amt,
        'Closing Balance': c.closing_balance,
      }));
      exportService.exportToExcel(flat, `Statement_${monthLabel.replace(' ', '_')}`);
    } catch (err) {
      console.error('Excel export failed', err);
      alert('Excel export failed. Try again.');
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5 pb-24">
      {/* Header / controls */}
      <div className="bg-white rounded-3xl border-4 border-slate-100 p-5 space-y-4 no-print">
        <div className="flex items-start gap-3">
          <FileText className="text-blue-600 flex-shrink-0" size={26} />
          <div className="flex-1">
            <h2 className="text-lg font-black uppercase tracking-tighter text-slate-900">Monthly Statement</h2>
            <p className="text-xs text-slate-500 mt-1">
              Server-computed monthly view per customer. Works for any past month — nothing is ever deleted from the ledger.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Month</span>
            <select
              value={month}
              onChange={e => setMonth(parseInt(e.target.value, 10))}
              className="mt-1 w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-blue-600 font-bold"
            >
              {MONTH_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Year</span>
            <select
              value={year}
              onChange={e => setYear(parseInt(e.target.value, 10))}
              className="mt-1 w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-blue-600 font-bold"
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Rider scope</span>
            <div className="mt-1 w-full p-3 bg-slate-100 border-2 border-slate-200 rounded-2xl text-sm font-bold text-slate-700 truncate">
              {riderLabel}
            </div>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Customer</span>
            <select
              value={customerFilter}
              onChange={e => setCustomerFilter(e.target.value)}
              className="mt-1 w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-blue-600 font-bold"
            >
              <option value="">All ({candidateCustomers.length})</option>
              {candidateCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            onClick={generate}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-60 flex items-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={14} /> : <Calendar size={14} />}
            Refresh
          </button>
          <button
            onClick={printAll}
            disabled={loading || !result}
            className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest disabled:opacity-60 flex items-center gap-2"
          >
            <Printer size={14} /> Print
          </button>
          <button
            onClick={exportXlsx}
            disabled={loading || !result || !(result.customers?.length)}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-60 flex items-center gap-2"
          >
            <Download size={14} /> Excel summary
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-4 border-red-100 rounded-3xl p-5 text-red-700 text-sm">
          <p className="font-bold uppercase text-xs mb-2 flex items-center gap-2"><AlertTriangle size={14} /> Statement load failed</p>
          <p className="font-mono break-all">{error}</p>
        </div>
      )}

      {/* Totals strip */}
      {result && !loading && (
        <div className="bg-slate-900 text-white rounded-3xl p-5 grid grid-cols-2 md:grid-cols-5 gap-3 no-print">
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-400">Customers</p>
            <p className="text-lg font-black mt-0.5">{totals.customers}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-400">Opening total</p>
            <p className="text-base font-black mt-0.5">{formatPKR(totals.opening)}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-400">Deliveries</p>
            <p className="text-base font-black mt-0.5 text-blue-300">{formatPKR(totals.deliveries)}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-400">Payments</p>
            <p className="text-base font-black mt-0.5 text-green-300">{formatPKR(totals.payments)}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-widest text-amber-400">Closing total</p>
            <p className="text-lg font-black mt-0.5">{formatPKR(totals.closing)}</p>
          </div>
        </div>
      )}

      {/* Per-customer cards */}
      {result && !loading && result.customers.length === 0 && (
        <div className="bg-white rounded-3xl border-4 border-slate-100 p-10 text-center text-slate-500">
          <FileText className="mx-auto text-slate-300 mb-3" size={40} />
          <p className="text-xs font-black uppercase tracking-widest">No activity for {monthLabel}</p>
          <p className="text-[10px] text-slate-400 mt-1">Try a different month or include all riders.</p>
        </div>
      )}

      {result?.customers.map(c => (
        <motion.div
          key={c.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl border-4 border-slate-100 overflow-hidden statement-card"
        >
          <div className="p-5 border-b-2 border-slate-100">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-black text-slate-900 truncate">
                  {c.name} {c.urdu_name ? <span className="text-slate-400 font-normal text-sm">{c.urdu_name}</span> : null}
                </p>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 mt-1 truncate">
                  {c.rider_name || 'Unknown rider'} · {c.payment_cycle || '—'} · {c.phone || 'no phone'}
                </p>
              </div>
              <button
                onClick={() => whatsappFor(c)}
                className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1 no-print"
              >
                <MessageCircle size={12} /> WhatsApp
              </button>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2 text-center">
              <div className="bg-slate-50 rounded-xl py-2">
                <p className="text-[9px] uppercase tracking-widest text-slate-500">Opening</p>
                <p className="text-sm font-black mt-0.5">{formatPKR(c.opening_balance)}</p>
              </div>
              <div className="bg-blue-50 rounded-xl py-2">
                <p className="text-[9px] uppercase tracking-widest text-blue-600">Deliveries</p>
                <p className="text-sm font-black mt-0.5 text-blue-800">+{formatPKR(c.total_deliveries_amt)}</p>
              </div>
              <div className="bg-green-50 rounded-xl py-2">
                <p className="text-[9px] uppercase tracking-widest text-green-700">Paid</p>
                <p className="text-sm font-black mt-0.5 text-green-800">−{formatPKR(c.total_payments_amt)}</p>
              </div>
              <div className={`rounded-xl py-2 ${c.closing_balance > 0 ? 'bg-red-50' : c.closing_balance < 0 ? 'bg-blue-50' : 'bg-slate-50'}`}>
                <p className="text-[9px] uppercase tracking-widest text-slate-600">Closing</p>
                <p className={`text-sm font-black mt-0.5 ${c.closing_balance > 0 ? 'text-red-700' : c.closing_balance < 0 ? 'text-blue-700' : 'text-slate-700'}`}>
                  {formatPKR(Math.abs(c.closing_balance))} {c.closing_balance > 0 ? 'owe' : c.closing_balance < 0 ? 'adv' : ''}
                </p>
              </div>
            </div>
          </div>

          {/* Detail tables */}
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="border-r-2 border-slate-100">
              <p className="px-4 pt-3 text-[10px] uppercase tracking-widest text-slate-500 font-black">Deliveries · {c.deliveries.length}</p>
              {c.deliveries.length === 0 ? (
                <p className="text-[11px] text-slate-400 px-4 py-2">No deliveries this month.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-[9px] uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="text-left px-4 py-1.5">Date</th>
                      <th className="text-right px-2 py-1.5">L</th>
                      <th className="text-right px-2 py-1.5">Rate</th>
                      <th className="text-right px-4 py-1.5">Amt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.deliveries.map(d => (
                      <tr key={d.id} className={`border-t border-slate-50 ${d.is_adjustment ? 'bg-amber-50' : ''}`}>
                        <td className="px-4 py-1 text-slate-700">{d.date.slice(5)}{d.is_adjustment ? <span className="text-amber-700 ml-1 text-[9px]">ADJ</span> : ''}</td>
                        <td className="px-2 py-1 text-right font-mono">{Number(d.liters).toFixed(1)}</td>
                        <td className="px-2 py-1 text-right font-mono text-slate-500">{Number(d.price_at_time).toFixed(0)}</td>
                        <td className="px-4 py-1 text-right font-mono font-bold">{formatPKR(d.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div>
              <p className="px-4 pt-3 text-[10px] uppercase tracking-widest text-slate-500 font-black">Payments · {c.payments.length}</p>
              {c.payments.length === 0 ? (
                <p className="text-[11px] text-slate-400 px-4 py-2">No payments this month.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-[9px] uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="text-left px-4 py-1.5">Date</th>
                      <th className="text-left px-2 py-1.5">Mode</th>
                      <th className="text-right px-4 py-1.5">Amt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.payments.map(p => (
                      <tr key={p.id} className={`border-t border-slate-50 ${p.is_adjustment ? 'bg-amber-50' : ''}`}>
                        <td className="px-4 py-1 text-slate-700">{p.date.slice(5)}{p.is_adjustment ? <span className="text-amber-700 ml-1 text-[9px]">ADJ</span> : ''}</td>
                        <td className="px-2 py-1 text-slate-500">{p.mode || '—'}</td>
                        <td className="px-4 py-1 text-right font-mono font-bold">{formatPKR(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default MonthlyStatement;
