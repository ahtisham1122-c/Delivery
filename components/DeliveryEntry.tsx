
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  ClipboardList, Save, CheckCircle, Search, History, X, 
  ChevronRight, ChevronLeft, LayoutList, Target, Lock, ShieldCheck,
  AlertCircle, RefreshCcw, Calculator as CalcIcon, 
  TrendingUp, TrendingDown, Activity, Zap, Pencil, AlertOctagon, 
  ArrowRight, Database, Printer, MessageCircle, AlertTriangle, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Customer, Delivery, PriceRecord, Rider, Payment, PaymentMode, UserRole, PaymentCycle, MonthlyArchive, RiderLoad, AuditLog } from '../types';
import { findPriceForDate, formatPKR, generateId } from '../services/dataStore';
import { supabase } from '../services/supabaseClient';
import { calculateCycleBreakdown } from '../services/ledgerUtils';
import { printService } from '../services/printService';
import { exportService } from '../services/exportService';
import { relationalDataService } from '../services/relationalDataService';
import { SummaryReceipt } from './Receipts';

interface DeliveryEntryProps {
  customers: Customer[];
  deliveries: Delivery[];
  setDeliveries: React.Dispatch<React.SetStateAction<Delivery[]>>;
  prices: PriceRecord[];
  riders: Rider[];
  payments: Payment[];
  setPayments: React.Dispatch<React.SetStateAction<Payment[]>>;
  archives: MonthlyArchive[];
  riderId?: string; 
  role: UserRole; 
  balances: Record<string, number>;
  onOpenCalc?: (customer: Customer) => void;
  riderLoads: RiderLoad[];
  setAuditLogs: React.Dispatch<React.SetStateAction<AuditLog[]>>;
}

const DeliveryRow = React.memo(({ 
  customer, 
  deliveries, 
  payments, 
  balances, 
  prices, 
  selectedDate, 
  deliveryInputsRef, 
  cashInputsRef, 
  saveDrafts, 
  onOpenCalc, 
  setHistoryCustomerId, 
  setAdjustmentModalCustomer, 
  handleSaveEntry, 
  isOwner, 
  isSwipeView, 
  jumpToNextPending,
  syncStatus
}: { 
  customer: Customer, 
  deliveries: Delivery[], 
  payments: Payment[], 
  balances: Record<string, number>, 
  prices: PriceRecord[], 
  selectedDate: string, 
  deliveryInputsRef: React.MutableRefObject<Record<string, string>>, 
  cashInputsRef: React.MutableRefObject<Record<string, string>>, 
  saveDrafts: () => void,
  onOpenCalc?: (customer: Customer) => void, 
  setHistoryCustomerId: (id: string) => void, 
  setAdjustmentModalCustomer: (c: Customer) => void, 
  handleSaveEntry: (c: Customer, liters: number, cash: number, autoNext: boolean) => Promise<void>, 
  isOwner: boolean, 
  isSwipeView: boolean, 
  jumpToNextPending: () => void,
  syncStatus?: 'saving' | 'saved' | 'pending'
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  
  const onSave = async () => {
    if (isProcessing || syncStatus === 'saving') return;
    setIsProcessing(true);
    try {
      await handleSaveEntry(customer, draftLiters, draftCash, isSwipeView);
    } catch (err) {
      console.error("Save failed:", err);
      alert("Save failed. Please try again.");
    } finally {
      // Keep disabled for a short moment to prevent rapid clicks even after save
      setTimeout(() => setIsProcessing(false), 500);
    }
  };
  const dayDeliveries = useMemo(() => deliveries.filter(d => d.date === selectedDate && !d.deleted), [deliveries, selectedDate]);
  const dayPayments = useMemo(() => payments.filter(p => p.date === selectedDate && !p.deleted), [payments, selectedDate]);
  const originalD = useMemo(() => dayDeliveries.find(d => !d.isAdjustment), [dayDeliveries]);
  const isLocked = !!originalD;
  const totalBalance = balances[customer.id] || 0;
  
  const milkRate = useMemo(() => {
    if (isLocked && originalD) return originalD.priceAtTime;
    try { return findPriceForDate(selectedDate, customer, prices); } catch { return -1; }
  }, [isLocked, originalD, selectedDate, customer, prices]);

  const rateError = milkRate === -1;

  const [localMilk, setLocalMilk] = useState(deliveryInputsRef.current[customer.id] !== undefined ? deliveryInputsRef.current[customer.id] : (originalD?.liters.toString() || ''));
  const [localCash, setLocalCash] = useState(cashInputsRef.current[customer.id] !== undefined ? cashInputsRef.current[customer.id] : ((dayPayments.find(p=>!p.isAdjustment)?.amount.toString()) || ''));

  useEffect(() => {
    const currentDraft = deliveryInputsRef.current[customer.id] || '';
    if (localMilk !== currentDraft) {
      if (localMilk.trim()) {
        deliveryInputsRef.current[customer.id] = localMilk;
      } else {
        delete deliveryInputsRef.current[customer.id];
      }
      saveDrafts();
    }
  }, [localMilk, customer.id, saveDrafts, deliveryInputsRef]);

  useEffect(() => {
    const currentDraft = cashInputsRef.current[customer.id] || '';
    if (localCash !== currentDraft) {
      if (localCash.trim()) {
        cashInputsRef.current[customer.id] = localCash;
      } else {
        delete cashInputsRef.current[customer.id];
      }
      saveDrafts();
    }
  }, [localCash, customer.id, saveDrafts, cashInputsRef]);

  useEffect(() => {
    if (originalD) setLocalMilk(originalD.liters.toString());
  }, [originalD]);

  useEffect(() => {
    const p = dayPayments.find(p=>!p.isAdjustment);
    if (p) setLocalCash(p.amount.toString());
  }, [dayPayments]);

  const draftLiters = parseFloat(localMilk) || 0;
  const draftCash = parseFloat(localCash) || 0;
  const draftBill = Math.round(draftLiters * (rateError ? 0 : milkRate));
  const projectedNewBalance = Math.round(totalBalance + draftBill - draftCash);
  const hasActiveDraft = draftLiters > 0 || draftCash > 0;

  const customerBreakdown = useMemo(
    () => calculateCycleBreakdown(customer, deliveries, payments, totalBalance, new Date(`${selectedDate}T12:00:00`)),
    [customer, deliveries, payments, totalBalance, selectedDate]
  );

  const typicalLiters = useMemo(() => {
    const history = deliveries.filter(d => !d.isAdjustment && !d.deleted).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    if (history.length < 3) return null;
    const val = history[0].liters;
    const isConsistent = history.every(h => Math.abs(h.liters - val) < 0.1);
    return isConsistent ? val : null;
  }, [deliveries]);

  const handleWhatsApp = () => {
    if (!customer.phone) {
      alert("No phone number saved for this customer.");
      return;
    }
    
    let message = `*Milk Delivery Update*\n\nHello ${customer.name},\n`;
    if (originalD) {
      message += `Today's Delivery: ${originalD.liters}L\n`;
    } else if (draftLiters > 0) {
      message += `Today's Delivery: ${draftLiters}L\n`;
    }
    
    const todayP = dayPayments.find(p => !p.isAdjustment);
    if (todayP) {
      message += `Cash Received: Rs. ${todayP.amount}\n`;
    } else if (draftCash > 0) {
      message += `Cash Received: Rs. ${draftCash}\n`;
    }
    
    const displayBalance = isLocked ? totalBalance : projectedNewBalance;
    message += `\n*Current Balance: Rs. ${formatPKR(Math.abs(displayBalance))}* ${displayBalance > 0 ? '(Pending)' : '(Advance)'}\n\nThank you!`;
    
    let phone = customer.phone.replace(/\D/g, '');
    if (phone.startsWith('0')) phone = '92' + phone.substring(1);
    
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  return (
    <motion.div 
      initial={isSwipeView ? { opacity: 0, x: 50 } : { opacity: 0, y: 20 }}
      animate={isSwipeView ? { opacity: 1, x: 0 } : { opacity: 1, y: 0 }}
      exit={isSwipeView ? { opacity: 0, x: -50 } : { opacity: 0, y: -20 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className={`bg-white rounded-[3.5rem] border border-slate-200 overflow-hidden shadow-sm flex flex-col transition-all duration-500 h-auto min-h-[600px] ${isSwipeView ? 'max-w-2xl mx-auto w-full' : 'mb-6 max-w-4xl mx-auto'}`}
    >
      <div className={`p-8 border-b border-slate-100 flex justify-between items-center shrink-0 ${isLocked ? 'bg-amber-50' : 'bg-slate-50'}`}>
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-lg transition-all ${isLocked ? 'bg-amber-600 text-white' : 'bg-slate-900 text-white'}`}>
            {isLocked ? <Lock size={24}/> : customer.deliveryOrder}
          </div>
          <div>
            <div className="flex items-center gap-2">
               <h4 className="font-black text-slate-900 text-lg tracking-tight leading-none">{customer.name}</h4>
               {hasActiveDraft && !isLocked && <Pencil size={12} className="text-blue-500 animate-pulse"/>}
               <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${customer.paymentCycle === PaymentCycle.DAILY ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>{customer.paymentCycle}</span>
            </div>
            <p className="text-3xl font-black text-blue-600 mt-1" dir="rtl">{customer.urduName}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {customer.phone && (
            <button onClick={handleWhatsApp} className="p-4 bg-white border border-slate-200 text-slate-400 hover:text-green-500 rounded-2xl transition-all shadow-sm active:scale-95"><MessageCircle size={22} /></button>
          )}
          <button onClick={() => onOpenCalc?.(customer)} className="p-4 bg-white border border-slate-200 text-slate-400 hover:text-green-600 rounded-2xl transition-all shadow-sm active:scale-95"><CalcIcon size={22} /></button>
          <button onClick={() => setHistoryCustomerId(customer.id)} className="p-4 bg-white border border-slate-200 text-slate-400 hover:text-blue-600 rounded-2xl transition-all shadow-sm active:scale-95"><History size={22} /></button>
        </div>
      </div>

      <div className="p-8 space-y-8">
        <div className={`p-8 rounded-[2.5rem] border-4 flex flex-col gap-4 shadow-xl transition-all ${totalBalance > 0.01 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
           <div className="flex justify-between items-center">
              <div>
                 <p className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${totalBalance > 0.01 ? 'text-red-600/60' : 'text-green-600/60'}`}>
                   Account Status (Rs.) <span className="text-[8px] opacity-40 italic">بیلنس</span>
                 </p>
                 <p className={`text-5xl font-black italic tracking-tighter ${totalBalance > 0.01 ? 'text-red-600' : 'text-green-600'}`}>Rs. {formatPKR(Math.abs(totalBalance))}</p>
              </div>
              {isLocked && <div className="bg-amber-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 animate-in slide-in-from-right-4"><Lock size={12}/> Sealed</div>}
           </div>
        </div>

        <div className="p-6 bg-slate-900 rounded-[2.5rem] border-4 border-slate-800 shadow-2xl space-y-4 animate-in slide-in-from-bottom-4">
             <div className="flex items-center gap-3">
               <div className="bg-blue-600 p-2 rounded-xl">
                 <Database size={16} className="text-white" />
               </div>
               <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Previous Dues Breakdown</h3>
             </div>
              <div className="grid grid-cols-1 gap-3">
                {customerBreakdown.length > 0 ? customerBreakdown.map((cycle) => (
                  <div key={cycle.cycleName} className="flex justify-between items-center p-4 bg-white/5 rounded-2xl border border-white/5">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{cycle.cycleName}</span>
                    <span className={`text-sm font-black italic tracking-tighter ${cycle.outstanding > 0 ? 'text-red-400' : 'text-green-400'}`}>
                     Rs. {formatPKR(Math.abs(cycle.outstanding))}
                     {cycle.outstanding < 0 && <span className="text-[8px] ml-1 not-italic opacity-60">(Adv)</span>}
                    </span>
                  </div>
                )) : (
                  <div className="flex justify-between items-center p-4 bg-white/5 rounded-2xl border border-white/5">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">All Cycles Settled</span>
                    <span className="text-sm font-black italic tracking-tighter text-green-400">Rs. 0</span>
                  </div>
                )}
              </div>
           </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <div className="space-y-2">
              <div className="flex justify-between items-end ml-4">
                <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest leading-none">Milk (Liters)</label>
                <div className="flex gap-2">
                  {typicalLiters && !isLocked && <button onClick={() => setLocalMilk(typicalLiters.toString())} className="bg-blue-600 text-white px-3 py-1 rounded-lg text-[8px] font-black uppercase animate-pulse shadow-lg">Auto: {typicalLiters}L</button>}
                  <label className="text-[14px] font-bold text-blue-500/60 leading-none">دودھ</label>
                </div>
              </div>
              <div className="relative">
                <input type="number" step="0.5" inputMode="decimal" pattern="[0-9]*" disabled={isLocked || rateError} className={`w-full p-6 rounded-3xl border-4 text-4xl font-black text-center outline-none transition-all ${!isLocked && draftLiters > 0 ? 'bg-blue-100 border-blue-400' : 'bg-blue-50 border-blue-100 focus:border-blue-500'} disabled:bg-slate-50 disabled:border-slate-100 disabled:text-slate-400`} value={localMilk} onChange={e => setLocalMilk(e.target.value)} placeholder="0.0" />
                {!isLocked && draftLiters > 0 && !rateError && (
                  <div className="absolute -top-4 right-6">
                    <p className={`text-[10px] font-black bg-white px-3 py-1 rounded-full border-2 shadow-lg uppercase tracking-tighter animate-bounce text-blue-600 border-blue-300`}>
                       + Rs. {formatPKR(draftBill)}
                    </p>
                  </div>
                )}
              </div>
           </div>
           <div className="space-y-2">
              <div className="flex justify-between items-end ml-4">
                <label className="text-[10px] font-black text-green-600 uppercase tracking-widest leading-none">Cash Received (Rs)</label>
                <label className="text-[14px] font-bold text-green-600/60 leading-none">نقد وصولی</label>
              </div>
              <input type="number" inputMode="numeric" pattern="[0-9]*" disabled={isLocked} className={`w-full p-6 rounded-3xl text-slate-900 text-4xl font-black text-center outline-none border-4 transition-all ${!isLocked && draftCash > 0 ? 'bg-green-100 border-green-400' : 'bg-slate-50 border-slate-100 focus:border-green-500'} disabled:bg-slate-50 disabled:border-slate-100 disabled:text-slate-400`} value={localCash} onChange={e => setLocalCash(e.target.value)} placeholder="Rs. 0" />
           </div>
        </div>

        {!isLocked && hasActiveDraft && !rateError && (
          <div className="p-6 bg-slate-900 rounded-[2.5rem] shadow-2xl border-4 border-white/5 animate-in zoom-in-95">
             <div className="flex justify-between items-center mb-4">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Financial Impact / مالی اثر</p>
                <Zap size={16} className="text-amber-500 animate-pulse" />
             </div>
             <div className="flex justify-between items-end">
                <div className="space-y-4">
                  <div>
                     <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Old Bal / پچھلا بقایا</p>
                     <span className="text-xs font-black text-slate-400 line-through">Rs. {formatPKR(Math.abs(totalBalance))}</span>
                  </div>
                  <div>
                     <p className="text-[10px] font-black text-white uppercase mb-1 tracking-widest">New Closing / نیا بقایا</p>
                     <p className={`text-4xl font-black italic tracking-tighter ${projectedNewBalance > 0.01 ? 'text-red-400' : 'text-green-400'}`}>Rs. {formatPKR(Math.abs(projectedNewBalance))}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`flex items-center gap-2 justify-end px-4 py-2 rounded-2xl bg-white/5 border ${ (draftBill - draftCash) >= 0 ? 'border-red-900/50' : 'border-green-900/50'}`}>
                     {(draftBill - draftCash) >= 0 ? <TrendingUp size={16} className="text-red-400"/> : <TrendingDown size={16} className="text-green-400"/>}
                     <span className={`text-lg font-black italic ${ (draftBill - draftCash) >= 0 ? 'text-red-400' : 'text-green-400'}`}>{formatPKR(Math.abs(draftBill - draftCash))}</span>
                  </div>
                </div>
             </div>
          </div>
        )}

        <div className="pt-4">
          {rateError ? (
            <div className="w-full py-6 bg-amber-50 text-amber-600 rounded-[2rem] font-black uppercase text-xs flex flex-col items-center justify-center border-4 border-dashed border-amber-200">
              <AlertCircle size={32} className="mb-2"/> 
              <span>Rate Verification Required / ریٹ چیک کریں</span>
            </div>
          ) : !isLocked ? (
            <button 
              onClick={onSave} 
              disabled={isProcessing || syncStatus === 'saving'}
              className={`w-full py-6 rounded-[2rem] font-black uppercase text-sm tracking-widest shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all ${isProcessing || syncStatus === 'saving' ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-slate-900'}`}
            >
              {isProcessing || syncStatus === 'saving' ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />} 
              {syncStatus === 'saving' ? 'Saving...' : 'Record & Lock Account'}
            </button>
          ) : (
            <div className="space-y-4">
              {syncStatus === 'saving' && (
                <div className="w-full py-4 bg-yellow-100 text-yellow-700 rounded-[2rem] font-black uppercase text-xs flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Saving...</div>
              )}
              {syncStatus === 'saved' && (
                <div className="w-full py-4 bg-green-100 text-green-700 rounded-[2rem] font-black uppercase text-xs flex items-center justify-center gap-2"><CheckCircle size={16} /> Saved</div>
              )}
              {syncStatus === 'pending' && (
                <div className="w-full py-4 bg-orange-100 text-orange-700 rounded-[2rem] font-black uppercase text-xs flex items-center justify-center gap-2"><AlertCircle size={16} /> Pending</div>
              )}
              {isOwner ? (
                <button onClick={() => setAdjustmentModalCustomer(customer)} className="w-full py-6 bg-orange-600 text-white rounded-[2rem] font-black uppercase text-sm tracking-widest shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all"><RefreshCcw size={20} /> Admin Adjust Ledger</button>
              ) : (
                <div className="w-full py-6 bg-slate-100 text-slate-400 rounded-[2.5rem] font-black uppercase text-[10px] flex items-center justify-center gap-3 border-4 border-dashed border-slate-200"><ShieldCheck size={20} className="text-green-600"/> Audit Sealed</div>
              )}
              {isSwipeView && <button onClick={jumpToNextPending} className="w-full py-4 text-blue-600 font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 animate-pulse">Skip to Next Pending <ArrowRight size={14}/></button>}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
});

const DeliveryEntry: React.FC<DeliveryEntryProps> = ({ 
  customers, deliveries, setDeliveries, prices, payments, setPayments, archives, riderId, role, balances, onOpenCalc, setAuditLogs
}) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [searchTerm, setSearchTerm] = useState('');
  const [historyCustomerId, setHistoryCustomerId] = useState<string | null>(null);
  const [historyExtraDeliveries, setHistoryExtraDeliveries] = useState<Delivery[]>([]);
  const [historyExtraPayments, setHistoryExtraPayments] = useState<Payment[]>([]);
  const [historyBeforeDate, setHistoryBeforeDate] = useState(relationalDataService.getEntryHistoryDateLimit());
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasOlderHistory, setHasOlderHistory] = useState(true);
  const [adjustmentModalCustomer, setAdjustmentModalCustomer] = useState<Customer | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  
  const [isAdjProcessing, setIsAdjProcessing] = useState(false);
  
  const deliveryInputsRef = useRef<Record<string, string>>({});
  const cashInputsRef = useRef<Record<string, string>>({});
  const [draftRevision, setDraftRevision] = useState(0);
  const [syncStatuses, setSyncStatuses] = useState<Record<string, 'saving' | 'saved' | 'pending'>>({});
  const [draftSavedIndicator, setDraftSavedIndicator] = useState(false);

  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [milkAdj, setMilkAdj] = useState('');
  const [cashAdj, setCashAdj] = useState('');
  
  const [viewMode, setViewMode] = useState<'swipe' | 'list'>('swipe');
  const [currentIndex, setCurrentIndex] = useState(0);

  const isOwner = role === UserRole.OWNER;

  useEffect(() => {
    if (!historyCustomerId) return;
    setHistoryExtraDeliveries([]);
    setHistoryExtraPayments([]);
    setHistoryBeforeDate(relationalDataService.getEntryHistoryDateLimit());
    setHasOlderHistory(true);
  }, [historyCustomerId]);

  const handlePrintRoute = () => {
    printService.setPrintConfig('80', 'md');
    printService.triggerPrint(
      <SummaryReceipt 
        date={selectedDate}
        customers={customers}
        deliveries={deliveries.filter(d => d.date === selectedDate)}
        payments={payments.filter(p => p.date === selectedDate)}
        profile="80"
        fontSize="md"
        compact={true}
      />
    );
  };

  const [isExportingSummary, setIsExportingSummary] = useState(false);

  const handleExportSummaryPDF = () => {
    setIsExportingSummary(true);
    setTimeout(() => {
      exportService.exportToPDF(
        'summary-export-container',
        `Daily_Summary_${selectedDate}`
      ).then(() => setIsExportingSummary(false));
    }, 500);
  };

  const handleExportSummaryExcel = () => {
    exportService.exportSummaryToExcel(
      selectedDate,
      customers,
      deliveries,
      payments
    );
  };

  const indexedDeliveries = useMemo(() => {
    const map = new Map<string, Delivery[]>();
    deliveries.forEach(d => {
      const list = map.get(d.customerId) || [];
      list.push(d);
      map.set(d.customerId, list);
    });
    return map;
  }, [deliveries]);

  const indexedPayments = useMemo(() => {
    const map = new Map<string, Payment[]>();
    payments.forEach(p => {
      const list = map.get(p.customerId) || [];
      list.push(p);
      map.set(p.customerId, list);
    });
    return map;
  }, [payments]);

  // --- DRAFT PERSISTENCE ENGINE ---
  useEffect(() => {
    try {
      const savedD = localStorage.getItem(`draft_d_${selectedDate}`);
      const savedC = localStorage.getItem(`draft_c_${selectedDate}`);
      if (savedD) deliveryInputsRef.current = JSON.parse(savedD);
      else deliveryInputsRef.current = {};
      
      if (savedC) cashInputsRef.current = JSON.parse(savedC);
      else cashInputsRef.current = {};
      setDraftRevision(prev => prev + 1);
    } catch (e) {
      console.error('Failed to load drafts from localStorage:', e);
      deliveryInputsRef.current = {};
      cashInputsRef.current = {};
      setDraftRevision(prev => prev + 1);
    }
  }, [selectedDate]);

  const saveDrafts = React.useCallback(() => {
    try {
      if (Object.keys(deliveryInputsRef.current).length > 0) {
        localStorage.setItem(`draft_d_${selectedDate}`, JSON.stringify(deliveryInputsRef.current));
      } else {
        localStorage.removeItem(`draft_d_${selectedDate}`);
      }
      if (Object.keys(cashInputsRef.current).length > 0) {
        localStorage.setItem(`draft_c_${selectedDate}`, JSON.stringify(cashInputsRef.current));
      } else {
        localStorage.removeItem(`draft_c_${selectedDate}`);
      }
      setDraftSavedIndicator(true);
      setTimeout(() => setDraftSavedIndicator(false), 2000);
    } catch (e) {
      console.warn('Failed to save drafts to localStorage:', e);
    }
  }, [selectedDate]);

  const routeCustomers = useMemo(() => {
    return (customers || [])
      .filter(c => {
        const belongs = riderId ? c.riderId === riderId : true;
        const searchLower = searchTerm.toLowerCase();
        return c.active && belongs && (c.name.toLowerCase().includes(searchLower) || (c.urduName && c.urduName.includes(searchTerm)));
      })
      .sort((a, b) => a.deliveryOrder - b.deliveryOrder);
  }, [customers, riderId, searchTerm]);

  // PROGRESS CALCULATIONS
  const progressStats = useMemo(() => {
    const total = routeCustomers.length;
    const todayCompleted = routeCustomers.filter(c => 
      deliveries.some(d => d.customerId === c.id && d.date === selectedDate && !d.isAdjustment)
    );
    const completed = todayCompleted.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    const firstPendingIdx = routeCustomers.findIndex(c => 
      !deliveries.some(d => d.customerId === c.id && d.date === selectedDate && !d.isAdjustment)
    );

    return { total, completed, percent, firstPendingIdx };
  }, [routeCustomers, deliveries, selectedDate]);

  const clearAllDrafts = () => {
    deliveryInputsRef.current = {};
    cashInputsRef.current = {};
    localStorage.removeItem(`draft_d_${selectedDate}`);
    localStorage.removeItem(`draft_c_${selectedDate}`);
    setShowClearConfirm(false);
  };

  const jumpToNextPending = React.useCallback(() => {
    if (progressStats.firstPendingIdx !== -1) {
      setCurrentIndex(progressStats.firstPendingIdx);
    }
  }, [progressStats.firstPendingIdx]);

  const handleSaveEntry = React.useCallback(async (customer: Customer, litersInput: number, cashInput: number, autoNext: boolean = false) => {
    console.log(`Attempting to save entry for ${customer.name} on ${selectedDate}`);
    
    // 1. Pre-check: Prevent saving if already exists in current prop-state
    const existingD = (deliveries || []).find(d => 
      d.customerId === customer.id && d.date === selectedDate && !d.isAdjustment
    );
    
    if (existingD) {
      console.warn(`Save aborted: Entry already exists for ${customer.name}`);
      alert(`Record Sealed: Entry already finalized for ${customer.name}.`);
      return;
    }
    
    if (isNaN(litersInput) || litersInput < 0) {
      alert("INVALID QUANTITY: Milk quantity cannot be negative.");
      return;
    }

    if (!isNaN(cashInput) && cashInput < 0) {
      alert("INVALID CASH: Cash received cannot be negative.");
      return;
    }
    
    let milkPrice: number;
    try {
      milkPrice = findPriceForDate(selectedDate, customer, prices);
    } catch (err: any) {
      alert(`PRICING ERROR: ${err.message}`);
      return;
    }

    const deliveryObj: Delivery = {
      id: generateId(),
      customerId: customer.id,
      date: selectedDate,
      liters: litersInput,
      priceAtTime: Number(milkPrice) || 0,
      totalAmount: (() => {
        const raw = (Number(litersInput) || 0) * (Number(milkPrice) || 0);
        return isNaN(raw) ? 0 : Math.round(raw * 100) / 100;
      })(),
      riderId: customer.riderId,
      isLocked: true, 
      updatedAt: new Date().toISOString(),
      version: 1 // Never create records with version 0
    };

    const paymentRequestId = cashInput > 0 ? generateId() : '';
    const paymentObj: Payment | null = cashInput > 0 ? {
      id: paymentRequestId,
      customerId: customer.id,
      date: selectedDate,
      amount: Math.round(cashInput),
      mode: PaymentMode.CASH,
      clientRequestId: paymentRequestId,
      updatedAt: new Date().toISOString(),
      version: 1 // Never create records with version 0
    } : null;

    // STEP A: Show "Saving..." spinner
    setSyncStatuses(prev => ({ ...prev, [customer.id]: 'saving' }));

    // STEP B: Write to Supabase through one atomic RPC FIRST.
    // Delivery + same-screen cash payment must either both save or both fail.
    let isCloudSuccess = false;
    let cloudErrorMsg = '';
    let savedDelivery: Delivery = deliveryObj;
    let savedPayment: Payment | null = paymentObj;
    try {
      const { data, error } = await supabase.rpc('save_delivery_entry', {
        p_delivery: relationalDataService.toSnakeCase(deliveryObj),
        p_payment: paymentObj ? relationalDataService.toSnakeCase(paymentObj) : null
      });
      if (error) throw error;
      if (data?.delivery) {
        savedDelivery = relationalDataService.toCamelCase(data.delivery) as Delivery;
      }
      if (data?.payment) {
        savedPayment = relationalDataService.toCamelCase(data.payment) as Payment;
      } else {
        savedPayment = null;
      }
      isCloudSuccess = true;
    } catch (err: any) {
      console.error("Cloud save failed:", err);
      cloudErrorMsg = err?.message || String(err);
    }

    // STEP C & D
    if (isCloudSuccess) {
      setSyncStatuses(prev => ({ ...prev, [customer.id]: 'saved' }));
      
      // Only update local state AFTER Supabase confirms success
      setDeliveries(prev => {
        const existingIndex = prev.findIndex(d => 
          d.id === savedDelivery.id ||
          (d.customerId === customer.id && d.date === selectedDate && d.riderId === customer.riderId && !d.isAdjustment)
        );
        if (existingIndex === -1) return [...prev, savedDelivery];
        return prev.map((d, idx) => idx === existingIndex ? savedDelivery : d);
      });
      
      setAuditLogs(prev => [...prev, {
        id: generateId(),
        action: 'CREATE',
        entityId: savedDelivery.id,
        entityType: 'Delivery',
        performedBy: 'System',
        timestamp: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        newValue: savedDelivery
      }]);

      if (savedPayment) {
        setPayments(prev => {
          const existingIndex = prev.findIndex(p => 
            p.id === savedPayment!.id ||
            (!!savedPayment!.linkedDeliveryId && p.linkedDeliveryId === savedPayment!.linkedDeliveryId)
          );
          if (existingIndex === -1) return [...prev, savedPayment!];
          return prev.map((p, idx) => idx === existingIndex ? savedPayment! : p);
        });

        setAuditLogs(prev => [...prev, {
          id: generateId(),
          action: 'CREATE',
          entityId: savedPayment.id,
          entityType: 'Payment',
          performedBy: 'System',
          timestamp: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1,
          newValue: savedPayment
        }]);
      }
    } else {
      // Cloud save failed — do NOT update local state
      // Show clear error to user
      setSyncStatuses(prev => ({ ...prev, [customer.id]: 'idle' }));
      if (cloudErrorMsg.includes('Concurrency Conflict')) {
        alert('RECORD ALREADY CHANGED: Another user modified this record. Please refresh the app to see the latest data.');
      } else {
        alert(
          'SAVE FAILED: Entry was not saved to server.\n' +
          'Please check your connection and try again.\n' +
          'Do NOT close the app until you see the green tick.'
        );
      }
      return; // Stop execution — do not proceed
    }

    // Clear inputs immediately
    delete deliveryInputsRef.current[customer.id];
    delete cashInputsRef.current[customer.id];
    saveDrafts();

    if (navigator.vibrate) {
      navigator.vibrate([50, 50, 50]);
    }

    console.log(`Successfully saved entry for ${customer.name}`);

    if (autoNext) {
      setTimeout(() => {
        const remainingPendingIdx = routeCustomers.findIndex((c, i) => 
          i > currentIndex && !deliveries.some(d => d.customerId === c.id && d.date === selectedDate && !d.isAdjustment)
        );
        if (remainingPendingIdx !== -1) {
          setCurrentIndex(remainingPendingIdx);
        } else {
          const wrapPendingIdx = routeCustomers.findIndex(c => 
            !deliveries.some(d => d.customerId === c.id && d.date === selectedDate && !d.isAdjustment)
          );
          if (wrapPendingIdx !== -1) setCurrentIndex(wrapPendingIdx);
        }
      }, 300);
    }
  }, [deliveries, selectedDate, prices, routeCustomers, currentIndex, setDeliveries, setPayments, setAuditLogs, saveDrafts]);

  const handleApplyAdjustment = async (type: 'milk' | 'cash') => {
    if (!adjustmentModalCustomer || isAdjProcessing) return;
    setIsAdjProcessing(true);
    const customer = adjustmentModalCustomer;

    const [yearStr, monthStr] = selectedDate.split('-');
    const selectedYear = parseInt(yearStr);
    const selectedMonth = parseInt(monthStr);
    const isArchived = archives.some(a => a.year === selectedYear && a.month === selectedMonth);
    
    if (isArchived) {
      const monthName = new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long' });
      alert(`This period (${monthName} ${selectedYear}) has been archived and is locked. Corrections cannot be made to archived periods.`);
      setIsAdjProcessing(false);
      return;
    }

    if (type === 'milk') {
      const originalDelivery = deliveries.find(d => d.customerId === customer.id && d.date === selectedDate && !d.isAdjustment);
      if (originalDelivery) {
        const hasReversal = deliveries.some(d => d.linkedDeliveryId === originalDelivery.id && d.adjustmentTag === 'reversal');
        if (hasReversal) {
          alert("This entry has already been corrected. View the ledger to see the adjustment history.");
          setIsAdjProcessing(false);
          return;
        }
      }
    } else {
      const originalPayment = payments.find(p => p.customerId === customer.id && p.date === selectedDate && !p.isAdjustment);
      if (originalPayment) {
        const hasReversal = payments.some(p => p.linkedDeliveryId === originalPayment.id && p.adjustmentTag === 'reversal');
        if (hasReversal) {
          alert("This entry has already been corrected. View the ledger to see the adjustment history.");
          setIsAdjProcessing(false);
          return;
        }
      }
    }

    const adjAmount = parseFloat((type === 'milk' ? milkAdj : cashAdj) || '0');
    if (isNaN(adjAmount) || adjAmount === 0) {
      alert(`Please enter a valid ${type} adjustment amount.`);
      setIsAdjProcessing(false);
      return;
    }
    if (type === 'milk') {
      let milkPrice: number;
      try { milkPrice = findPriceForDate(selectedDate, customer, prices); } 
      catch (err: any) { alert(`ADJUSTMENT ERROR: ${err.message}`); setIsAdjProcessing(false); return; }
      
      const originalDelivery = deliveries.find(d => d.customerId === customer.id && d.date === selectedDate && !d.isAdjustment);
      
      const rawTotal = (Number(adjAmount) || 0) * (Number(milkPrice) || 0);
      const adjustmentId = generateId();
      let savedEntry: Delivery | Payment | null = null;
      let savedKind: 'Delivery' | 'Payment' | null = null;
      let savedAudit: AuditLog | null = null;
      try {
        const { data, error } = await supabase.rpc('save_manual_adjustment', {
          p_adjustment: relationalDataService.toSnakeCase({
            id: adjustmentId,
            auditId: generateId(),
            customerId: customer.id,
            type: rawTotal >= 0 ? 'DEBIT' : 'CREDIT',
            amount: Math.round(Math.abs(rawTotal) * 100) / 100,
            date: selectedDate,
            note: adjustmentNote || `Owner milk correction (${adjAmount} L)`,
            adjustmentTag: 'reversal',
            linkedDeliveryId: originalDelivery?.id,
            clientRequestId: adjustmentId
          })
        });
        if (error) throw error;
        savedKind = data.entry_kind;
        savedEntry = relationalDataService.toCamelCase(data.entry) as Delivery | Payment;
        savedAudit = data.audit ? relationalDataService.toCamelCase(data.audit) as AuditLog : null;
      } catch (err) {
        console.error("Cloud save failed:", err);
      }

      if (!savedEntry || !savedKind) {
        alert("SAVE FAILED: Check connection");
        setIsAdjProcessing(false);
        return;
      }

      if (savedKind === 'Delivery') {
        setDeliveries(prev => [...prev, savedEntry as Delivery]);
      } else {
        setPayments(prev => [...prev, savedEntry as Payment]);
      }
      if (savedAudit) setAuditLogs(prev => [...prev, savedAudit]);
    } else {
      const originalPayment = payments.find(p => p.customerId === customer.id && p.date === selectedDate && !p.isAdjustment);
      const adjustmentId = generateId();
      let savedEntry: Delivery | Payment | null = null;
      let savedKind: 'Delivery' | 'Payment' | null = null;
      let savedAudit: AuditLog | null = null;
      try {
        const { data, error } = await supabase.rpc('save_manual_adjustment', {
          p_adjustment: relationalDataService.toSnakeCase({
            id: adjustmentId,
            auditId: generateId(),
            customerId: customer.id,
            type: adjAmount >= 0 ? 'CREDIT' : 'DEBIT',
            amount: Math.round(Math.abs(adjAmount) * 100) / 100,
            date: selectedDate,
            note: adjustmentNote || "Owner cash correction",
            mode: PaymentMode.CASH,
            adjustmentTag: 'reversal',
            linkedDeliveryId: originalPayment?.id,
            clientRequestId: adjustmentId
          })
        });
        if (error) throw error;
        savedKind = data.entry_kind;
        savedEntry = relationalDataService.toCamelCase(data.entry) as Delivery | Payment;
        savedAudit = data.audit ? relationalDataService.toCamelCase(data.audit) as AuditLog : null;
      } catch (err) {
        console.error("Cloud save failed:", err);
      }

      if (!savedEntry || !savedKind) {
        alert("SAVE FAILED: Check connection");
        setIsAdjProcessing(false);
        return;
      }

      if (savedKind === 'Delivery') {
        setDeliveries(prev => [...prev, savedEntry as Delivery]);
      } else {
        setPayments(prev => [...prev, savedEntry as Payment]);
      }
      if (savedAudit) setAuditLogs(prev => [...prev, savedAudit]);
    }
    setAdjustmentModalCustomer(null);
    setAdjustmentNote('');
    setMilkAdj('');
    setCashAdj('');
    setIsAdjProcessing(false);
  };

  const historyItems = useMemo(() => {
    if (!historyCustomerId) return [];

    const uniqueDeliveries = Array.from(new Map([
      ...deliveries.filter(d => d.customerId === historyCustomerId && !d.deleted),
      ...historyExtraDeliveries.filter(d => d.customerId === historyCustomerId && !d.deleted)
    ].map(d => [d.id, d])).values());

    const uniquePayments = Array.from(new Map([
      ...payments.filter(p => p.customerId === historyCustomerId && !p.deleted),
      ...historyExtraPayments.filter(p => p.customerId === historyCustomerId && !p.deleted)
    ].map(p => [p.id, p])).values());

    return [
      ...uniqueDeliveries.map(d => ({ ...d, type: 'milk' as const, timestamp: d.updatedAt || `${d.date}T00:00:00` })),
      ...uniquePayments.map(p => ({ ...p, type: 'payment' as const, timestamp: p.updatedAt || `${p.date}T00:00:00` }))
    ].sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return b.timestamp.localeCompare(a.timestamp);
    });
  }, [historyCustomerId, deliveries, payments, historyExtraDeliveries, historyExtraPayments]);

  const loadOlderHistory = async () => {
    if (!historyCustomerId || isLoadingHistory || !hasOlderHistory) return;
    setIsLoadingHistory(true);
    try {
      const result = await relationalDataService.fetchCustomerLedgerHistory(historyCustomerId, historyBeforeDate);
      setHistoryExtraDeliveries(prev => Array.from(new Map([...prev, ...result.deliveries].map(d => [d.id, d])).values()));
      setHistoryExtraPayments(prev => Array.from(new Map([...prev, ...result.payments].map(p => [p.id, p])).values()));
      setHistoryBeforeDate(result.fromDate);
      if (!result.hasMore) {
        setHasOlderHistory(false);
      }
    } catch (err) {
      console.error('Failed to load older history:', err);
      alert('HISTORY LOAD FAILED: Older records could not be loaded. Please check connection and try again.');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const renderCustomerCard = (customer: Customer, isSwipeView: boolean) => {
    if (!customer) return null;
    return (
      <DeliveryRow 
        key={`${selectedDate}-${draftRevision}-${customer.id}`}
        customer={customer}
        deliveries={indexedDeliveries.get(customer.id) || []}
        payments={indexedPayments.get(customer.id) || []}
        balances={balances}
        prices={prices}
        selectedDate={selectedDate}
        deliveryInputsRef={deliveryInputsRef}
        cashInputsRef={cashInputsRef}
        saveDrafts={saveDrafts}
        onOpenCalc={onOpenCalc}
        setHistoryCustomerId={setHistoryCustomerId}
        setAdjustmentModalCustomer={setAdjustmentModalCustomer}
        handleSaveEntry={handleSaveEntry}
        isOwner={isOwner}
        isSwipeView={isSwipeView}
        jumpToNextPending={jumpToNextPending}
        syncStatus={syncStatuses[customer.id]}
      />
    );
  };

  return (
    <div className="p-4 md:p-8 space-y-6 pb-40 relative">
      {draftSavedIndicator && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest shadow-2xl animate-in fade-in slide-in-from-top-4">
          Draft Saved
        </div>
      )}
      <div onClick={jumpToNextPending} className="bg-white border-2 border-slate-100 rounded-[2rem] p-5 flex flex-col gap-3 shadow-sm no-print cursor-pointer hover:border-blue-300 transition-all active:scale-95">
         <div className="flex justify-between items-center px-2">
            <div className="flex items-center gap-3">
               <Activity size={16} className="text-blue-500"/>
               <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">Route Coverage / کوریج</h3>
            </div>
            <div className="flex items-center gap-4">
               <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{progressStats.completed} / {progressStats.total} Saved</p>
               <span className={`px-2 py-0.5 rounded-md text-[8px] font-black ${progressStats.percent === 100 ? 'bg-green-600 text-white shadow-lg' : 'bg-blue-100 text-blue-600'}`}>{progressStats.percent}%</span>
            </div>
         </div>
         <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/50 p-0.5 relative">
            <div className={`h-full rounded-full transition-all duration-1000 ease-out ${progressStats.percent === 100 ? 'bg-green-600 shadow-[0_0_15px_rgba(22,163,74,0.6)]' : 'bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.4)]'}`} style={{ width: `${progressStats.percent}%` }} />
            {progressStats.percent > 0 && progressStats.percent < 100 && <div className="absolute top-0 bottom-0 w-20 bg-white/20 animate-shimmer" style={{ left: `calc(${progressStats.percent}% - 20px)` }}></div>}
         </div>

         {/* HIDDEN SUMMARY FOR PDF EXPORT */}
         {isExportingSummary && (
           <div className="fixed left-[-9999px] top-0">
             <div id="summary-export-container" className="bg-white p-4">
               <SummaryReceipt 
                 date={selectedDate}
                 customers={customers}
                 deliveries={deliveries.filter(d => d.date === selectedDate)}
                 payments={payments.filter(p => p.date === selectedDate)}
                 profile="80"
                 fontSize="md"
                 compact={false}
               />
             </div>
           </div>
         )}
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center bg-slate-900 p-6 rounded-[3rem] shadow-xl">
          <div className="relative flex-shrink-0">
            <input type="date" className={`border p-3 rounded-2xl font-black text-sm outline-none transition-all bg-white/10 border-white/20 text-white`} value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
            {selectedDate !== new Date().toLocaleDateString('en-CA') && (
              <div className="absolute -top-2 -right-2 bg-amber-500 text-white p-1 rounded-full animate-pulse shadow-lg border-2 border-slate-900">
                <AlertTriangle size={12} />
              </div>
            )}
          </div>
          <div className="relative flex-1 w-full">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={22} />
            <input type="text" placeholder="Search account..." className="w-full pl-14 pr-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-white outline-none font-bold" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button 
              onClick={handlePrintRoute}
              className="p-4 bg-white/10 border border-white/20 text-white rounded-2xl hover:bg-white/20 transition-all active:scale-95 flex items-center justify-center gap-2"
              title="Print Route Report"
            >
              <Printer size={20} />
              <span className="hidden md:inline text-[10px] font-black uppercase">Print</span>
            </button>
            <button 
              onClick={handleExportSummaryPDF}
              className="p-4 bg-white/10 border border-white/20 text-white rounded-2xl hover:bg-white/20 transition-all active:scale-95 flex items-center justify-center gap-2"
              title="Download PDF"
            >
              <span className="text-[10px] font-black uppercase">PDF</span>
            </button>
            <button 
              onClick={handleExportSummaryExcel}
              className="p-4 bg-white/10 border border-white/20 text-white rounded-2xl hover:bg-white/20 transition-all active:scale-95 flex items-center justify-center gap-2"
              title="Download Excel"
            >
              <span className="text-[10px] font-black uppercase">Excel</span>
            </button>
            <div className="flex bg-white/5 p-1.5 rounded-[1.5rem] border border-white/10 flex-1 md:flex-none">
              <button onClick={() => setViewMode('swipe')} className={`flex-1 md:flex-none p-3 px-5 rounded-xl transition-all ${viewMode === 'swipe' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400'}`}><Target size={22}/></button>
              <button onClick={() => setViewMode('list')} className={`flex-1 md:flex-none p-3 px-5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400'}`}><LayoutList size={22}/></button>
            </div>
          </div>
      </div>

      <div className="transition-all duration-300 flex-1 min-h-[600px]">
        {viewMode === 'swipe' ? (
          <div className="relative flex flex-col items-center">
            <AnimatePresence mode="wait">
              {routeCustomers[currentIndex] ? (
                <motion.div 
                  key={routeCustomers[currentIndex].id}
                  className="w-full"
                >
                  {renderCustomerCard(routeCustomers[currentIndex], true)}
                </motion.div>
              ) : (
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-20 text-slate-300 font-black text-center w-full uppercase tracking-widest"
                >
                  No customers matching search.
                </motion.p>
              )}
            </AnimatePresence>
            
            {routeCustomers[currentIndex] && (
              <div className="mt-10 flex items-center gap-10">
                <motion.button 
                  whileTap={{ scale: 0.9 }}
                  disabled={currentIndex === 0} 
                  onClick={() => setCurrentIndex(currentIndex - 1)} 
                  className="w-20 h-20 bg-white border-2 border-slate-100 rounded-full flex items-center justify-center text-slate-400 shadow-xl disabled:opacity-20 transition-all"
                >
                  <ChevronLeft size={32} />
                </motion.button>
                <div className="text-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-1">Navigation</p>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black text-slate-900">{currentIndex + 1}</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-lg font-black text-slate-400">{routeCustomers.length}</span>
                  </div>
                </div>
                <motion.button 
                  whileTap={{ scale: 0.9 }}
                  disabled={currentIndex === routeCustomers.length - 1} 
                  onClick={() => setCurrentIndex(currentIndex + 1)} 
                  className="w-20 h-20 bg-white border-2 border-slate-100 rounded-full flex items-center justify-center text-blue-600 shadow-xl disabled:opacity-20 transition-all"
                >
                  <ChevronRight size={32} />
                </motion.button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <AnimatePresence>
              {routeCustomers.length === 0 ? (
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-20 text-slate-300 font-black text-center w-full uppercase tracking-widest"
                >
                  No customers matching search.
                </motion.p>
              ) : (
                routeCustomers.map(c => renderCustomerCard(c, false))
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {showClearConfirm && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[200] flex items-center justify-center p-4">
           <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-md border-8 border-red-500 overflow-hidden animate-in zoom-in-95">
              <div className="p-10 bg-red-500 text-white flex flex-col items-center text-center gap-4">
                 <AlertOctagon size={64} className="animate-bounce" />
                 <div><h3 className="font-black text-3xl tracking-tighter uppercase italic leading-none">Clear Route Drafts?</h3></div>
              </div>
              <div className="p-10 space-y-6">
                 <p className="text-sm font-bold text-slate-500 text-center leading-relaxed">This will permanently delete all unsaved entries for this route.</p>
                 <div className="flex flex-col gap-3">
                    <button onClick={clearAllDrafts} className="w-full py-6 bg-red-600 text-white rounded-3xl font-black uppercase text-sm shadow-xl active:scale-95 transition-all">Yes, Delete Everything</button>
                    <button onClick={() => setShowClearConfirm(false)} className="w-full py-4 text-slate-400 font-black uppercase text-[10px] tracking-widest">Keep My Progress</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {adjustmentModalCustomer && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[120] flex items-center justify-center p-4">
           <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-md border-8 border-orange-600 overflow-hidden animate-in zoom-in-95">
              <div className="p-10 bg-orange-600 text-white flex flex-col gap-2"><h3 className="font-black text-3xl tracking-tighter uppercase italic leading-none">Ledger Correction</h3></div>
              <div className="p-10 space-y-8">
                 <div className="bg-slate-50 p-6 rounded-3xl border-4 border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Target Account</p>
                    <p className="text-2xl font-black text-slate-900 leading-none">{adjustmentModalCustomer.name}</p>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest ml-4">Milk Adj (Liters)</label>
                        <input 
                          type="number" 
                          step="0.1"
                          className="w-full p-6 bg-blue-50 border-4 border-blue-100 rounded-[2rem] font-black text-2xl text-center outline-none focus:border-blue-500" 
                          placeholder="0.0" 
                          value={milkAdj} 
                          onChange={e => setMilkAdj(e.target.value)} 
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-green-600 uppercase tracking-widest ml-4">Cash Adj (PKR)</label>
                        <input 
                          type="number" 
                          className="w-full p-6 bg-green-50 border-4 border-green-100 rounded-[2rem] font-black text-2xl text-center outline-none focus:border-green-500" 
                          placeholder="0" 
                          value={cashAdj} 
                          onChange={e => setCashAdj(e.target.value)} 
                        />
                    </div>
                 </div>
                 <p className="text-[9px] font-bold text-slate-400 text-center uppercase">Use positive (+) to add, negative (-) to subtract</p>
                 <textarea className="w-full p-6 bg-slate-50 border-4 border-slate-100 rounded-[2rem] font-bold text-base outline-none focus:border-orange-500" rows={2} placeholder="Reason..." value={adjustmentNote} onChange={e => setAdjustmentNote(e.target.value)} />
                 <div className="flex gap-4">
                    <button disabled={isAdjProcessing} onClick={() => handleApplyAdjustment('milk')} className={`flex-1 py-6 bg-blue-600 text-white rounded-[1.5rem] font-black uppercase text-[10px] active:scale-95 ${isAdjProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}>{isAdjProcessing ? 'Processing' : 'Correct Milk'}</button>
                    <button disabled={isAdjProcessing} onClick={() => handleApplyAdjustment('cash')} className={`flex-1 py-6 bg-green-600 text-white rounded-[1.5rem] font-black uppercase text-[10px] active:scale-95 ${isAdjProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}>{isAdjProcessing ? 'Processing' : 'Correct Cash'}</button>
                 </div>
                 <button onClick={() => setAdjustmentModalCustomer(null)} className="w-full py-4 text-slate-400 font-black uppercase text-[10px] tracking-[0.4em]">Cancel</button>
              </div>
           </div>
        </div>
      )}

      {historyCustomerId && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-2xl z-[150] flex items-center justify-center p-4">
           <div className="bg-white rounded-[4rem] shadow-2xl w-full max-w-lg border-8 border-slate-900 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
              <div className="p-10 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div>
                   <h3 className="font-black text-2xl uppercase italic tracking-tighter leading-none">Account History</h3>
                   <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.28em] mt-2">Recent 40 days, load older when needed</p>
                 </div>
                 <button onClick={() => setHistoryCustomerId(null)} className="p-4 bg-white/10 rounded-full"><X size={24}/></button>
              </div>
              <div className="flex-1 overflow-y-auto p-10 space-y-4 scrollbar-hide">
                 {historyItems.length === 0 ? (
                   <div className="py-10 text-center bg-slate-50 rounded-[2rem] border-4 border-dashed border-slate-100">
                     <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No recent records</p>
                   </div>
                 ) : historyItems.map((item, idx) => (
                   <div key={idx} className={`flex gap-5 p-6 rounded-[2rem] border-4 transition-all ${item.isAdjustment ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-100'}`}>
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${item.type === 'milk' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'}`}><ClipboardList size={20}/></div>
                      <div className="flex-1 min-w-0">
                         <div className="flex justify-between items-start"><p className="font-black text-slate-900 text-sm uppercase">{item.type === 'milk' ? 'Milk' : 'Cash'}</p></div>
                         <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">Date: {new Date(item.date).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right flex-shrink-0"><p className={`font-black text-xl italic tracking-tighter ${item.type === 'milk' ? 'text-red-500' : 'text-green-600'}`}>{item.type === 'milk' ? `${((item as any).liters).toFixed(1)}L` : `Rs.${(item as any).amount}`}</p></div>
                   </div>
                 ))}
                 <button
                   onClick={loadOlderHistory}
                   disabled={isLoadingHistory || !hasOlderHistory}
                   className={`w-full py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 transition-all ${
                     hasOlderHistory ? 'bg-slate-900 text-white hover:bg-blue-600' : 'bg-slate-100 text-slate-400'
                   } ${isLoadingHistory ? 'opacity-70 cursor-wait' : ''}`}
                 >
                   {isLoadingHistory ? <Loader2 size={16} className="animate-spin" /> : <History size={16} />}
                   {hasOlderHistory ? 'Load Older 40 Days' : 'No Older Records Found'}
                 </button>
              </div>
           </div>
        </div>
      )}
      <style>{`@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(500%); } } .animate-shimmer { animation: shimmer 2s infinite linear; }`}</style>
    </div>
  );
};

export default React.memo(DeliveryEntry);
