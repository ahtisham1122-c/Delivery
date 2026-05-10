
import React, { useState, useMemo } from 'react';
import { 
  CreditCard, Search, CheckCircle, 
  Clock, X, Printer,
  Info, Landmark, Smartphone, Banknote, Settings2, Monitor, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Customer, Payment, PaymentCycle, UserRole, PaymentMode, Rider, MonthlyArchive, Delivery, PriceRecord } from '../types';
import { formatPKR, generateId } from '../services/dataStore';
import { calculateCycleBreakdown } from '../services/ledgerUtils';
import { printService } from '../services/printService';
import { exportService } from '../services/exportService';
import { IndividualReceipt } from './Receipts';
import { supabase } from '../services/supabaseClient';
import { relationalDataService } from '../services/relationalDataService';

interface BillingTrackerProps {
  customers: Customer[];
  payments: Payment[];
  setPayments: React.Dispatch<React.SetStateAction<Payment[]>>;
  balances: Record<string, number>;
  role: UserRole;
  riders: Rider[];
  riderFilterId: string;
  archives: MonthlyArchive[];
  deliveries: Delivery[];
  prices: PriceRecord[];
}

const BillingRow = React.memo(React.forwardRef<HTMLDivElement, { 
  customer: Customer, 
  deliveries: Delivery[], 
  payments: Payment[], 
  balances: Record<string, number>, 
  handleQuickPayment: (c: Customer) => void, 
  handlePrint: (c: Customer) => void,
  handleExportPDF: (c: Customer) => void,
  handleExportExcel: (c: Customer) => void
}>((props, ref) => {
  const { 
    customer, 
    deliveries, 
    payments, 
    balances, 
    handleQuickPayment, 
    handlePrint,
    handleExportPDF,
    handleExportExcel
  } = props;
  const bal = balances[customer.id] || 0;
  const breakdown = useMemo(() => calculateCycleBreakdown(customer, deliveries, payments, bal), [customer, deliveries, payments, bal]);

  return (
    <motion.div 
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-[3rem] p-8 border-2 border-slate-100 flex flex-col gap-6 transition-all hover:border-blue-600 shadow-sm hover:shadow-xl"
    >
      <div className="flex justify-between items-start">
        <div>
          <h4 className="font-black text-slate-900 text-lg truncate">{customer.name}</h4>
          <p className="text-2xl font-bold text-blue-500" dir="rtl">{customer.urduName}</p>
        </div>
        <div className={`p-3 rounded-2xl bg-slate-50 text-slate-300`}>
            <Info size={20}/>
        </div>
      </div>

      <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 relative overflow-hidden">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest relative z-10">Remaining Dues</p>
        <p className={`text-3xl font-black italic tracking-tighter relative z-10 mt-1 ${bal > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
            Rs. {formatPKR(bal)}
        </p>
      </div>

      <div className="bg-slate-900 p-5 rounded-[2rem] border border-slate-800 space-y-3">
          <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Cycle Breakdown</p>
          <div className="space-y-2">
            {breakdown.length > 0 ? breakdown.map((cycle) => (
              <div key={cycle.cycleName} className="flex justify-between items-center text-[10px] font-bold">
                <span className="text-slate-400">{cycle.cycleName}</span>
                <span className={cycle.outstanding > 0 ? 'text-red-400' : 'text-green-400'}>
                  Rs. {formatPKR(Math.abs(cycle.outstanding))}
                </span>
              </div>
            )) : (
              <div className="flex justify-between items-center text-[10px] font-bold">
                <span className="text-slate-400">All Cycles Settled</span>
                <span className="text-green-400">Rs. 0</span>
              </div>
            )}
          </div>
        </div>

      <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={() => handleQuickPayment(customer)}
            className="py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg active:scale-95"
          >
            Receive Payment
          </button>
          <button 
            onClick={() => handlePrint(customer)}
            className="py-4 bg-white border-2 border-slate-200 text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:border-blue-600 hover:text-blue-600 transition-all flex items-center justify-center gap-2"
          >
            <Printer size={14}/> 🖨 Print
          </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={() => handleExportPDF(customer)}
            className="py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
          >
            Download PDF
          </button>
          <button 
            onClick={() => handleExportExcel(customer)}
            className="py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
          >
            Download Excel
          </button>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-xl border border-slate-100">
          <Clock size={12} className="text-slate-400"/>
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Cycle: {customer.paymentCycle}</p>
      </div>
    </motion.div>
  );
}));

const BillingTracker: React.FC<BillingTrackerProps> = ({ 
  customers, payments, setPayments, balances, riderFilterId, archives, deliveries, prices
}) => {
  const [selectedCycle, setSelectedCycle] = useState<PaymentCycle | 'ALL_PENDING'>('ALL_PENDING');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ 
    customerId: '', 
    amount: '', 
    note: '', 
    mode: PaymentMode.CASH 
  });
  
  // PRINT CONFIGURATION
  const [printProfile, setPrintProfile] = useState<'A4' | '80' | '58'>('80');
  const [printFontSize, setPrintFontSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [showPrintSettings, setShowPrintSettings] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const indexedDeliveries = useMemo(() => {
    const map = new Map<string, Delivery[]>();
    deliveries.filter(d => !d.deleted).forEach(d => {
      const list = map.get(d.customerId) || [];
      list.push(d);
      map.set(d.customerId, list);
    });
    return map;
  }, [deliveries]);

  const indexedPayments = useMemo(() => {
    const map = new Map<string, Payment[]>();
    payments.filter(p => !p.deleted).forEach(p => {
      const list = map.get(p.customerId) || [];
      list.push(p);
      map.set(p.customerId, list);
    });
    return map;
  }, [payments]);

  const isPeriodClosed = useMemo(() => {
    const dt = new Date(today);
    return (archives || []).some(a => a.month === dt.getMonth() && a.year === dt.getFullYear());
  }, [today, archives]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchesRider = riderFilterId === 'all' ? true : c.riderId === riderFilterId;
      const matchesCycle = selectedCycle === 'ALL_PENDING' ? (balances[c.id] > 0.01) : c.paymentCycle === selectedCycle;
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (c.urduName && c.urduName.includes(searchTerm));
      return c.active && matchesRider && matchesCycle && matchesSearch;
    }).sort((a, b) => (a.deliveryOrder || 0) - (b.deliveryOrder || 0));
  }, [customers, selectedCycle, searchTerm, balances, riderFilterId]);

  const stats = useMemo(() => {
    const cycleCustIds = filteredCustomers.map(c => c.id);
    const totalDues = cycleCustIds.reduce((sum, id) => {
        const bal = balances[id] || 0;
        return sum + (typeof bal === 'number' && !isNaN(bal) && bal > 0 ? bal : 0);
    }, 0);
    return { totalDues: Math.round(totalDues) };
  }, [filteredCustomers, balances]);

  const handleQuickPayment = (customer: Customer) => {
    if (isPeriodClosed) {
        alert("Archive restricted. Payment cannot be added.");
        return;
    }
    setPaymentForm({
      customerId: customer.id,
      amount: Math.round(balances[customer.id] || 0).toString(),
      note: '',
      mode: PaymentMode.CASH
    });
    setIsModalOpen(true);
  };

  const submitPayment = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(paymentForm.amount);
    if (!paymentForm.customerId || isNaN(amount) || amount <= 0) {
        alert("INVALID PAYMENT: Amount must be greater than 0.");
        return;
    }

    if (isProcessing) return;

    // Double-entry prevention: Check if exact same payment was recorded in last 10 seconds
    const isDuplicate = payments.some(p => 
      !p.deleted &&
      p.customerId === paymentForm.customerId && 
      p.amount === Math.round(amount) && 
      p.date === today &&
      Math.abs(new Date().getTime() - new Date(p.updatedAt).getTime()) < 10000
    );

    if (isDuplicate) {
      alert("DUPLICATE DETECTED: This payment was already recorded a few seconds ago.");
      return;
    }

    setIsProcessing(true);

    const requestId = generateId();
    const newPayment: Payment = {
      id: requestId,
      customerId: paymentForm.customerId,
      amount: Math.round(amount),
      date: today,
      mode: paymentForm.mode,
      note: paymentForm.note,
      clientRequestId: requestId,
      updatedAt: new Date().toISOString(),
      version: 1
    };

    (async () => {
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
            alert("PAYMENT SYNC FAILED: Record not confirmed on server. Please check internet.");
        }

        if (savedPayment) {
            setPayments(prev => {
                const alreadyExists = prev.some(p => p.id === savedPayment.id);
                if (alreadyExists) return prev;
                return [savedPayment, ...prev];
            });
            if (wasDuplicate) {
              alert("Duplicate payment blocked: the existing server record was used.");
            }
            setIsModalOpen(false);
            setPaymentForm({ customerId: '', amount: '', note: '', mode: PaymentMode.CASH });
        }
        setIsProcessing(false);
    })();
  };

  const handlePrint = (customer: Customer) => {
    printService.setPrintConfig(printProfile, printFontSize);
    printService.triggerPrint(
      <IndividualReceipt 
        customer={customer}
        deliveries={deliveries}
        payments={payments}
        prices={prices}
        balances={balances}
        profile={printProfile}
        fontSize={printFontSize}
      />
    );
  };

  const handleExportExcel = (customer: Customer) => {
    exportService.exportBillingToExcel(customer, deliveries, balances);
  };

  const [exportingCustomerId, setExportingCustomerId] = useState<string | null>(null);

  const handleExportPDF = (customer: Customer) => {
    setExportingCustomerId(customer.id);
    // Give React a moment to render the hidden receipt
    setTimeout(() => {
      exportService.exportToPDF(
        `receipt-export-${customer.id}`, 
        `Receipt_${customer.name.replace(/\s+/g, '_')}`
      ).then(() => setExportingCustomerId(null));
    }, 500);
  };

  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in duration-500 pb-32">
      {/* HIDDEN RECEIPT FOR PDF EXPORT */}
      {exportingCustomerId && (
        <div className="fixed left-[-9999px] top-0">
          {customers.filter(c => c.id === exportingCustomerId).map(customer => (
            <div key={customer.id} id={`receipt-export-${customer.id}`} className="bg-white p-4">
              <IndividualReceipt 
                customer={customer}
                deliveries={deliveries}
                payments={payments}
                prices={prices}
                balances={balances}
                profile="80"
                fontSize="md"
              />
            </div>
          ))}
        </div>
      )}
      {/* WEB CONTROLS */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 no-print">
         <div className="flex items-center gap-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Collection Hub</h3>
            <button 
              onClick={() => setShowPrintSettings(!showPrintSettings)}
              className={`p-2 rounded-xl transition-all ${showPrintSettings ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}
            >
              <Settings2 size={18}/>
            </button>
         </div>
      </div>

      {/* PRINT SETTINGS PANEL */}
      {showPrintSettings && (
        <div className="bg-white p-6 rounded-[2rem] border-2 border-blue-100 shadow-xl animate-in slide-in-from-top-4 no-print space-y-6">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Paper Size / پیپر کا سائز</p>
                 <div className="flex bg-slate-100 p-1 rounded-2xl">
                    <button onClick={() => setPrintProfile('A4')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-[10px] transition-all ${printProfile === 'A4' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}><Monitor size={14}/> A4 Page</button>
                    <button onClick={() => setPrintProfile('80')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-[10px] transition-all ${printProfile === '80' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}><Smartphone size={14}/> 80mm</button>
                    <button onClick={() => setPrintProfile('58')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-[10px] transition-all ${printProfile === '58' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}><Smartphone size={12}/> 58mm</button>
                 </div>
              </div>
              <div className="space-y-3">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Text Size / لکھائی کا سائز</p>
                 <div className="flex bg-slate-100 p-1 rounded-2xl">
                    <button onClick={() => setPrintFontSize('sm')} className={`flex-1 py-3 rounded-xl font-black text-[10px] transition-all ${printFontSize === 'sm' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Small</button>
                    <button onClick={() => setPrintFontSize('md')} className={`flex-1 py-3 rounded-xl font-black text-[10px] transition-all ${printFontSize === 'md' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Normal</button>
                    <button onClick={() => setPrintFontSize('lg')} className={`flex-1 py-3 rounded-xl font-black text-[10px] transition-all ${printFontSize === 'lg' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Large</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      <div className="bg-slate-900 p-8 md:p-12 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden no-print">
         <div className="relative z-10 flex flex-col md:flex-row justify-between items-end gap-8">
            <div className="space-y-4">
               <div className="flex items-center gap-4">
                  <div className="bg-blue-600 p-4 rounded-3xl shadow-xl">
                     <CreditCard size={32}/>
                  </div>
                  <div>
                     <h2 className="text-3xl font-black tracking-tighter uppercase italic">Collection Hub</h2>
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                       {selectedCycle === 'ALL_PENDING' ? "Outstanding Ledger Debts" : `${selectedCycle} Cycle View`}
                     </p>
                  </div>
               </div>
               <p className="text-5xl font-black text-white italic tracking-tighter">Rs. {formatPKR(stats.totalDues)}</p>
            </div>
         </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-center justify-between bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden no-print">
        <div className="flex bg-slate-100 p-1.5 rounded-[1.8rem] w-full md:w-auto overflow-x-auto">
          <button 
            onClick={() => setSelectedCycle('ALL_PENDING')} 
            className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${selectedCycle === 'ALL_PENDING' ? 'bg-white shadow-md text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
          >
            All Pending
          </button>
          {Object.values(PaymentCycle).map(cycle => (
            <button 
              key={cycle}
              onClick={() => setSelectedCycle(cycle)} 
              className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${selectedCycle === cycle ? 'bg-white shadow-md text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {cycle}
            </button>
          ))}
        </div>
        
        <div className="relative w-full md:w-80 flex gap-2">
           <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    type="text" placeholder="Search account..." 
                    className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-[10px] font-black text-slate-700 outline-none focus:border-blue-600 shadow-inner"
                    value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                />
           </div>
           <button className="p-4 bg-slate-900 text-white rounded-2xl shadow-lg active:scale-95 transition-all">
                <Search size={18} />
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 no-print">
        <AnimatePresence mode="popLayout">
          {filteredCustomers.map((customer) => (
            <BillingRow 
              key={customer.id}
              customer={customer}
              deliveries={indexedDeliveries.get(customer.id) || []}
              payments={indexedPayments.get(customer.id) || []}
              balances={balances}
              handleQuickPayment={handleQuickPayment}
              handlePrint={handlePrint}
              handleExportPDF={handleExportPDF}
              handleExportExcel={handleExportExcel}
            />
          ))}
        </AnimatePresence>

        {filteredCustomers.length === 0 && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="col-span-full py-40 flex flex-col items-center justify-center bg-white rounded-[4rem] border-4 border-dashed border-slate-100 text-slate-300 opacity-50"
          >
             <CheckCircle size={64} className="mb-4" />
             <p className="font-black text-lg uppercase tracking-[0.4em]">No Outstanding Debts Found</p>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center no-print">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-white rounded-t-[3rem] md:rounded-[3.5rem] shadow-2xl w-full max-w-lg border-t-8 md:border-8 border-slate-900 relative z-10 overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <h3 className="font-black text-2xl tracking-tighter uppercase italic">Record Payment</h3>
                 <button onClick={() => setIsModalOpen(false)} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-all"><X size={20}/></button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <form onSubmit={submitPayment} className="p-8 md:p-10 space-y-8">
                   <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Payment Method / ادائیگی کا طریقہ</label>
                      <div className="grid grid-cols-3 gap-3">
                         {[
                           { id: PaymentMode.CASH, label: 'Cash', icon: Banknote },
                           { id: PaymentMode.BANK, label: 'Bank', icon: Landmark },
                           { id: PaymentMode.WALLET, label: 'Wallet', icon: Smartphone }
                         ].map(mode => (
                           <button 
                             key={mode.id}
                             type="button"
                             onClick={() => setPaymentForm({...paymentForm, mode: mode.id})}
                             className={`p-4 rounded-2xl border-4 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 ${paymentForm.mode === mode.id ? 'bg-blue-600 border-blue-400 text-white shadow-xl scale-105' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-200'}`}
                           >
                              <mode.icon size={24}/>
                              <span className="text-[9px] font-black uppercase tracking-widest">{mode.label}</span>
                           </button>
                         ))}
                      </div>
                   </div>

                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Payment Amount (PKR)</label>
                      <input 
                        required 
                        type="number" 
                        inputMode="decimal"
                        className="w-full p-8 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-5xl text-center outline-none focus:border-blue-600 transition-all" 
                        value={paymentForm.amount} 
                        onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} 
                      />
                   </div>
                   
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Note (Optional)</label>
                      <input 
                        className="w-full p-5 bg-slate-50 border-4 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-blue-600 transition-all" 
                        value={paymentForm.note} 
                        onChange={e => setPaymentForm({...paymentForm, note: e.target.value})} 
                        placeholder="e.g. Received by Rider" 
                      />
                   </div>

                   <button 
                     type="submit" 
                     disabled={isProcessing}
                     className={`w-full py-6 bg-blue-600 text-white rounded-[2rem] font-black text-2xl shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3 ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                   >
                     {isProcessing ? (
                       <>
                         <Loader2 size={24} className="animate-spin" />
                         <span>Processing...</span>
                       </>
                     ) : (
                       'Receive & Seal Record'
                     )}
                   </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default React.memo(BillingTracker);
