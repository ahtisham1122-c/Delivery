
import React, { useState } from 'react';
import { Fuel, X, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Expense, Rider, UserRole } from '../types';
import { generateId } from '../services/dataStore';
import { supabase } from '../services/supabaseClient';
import { relationalDataService } from '../services/relationalDataService';

interface PetrolLogProps {
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  riders: Rider[];
  role: UserRole;
  riderId?: string;
}

const PetrolLog: React.FC<PetrolLogProps> = ({ expenses, setExpenses, riders, role, riderId }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'pending'>('idle');
  const [formData, setFormData] = useState({
    riderId: riderId || riders[0]?.id || '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    note: ''
  });

  const isOwner = role === UserRole.OWNER;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.riderId || !formData.amount) return;

    const amount = parseFloat(formData.amount);
    if (amount <= 0) {
      alert("Please enter a valid positive amount for petrol.");
      return;
    }

    if (isProcessing || syncStatus === 'saving') return;

    // Double-entry prevention: Check if exact same petrol entry was recorded in last 10 seconds
    const isDuplicate = expenses.some(exp => 
      exp.riderId === formData.riderId && 
      exp.amount === amount && 
      exp.date === formData.date &&
      exp.type === 'Petrol' &&
      Math.abs(new Date().getTime() - new Date(exp.updatedAt).getTime()) < 10000
    );

    if (isDuplicate) {
      alert("DUPLICATE DETECTED: This petrol entry was already recorded a few seconds ago.");
      return;
    }

    setIsProcessing(true);
    setSyncStatus('saving');

    const newExpense: Expense = {
      id: generateId(),
      riderId: formData.riderId,
      amount: Math.max(0, amount),
      date: formData.date,
      type: 'Petrol',
      note: formData.note,
      updatedAt: new Date().toISOString(),
      version: 1
    };

    let isCloudSuccess = false;
    try {
      const { error: eErr } = await supabase.from('dp_expenses').upsert(relationalDataService.toSnakeCase(newExpense));
      if (eErr) throw eErr;
      isCloudSuccess = true;
    } catch (err) {
      console.error("Cloud save failed:", err);
      alert("SYNC ERROR: Petrol record failed server verification.");
    }

    if (isCloudSuccess) {
      setSyncStatus('saved');
    } else {
      setSyncStatus('idle');
    }

    setExpenses(prev => [newExpense, ...prev]);
    
    setTimeout(() => {
      setIsModalOpen(false);
      setFormData({ ...formData, amount: '', note: '' });
      setIsProcessing(false);
      setSyncStatus('idle');
    }, 500);
  };

  const petrolExpenses = expenses.filter(e => e.type === 'Petrol');
  const visibleExpenses = isOwner ? petrolExpenses : petrolExpenses.filter(e => e.riderId === riderId);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 md:space-y-8"
    >
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-6 md:p-8 rounded-[2.5rem] md:rounded-[3rem] border-2 border-slate-100 shadow-sm">
        <div>
          <h3 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tighter uppercase italic">Petrol Log</h3>
        </div>
        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsModalOpen(true)}
          className="w-full md:w-auto bg-amber-500 text-white px-8 md:px-10 py-4 md:py-5 rounded-2xl md:rounded-3xl font-black text-base md:text-lg uppercase tracking-widest hover:bg-slate-900 transition-all shadow-xl shadow-amber-200 flex items-center justify-center gap-4 active:scale-95"
        >
          <Fuel size={24} /> Log Petrol
        </motion.button>
      </div>

      <div className="bg-white rounded-[2.5rem] md:rounded-[3.5rem] shadow-sm border-2 border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-900 text-white">
              <tr className="text-[10px] font-black uppercase tracking-[0.3em]">
                <th className="px-6 md:px-10 py-6 md:py-8">Date</th>
                <th className="px-6 md:px-10 py-6 md:py-8">Rider</th>
                <th className="px-6 md:px-10 py-6 md:py-8">Amount</th>
                <th className="px-6 md:px-10 py-6 md:py-8">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <AnimatePresence mode="popLayout">
                {visibleExpenses.map((exp, i) => (
                  <motion.tr 
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    key={exp.id} 
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 md:px-10 py-5 md:py-6 font-bold text-slate-500 text-xs md:text-sm">{new Date(exp.date).toLocaleDateString('en-GB')}</td>
                    <td className="px-6 md:px-10 py-5 md:py-6 font-black text-slate-900 text-sm md:text-base">{riders.find(r => r.id === exp.riderId)?.name || 'Unknown'}</td>
                    <td className="px-6 md:px-10 py-5 md:py-6 font-black text-amber-600 text-lg md:text-xl italic">Rs. {(exp.amount ?? 0).toLocaleString()}</td>
                    <td className="px-6 md:px-10 py-5 md:py-6 text-slate-400 font-bold italic text-xs md:text-sm">{exp.note || 'Regular filling'}</td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              className="bg-white rounded-t-[2.5rem] md:rounded-[3.5rem] shadow-2xl w-full max-w-xl overflow-hidden border-x-0 md:border-x-8 border-t-8 md:border-b-8 border-amber-500/20 relative z-10"
            >
              <div className="p-8 md:p-10 bg-amber-500 text-white flex justify-between items-center">
                <div>
                  <h3 className="font-black text-2xl md:text-3xl italic tracking-tighter uppercase">Petrol Voucher</h3>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="bg-white/10 p-2 md:p-3 rounded-full hover:bg-white/20 transition-all">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-8 md:p-10 space-y-6 md:space-y-8 max-h-[70vh] overflow-y-auto scrollbar-hide">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Date</label>
                    <input type="date" required className="w-full px-6 py-4 md:py-5 bg-slate-50 border-4 border-slate-100 rounded-2xl md:rounded-3xl font-black text-base md:text-lg outline-none focus:border-amber-400 transition-all" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Amount (Rs)</label>
                    <input 
                      type="number" 
                      min="1"
                      required 
                      className="w-full px-6 md:px-8 py-4 md:py-5 bg-slate-50 border-4 border-slate-100 rounded-2xl md:rounded-3xl font-black text-2xl md:text-3xl text-center outline-none focus:border-amber-500 transition-all" 
                      value={formData.amount} 
                      onChange={e => setFormData({...formData, amount: Math.max(0, parseFloat(e.target.value) || 0).toString()})} 
                      placeholder="0" 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Select Staff</label>
                  <select 
                    disabled={!isOwner}
                    className="w-full px-6 py-4 md:py-5 bg-slate-50 border-4 border-slate-100 rounded-2xl md:rounded-3xl font-black text-lg md:text-xl outline-none disabled:opacity-50 focus:border-amber-400 transition-all" 
                    value={formData.riderId}
                    onChange={e => setFormData({...formData, riderId: e.target.value})}
                  >
                    {riders.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Voucher Note</label>
                  <textarea className="w-full px-6 md:px-8 py-4 md:py-5 bg-slate-50 border-4 border-slate-100 rounded-2xl md:rounded-3xl font-bold text-base md:text-lg outline-none focus:border-amber-400 transition-all" rows={2} value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} placeholder="e.g. 5 Liters Petrol" />
                </div>

                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit" 
                  disabled={isProcessing || syncStatus === 'saving'}
                  className={`w-full py-5 md:py-6 bg-amber-500 text-white rounded-2xl md:rounded-[2rem] font-black text-xl md:text-2xl hover:bg-slate-900 transition-all shadow-2xl flex items-center justify-center gap-4 group ${isProcessing || syncStatus === 'saving' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {syncStatus === 'saving' ? 'Saving...' : 'Save Fuel Entry'} <ArrowRight size={28} />
                </motion.button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default PetrolLog;


export default PetrolLog;
