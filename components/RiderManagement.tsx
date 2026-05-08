
import React, { useState } from 'react';
import { Bike, Fuel, Plus, User, X, Key, Map, Banknote, ArrowRight, ShieldCheck, Calendar, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Rider, Expense, UserRole } from '../types';

interface RiderManagementProps {
  riders: Rider[];
  setRiders: React.Dispatch<React.SetStateAction<Rider[]>>;
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  role: UserRole;
}

const RiderManagement: React.FC<RiderManagementProps> = ({ riders, setRiders, expenses, setExpenses, role }) => {
  const [activeView, setActiveView] = useState<'profiles' | 'expenses'>(role === UserRole.OWNER ? 'profiles' : 'expenses');
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isRiderModalOpen, setIsRiderModalOpen] = useState(false);
  
  const [expenseForm, setExpenseForm] = useState({
    riderId: riders[0]?.id || '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    type: 'Petrol' as any,
    note: ''
  });

  const [riderForm, setRiderForm] = useState({
    name: '',
    route: '',
    salary: '',
    pin: ''
  });

  const isOwner = role === UserRole.OWNER;

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.riderId || !expenseForm.amount) return;
    
    const newExpense: Expense = {
      id: Math.random().toString(36).substr(2, 9),
      riderId: expenseForm.riderId,
      amount: parseFloat(expenseForm.amount),
      date: expenseForm.date,
      type: expenseForm.type,
      note: expenseForm.note,
      updatedAt: new Date().toISOString(),
      version: 0
    };
    setExpenses([newExpense, ...expenses]);
    setIsExpenseModalOpen(false);
  };

  const handleRiderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newRider: Rider = {
      id: Math.random().toString(36).substr(2, 9),
      name: riderForm.name,
      route: riderForm.route,
      salary: parseFloat(riderForm.salary) || 0,
      pin: riderForm.pin.padStart(4, '0'),
      role: 'Delivery Boy',
      updatedAt: new Date().toISOString(),
      version: 0
    };
    setRiders([...riders, newRider]);
    setIsRiderModalOpen(false);
    setRiderForm({ name: '', route: '', salary: '', pin: '' });
  };

  const getRiderName = (id: string) => riders.find(r => r.id === id)?.name || 'Unknown';

  const resetRiderForm = () => {
    setRiderForm({ name: '', route: '', salary: '', pin: '' });
  };

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full md:w-fit border border-slate-200">
        <button 
          onClick={() => setActiveView('profiles')}
          className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeView === 'profiles' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <User size={16} /> {isOwner ? 'Staff' : 'Profile'}
        </button>
        {isOwner && (
          <button 
            onClick={() => setActiveView('expenses')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeView === 'expenses' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Fuel size={16} /> Expenses
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {activeView === 'profiles' ? (
          <motion.div 
            key="profiles"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-10"
          >
            {riders.map(rider => (
              <motion.div 
                key={rider.id} 
                layout
                className="bg-white p-6 md:p-10 rounded-[2.5rem] md:rounded-[3.5rem] border-2 border-slate-100 shadow-sm relative overflow-hidden group hover:border-blue-600 transition-all"
              >
                <div className="bg-slate-900 text-white w-14 h-14 md:w-20 md:h-20 rounded-2xl md:rounded-[2rem] flex items-center justify-center mb-6 md:mb-8 shadow-xl group-hover:bg-blue-600 transition-colors">
                  <Bike size={28} className="md:hidden" />
                  <Bike size={40} className="hidden md:block" />
                </div>
                <h3 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight leading-none mb-2">{rider.name}</h3>
                <p className="text-blue-600 font-black text-[10px] uppercase tracking-[0.3em]">Area: {rider.route}</p>
                
                <div className="space-y-4 md:space-y-6 pt-6 md:pt-8 mt-6 md:mt-8 border-t-2 border-slate-50">
                  <div className="flex justify-between items-center bg-slate-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-100">
                    <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Key size={14}/> PIN</span>
                    <span className="font-black text-slate-900 text-lg md:text-xl tracking-[0.3em]">{rider.pin}</span>
                  </div>
                  <div className="flex justify-between items-center bg-blue-50/50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-blue-100">
                    <span className="text-[9px] md:text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2"><Banknote size={14}/> Salary</span>
                    <span className="font-black text-blue-900 text-base md:text-lg">Rs. {(rider.salary ?? 0).toLocaleString()}</span>
                  </div>
                  {isOwner && (
                    <div className="flex justify-between items-center bg-red-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-red-100">
                      <span className="text-[9px] md:text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center gap-2"><Fuel size={14}/> Petrol</span>
                      <span className="font-black text-red-600 text-base md:text-lg">
                        Rs. {(expenses.filter(e => e.riderId === rider.id).reduce((a, b) => a + (b.amount ?? 0), 0)).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            {isOwner && (
              <motion.button 
                whileTap={{ scale: 0.98 }}
                onClick={() => { resetRiderForm(); setIsRiderModalOpen(true); }}
                className="border-4 border-dashed border-slate-200 rounded-[2.5rem] md:rounded-[3.5rem] p-8 md:p-12 flex flex-col items-center justify-center text-slate-300 hover:border-blue-400 hover:text-blue-600 transition-all group"
              >
                <div className="bg-slate-50 p-4 md:p-6 rounded-full group-hover:bg-blue-50 transition-colors">
                  <Plus size={48} className="md:hidden" />
                  <Plus size={64} className="hidden md:block" />
                </div>
                <span className="font-black text-sm md:text-xl uppercase tracking-widest mt-6 md:mt-8">Add Staff</span>
              </motion.button>
            )}
          </motion.div>
        ) : (
          <motion.div 
            key="expenses"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 md:p-10 rounded-3xl md:rounded-[3rem] border border-slate-200 shadow-sm">
              <div>
                <h3 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tighter uppercase">Expense Tracking</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-1">Petrol, Vouchers & Repairs</p>
              </div>
              <button 
                onClick={() => setIsExpenseModalOpen(true)}
                className="w-full md:w-auto bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-900 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-3 active:scale-95"
              >
                <Plus size={20} /> Record Expense
              </button>
            </div>
            
            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {expenses.map(exp => (
                  <motion.div 
                    key={exp.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${exp.type === 'Petrol' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                          {exp.type === 'Petrol' ? <Fuel size={18} /> : <Banknote size={18} />}
                        </div>
                        <div>
                          <p className="font-black text-slate-900 leading-none">{getRiderName(exp.riderId || '')}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-1">
                            <Calendar size={10} /> {new Date(exp.date).toLocaleDateString('en-GB')}
                          </p>
                        </div>
                      </div>
                      <p className="font-black text-red-600 text-lg">Rs. {(exp.amount ?? 0).toLocaleString()}</p>
                    </div>
                    
                    {exp.note && (
                      <div className="flex items-start gap-2 bg-slate-50 p-3 rounded-xl">
                        <Info size={14} className="text-slate-400 mt-0.5" />
                        <p className="text-xs font-medium text-slate-600 italic leading-relaxed">{exp.note}</p>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              {expenses.length === 0 && (
                <div className="py-20 text-center text-slate-300 font-black uppercase tracking-widest text-sm">
                  No expenses recorded yet.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Rider Modal */}
      <AnimatePresence>
        {isRiderModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-end md:items-center justify-center p-0 md:p-4">
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-white rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden border-t md:border-4 border-slate-100"
            >
              <div className="p-6 md:p-8 bg-slate-900 text-white flex justify-between items-center">
                <div>
                  <h3 className="font-black text-xl md:text-2xl italic tracking-tighter">New Staff Account</h3>
                  <p className="text-slate-500 text-[9px] font-black uppercase tracking-[0.4em] mt-1">Create Mobile Credentials</p>
                </div>
                <button onClick={() => setIsRiderModalOpen(false)} className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-all"><X size={20} /></button>
              </div>
              <form onSubmit={handleRiderSubmit} className="p-6 md:p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Staff Full Name</label>
                  <div className="relative">
                    <input required className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg outline-none focus:border-blue-600 transition-all" value={riderForm.name} onChange={e => setRiderForm({...riderForm, name: e.target.value})} placeholder="e.g. Zeeshan Ali" />
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Assigned Route</label>
                  <div className="relative">
                    <input required className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg outline-none focus:border-blue-600 transition-all" value={riderForm.route} onChange={e => setRiderForm({...riderForm, route: e.target.value})} placeholder="e.g. Model Town" />
                    <Map className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Salary (Rs)</label>
                    <div className="relative">
                      <input type="number" required className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg outline-none focus:border-blue-600 transition-all" value={riderForm.salary} onChange={e => setRiderForm({...riderForm, salary: e.target.value})} />
                      <Banknote className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Login PIN</label>
                    <div className="relative">
                      <input 
                        type="password" 
                        maxLength={4} 
                        required 
                        className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-2xl outline-none focus:border-blue-600 tracking-[0.5em] text-center" 
                        value={riderForm.pin} 
                        onChange={e => setRiderForm({...riderForm, pin: e.target.value.replace(/\D/g, '')})} 
                        placeholder="****"
                      />
                      <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                    </div>
                  </div>
                </div>

                <button type="submit" className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-lg hover:bg-blue-600 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3 group">
                  Register Staff <ArrowRight size={24} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Expense Modal */}
      <AnimatePresence>
        {isExpenseModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-end md:items-center justify-center p-0 md:p-4">
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-white rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden border-t md:border-4 border-slate-100"
            >
              <div className="p-6 md:p-8 bg-blue-600 text-white flex justify-between items-center">
                <div>
                  <h3 className="font-black text-xl md:text-2xl italic tracking-tighter">Record Expense</h3>
                  <p className="text-blue-200 text-[9px] font-black uppercase tracking-[0.4em] mt-1">Deduct from daily cash</p>
                </div>
                <button onClick={() => setIsExpenseModalOpen(false)} className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-all"><X size={20} /></button>
              </div>
              <form onSubmit={handleExpenseSubmit} className="p-6 md:p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Select Rider</label>
                  <select 
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg outline-none focus:border-blue-600 transition-all" 
                    value={expenseForm.riderId}
                    onChange={e => setExpenseForm({...expenseForm, riderId: e.target.value})}
                  >
                    {riders.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Amount (Rs)</label>
                    <input type="number" required className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xl outline-none focus:border-blue-600 transition-all" value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Category</label>
                    <select className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg outline-none" value={expenseForm.type} onChange={e => setExpenseForm({...expenseForm, type: e.target.value as any})}>
                      <option value="Petrol">Petrol</option>
                      <option value="Salary">Advance Salary</option>
                      <option value="Other">Repairs/Other</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Detailed Note</label>
                  <textarea className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base outline-none" rows={2} value={expenseForm.note} onChange={e => setExpenseForm({...expenseForm, note: e.target.value})} placeholder="e.g. Generator petrol 5 liters" />
                </div>

                <button type="submit" className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-lg hover:bg-slate-900 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3 group">
                  Save Voucher <ArrowRight size={24} />
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RiderManagement;
