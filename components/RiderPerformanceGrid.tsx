// Phase 5 (2026-05-09): owner-only side-by-side rider scoreboard.
// Shows every rider as a tile with the four KPIs the owner cares about
// at a glance: today's deliveries (count + liters), today's collections
// (Rs), # active customers, and total outstanding (sum of balances).
// Tap a tile -> the global rider filter switches to that rider, so
// every screen in the app drills in on their data immediately.

import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { Users, Droplets, Wallet, AlertCircle, ArrowRight } from 'lucide-react';
import { Customer, Delivery, Payment, Rider } from '../types';
import { formatPKR } from '../services/dataStore';

interface Props {
  riders: Rider[];
  customers: Customer[];
  deliveries: Delivery[];
  payments: Payment[];
  balances: Record<string, number>;
  onSelectRider: (riderId: string) => void;
}

const RiderPerformanceGrid: React.FC<Props> = ({ riders, customers, deliveries, payments, balances, onSelectRider }) => {
  const today = new Date().toISOString().split('T')[0];

  const stats = useMemo(() => {
    const map = new Map<string, {
      customers: number;
      todayDeliveriesCount: number;
      todayLiters: number;
      todayCollections: number;
      outstanding: number;
    }>();

    riders.forEach(r => {
      map.set(r.id, {
        customers: 0,
        todayDeliveriesCount: 0,
        todayLiters: 0,
        todayCollections: 0,
        outstanding: 0,
      });
    });

    const customerToRider = new Map<string, string>();
    customers.forEach(c => {
      if (c.deleted) return;
      customerToRider.set(c.id, c.riderId);
      if (!c.active) return;
      const s = map.get(c.riderId);
      if (s) {
        s.customers += 1;
        s.outstanding += Number(balances[c.id] || 0);
      }
    });

    deliveries.forEach(d => {
      if (d.deleted || d.date !== today) return;
      // Prefer the rider stored on the delivery itself; fall back to the
      // customer's assigned rider if the delivery is system/adjustment.
      const rid = (d.riderId && d.riderId !== 'system') ? d.riderId : customerToRider.get(d.customerId);
      if (!rid) return;
      const s = map.get(rid);
      if (s) {
        s.todayDeliveriesCount += 1;
        s.todayLiters += Number(d.liters || 0);
      }
    });

    payments.forEach(p => {
      if (p.deleted || p.date !== today) return;
      const rid = customerToRider.get(p.customerId);
      if (!rid) return;
      const s = map.get(rid);
      if (s) s.todayCollections += Number(p.amount || 0);
    });

    return riders
      .map(r => ({ rider: r, ...(map.get(r.id) || { customers: 0, todayDeliveriesCount: 0, todayLiters: 0, todayCollections: 0, outstanding: 0 }) }))
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [riders, customers, deliveries, payments, balances, today]);

  if (riders.length === 0) {
    return (
      <div className="bg-white rounded-3xl border-4 border-slate-100 p-8 text-center">
        <Users className="text-slate-300 mx-auto mb-3" size={40} />
        <p className="text-xs font-black uppercase tracking-widest text-slate-500">No riders yet</p>
        <p className="text-[10px] text-slate-400 mt-1">Add one from Setup → Staff</p>
      </div>
    );
  }

  const totals = stats.reduce(
    (acc, s) => ({
      customers: acc.customers + s.customers,
      todayDeliveriesCount: acc.todayDeliveriesCount + s.todayDeliveriesCount,
      todayLiters: acc.todayLiters + s.todayLiters,
      todayCollections: acc.todayCollections + s.todayCollections,
      outstanding: acc.outstanding + s.outstanding,
    }),
    { customers: 0, todayDeliveriesCount: 0, todayLiters: 0, todayCollections: 0, outstanding: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between px-2">
        <h3 className="text-sm font-black tracking-tighter uppercase italic text-slate-900">Rider performance · today</h3>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{stats.length} riders</span>
      </div>

      {/* Combined totals strip */}
      <div className="bg-slate-900 text-white rounded-3xl p-5 grid grid-cols-4 gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Customers</p>
          <p className="text-lg font-black mt-0.5">{totals.customers}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Liters today</p>
          <p className="text-lg font-black mt-0.5">{totals.todayLiters.toFixed(1)}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Cash today</p>
          <p className="text-lg font-black mt-0.5">{formatPKR(totals.todayCollections)}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-amber-400">Outstanding</p>
          <p className="text-lg font-black mt-0.5">{formatPKR(totals.outstanding)}</p>
        </div>
      </div>

      {/* Per-rider tiles */}
      <div className="grid grid-cols-1 gap-3">
        {stats.map(s => {
          const dueColor = s.outstanding > 0 ? 'text-red-600' : s.outstanding < 0 ? 'text-blue-600' : 'text-slate-400';
          return (
            <motion.button
              key={s.rider.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelectRider(s.rider.id)}
              className="bg-white rounded-3xl border-4 border-slate-100 p-5 text-left active:border-blue-200 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <p className="font-black text-sm text-slate-900 truncate">{s.rider.name}</p>
                  <p className="text-[10px] uppercase tracking-widest text-slate-400 truncate mt-0.5">
                    {s.rider.route || 'No route'} · {s.customers} customers
                  </p>
                </div>
                <ArrowRight size={16} className="text-slate-300 mt-1 flex-shrink-0" />
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-50 rounded-xl py-2.5">
                  <Droplets size={14} className="text-blue-500 mx-auto mb-1" />
                  <p className="text-sm font-black text-slate-900">{s.todayLiters.toFixed(1)}</p>
                  <p className="text-[8px] uppercase tracking-widest text-slate-500 mt-0.5">L today</p>
                  <p className="text-[8px] text-slate-400 mt-0.5">{s.todayDeliveriesCount} drops</p>
                </div>
                <div className="bg-slate-50 rounded-xl py-2.5">
                  <Wallet size={14} className="text-green-500 mx-auto mb-1" />
                  <p className="text-sm font-black text-slate-900">{formatPKR(s.todayCollections)}</p>
                  <p className="text-[8px] uppercase tracking-widest text-slate-500 mt-0.5">Cash today</p>
                </div>
                <div className="bg-slate-50 rounded-xl py-2.5">
                  <AlertCircle size={14} className={`mx-auto mb-1 ${dueColor}`} />
                  <p className={`text-sm font-black ${dueColor}`}>{formatPKR(Math.abs(s.outstanding))}</p>
                  <p className="text-[8px] uppercase tracking-widest text-slate-500 mt-0.5">
                    {s.outstanding < 0 ? 'Advance' : 'Owing'}
                  </p>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default RiderPerformanceGrid;
