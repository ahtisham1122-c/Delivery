// Phase 3 (2026-05-09): Live drift detector.
// Owner taps "Live Reconcile" -> we send the locally-computed balances to
// `live_reconcile()` on Supabase which compares each one to the
// authoritative server-side calculation and returns rows where they
// disagree by more than 1 paisa. Read-only, no mutations.
//
// Practical use: open this screen on the Owner phone, then immediately
// open it on each Rider phone. If any device shows drift, that device
// has stale cached state — hard-refresh it. If multiple devices agree
// with each other but disagree with the server, the server is the
// source of truth (and a deeper data bug is in play — call for help).

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Loader2, ShieldCheck, AlertTriangle, RefreshCcw } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { formatPKR } from '../services/dataStore';
import { Customer, UserRole } from '../types';

// Note: column names are prefixed `out_` because the underlying RPC
// declares them that way to avoid an OUT-parameter / column shadowing
// ambiguity in Postgres. See 20260509_phase3_hotfix_reconcile.sql.
interface DriftRow {
  out_customer_id: string;
  out_customer_name: string;
  out_local_balance: number;
  out_server_balance: number;
  out_difference: number;
}

interface LiveReconcileProps {
  customers: Customer[];
  balances: Record<string, number>;
  role: UserRole;
}

const LiveReconcile: React.FC<LiveReconcileProps> = ({ customers, balances, role }) => {
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<DriftRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  if (role !== UserRole.OWNER) {
    return (
      <div className="p-8 text-center text-slate-500">
        <ShieldCheck size={48} className="mx-auto mb-4 text-slate-300" />
        <p className="font-bold uppercase text-xs tracking-widest">Owner-only tool</p>
      </div>
    );
  }

  const runCheck = async () => {
    setRunning(true);
    setError(null);
    setRows(null);
    try {
      const localPayload: Record<string, number> = {};
      customers.forEach(c => {
        localPayload[c.id] = Math.round((balances[c.id] || 0) * 100) / 100;
      });

      const { data, error: rpcErr } = await supabase.rpc('live_reconcile', {
        p_local_balances: localPayload,
      });
      if (rpcErr) throw rpcErr;

      setRows((data || []) as DriftRow[]);
      setLastChecked(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.error('Live reconcile failed:', err);
      setError(err?.message || 'Reconcile failed.');
    } finally {
      setRunning(false);
    }
  };

  const totalCustomers = customers.length;
  const driftCount = rows?.length ?? 0;
  const allClean = rows !== null && driftCount === 0;
  const totalDrift = rows?.reduce((s, r) => s + Math.abs(Number(r.out_difference) || 0), 0) ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white rounded-3xl border-4 border-slate-100 p-6">
        <div className="flex items-start gap-4">
          <ShieldCheck className="text-blue-600 flex-shrink-0" size={28} />
          <div className="flex-1">
            <h2 className="text-lg font-black tracking-tighter text-slate-900 uppercase">Live Reconcile</h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Compares balances shown on this device against the authoritative server calculation.
              Run this on every device — Owner phone and each Rider phone. Any row that appears
              indicates that device has stale cached state. Read-only, makes no changes.
            </p>
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={runCheck}
          disabled={running}
          className="mt-6 w-full py-4 rounded-2xl bg-blue-600 text-white font-black uppercase text-sm tracking-widest shadow-xl flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {running ? <Loader2 className="animate-spin" size={18} /> : <RefreshCcw size={18} />}
          {running ? 'Checking…' : `Check ${totalCustomers} customers`}
        </motion.button>

        {lastChecked && (
          <p className="text-[10px] text-slate-400 text-center mt-3 uppercase tracking-widest">
            Last checked at {lastChecked}
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border-4 border-red-100 rounded-3xl p-6 text-red-700 text-sm">
          <p className="font-bold uppercase text-xs mb-2">Reconcile failed</p>
          <p className="font-mono break-all">{error}</p>
        </div>
      )}

      {allClean && (
        <div className="bg-green-50 border-4 border-green-100 rounded-3xl p-8 text-center">
          <ShieldCheck className="text-green-600 mx-auto mb-3" size={48} />
          <p className="font-black uppercase text-sm tracking-widest text-green-700">All balances match the server</p>
          <p className="text-xs text-slate-500 mt-2">{totalCustomers} customers checked. No drift detected on this device.</p>
        </div>
      )}

      {rows && driftCount > 0 && (
        <div className="bg-white rounded-3xl border-4 border-amber-200 overflow-hidden">
          <div className="bg-amber-50 p-5 flex items-center gap-3 border-b-4 border-amber-200">
            <AlertTriangle className="text-amber-600" size={24} />
            <div>
              <p className="font-black text-amber-900 uppercase text-sm">Drift detected on this device</p>
              <p className="text-xs text-amber-800 mt-1">
                {driftCount} of {totalCustomers} customers · total absolute drift {formatPKR(totalDrift)}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="text-left p-3">Customer</th>
                  <th className="text-right p-3">This device</th>
                  <th className="text-right p-3">Server</th>
                  <th className="text-right p-3">Δ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const diff = Number(r.out_difference) || 0;
                  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
                  return (
                    <tr key={r.out_customer_id} className="border-t border-slate-100">
                      <td className="p-3 font-medium text-slate-800">{r.out_customer_name}</td>
                      <td className="p-3 text-right font-mono text-slate-600">{formatPKR(Number(r.out_local_balance) || 0)}</td>
                      <td className="p-3 text-right font-mono text-slate-900 font-bold">{formatPKR(Number(r.out_server_balance) || 0)}</td>
                      <td className={`p-3 text-right font-mono font-bold ${diff > 0 ? 'text-red-600' : 'text-blue-600'}`}>
                        {sign}{formatPKR(Math.abs(diff))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="bg-slate-50 p-4 text-xs text-slate-600 leading-relaxed border-t-4 border-slate-100">
            <p className="font-bold mb-1">What to do</p>
            <p>Tap the refresh button at the top right to pull the latest data from the cloud, then run this check again. If the drift persists after a refresh, capture a screenshot and report it — the server number is the authoritative one.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveReconcile;
