// Phase 5 (2026-05-09): Owner rider-selector.
// The riderFilterId state already flowed through 14 screens, but until
// now the Owner had no UI to actually change it from "all". Each rider
// also had no visible cue that their login was scoped to themselves.
// This bar fixes both: Owner taps to pick a rider; Riders see a locked
// label confirming they're seeing only their own customers.

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, ChevronDown, Check, Lock, X } from 'lucide-react';
import { Rider, UserRole, Customer } from '../types';

interface RiderFilterBarProps {
  riders: Rider[];
  customers: Customer[];
  role: UserRole;
  value: string; // 'all' | rider.id
  onChange: (val: string) => void;
}

const RiderFilterBar: React.FC<RiderFilterBarProps> = ({ riders, customers, role, value, onChange }) => {
  const [open, setOpen] = useState(false);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    customers.forEach(c => {
      if (c.deleted || !c.active) return;
      m[c.riderId] = (m[c.riderId] || 0) + 1;
    });
    return m;
  }, [customers]);

  // Riders: locked label, no interaction.
  if (role === UserRole.RIDER) {
    const me = riders.find(r => r.id === value);
    return (
      <div className="bg-blue-50 border-b border-blue-100 px-5 py-2.5 flex items-center gap-2 text-blue-700">
        <Lock size={14} />
        <span className="text-[10px] font-black uppercase tracking-widest">
          {me ? `Showing ${me.name}'s customers (${counts[me.id] || 0})` : 'Your customers'}
        </span>
      </div>
    );
  }

  // Owner: full picker.
  const sortedRiders = [...riders].sort((a, b) => a.name.localeCompare(b.name));
  const selected = value === 'all' ? null : sortedRiders.find(r => r.id === value);
  const totalCustomers = customers.filter(c => !c.deleted && c.active).length;

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => setOpen(true)}
        className={`w-full px-5 py-2.5 flex items-center justify-between border-b text-xs font-bold transition-colors ${
          selected
            ? 'bg-blue-600 text-white border-blue-700'
            : 'bg-slate-50 text-slate-700 border-slate-200'
        }`}
      >
        <span className="flex items-center gap-2 uppercase tracking-widest text-[10px]">
          <Users size={14} />
          {selected
            ? `Viewing as: ${selected.name}`
            : `All riders · ${totalCustomers} customers`}
        </span>
        <ChevronDown size={14} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[120]"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[2.5rem] z-[130] max-h-[85vh] overflow-hidden flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="sheet-handle" />
              <div className="flex items-center justify-between px-6 pt-2 pb-4">
                <h3 className="text-lg font-black tracking-tighter uppercase italic text-slate-900">View by Rider</h3>
                <button onClick={() => setOpen(false)} className="p-2 bg-slate-100 rounded-full text-slate-400">
                  <X size={16} />
                </button>
              </div>

              <div className="overflow-y-auto px-4 pb-8 space-y-2">
                <button
                  onClick={() => { onChange('all'); setOpen(false); }}
                  className={`w-full p-4 rounded-2xl flex items-center justify-between border-2 transition-all ${
                    value === 'all' ? 'bg-blue-600 text-white border-blue-700' : 'bg-slate-50 border-slate-100 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Users size={18} />
                    <div className="text-left">
                      <p className="font-black text-sm">All Riders</p>
                      <p className={`text-[10px] uppercase tracking-widest ${value === 'all' ? 'text-blue-100' : 'text-slate-400'}`}>
                        {totalCustomers} active customers
                      </p>
                    </div>
                  </div>
                  {value === 'all' && <Check size={18} />}
                </button>

                {sortedRiders.map(r => (
                  <button
                    key={r.id}
                    onClick={() => { onChange(r.id); setOpen(false); }}
                    className={`w-full p-4 rounded-2xl flex items-center justify-between border-2 transition-all ${
                      value === r.id ? 'bg-blue-600 text-white border-blue-700' : 'bg-white border-slate-100 text-slate-800'
                    }`}
                  >
                    <div className="text-left flex-1 min-w-0">
                      <p className="font-black text-sm truncate">{r.name}</p>
                      <p className={`text-[10px] uppercase tracking-widest truncate ${value === r.id ? 'text-blue-100' : 'text-slate-400'}`}>
                        {r.route || 'No route'} · {counts[r.id] || 0} customers
                      </p>
                    </div>
                    {value === r.id && <Check size={18} />}
                  </button>
                ))}

                {sortedRiders.length === 0 && (
                  <p className="text-center text-xs text-slate-400 py-8 uppercase tracking-widest">
                    No riders set up yet. Add one in Setup → Staff.
                  </p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default RiderFilterBar;
