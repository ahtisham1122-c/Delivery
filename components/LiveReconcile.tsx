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
import { Loader2, ShieldCheck, AlertTriangle, RefreshCcw, Activity, CheckCircle, XCircle } from 'lucide-react';
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

  // Phase 9 health-check state (server-side invariants probe).
  const [healthRunning, setHealthRunning] = useState(false);
  const [health, setHealth] = useState<any | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Phase 10: audit-chain verify state.
  const [chainRunning, setChainRunning] = useState(false);
  const [chainResult, setChainResult] = useState<any | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);

  const runChainVerify = async () => {
    setChainRunning(true);
    setChainError(null);
    setChainResult(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('verify_audit_chain');
      if (rpcErr) throw rpcErr;
      setChainResult(data);
    } catch (err: any) {
      setChainError(err?.message || 'Audit chain verification failed.');
    } finally {
      setChainRunning(false);
    }
  };

  const runHealthCheck = async () => {
    setHealthRunning(true);
    setHealthError(null);
    setHealth(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('financial_health_check');
      if (rpcErr) throw rpcErr;
      setHealth(data);
    } catch (err: any) {
      setHealthError(err?.message || 'Health check failed.');
    } finally {
      setHealthRunning(false);
    }
  };

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

      {/* Phase 10: Audit-chain tamper probe. Walks every entry in
          dp_audit_logs in order, recomputes the hash, and checks each
          row's prev_hash equals the previous row's entry_hash. Any
          edit, delete, or insertion-out-of-order is detected. */}
      <div className="bg-white rounded-3xl border-4 border-slate-100 p-6 no-print">
        <div className="flex items-start gap-3 mb-4">
          <ShieldCheck className="text-indigo-600 flex-shrink-0" size={26} />
          <div className="flex-1">
            <h2 className="text-lg font-black uppercase tracking-tighter text-slate-900">Audit-chain tamper check</h2>
            <p className="text-xs text-slate-500 mt-1">
              Walks every audit log entry, recomputes its cryptographic hash, and confirms the chain is unbroken. If anyone (even an admin) ever edits a historical row, this check will fail and tell you exactly which entry was touched.
            </p>
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={runChainVerify}
          disabled={chainRunning}
          className="w-full py-3 rounded-2xl bg-indigo-600 text-white font-black uppercase text-xs tracking-widest disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {chainRunning ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
          {chainRunning ? 'Verifying…' : 'Verify audit chain'}
        </motion.button>
        {chainError && (
          <p className="text-[11px] text-red-600 mt-3 font-mono break-all">{chainError}</p>
        )}
        {chainResult && (
          <div className={`mt-4 rounded-xl p-4 text-xs ${chainResult.intact ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
            <p className="font-black uppercase tracking-widest mb-1">
              {chainResult.intact
                ? `Chain intact — ${chainResult.total_entries} entries`
                : `Chain BROKEN — ${chainResult.breaks_detected} of ${chainResult.total_entries} entries fail`}
            </p>
            <p className="text-[10px] text-slate-600">
              {chainResult.intact
                ? 'No tampering detected. Every audit log entry is cryptographically linked to the one before it.'
                : 'Someone or something modified the audit log directly. This should never happen — report it immediately.'}
            </p>
            {chainResult.first_break && (
              <pre className="text-[9px] mt-2 bg-white p-2 rounded font-mono overflow-x-auto">{JSON.stringify(chainResult.first_break, null, 2)}</pre>
            )}
          </div>
        )}
      </div>

      {/* Phase 9: Financial Health Check — server-side invariants probe.
          Different from Live Reconcile (which compares this device to server).
          This runs eight finance-critical invariants and shows pass/fail. */}
      <div className="bg-white rounded-3xl border-4 border-slate-100 p-6 no-print">
        <div className="flex items-start gap-3 mb-4">
          <Activity className="text-emerald-600 flex-shrink-0" size={26} />
          <div className="flex-1">
            <h2 className="text-lg font-black uppercase tracking-tighter text-slate-900">Financial Health Check</h2>
            <p className="text-xs text-slate-500 mt-1">
              Server-side invariants probe — detects negative amounts, orphan rows, duplicate request-ids, free-milk rows (liters but no price), etc. Read-only.
            </p>
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={runHealthCheck}
          disabled={healthRunning}
          className="w-full py-3 rounded-2xl bg-emerald-600 text-white font-black uppercase text-xs tracking-widest disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {healthRunning ? <Loader2 className="animate-spin" size={16} /> : <Activity size={16} />}
          {healthRunning ? 'Running…' : 'Run 8 invariant checks'}
        </motion.button>
        {healthError && (
          <p className="text-[11px] text-red-600 mt-3 font-mono break-all">{healthError}</p>
        )}
        {health && (
          <div className="mt-4 space-y-1.5">
            <div className={`rounded-xl p-3 text-xs font-black uppercase tracking-widest text-center ${
              health.all_ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {health.all_ok
                ? `All ${health.passed} checks passed`
                : `${health.failed} of ${health.passed + health.failed} checks failed`}
            </div>
            {(health.checks || []).map((c: any) => (
              <div key={c.check} className={`flex items-start gap-2 text-xs p-2 rounded-lg ${c.ok ? 'bg-slate-50' : 'bg-red-50'}`}>
                {c.ok ? <CheckCircle size={14} className="text-green-600 flex-shrink-0 mt-0.5" />
                      : <XCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800">{c.check.replace(/_/g, ' ')}</p>
                  <p className={`text-[10px] mt-0.5 ${c.ok ? 'text-slate-500' : 'text-red-700'}`}>{c.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
