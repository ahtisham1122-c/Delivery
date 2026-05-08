
import React, { useState, useMemo } from 'react';
import { Receipt, X, Filter, Fuel, Snowflake, Hammer, Zap, User, ShieldAlert, Printer, Settings2, Monitor, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Expense, UserRole, Rider, ExpenseType, MonthlyArchive } from '../types';
import { formatPKR, generateId } from '../services/dataStore';
import { supabase } from '../services/supabaseClient';
import { relationalDataService } from '../services/relationalDataService';

interface ExpenseManagementProps {
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  riders: Rider[];
  role: UserRole;
  riderFilterId: string;
  archives: MonthlyArchive[];
}

const ExpenseManagement: React.FC<ExpenseManagementProps> = ({ expenses, setExpenses, riders, riderFilterId, archives }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'pending'>('idle');
  const [printProfile, setPrintProfile] = useState<'A4' | '80' | '58'>('80');
  const [printFontSize, setPrintFontSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [showPrintSettings, setShowPrintSettings] = useState(false);

  const [formData, setFormData] = useState({ 
    amount: '', 
    date: new Date().toISOString().split('T')[0], 
    type: 'Repair' as ExpenseType, 
    note: '', 
    riderId: '' 
  });

  const filteredExpenses = useMemo(() => 
    riderFilterId === 'all' ? expenses : expenses.filter(e => e.riderId === riderFilterId),
  [expenses, riderFilterId]);

  const isPeriodClosed = useMemo(() => {
    const dt = new Date(formData.date);
    return (archives || []).some(a => a.month === dt.getMonth() && a.year === dt.getFullYear());
  }, [formData.date, archives]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
        alert("INVALID AMOUNT: Expense must be greater than 0.");
        return;
    }
    if (isPeriodClosed) {
        alert("Cannot record expenses for an archived month.");
        return;
    }

    if (isProcessing || syncStatus === 'saving') return;

    // Double-entry prevention: Check for exact duplicate in the last 10 seconds
    const isDuplicate = expenses.some(e => 
      e.type === formData.type && 
      e.amount === parseFloat(formData.amount) && 
      e.date === formData.date &&
      e.riderId === (riderFilterId !== 'all' ? riderFilterId : (formData.riderId || undefined)) &&
      (new Date().getTime() - new Date(e.updatedAt).getTime() < 10000)
    );

    if (isDuplicate) {
      alert("DUPLICATE DETECTED: An expense with the same details was just recorded. Please wait or check history.");
      return;
    }

    setIsProcessing(true);
    setSyncStatus('saving');

    const newExpense: Expense = {
      id: generateId(),
      amount: parseFloat(formData.amount),
      date: formData.date,
      type: formData.type,
      note: formData.note,
      riderId: riderFilterId !== 'all' ? riderFilterId : (formData.riderId || undefined),
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
      alert("SYNC ERROR: Expense not confirmed on server. Check connection.");
    }

    if (isCloudSuccess) {
      setSyncStatus('saved');
      setExpenses(prev => [newExpense, ...prev]);
    } else {
      setSyncStatus('idle');
      setIsProcessing(false);
      return;
    }
    
    // Reset processing after a short delay
    setTimeout(() => {
      setIsModalOpen(false);
      setFormData({ amount: '', date: new Date().toISOString().split('T')[0], type: 'Repair', note: '', riderId: '' });
      setIsProcessing(false);
      setSyncStatus('idle');
    }, 500);
  };

  const getCategoryIcon = (type: ExpenseType) => {
    switch (type) {
        case 'Petrol': return <Fuel size={14}/>;
        case 'Baraf (Ice)': return <Snowflake size={14}/>;
        case 'Generator': return <Zap size={14}/>;
        case 'Repair': return <Hammer size={14}/>;
        case 'Salary': return <User size={14}/>;
        default: return <Receipt size={14}/>;
    }
  };

  return (
    <div className="space-y-8 pb-24">
      {/* THERMAL PRINT DOCUMENT */}
      <div className={`print-only thermal-${printProfile} print-text-${printFontSize} space-y-4 text-slate-900`}>
        <div className="text-center space-y-1">
          <h1 className="font-black text-lg uppercase tracking-tight">Gujjar Milk Shop</h1>
          <p className="font-bold text-[10px]">Expense Report</p>
          <div className="border-dashed-print"></div>
          <div className="flex justify-between font-black text-[10px]">
            <span>Date: {new Date().toLocaleDateString('en-GB')}</span>
            <span>Ref: #{generateId().substring(0, 8).toUpperCase()}</span>
          </div>
          <div className="border-dashed-print"></div>
        </div>

        <div className="space-y-2">
          {filteredExpenses.map((exp, i) => (
            <div key={i} className="flex justify-between items-start text-[10px]">
              <div className="flex-1">
                <p className="font-black leading-tight">{exp.type}</p>
                <p className="opacity-70 text-[8px]">{new Date(exp.date).toLocaleDateString('en-GB')}</p>
              </div>
              <div className="text-right">
                <p className="font-black">Rs.{formatPKR(exp.amount)}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="border-dashed-print"></div>
        <div className="flex justify-between font-black text-[10px]">
          <span>TOTAL EXPENSES:</span>
          <span>Rs.{formatPKR(filteredExpenses.reduce((acc, e) => acc + e.amount, 0))}</span>
        </div>

        <div className="border-dashed-print pt-4"></div>
        <p className="text-[8px] text-center font-bold opacity-60">
          Generated via Gujjar Digital Ledger
        </p>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center bg-white p-6 md:p-8 rounded-[2.5rem] md:rounded-[3rem] border-2 border-slate-100 shadow-sm relative overflow-hidden no-print"
      >
        {riderFilterId !== 'all' && (
           <div className="absolute top-0 right-0 bg-indigo-600 text-white px-8 py-2 rounded-bl-3xl font-black text-[8px] uppercase tracking-widest flex items-center gap-2">
            <Filter size={10}/> Route Specific View
          </div>
        )}
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div>
            <h3 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tighter uppercase leading-none">Route Expenses</h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Field Costs & Maintenance (Rs.)</p>
          </div>
          <div className="flex gap-2 ml-auto md:ml-0">
            <motion.button 
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowPrintSettings(!showPrintSettings)}
              className={`p-3 md:p-4 rounded-2xl transition-all ${showPrintSettings ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}
            >
              <Settings2 size={20}/>
            </motion.button>
            <motion.button 
              whileTap={{ scale: 0.95 }}
              onClick={() => window.print()} 
              className="p-3 md:p-4 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all"
            >
              <Printer size={20} />
            </motion.button>
          </div>
        </div>
        <motion.button 
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsModalOpen(true)} 
          className="bg-indigo-600 text-white px-10 py-5 rounded-3xl font-black text-lg uppercase tracking-widest hover:bg-slate-900 transition-all shadow-xl shadow-indigo-200 flex items-center gap-4 w-full md:w-auto justify-center"
        >
          <Receipt size={24} /> New Voucher
        </motion.button>
      </motion.div>

      {/* PRINT SETTINGS PANEL */}
      <AnimatePresence>
        {showPrintSettings && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white p-6 rounded-[2rem] border-2 border-indigo-100 shadow-xl no-print space-y-6"
          >
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Paper Size / پیپر کا سائز</p>
                   <div className="flex bg-slate-100 p-1 rounded-2xl">
                      <button onClick={() => setPrintProfile('A4')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-[10px] transition-all ${printProfile === 'A4' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}><Monitor size={14}/> A4 Page</button>
                      <button onClick={() => setPrintProfile('80')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-[10px] transition-all ${printProfile === '80' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}><Smartphone size={14}/> 80mm</button>
                      <button onClick={() => setPrintProfile('58')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-[10px] transition-all ${printProfile === '58' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}><Smartphone size={12}/> 58mm</button>
                   </div>
                </div>
                <div className="space-y-3">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Text Size / لکھائی کا سائز</p>
                   <div className="flex bg-slate-100 p-1 rounded-2xl">
                      <button onClick={() => setPrintFontSize('sm')} className={`flex-1 py-3 rounded-xl font-black text-[10px] transition-all ${printFontSize === 'sm' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Small</button>
                      <button onClick={() => setPrintFontSize('md')} className={`flex-1 py-3 rounded-xl font-black text-[10px] transition-all ${printFontSize === 'md' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Normal</button>
                      <button onClick={() => setPrintFontSize('lg')} className={`flex-1 py-3 rounded-xl font-black text-[10px] transition-all ${printFontSize === 'lg' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Large</button>
                   </div>
                </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile-friendly List View */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 no-print">
        <AnimatePresence mode="popLayout">
          {filteredExpenses.map((exp) => (
            <motion.div 
              key={exp.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              layout
              className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col gap-4"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    {getCategoryIcon(exp.type)}
                  </div>
                  <div>
                    <p className="font-black text-slate-900 text-sm">{exp.type}</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{new Date(exp.date).toLocaleDateString('en-GB')}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-red-600 italic tracking-tighter">Rs. {formatPKR(exp.amount)}</p>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{exp.riderId ? riders.find(r => r.id === exp.riderId)?.name : 'Main Shop'}</p>
                </div>
              </div>
              {exp.note && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-medium text-slate-500 italic">"{exp.note}"</p>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredExpenses.length === 0 && (
          <div className="col-span-full py-20 text-center opacity-20">
            <Receipt size={48} className="mx-auto" />
            <p className="text-[10px] font-black uppercase tracking-widest mt-4">No expenses found</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[150] flex items-end md:items-center justify-center p-0 md:p-4"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-t-[2.5rem] md:rounded-[3.5rem] shadow-2xl w-full max-w-xl overflow-hidden border-t-8 md:border-8 border-indigo-600"
            >
              <div className="p-6 md:p-10 bg-indigo-600 text-white flex justify-between items-center">
                <div>
                  <h3 className="font-black text-2xl md:text-3xl italic tracking-tighter uppercase leading-none">Record Expense</h3>
                  <p className="text-indigo-300 text-[8px] md:text-[10px] font-black uppercase tracking-[0.4em] mt-1">Voucher Entry</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 md:p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all"><X size={20} /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 md:p-10 space-y-6 md:space-y-8 overflow-y-auto max-h-[75vh]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                  <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Voucher Date</label>
                      <input type="date" required className={`w-full p-5 md:p-6 rounded-2xl md:rounded-3xl font-black text-lg outline-none border-4 transition-all ${isPeriodClosed ? 'bg-red-50 border-red-500 text-red-600' : 'bg-slate-50 border-slate-100 focus:border-indigo-500'}`} value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                  </div>
                  <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Amount (Rs.)</label>
                      <input type="number" required className="w-full p-6 md:p-8 bg-slate-50 border-4 border-slate-100 rounded-2xl md:rounded-[2.5rem] font-black text-3xl md:text-4xl text-center outline-none focus:border-indigo-500" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} placeholder="0" />
                  </div>
                </div>

                {isPeriodClosed && (
                   <div className="bg-red-50 border-2 border-red-200 p-4 rounded-2xl flex items-center gap-4 animate-bounce">
                      <ShieldAlert className="text-red-600" />
                      <p className="text-[10px] font-black text-red-800 uppercase">Warning: This date belongs to a CLOSED ARCHIVE.</p>
                   </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Expense Category</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {['Petrol', 'Repair', 'Baraf (Ice)', 'Generator', 'Salary', 'Other'].map(cat => (
                          <button 
                              key={cat} type="button" 
                              onClick={() => setFormData({...formData, type: cat as ExpenseType})}
                              className={`p-3 md:p-4 rounded-xl md:rounded-2xl font-black text-[10px] uppercase tracking-widest border-4 transition-all ${formData.type === cat ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg scale-105' : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-200'}`}
                          >
                              {cat}
                          </button>
                      ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Staff Attribution</label>
                  <select className="w-full p-5 md:p-6 bg-slate-50 border-4 border-slate-100 rounded-2xl md:rounded-3xl font-black text-lg outline-none focus:border-indigo-500" value={riderFilterId !== 'all' ? riderFilterId : formData.riderId} disabled={riderFilterId !== 'all'} onChange={e => setFormData({...formData, riderId: e.target.value})}>
                    <option value="">General Shop Account</option>
                    {riders.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                
                <textarea className="w-full p-5 md:p-6 bg-slate-50 border-4 border-slate-100 rounded-2xl md:rounded-3xl font-bold text-lg outline-none focus:border-indigo-500" rows={2} value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} placeholder="Voucher description (optional)..." />
                
                <div className="flex flex-col gap-3">
                  <motion.button 
                    whileTap={{ scale: 0.98 }}
                    disabled={isPeriodClosed || isProcessing || syncStatus === 'saving'} 
                    type="submit" 
                    className={`w-full py-6 md:py-8 rounded-2xl md:rounded-[2.5rem] font-black text-xl md:text-2xl transition-all shadow-2xl ${isPeriodClosed || isProcessing || syncStatus === 'saving' ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-slate-900'}`}
                  >
                    {isPeriodClosed ? 'Archived Month' : syncStatus === 'saving' ? 'Saving...' : 'Save Voucher'}
                  </motion.button>
                  <button type="button" onClick={() => setIsModalOpen(false)} className="w-full py-4 text-slate-400 font-black uppercase text-[10px] tracking-[0.4em]">Cancel</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default React.memo(ExpenseManagement);
