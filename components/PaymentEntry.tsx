
import React, { useState, useEffect } from 'react';
import { Wallet, Search, Landmark, Plus, X, Banknote, Smartphone, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Customer, Payment, PaymentMode, MonthLock } from '../types';
import { generateId } from '../services/dataStore';
import { supabase } from '../services/supabaseClient';
import { relationalDataService } from '../services/relationalDataService';

interface PaymentEntryProps {
  customers: Customer[];
  payments: Payment[];
  setPayments: React.Dispatch<React.SetStateAction<Payment[]>>;
  lockedMonths: MonthLock[];
}

const PaymentEntry: React.FC<PaymentEntryProps> = ({ customers, payments, setPayments, lockedMonths }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'pending'>('idle');
  const [formData, setFormData] = useState({
    customerId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    mode: PaymentMode.CASH,
    note: ''
  });

  // Load draft on mount
  useEffect(() => {
    try {
      const draft = localStorage.getItem('draft_payment');
      if (draft) {
        setTimeout(() => setFormData(JSON.parse(draft)), 0);
      }
    } catch (e) {
      console.error('Failed to load payment draft:', e);
    }
  }, []);

  // Save draft on change with debounce
  useEffect(() => {
  const timer = setTimeout(() => {
    if (formData.amount || formData.note || formData.customerId) {
      try {
        localStorage.setItem('draft_payment', JSON.stringify(formData));
      } catch (e) {
        console.warn('Failed to save payment draft to localStorage:', e);
      }
    } else {
      localStorage.removeItem('draft_payment');
    }
  }, 500);
  return () => clearTimeout(timer);
}, [formData]);

  // Split customers for the dropdown
  const activeCustomers = customers.filter(c => c.active).sort((a, b) => (a.deliveryOrder || 0) - (b.deliveryOrder || 0));
  const withdrawnCustomers = customers.filter(c => !c.active).sort((a, b) => (a.deliveryOrder || 0) - (b.deliveryOrder || 0));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customerId || !formData.amount) return;

    const amount = parseFloat(formData.amount);
    if (amount <= 0) {
      alert("Please enter a valid positive payment amount.");
      return;
    }

    const payDate = new Date(formData.date);
    const isLocked = lockedMonths.some(m => m.month === payDate.getMonth() && m.year === payDate.getFullYear());
    
    if (isLocked) {
      alert("This month is CLOSED and LOCKED. You cannot record payments for this date.");
      return;
    }

    if (isProcessing) return;

    // Double-entry prevention: Check for exact duplicate in the last 10 seconds
    const isDuplicate = payments.some(p => 
      p.customerId === formData.customerId && 
      p.amount === amount && 
      p.date === formData.date &&
      (new Date().getTime() - new Date(p.updatedAt).getTime() < 10000)
    );

    if (isDuplicate) {
      alert("DUPLICATE DETECTED: A payment with the same details was just recorded. Please wait or check history.");
      return;
    }

    setIsProcessing(true);
    setSyncStatus('saving');

    const requestId = generateId();
    const newPayment: Payment = {
      id: requestId,
      customerId: formData.customerId,
      amount: Math.max(0, amount),
      date: formData.date,
      mode: formData.mode,
      note: formData.note,
      clientRequestId: requestId,
      updatedAt: new Date().toISOString(),
      version: 1 // Never create records with version 0
    };

    let savedPayment: Payment | null = null;
    let wasDuplicate = false;
    try {
      const { data, error: pErr } = await supabase.rpc('save_standalone_payment', {
        p_payment: relationalDataService.toSnakeCase(newPayment)
      });
      if (pErr) throw pErr;
      if (!data?.payment) throw new Error('Payment was not confirmed by server.');
      savedPayment = relationalDataService.toCamelCase(data.payment) as Payment;
      wasDuplicate = Boolean(data.duplicate);
    } catch (err) {
      console.error("Cloud save failed:", err);
    }

    if (savedPayment) {
      setSyncStatus('saved');
      
      setPayments(prev => {
        const alreadyExists = prev.some(p => p.id === savedPayment.id);
        if (alreadyExists) return prev;
        return [savedPayment, ...prev];
      });
      if (wasDuplicate) {
        alert("Duplicate payment blocked: the existing server record was used.");
      }
    } else {
      setSyncStatus('idle');
      alert("PAYMENT SYNC FAILED: Record not confirmed on server. Please check internet.");
      setIsProcessing(false);
      return;
    }
    
    setTimeout(() => {
      setIsModalOpen(false);
      setFormData({ customerId: '', amount: '', date: new Date().toISOString().split('T')[0], mode: PaymentMode.CASH, note: '' });
      localStorage.removeItem('draft_payment');
      setSyncStatus('idle');
      setIsProcessing(false);
    }, 500);
  };

  const getCustomerName = (id: string) => customers.find(c => c.id === id)?.name || 'Unknown';

  return (
    <div className="space-y-6 pb-24">
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center"
      >
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search payments..."
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm font-bold text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <motion.button 
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-2xl hover:bg-green-700 transition-colors w-full md:w-auto justify-center font-black uppercase text-[10px] tracking-widest shadow-lg"
        >
          <Plus size={20} />
          Receive Payment
        </motion.button>
      </motion.div>

      {/* Mobile-friendly List View */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {payments
            .filter(p => getCustomerName(p.customerId).toLowerCase().includes(searchTerm.toLowerCase()))
            .map((payment, i) => (
              <motion.div 
                key={payment.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col gap-4"
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${payment.mode === PaymentMode.BANK ? 'bg-blue-100 text-blue-600' : payment.mode === PaymentMode.WALLET ? 'bg-purple-100 text-purple-600' : 'bg-green-100 text-green-600'}`}>
                      {payment.mode === PaymentMode.BANK ? <Landmark size={20} /> : 
                       payment.mode === PaymentMode.WALLET ? <Smartphone size={20} /> : 
                       <Banknote size={20} />}
                    </div>
                    <div>
                      <p className="font-black text-slate-900 text-sm">{getCustomerName(payment.customerId)}</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{new Date(payment.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-green-600 italic tracking-tighter">Rs. {payment.amount.toLocaleString()}</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{payment.mode}</p>
                  </div>
                </div>
                {payment.note && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-medium text-slate-500 italic">"{payment.note}"</p>
                  </div>
                )}
              </motion.div>
            ))}
        </AnimatePresence>
        
        {payments.length === 0 && (
          <div className="col-span-full py-20 flex flex-col items-center justify-center opacity-20">
            <Wallet size={48} />
            <p className="text-[10px] font-black uppercase tracking-widest mt-4">No payments recorded</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-md overflow-hidden border-8 border-slate-900"
          >
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-black text-2xl tracking-tighter uppercase italic">Receive Payment</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-white/10 rounded-full"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Select Customer</label>
                <select 
                  required
                  className="w-full p-4 bg-slate-50 border-4 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-blue-600"
                  value={formData.customerId}
                  onChange={e => setFormData({...formData, customerId: e.target.value})}
                >
                  <option value="">-- Choose Customer --</option>
                  <optgroup label="Active Delivery">
                    {activeCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                  <optgroup label="Withdrawn / Stopped">
                    {withdrawnCustomers.map(c => <option key={c.id} value={c.id}>{c.name} (Stopped)</option>)}
                  </optgroup>
                </select>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Amount (Rs.)</label>
                  <input 
                    type="number"
                    min="1"
                    required
                    className="w-full p-6 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-4xl text-center outline-none focus:border-green-600"
                    placeholder="0"
                    value={formData.amount}
                    onChange={e => setFormData({...formData, amount: Math.max(0, parseFloat(e.target.value) || 0).toString()})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Payment Date</label>
                  <input 
                    type="date"
                    required
                    className="w-full p-4 bg-slate-50 border-4 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-blue-600"
                    value={formData.date}
                    onChange={e => setFormData({...formData, date: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Payment Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.values(PaymentMode).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setFormData({...formData, mode})}
                      className={`p-4 rounded-2xl border-4 flex flex-col items-center justify-center gap-2 transition-all ${
                        formData.mode === mode 
                          ? 'bg-blue-600 border-blue-400 text-white shadow-xl scale-105' 
                          : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-200'
                      }`}
                    >
                      <span className="text-[9px] font-black uppercase tracking-widest">{mode}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Remarks / Note</label>
                <textarea 
                  className="w-full p-4 bg-slate-50 border-4 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-blue-600"
                  rows={2}
                  placeholder="e.g. Final Settlement"
                  value={formData.note}
                  onChange={e => setFormData({...formData, note: e.target.value})}
                />
              </div>

              <div className="pt-4 flex flex-col gap-3">
                {syncStatus === 'saving' && (
                  <div className="w-full py-4 bg-yellow-100 text-yellow-700 rounded-[2rem] font-black uppercase text-xs flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Saving...</div>
                )}
                {syncStatus === 'saved' && (
                  <div className="w-full py-4 bg-green-100 text-green-700 rounded-[2rem] font-black uppercase text-xs flex items-center justify-center gap-2"><CheckCircle size={16} /> Saved</div>
                )}
                {syncStatus === 'pending' && (
                  <div className="w-full py-4 bg-orange-100 text-orange-700 rounded-[2rem] font-black uppercase text-xs flex items-center justify-center gap-2"><AlertCircle size={16} /> Pending</div>
                )}
                {syncStatus === 'idle' && (
                  <button 
                    type="submit"
                    disabled={isProcessing}
                    className={`w-full py-6 bg-green-600 text-white rounded-[2rem] font-black text-2xl shadow-2xl active:scale-95 transition-all ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    Record Payment
                  </button>
                )}
                <button type="button" onClick={() => setIsModalOpen(false)} className="w-full py-4 text-slate-400 font-black uppercase text-[10px] tracking-[0.4em]">Cancel</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default React.memo(PaymentEntry);
