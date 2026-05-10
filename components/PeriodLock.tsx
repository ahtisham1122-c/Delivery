// Phase 6 (2026-05-10): Period Lock — owner-facing UI for the
// non-destructive replacement of the old "Close Month" flow.
//
// Replaces the destructive month-close (which soft-deleted every prior
// transaction) with a freeze-but-preserve pattern matching how
// QuickBooks / Xero / Tally / Khata Book actually work. Detail of
// every delivery and payment stays visible in the ledger forever; the
// lock just makes prior-period rows read-only at the database trigger
// level. Reversible via the "Unlock everything" button below.

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Lock, Unlock, ShieldCheck, Loader2, AlertTriangle, History } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { UserRole } from '../types';

interface LockState {
  lock_date: string;       // ISO date 'YYYY-MM-DD'
  locked_by: string | null;
  locked_at: string | null;
  note: string | null;
}

interface Props {
  role: UserRole;
}

const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' });
};

const PeriodLock: React.FC<Props> = ({ role }) => {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<LockState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosenDate, setChosenDate] = useState<string>('');
  const [note, setNote] = useState<string>('');

  // Default the date picker to the last day of the previous month —
  // the most common monthly-lock target.
  const defaultLockTarget = useMemo(() => {
    const today = new Date();
    const last = new Date(today.getFullYear(), today.getMonth(), 0);
    return last.toISOString().split('T')[0];
  }, []);

  useEffect(() => {
    setChosenDate(defaultLockTarget);
  }, [defaultLockTarget]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('get_period_lock');
      if (rpcErr) throw rpcErr;
      setState(data as LockState);
    } catch (err: any) {
      setError(err?.message || 'Failed to read current lock state.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  if (role !== UserRole.OWNER) {
    return (
      <div className="p-8 text-center text-slate-500">
        <Lock size={48} className="mx-auto mb-4 text-slate-300" />
        <p className="font-bold uppercase text-xs tracking-widest">Owner-only tool</p>
      </div>
    );
  }

  const currentLock = state?.lock_date || '1970-01-01';
  const isUnlocked = currentLock <= '1970-01-02';

  const advanceLock = async () => {
    if (!chosenDate) {
      alert('Pick a date first.');
      return;
    }
    if (chosenDate < currentLock) {
      alert(`Refusing: the new lock date (${formatDate(chosenDate)}) is BEFORE the current lock (${formatDate(currentLock)}). To lower the lock, use "Unlock everything" below.`);
      return;
    }
    if (chosenDate >= new Date().toISOString().split('T')[0]) {
      const ok = window.confirm(
        `WARNING: you're about to lock TODAY or a future date. ` +
        `That will block normal rider deliveries from being saved. ` +
        `Continue only if you really mean it.`
      );
      if (!ok) return;
    }

    const summary =
      `LOCK PRIOR PERIOD\n\n` +
      `Current lock: ${formatDate(currentLock)}\n` +
      `New lock:     ${formatDate(chosenDate)}\n\n` +
      `After this, no one (Owner or Rider) can edit, add, or delete ` +
      `deliveries / payments / expenses / closings dated on or before ` +
      `${formatDate(chosenDate)}, EXCEPT through Owner Adjustments.\n\n` +
      `Detail stays visible in the ledger forever. Nothing is deleted.\n\n` +
      `Click OK to confirm.`;

    if (!window.confirm(summary)) return;

    setBusy(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc('set_period_lock', {
        p_lock_date: chosenDate,
        p_locked_by: 'Owner',
        p_note: note?.trim() || null,
      });
      if (rpcErr) throw rpcErr;
      alert(`Period locked through ${formatDate((data as any)?.new_lock || chosenDate)}.`);
      setNote('');
      await refresh();
    } catch (err: any) {
      alert(`Lock FAILED.\n\n${err?.message || String(err)}\n\nNo changes were made.`);
    } finally {
      setBusy(false);
    }
  };

  const unlockEverything = async () => {
    const phrase = 'UNLOCK EVERYTHING';
    const typed = window.prompt(
      `EMERGENCY UNLOCK\n\n` +
      `This removes the lock on every past period. Anyone can then ` +
      `edit historical deliveries, payments, and expenses.\n\n` +
      `Use this only when you absolutely need to fix something in a ` +
      `closed period and an Owner Adjustment is not enough.\n\n` +
      `Type the exact phrase to proceed:\n\n${phrase}`
    );
    if (typed?.trim() !== phrase) {
      alert('Phrase did not match. Unlock cancelled. No changes were made.');
      return;
    }

    setBusy(true);
    try {
      const { error: rpcErr } = await supabase.rpc('clear_period_lock', {
        p_locked_by: 'Owner',
        p_note: note?.trim() || 'emergency unlock',
      });
      if (rpcErr) throw rpcErr;
      alert('All periods are now unlocked.');
      setNote('');
      await refresh();
    } catch (err: any) {
      alert(`Unlock FAILED.\n\n${err?.message || String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Status card */}
      <div className={`rounded-3xl p-6 border-4 ${isUnlocked ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
        <div className="flex items-start gap-3">
          {isUnlocked ? <Unlock className="text-amber-600 flex-shrink-0" size={28} /> : <ShieldCheck className="text-blue-600 flex-shrink-0" size={28} />}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-black tracking-tighter uppercase text-slate-900">
              {isUnlocked ? 'No period is locked' : `Locked through ${formatDate(currentLock)}`}
            </h2>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              {isUnlocked
                ? 'Every transaction in the ledger is currently editable by anyone with permission. Set a lock date below once you have reconciled a month with your bank / cash and sent customer statements.'
                : `All deliveries, payments, expenses, and closings dated ${formatDate(currentLock)} or earlier are read-only. Nothing has been deleted — they are still visible in every ledger and report. To correct a locked-period balance, use Owner Adjustments (they bypass the lock and create an audit trail).`}
            </p>
            {state?.locked_at && !isUnlocked && (
              <p className="text-[10px] uppercase tracking-widest text-slate-400 mt-3">
                Locked by {state?.locked_by || 'unknown'} · {new Date(state.locked_at).toLocaleString('en-PK')}
                {state.note ? ` · "${state.note}"` : ''}
              </p>
            )}
          </div>
        </div>
        {loading && <Loader2 className="animate-spin text-slate-400 mt-3" size={16} />}
        {error && <p className="text-xs text-red-600 mt-3 font-mono break-all">{error}</p>}
      </div>

      {/* Advance lock */}
      <div className="bg-white rounded-3xl border-4 border-slate-100 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Lock size={20} className="text-slate-700 flex-shrink-0" />
          <div>
            <h3 className="font-black uppercase text-sm tracking-tighter text-slate-900">Advance the lock</h3>
            <p className="text-xs text-slate-500 mt-1">
              Sets a new freeze cutoff. Default is the last day of last month — the typical monthly-lock target. You can pick any date on or after the current lock.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Lock through (inclusive)</span>
            <input
              type="date"
              value={chosenDate}
              onChange={e => setChosenDate(e.target.value)}
              className="mt-1 w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-blue-600 font-bold"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Note (optional)</span>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. April reconciled with bank"
              className="mt-1 w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-blue-600"
            />
          </label>
        </div>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={advanceLock}
          disabled={busy || loading}
          className="w-full py-4 rounded-2xl bg-blue-600 text-white font-black uppercase text-sm tracking-widest shadow-xl flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy ? <Loader2 className="animate-spin" size={18} /> : <Lock size={18} />}
          Lock through {chosenDate ? formatDate(chosenDate) : '…'}
        </motion.button>
      </div>

      {/* What this does NOT do */}
      <div className="bg-slate-50 rounded-3xl p-5 text-xs text-slate-600 leading-relaxed border-2 border-slate-100">
        <p className="font-black text-slate-800 mb-2 flex items-center gap-2"><History size={14} /> Period Lock vs old "Close Month"</p>
        <ul className="space-y-1.5 list-disc list-inside">
          <li>No data is deleted, archived into a blob, or hidden from screens.</li>
          <li>Customer balances stay computed on the server from the full live ledger.</li>
          <li>To correct a closed-period balance, record an <b>Owner Adjustment</b> for that customer — it's tagged in the audit log and bypasses the lock.</li>
          <li>You can advance the lock again next month. It only ever moves <b>forward</b>.</li>
        </ul>
      </div>

      {/* Emergency unlock */}
      <div className="bg-red-50 rounded-3xl p-5 border-4 border-red-100">
        <div className="flex items-start gap-3 mb-3">
          <AlertTriangle size={20} className="text-red-600 flex-shrink-0" />
          <div>
            <h3 className="font-black uppercase text-sm tracking-tighter text-red-900">Emergency: unlock everything</h3>
            <p className="text-xs text-red-700 mt-1">
              Removes the lock on all past periods. Use only if Owner Adjustments cannot solve the problem. The unlock is audit-logged.
            </p>
          </div>
        </div>
        <button
          onClick={unlockEverything}
          disabled={busy || loading}
          className="w-full py-3 rounded-2xl bg-white border-2 border-red-200 text-red-700 font-black uppercase text-xs tracking-widest disabled:opacity-60"
        >
          Unlock all periods
        </button>
      </div>
    </div>
  );
};

export default PeriodLock;
