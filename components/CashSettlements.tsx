// Phase 10 (2026-05-13): Cash Settlement workflow.
//
// Closes the physical-cash loop: every time the Owner accepts cash
// from a rider at end-of-day, it must be recorded here. The DB
// computes the day's expected_cash for that rider from the payments
// recorded against their customers, compares it to the amount the
// Owner says they received, and stores the variance.
//
// This is the bank-grade "the cash that left the rider's hand is now
// in the Owner's safe" transaction. Without it, the system has no way
// to know whether Rs. 12,000 in payments actually arrived as Rs. 12,000
// or Rs. 11,300.

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { Wallet, Calendar, Loader2, AlertTriangle, CheckCircle, X, Banknote } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { formatPKR, generateId } from '../services/dataStore';
import { UserRole } from '../types';

interface RiderSummary {
  rider_id: string;
  name: string;
  route: string | null;
  expected_cash: number;
  settled_cash: number;
  delivered_liters: number;
  closing: any | null;
}

interface Props {
  role: UserRole;
}

const formatDate = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' });
};

const CashSettlements: React.FC<Props> = ({ role }) => {
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [summary, setSummary] = useState<RiderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyRider, setBusyRider] = useState<string | null>(null);
  const [selected, setSelected] = useState<RiderSummary | null>(null);
  const [amount, setAmount] = useState<string>('');
  const [note, setNote] = useState<string>('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('daily_settlement_summary', { p_date: date });
      if (rpcErr) throw rpcErr;
      setSummary((data as any)?.riders || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load settlements.');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { refresh(); }, [refresh]);

  if (role !== UserRole.OWNER) {
    return (
      <div className="p-8 text-center text-slate-500">
        <Wallet size={48} className="mx-auto mb-4 text-slate-300" />
        <p className="font-bold uppercase text-xs tracking-widest">Owner-only tool</p>
      </div>
    );
  }

  const totals = useMemo(() => ({
    expected: summary.reduce((s, r) => s + (Number(r.expected_cash) || 0), 0),
    settled:  summary.reduce((s, r) => s + (Number(r.settled_cash)  || 0), 0),
    liters:   summary.reduce((s, r) => s + (Number(r.delivered_liters) || 0), 0),
  }), [summary]);
  const grandVariance = totals.settled - totals.expected;

  const openModal = (r: RiderSummary) => {
    setSelected(r);
    const remaining = Math.max(0, (Number(r.expected_cash) || 0) - (Number(r.settled_cash) || 0));
    setAmount(remaining ? String(Math.round(remaining)) : '');
    setNote('');
  };

  const submit = async () => {
    if (!selected) return;
    const amt = Number(amount);
    if (isNaN(amt) || amt < 0) { alert('Enter a valid amount (>= 0).'); return; }
    setBusyRider(selected.rider_id);
    try {
      const { data, error: rpcErr } = await supabase.rpc('record_cash_settlement', {
        p_settlement: {
          id: generateId(),
          rider_id: selected.rider_id,
          settlement_date: date,
          amount: amt,
          mode: 'Cash',
          note: note?.trim() || null,
          client_request_id: generateId(),
        }
      });
      if (rpcErr) throw rpcErr;
      const v = Number((data as any)?.variance || 0);
      const msg = `Settlement recorded.\n\nExpected: Rs. ${formatPKR(Number((data as any)?.expected_cash || 0))}\nReceived: Rs. ${formatPKR(amt)}\nVariance: ${v >= 0 ? '+' : ''}Rs. ${formatPKR(v)}`;
      alert(msg);
      setSelected(null);
      await refresh();
    } catch (err: any) {
      alert(`Settlement FAILED.\n\n${err?.message || String(err)}`);
    } finally {
      setBusyRider(null);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5 pb-24">
      {/* Header + date picker */}
      <div className="bg-white rounded-3xl border-4 border-slate-100 p-5">
        <div className="flex items-start gap-3 mb-4">
          <Banknote className="text-emerald-600 flex-shrink-0" size={26} />
          <div className="flex-1">
            <h2 className="text-lg font-black uppercase tracking-tighter text-slate-900">Cash Settlements</h2>
            <p className="text-xs text-slate-500 mt-1">
              Record cash you received from each rider for the day. The system shows what each rider <em>should</em> have collected based on payments entered, and the variance after you record.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Calendar size={16} className="text-slate-400" />
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="flex-1 p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-blue-600 font-bold"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-4 border-red-100 rounded-3xl p-4 text-red-700 text-sm">
          <p className="font-bold uppercase text-xs mb-1 flex items-center gap-2"><AlertTriangle size={14} /> Load failed</p>
          <p className="font-mono break-all">{error}</p>
        </div>
      )}

      {/* Totals strip */}
      {!loading && summary.length > 0 && (
        <div className="bg-slate-900 text-white rounded-3xl p-5 grid grid-cols-4 gap-3 text-center">
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-400">Riders</p>
            <p className="text-lg font-black mt-0.5">{summary.length}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-400">Expected</p>
            <p className="text-base font-black mt-0.5">{formatPKR(totals.expected)}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-400">Settled</p>
            <p className="text-base font-black mt-0.5 text-emerald-300">{formatPKR(totals.settled)}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-widest text-amber-400">Variance</p>
            <p className={`text-base font-black mt-0.5 ${grandVariance >= 0 ? 'text-emerald-300' : 'text-red-400'}`}>
              {grandVariance >= 0 ? '+' : ''}{formatPKR(grandVariance)}
            </p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-3xl border-4 border-slate-100 p-8 text-center text-slate-400">
          <Loader2 className="animate-spin mx-auto mb-2" size={20} />
          <p className="text-xs uppercase tracking-widest">Loading…</p>
        </div>
      )}

      {/* Per-rider rows */}
      {!loading && summary.length === 0 && (
        <div className="bg-white rounded-3xl border-4 border-slate-100 p-8 text-center text-slate-500">
          <p className="text-xs uppercase tracking-widest">No riders yet. Add some in Setup → Staff.</p>
        </div>
      )}

      {!loading && summary.map(r => {
        const variance = (Number(r.settled_cash) || 0) - (Number(r.expected_cash) || 0);
        const isClean = Math.abs(variance) < 0.5 && r.settled_cash > 0;
        const isPending = r.settled_cash === 0 && r.expected_cash > 0;
        return (
          <div key={r.rider_id} className={`bg-white rounded-3xl border-4 p-5 ${isClean ? 'border-emerald-200' : isPending ? 'border-amber-200' : 'border-slate-100'}`}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <p className="font-black text-slate-900 truncate">{r.name}</p>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 truncate mt-0.5">
                  {r.route || 'No route'} · {Number(r.delivered_liters || 0).toFixed(1)} L delivered
                </p>
              </div>
              <button
                onClick={() => openModal(r)}
                disabled={!!busyRider}
                className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-60"
              >
                Record
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-50 rounded-xl py-2">
                <p className="text-[9px] uppercase tracking-widest text-slate-500">Expected</p>
                <p className="text-sm font-black mt-0.5">{formatPKR(r.expected_cash)}</p>
              </div>
              <div className={`rounded-xl py-2 ${r.settled_cash > 0 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                <p className={`text-[9px] uppercase tracking-widest ${r.settled_cash > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>Settled</p>
                <p className={`text-sm font-black mt-0.5 ${r.settled_cash > 0 ? 'text-emerald-800' : 'text-amber-800'}`}>{formatPKR(r.settled_cash)}</p>
              </div>
              <div className={`rounded-xl py-2 ${Math.abs(variance) < 0.5 ? 'bg-slate-50' : variance > 0 ? 'bg-blue-50' : 'bg-red-50'}`}>
                <p className="text-[9px] uppercase tracking-widest text-slate-600">Variance</p>
                <p className={`text-sm font-black mt-0.5 ${Math.abs(variance) < 0.5 ? 'text-slate-700' : variance > 0 ? 'text-blue-700' : 'text-red-700'}`}>
                  {variance >= 0 ? '+' : ''}{formatPKR(variance)}
                </p>
              </div>
            </div>
            {isClean && (
              <p className="text-[10px] text-emerald-700 mt-3 flex items-center gap-1 font-bold uppercase tracking-widest">
                <CheckCircle size={12} /> Settled — books match
              </p>
            )}
            {isPending && (
              <p className="text-[10px] text-amber-700 mt-3 flex items-center gap-1 font-bold uppercase tracking-widest">
                <AlertTriangle size={12} /> Cash not yet collected from this rider
              </p>
            )}
          </div>
        );
      })}

      {/* Modal */}
      {selected && (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-end md:items-center justify-center" onClick={() => setSelected(null)}>
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            onClick={e => e.stopPropagation()}
            className="w-full md:max-w-md bg-white rounded-t-[2.5rem] md:rounded-[2.5rem] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black uppercase tracking-tighter text-slate-900">Record cash from {selected.name}</h3>
              <button onClick={() => setSelected(null)} className="p-2 bg-slate-100 rounded-full"><X size={16} /></button>
            </div>
            <p className="text-xs text-slate-500">Date: {formatDate(date)}</p>
            <div className="bg-slate-50 rounded-2xl p-4 grid grid-cols-3 text-center gap-2">
              <div>
                <p className="text-[9px] uppercase tracking-widest text-slate-500">Expected</p>
                <p className="text-sm font-black mt-1">{formatPKR(selected.expected_cash)}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-widest text-slate-500">Already settled</p>
                <p className="text-sm font-black mt-1">{formatPKR(selected.settled_cash)}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-widest text-slate-500">Outstanding</p>
                <p className="text-sm font-black mt-1">{formatPKR(Math.max(0, selected.expected_cash - selected.settled_cash))}</p>
              </div>
            </div>
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Amount received (Rs.)</span>
              <input
                type="number"
                inputMode="numeric"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="mt-1 w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-2xl font-black outline-none focus:border-blue-600"
                autoFocus
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Note (optional)</span>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. partial — balance tomorrow"
                className="mt-1 w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-blue-600"
              />
            </label>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={submit}
              disabled={busyRider === selected.rider_id}
              className="w-full py-4 rounded-2xl bg-emerald-600 text-white font-black uppercase text-sm tracking-widest disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busyRider === selected.rider_id ? <Loader2 className="animate-spin" size={16} /> : <Wallet size={16} />}
              Record receipt
            </motion.button>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default CashSettlements;
