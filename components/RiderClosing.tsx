
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Truck, Wallet, Scale, CheckCircle,
  AlertCircle, Fuel, ChevronDown, ChevronUp, Landmark
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Rider, Delivery, Payment, RiderClosingRecord, Expense, RiderLoad, UserRole, Customer, PaymentMode } from '../types';
import { supabase } from '../services/supabaseClient';
import AuditHistory from './AuditHistory';

interface RiderClosingProps {
  riders: Rider[];
  customers: Customer[];
  deliveries: Delivery[];
  setDeliveries: React.Dispatch<React.SetStateAction<Delivery[]>>;
  payments: Payment[];
  setPayments: React.Dispatch<React.SetStateAction<Payment[]>>;
  expenses: Expense[];
  closingRecords: RiderClosingRecord[];
  setClosingRecords: React.Dispatch<React.SetStateAction<RiderClosingRecord[]>>;
  riderLoads: RiderLoad[];
  setRiderLoads: React.Dispatch<React.SetStateAction<RiderLoad[]>>;
  role: UserRole;
  setActiveTab: (tab: string) => void;
  riderFilterId: string;
}

const RiderClosing: React.FC<RiderClosingProps> = ({ 
  riders, customers, deliveries, payments, expenses, closingRecords, setClosingRecords, riderLoads, setActiveTab,
  riderFilterId
}) => {
  const [view, setView] = useState<'entry' | 'history'>('entry');
  const [selectedRiderId, setSelectedRiderId] = useState(riderFilterId !== 'all' ? riderFilterId : (riders[0]?.id || ''));
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showVerification, setShowVerification] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'pending'>('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [returnedMilk, setReturnedMilk] = useState('');
  const [wastageMilk, setWastageMilk] = useState(''); 
  const [physicalCash, setPhysicalCash] = useState('');
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    if (riderFilterId !== 'all') {
      const t = setTimeout(() => setSelectedRiderId(riderFilterId), 0);
      return () => clearTimeout(t);
    }
  }, [riderFilterId]);

  const filteredHistoryRecords = useMemo(() => {
    if (riderFilterId === 'all') return closingRecords;
    return closingRecords.filter(record => record.riderId === riderFilterId);
  }, [closingRecords, riderFilterId]);

  const matchedDeliveries = useMemo(() => {
    return (deliveries || []).filter(d => {
      if (d.date !== selectedDate || d.deleted) return false;
      if (d.riderId === selectedRiderId) return true;
      const cust = (customers || []).find(c => c.id === d.customerId);
      return cust && cust.riderId === selectedRiderId;
    });
  }, [selectedRiderId, selectedDate, deliveries, customers]);

  const appDeliveries = useMemo(() => {
    return matchedDeliveries.reduce((acc: number, d) => acc + (typeof d.liters === 'number' && !isNaN(d.liters) ? d.liters : 0), 0);
  }, [matchedDeliveries]);

  const matchedPayments = useMemo(() => {
    return (payments || []).filter(p => {
      if (p.date !== selectedDate || p.deleted) return false;
      const cust = (customers || []).find(c => c.id === p.customerId);
      return cust && cust.riderId === selectedRiderId;
    });
  }, [selectedRiderId, selectedDate, payments, customers]);

  const appCashCollected = useMemo(() => {
    // ACCOUNTING REFINEMENT: Only sum CASH payments for rider physical reconciliation
    return matchedPayments
      .filter(p => p.mode === PaymentMode.CASH)
      .reduce((acc: number, p) => acc + (typeof p.amount === 'number' && !isNaN(p.amount) ? p.amount : 0), 0);
  }, [matchedPayments]);

  const directPaymentsSum = useMemo(() => {
    // TRACKING: Show bank/wallet payments separately
    return matchedPayments
      .filter(p => p.mode !== PaymentMode.CASH)
      .reduce((acc: number, p) => acc + (typeof p.amount === 'number' && !isNaN(p.amount) ? p.amount : 0), 0);
  }, [matchedPayments]);

  const totalShopPickups = useMemo(() => {
    return (riderLoads || [])
      .filter(l => l.riderId === selectedRiderId && l.date === selectedDate)
      .reduce((acc: number, l) => acc + (l.liters || 0), 0);
  }, [selectedRiderId, selectedDate, riderLoads]);

  const riderExpenses = useMemo(() => {
    return (expenses || [])
      .filter(e => e.riderId === selectedRiderId && e.date === selectedDate)
      .reduce((acc: number, e) => acc + (e.amount || 0), 0);
  }, [selectedRiderId, selectedDate, expenses]);

  const returnVal = Math.max(0, parseFloat(returnedMilk || '0'));
  const wasteVal = Math.max(0, parseFloat(wastageMilk || '0'));
  const cashVal = Math.max(0, parseFloat(physicalCash || '0'));

  const totalAccountedMilk = appDeliveries + returnVal + wasteVal;
  const milkVariance = totalAccountedMilk - totalShopPickups;
  const isMilkShortage = milkVariance < -0.05; 

  const netExpectedCash = appCashCollected - riderExpenses;
  const cashVariance = cashVal - netExpectedCash;
  const isCashShortage = cashVariance < -5;

  const handleSaveClosing = async () => {
    if (totalShopPickups === 0) {
      alert("No Route Dispatches found for this date. Visit Issuance Hub first.");
      return;
    }

    if (isProcessing || syncStatus === 'saving') return;

    // Double-entry prevention: Check if audit already exists for this rider and date
    const existingAudit = closingRecords.find(r => r.riderId === selectedRiderId && r.date === selectedDate);
    if (existingAudit) {
      alert("AUDIT ALREADY EXISTS: A closing record for this rider and date has already been saved.");
      return;
    }
    
    const confirmAudit = window.confirm(
      `Confirm Verified Audit?\n\n` +
      `Dispatched: ${totalShopPickups.toFixed(1)} L\n` +
      `Delivered: ${appDeliveries.toFixed(1)} L\n\n` +
      `Cash Target: Rs. ${netExpectedCash.toLocaleString()}\n` +
      `Received: Rs. ${cashVal.toLocaleString()}\n\n` +
      `(Note: Rs. ${directPaymentsSum.toLocaleString()} Bank payments excluded from Galla)`
    );

    if (!confirmAudit) return;

    setIsProcessing(true);
    setSyncStatus('saving');

    const updatedDeliveries = deliveries.map(d => {
        const isThisRider = d.riderId === selectedRiderId || customers.find(c => c.id === d.customerId)?.riderId === selectedRiderId;
        if (d.date === selectedDate && isThisRider) {
            return { ...d, isLocked: true };
        }
        return d;
    });

    const newRecord: RiderClosingRecord = {
      id: generateId(),
      riderId: selectedRiderId,
      date: selectedDate,
      morningLoadLiters: totalShopPickups,
      appDeliveriesLiters: appDeliveries,
      returnedMilkLiters: returnVal,
      wastageLiters: wasteVal,
      expectedCashRecovery: appCashCollected,
      expenseDeductions: riderExpenses,
      physicalCashReceived: cashVal,
      auditRemarks: remarks || undefined,
      timestamp: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };

    let isCloudSuccess = false;
    try {
      const { error: rErr } = await supabase.from('dp_closing_records').upsert(newRecord);
      if (rErr) throw rErr;
      
      // Also update deliveries in cloud
      const lockedDeliveries = updatedDeliveries.filter(d => d.date === selectedDate && (d.riderId === selectedRiderId || customers.find(c => c.id === d.customerId)?.riderId === selectedRiderId));
      if (lockedDeliveries.length > 0) {
        const { error: dErr } = await supabase.from('dp_deliveries').upsert(lockedDeliveries);
        if (dErr) console.error("Failed to lock deliveries in cloud:", dErr);
      }
      
      isCloudSuccess = true;
    } catch (err) {
      console.error("Cloud save failed:", err);
      alert("AUDIT LOCK FAILED: Data not synchronized. Check internet.");
    }

    if (isCloudSuccess) {
      setSyncStatus('saved');
      setDeliveries(updatedDeliveries);
      setClosingRecords(prev => [newRecord, ...prev]);
    } else {
      setSyncStatus('idle');
      setIsProcessing(false);
      return;
    }
    
    setTimeout(() => {
      alert("Daily Audit locked and verified.");
      setReturnedMilk('');
      setWastageMilk('');
      setPhysicalCash('');
      setRemarks('');
      setIsProcessing(false);
      setSyncStatus('idle');
      setActiveTab('dashboard');
    }, 500);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-4 md:p-8 space-y-6 md:space-y-8 pb-32"
    >
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 md:p-6 rounded-[2rem] md:rounded-[2.5rem] border border-slate-200 shadow-sm">
        <div className="flex bg-slate-100 p-1.5 rounded-[1.5rem] w-full md:w-auto">
          <button onClick={() => setView('entry')} className={`flex-1 md:flex-none px-6 md:px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${view === 'entry' ? 'bg-white shadow-md text-blue-600' : 'text-slate-500'}`}>New Audit</button>
          <button onClick={() => setView('history')} className={`flex-1 md:flex-none px-6 md:px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${view === 'history' ? 'bg-white shadow-md text-blue-600' : 'text-slate-500'}`}>Audit History</button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {view === 'history' ? (
          <motion.div
            key="history"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <AuditHistory closingRecords={filteredHistoryRecords} riders={riders} />
          </motion.div>
        ) : (
          <motion.div
            key="entry"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6 md:space-y-8"
          >
            <div className="bg-slate-900 p-6 md:p-8 rounded-[2.5rem] md:rounded-[3.5rem] shadow-2xl border-4 border-white/5 flex flex-col md:flex-row gap-6 items-end">
              <div className="flex-1 w-full space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-4">Route Staff</label>
                <select className="w-full pl-6 pr-10 py-4 md:py-5 bg-white/5 border border-white/10 text-white rounded-2xl md:rounded-3xl font-black outline-none appearance-none" value={selectedRiderId} onChange={e => setSelectedRiderId(e.target.value)}>
                  {riders.map(r => <option key={r.id} value={r.id} className="text-slate-900">{r.name}</option>)}
                </select>
              </div>
              <div className="flex-1 w-full space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-4">Audit Date</label>
                <input type="date" className="w-full pl-6 pr-8 py-4 md:py-5 bg-white/5 border border-white/10 text-white rounded-2xl md:rounded-3xl font-black outline-none" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
              <motion.div 
                layout
                className="bg-white p-6 md:p-10 rounded-[2.5rem] md:rounded-[3.5rem] shadow-sm border border-slate-200 space-y-6 md:space-y-8"
              >
                <div className="flex items-center justify-between border-b pb-6">
                   <div className="flex items-center gap-4">
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><Scale size={24}/></div>
                      <h3 className="text-lg md:text-xl font-black text-slate-900 uppercase">Milk Reconciliation</h3>
                   </div>
                </div>

                <div className="space-y-6">
                   <AuditRow label="Morning Issuance" value={`${totalShopPickups.toFixed(1)} L`} icon={<Truck size={14}/>} />
                   
                   <div className="bg-blue-50/50 rounded-3xl border border-blue-100 overflow-hidden">
                      <div className="p-5 md:p-6 flex justify-between items-center">
                         <div>
                            <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">Total Logged (App)</p>
                            <p className="text-2xl md:text-3xl font-black text-blue-600 italic leading-none">{appDeliveries.toFixed(1)} L</p>
                         </div>
                         <motion.button 
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setShowVerification(!showVerification)} 
                          className="p-2.5 md:p-3 bg-white text-blue-600 rounded-xl shadow-sm border border-blue-100 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest transition-all"
                         >
                            {showVerification ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} {matchedDeliveries.length} Records
                         </motion.button>
                      </div>
                      
                      <AnimatePresence>
                        {showVerification && (
                           <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="px-6 pb-6 pt-2 space-y-2 overflow-hidden"
                           >
                              <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest grid grid-cols-2 border-b border-blue-100 pb-2 mb-2">
                                 <span>Customer</span>
                                 <span className="text-right">Quantity</span>
                              </div>
                              <div className="max-h-40 overflow-y-auto space-y-1.5 scrollbar-hide">
                                 {matchedDeliveries.length === 0 ? (
                                    <p className="text-[9px] text-slate-400 font-bold py-4 text-center">No data found.</p>
                                 ) : (
                                    matchedDeliveries.map((d, i) => (
                                       <motion.div 
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        key={i} 
                                        className="flex justify-between items-center text-[10px] font-bold py-1 border-b border-blue-50/50 last:border-0"
                                       >
                                          <span className="text-slate-600 truncate mr-4">{customers.find(c => c.id === d.customerId)?.name || 'Unknown'}</span>
                                          <span className="font-black text-blue-700 whitespace-nowrap">{d.liters.toFixed(1)}L</span>
                                       </motion.div>
                                    ))
                                 )}
                              </div>
                           </motion.div>
                        )}
                      </AnimatePresence>
                   </div>
                   
                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-4 block">Returned (L)</label>
                        <input type="number" step="0.5" className="w-full p-4 md:p-5 bg-slate-50 rounded-2xl text-xl md:text-2xl font-black border-2 border-slate-100 text-center outline-none focus:border-blue-400" placeholder="0.0" value={returnedMilk} onChange={e => setReturnedMilk(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-orange-400 uppercase ml-4 block">Wastage (L)</label>
                        <input type="number" step="0.5" className="w-full p-4 md:p-5 bg-slate-50 rounded-2xl text-xl md:text-2xl font-black border-2 border-slate-100 text-center outline-none focus:border-blue-400" placeholder="0.0" value={wastageMilk} onChange={e => setWastageMilk(e.target.value)} />
                      </div>
                   </div>

                   <motion.div 
                    layout
                    className={`p-6 md:p-8 rounded-3xl border-4 flex justify-between items-center ${isMilkShortage ? 'bg-red-50 border-red-100 text-red-600' : 'bg-green-50 border-green-200 text-green-600'}`}
                   >
                      <div>
                        <p className="text-[10px] font-black uppercase opacity-60">{isMilkShortage ? 'Shortage Reported' : 'Balanced'}</p>
                        <p className="text-2xl md:text-3xl font-black italic mt-1">{milkVariance.toFixed(1)} L</p>
                      </div>
                      {isMilkShortage ? <AlertCircle size={32} /> : <CheckCircle size={32} />}
                   </motion.div>
                </div>
              </motion.div>

              <motion.div 
                layout
                className="bg-white p-6 md:p-10 rounded-[2.5rem] md:rounded-[3.5rem] shadow-sm border border-slate-200 space-y-6 md:space-y-8"
              >
                <div className="flex items-center justify-between border-b pb-6">
                   <div className="flex items-center gap-4">
                      <div className="p-3 bg-green-50 text-green-600 rounded-2xl"><Wallet size={24}/></div>
                      <h3 className="text-lg md:text-xl font-black text-slate-900 uppercase">Cash Settlement (Galla)</h3>
                   </div>
                </div>

                <div className="space-y-6">
                   <AuditRow label="Cash Collected (Rider)" value={`Rs. ${appCashCollected.toLocaleString()}`} icon={<Wallet size={14}/>} />
                   
                   {directPaymentsSum > 0 && (
                     <div className="flex justify-between items-center px-4 py-2 bg-blue-50 rounded-xl border border-blue-100">
                        <div className="flex items-center gap-2 text-blue-600">
                           <Landmark size={12}/>
                           <span className="text-[9px] font-black uppercase">Direct Bank Payments</span>
                        </div>
                        <span className="text-xs font-black text-blue-700">Rs. {directPaymentsSum.toLocaleString()}</span>
                     </div>
                   )}

                   <AuditRow label="Route Expenses" value={`- Rs. ${riderExpenses.toLocaleString()}`} icon={<Fuel size={14}/>} color="text-red-500" />
                   
                   <div className="space-y-3 pt-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase text-center">Net Physical Handover</p>
                      <div className="relative">
                         <input 
                          type="number" className={`w-full p-6 md:p-8 rounded-3xl text-3xl md:text-5xl font-black text-center border-4 outline-none transition-all ${isCashShortage ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-900 text-green-400 border-slate-800'}`} 
                          placeholder="Rs. 0" 
                          value={physicalCash} 
                          onChange={e => setPhysicalCash(e.target.value)} 
                         />
                      </div>
                   </div>

                   <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase ml-4">Daily Remarks / Notes</label>
                      <textarea 
                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-blue-400" 
                        rows={2} 
                        placeholder="e.g. 2L spoiled due to heat..." 
                        value={remarks}
                        onChange={e => setRemarks(e.target.value)}
                      />
                   </div>

                   <motion.div 
                    layout
                    className={`p-6 md:p-8 rounded-3xl border-4 flex justify-between items-center ${isCashShortage ? 'bg-red-600 border-red-400 text-white' : 'bg-slate-100 border-slate-200 text-slate-900'}`}
                   >
                      <div>
                        <p className="text-[10px] font-black uppercase opacity-60">Cash Gap</p>
                        <p className="text-2xl md:text-3xl font-black italic mt-1">Rs. {cashVariance.toLocaleString()}</p>
                      </div>
                      {isCashShortage ? <AlertCircle size={32} /> : <CheckCircle size={32} />}
                   </motion.div>
                </div>
              </motion.div>
            </div>

            <div className="flex justify-center pt-4 md:pt-8">
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSaveClosing} 
                disabled={isProcessing || syncStatus === 'saving'}
                className={`w-full max-w-lg py-5 md:py-6 rounded-3xl font-black text-xl md:text-2xl bg-blue-600 text-white shadow-2xl flex items-center justify-center gap-4 transition-all ${isProcessing || syncStatus === 'saving' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {syncStatus === 'saving' ? 'Sealing Audit...' : 'Confirm & Seal Audit'} <CheckCircle size={28} />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const AuditRow = ({ label, value, icon, color = "text-slate-900" }: { label: string, value: string, icon: any, color?: string }) => (
  <div className="flex justify-between items-center py-4 border-b border-slate-50">
     <div className="flex items-center gap-3">
        <span className="text-slate-400">{icon}</span>
        <span className="text-xs font-black text-slate-500 uppercase leading-none">{label}</span>
     </div>
     <span className={`text-base md:text-lg font-black italic ${color}`}>{value}</span>
  </div>
);

export default RiderClosing;
