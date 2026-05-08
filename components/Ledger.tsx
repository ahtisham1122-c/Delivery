import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, Calendar, ChevronRight, Search,
  Printer, RefreshCcw, Phone, Settings2, Monitor, Smartphone,
  Plus, Minus, X, ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Customer, Delivery, Payment, Rider, MonthlyArchive, AuditLog } from '../types';
import { formatPKR } from '../services/dataStore';
import { printService } from '../services/printService';
import { exportService } from '../services/exportService';
import ThermalPrintView from './ThermalPrintView';

interface ReportsProps {
  customers: Customer[];
  deliveries: Delivery[];
  payments: Payment[];
  riders: Rider[];
  archives: MonthlyArchive[];
  riderFilterId: string;
  auditLogs: AuditLog[];
  onSyncArchives: () => void;
  onAddAdjustment: (adj: { customerId: string, type: 'DEBIT' | 'CREDIT', amount: number, note: string }) => void;
}

const KhataRow = React.memo(React.forwardRef<HTMLDivElement, { 
  customer: Customer, 
  monthDeliveries: Delivery[], 
  balance: number, 
  onSelect: (id: string) => void 
}>((props, ref) => {
  const { customer, monthDeliveries, balance, onSelect } = props;
  const mBill = useMemo(() => monthDeliveries.reduce((a, b) => a + ((!b.deleted && typeof b.totalAmount === 'number' && !isNaN(b.totalAmount)) ? b.totalAmount : 0), 0), [monthDeliveries]);

  return (
    <motion.div 
      ref={ref}
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      whileTap={{ scale: 0.99 }}
      onClick={() => onSelect(customer.id)}
      className={`group bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between gap-4 cursor-pointer hover:border-slate-300 hover:shadow-md transition-all ${!customer.active ? 'opacity-60 bg-slate-50' : ''}`}
    >
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded shadow-sm bg-white border border-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm">
          {customer.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-sm text-slate-900">{customer.name}</p>
          {customer.urduName && <p className="text-sm text-slate-500 font-normal" dir="rtl">{customer.urduName}</p>}
        </div>
      </div>
      
      <div className="flex flex-col items-end gap-1 flex-1">
        <div className="flex justify-between items-center w-full max-w-[140px]">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Balance</span>
          <span className={`font-mono font-semibold text-sm ${balance > 0 ? 'text-red-600' : 'text-slate-900'}`}>Rs. {formatPKR(balance)}</span>
        </div>
        <div className="flex justify-between items-center w-full max-w-[140px]">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Current Bill</span>
          <span className="font-mono text-sm text-slate-600">Rs. {formatPKR(mBill)}</span>
        </div>
      </div>
      
      <div className="p-2 text-slate-300 group-hover:text-slate-500 transition-colors hidden sm:block">
        <ChevronRight size={18}/>
      </div>
    </motion.div>
  );
}));

const Reports: React.FC<ReportsProps> = ({ 
  customers, deliveries, payments, riderFilterId, archives, onSyncArchives, onAddAdjustment
}) => {
  const [reportType, setReportType] = useState<'khata' | 'pnl'>('khata');
  
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isExportingLedger, setIsExportingLedger] = useState(false);

  // Adjustment Modal State
  const [isAdjModalOpen, setIsAdjModalOpen] = useState(false);
  const [adjType, setAdjType] = useState<'DEBIT' | 'CREDIT'>('DEBIT');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjNote, setAdjNote] = useState('');

  // PRINT CONFIGURATION
  const [printProfile, setPrintProfile] = useState<'A4' | '80' | '58'>('A4');
  const [printFontSize, setPrintFontSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [showPrintSettings, setShowPrintSettings] = useState(false);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear - 2; i <= currentYear + 1; i++) years.push(i);
    return years;
  }, []);

  const getMonthName = (index: number) => new Date(2000, index).toLocaleString('en-GB', { month: 'long' });

  const parseDateParts = (dateStr: string) => {
    const parts = (dateStr || '').substring(0, 10).split('-');
    return {
      year: parseInt(parts[0], 10) || 0,
      month: (parseInt(parts[1], 10) || 1) - 1, // Fix: 0-indexed month for correct comparison with selectedMonth
      day: parseInt(parts[2], 10) || 0
    };
  };

  const relevantArchive = useMemo(() => {
    return (archives || []).find(a => a.year === selectedYear && a.month === selectedMonth);
  }, [archives, selectedMonth, selectedYear]);

  // Hardened unique data sets to prevent double-counting of potentially duplicate records in state
  const uniqueDeliveries = useMemo(() => Array.from(new Map((deliveries || []).map(d => [d.id, d])).values()), [deliveries]);
  const uniquePayments = useMemo(() => Array.from(new Map((payments || []).map(p => [p.id, p])).values()), [payments]);

  const sourceDeliveries = relevantArchive ? relevantArchive.deliveries : uniqueDeliveries;
  const sourcePayments = relevantArchive ? relevantArchive.payments : uniquePayments;

  const filteredCustomers = useMemo(() => {
    let list = riderFilterId === 'all' ? (customers || []) : (customers || []).filter(c => c.riderId === riderFilterId);
    if (searchTerm) {
      list = list.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (c.urduName && c.urduName.includes(searchTerm))
      );
    }
    return [...list].sort((a, b) => (a.deliveryOrder || 0) - (b.deliveryOrder || 0));
  }, [customers, riderFilterId, searchTerm]);

  const customerDetailData = useMemo(() => {
    if (!selectedCustomerId) return null;
    const customer = customers.find(c => c.id === selectedCustomerId);
    if (!customer) return null;

    let monthlyOpeningBalance = 0;
    
    // Improved accounting logic:
    // 1. Archives carry their own absolute "closingBalances" snapshot.
    // 2. We use this snapshot to back-calculate the opening balance of that period.
    // 3. For the current month, we use the customer's moving openingBalance.
    
    if (relevantArchive) {
        const archivedClosing = relevantArchive.closingBalances?.[selectedCustomerId];
        
        // Calculate the Billing/Recovery for JUST this archived month
        const mDeliveriesLocal = (sourceDeliveries || []).filter(d => {
            if (d.customerId !== selectedCustomerId || d.deleted) return false;
            const { year, month } = parseDateParts(d.date);
            return year === selectedYear && month === selectedMonth;
        });
        const mPaymentsLocal = (sourcePayments || []).filter(p => {
            if (p.customerId !== selectedCustomerId || p.deleted) return false;
            const { year, month } = parseDateParts(p.date);
            return year === selectedYear && month === selectedMonth;
        });

        const periodBilling = mDeliveriesLocal.reduce((sum, d) => sum + (Number(d.totalAmount) || 0), 0);
        const periodRecovery = mPaymentsLocal.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

        if (archivedClosing !== undefined) {
             monthlyOpeningBalance = archivedClosing - periodBilling + periodRecovery;
        } else {
             monthlyOpeningBalance = Number(customer.openingBalance) || 0;
        }
    } else {
        // Viewing Current Month view (Active data)
        // Opening balance for the current view should include everything happened BEFORE selectedMonth
        // that hasn't been archived and soft-deleted yet.
        
        const prevDeliveries = (uniqueDeliveries || []).filter(d => {
            if (d.customerId !== selectedCustomerId || d.deleted) return false;
            const { year, month } = parseDateParts(d.date);
            return (year < selectedYear) || (year === selectedYear && month < selectedMonth);
        });
        
        const prevPayments = (uniquePayments || []).filter(p => {
            if (p.customerId !== selectedCustomerId || p.deleted) return false;
            const { year, month } = parseDateParts(p.date);
            return (year < selectedYear) || (year === selectedYear && month < selectedMonth);
        });

        const totalPrevDebit = prevDeliveries.reduce((sum, d) => sum + (Number(d.totalAmount) || 0), 0);
        const totalPrevCredit = prevPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        
        monthlyOpeningBalance = (Number(customer.openingBalance) || 0) + totalPrevDebit - totalPrevCredit;
    }

    const mDeliveries = (sourceDeliveries || []).filter(d => {
      if (d.customerId !== selectedCustomerId || d.deleted) return false;
      const { year, month } = parseDateParts(d.date);
      return year === selectedYear && month === selectedMonth;
    });

    const mPayments = (sourcePayments || []).filter(p => {
      if (p.customerId !== selectedCustomerId || p.deleted) return false;
      const { year, month } = parseDateParts(p.date);
      return year === selectedYear && month === selectedMonth;
    });

    const ledgerItems = [
      ...mDeliveries.map(d => ({ ...d, type: 'milk', sortDate: d.date, debit: (d.totalAmount || 0), credit: 0, timestamp: d.updatedAt })),
      ...mPayments.map(p => ({ ...p, type: 'payment', sortDate: p.date, debit: 0, credit: (p.amount || 0), timestamp: p.updatedAt }))
    ].sort((a, b) => a.sortDate.localeCompare(b.sortDate) || a.timestamp.localeCompare(b.timestamp));

    const periodBilling = mDeliveries.reduce((sum, d) => sum + ((!d.deleted && !isNaN(Number(d.totalAmount))) ? Number(d.totalAmount) : 0), 0);
    const periodRecovery = mPayments.reduce((sum, p) => sum + ((!p.deleted && !isNaN(Number(p.amount))) ? Number(p.amount) : 0), 0);
    const closingBalance = monthlyOpeningBalance + periodBilling - periodRecovery;

    return { customer, openingBalance: monthlyOpeningBalance, ledgerItems, periodBilling, periodRecovery, closingBalance };
  }, [selectedCustomerId, selectedMonth, selectedYear, customers, relevantArchive, sourceDeliveries, sourcePayments, uniqueDeliveries, uniquePayments]);

  const indexedMonthDeliveries = useMemo(() => {
    const map = new Map<string, Delivery[]>();
    (sourceDeliveries || []).forEach(d => {
      if (d.deleted) return;
      const { year, month } = parseDateParts(d.date);
      if (year === selectedYear && month === selectedMonth) {
        const list = map.get(d.customerId) || [];
        list.push(d);
        map.set(d.customerId, list);
      }
    });
    return map;
  }, [sourceDeliveries, selectedYear, selectedMonth]);

  const monthlyBalances = useMemo(() => {
    if (relevantArchive) return relevantArchive.closingBalances || {};
    
    // For active data view, calculate the balance at the END of the selected month
    const res: Record<string, number> = {};
    const monthEndDate = new Date(selectedYear, selectedMonth, 1);
    monthEndDate.setMonth(monthEndDate.getMonth() + 1);
    monthEndDate.setDate(0); // Last day
    monthEndDate.setHours(23, 59, 59, 999);
    
    customers.forEach(customer => {
      const startBal = Number(customer.openingBalance) || 0;
      
      const prevAndCurrentDeliveries = (uniqueDeliveries || []).filter(d => {
        if (d.customerId !== customer.id || d.deleted) return false;
        const { year, month } = parseDateParts(d.date);
        return (year < selectedYear) || (year === selectedYear && month <= selectedMonth);
      });
      
      const prevAndCurrentPayments = (uniquePayments || []).filter(p => {
        if (p.customerId !== customer.id || p.deleted) return false;
        const { year, month } = parseDateParts(p.date);
        return (year < selectedYear) || (year === selectedYear && month <= selectedMonth);
      });

      const totalD = prevAndCurrentDeliveries.reduce((sum, d) => sum + (Number(d.totalAmount) || 0), 0);
      const totalP = prevAndCurrentPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      
      res[customer.id] = Math.round((startBal + totalD - totalP) * 100) / 100;
    });
    
    return res;
  }, [relevantArchive, customers, uniqueDeliveries, uniquePayments, selectedMonth, selectedYear]);

  if (selectedCustomerId && customerDetailData) {
    const { customer, openingBalance, ledgerItems, closingBalance } = customerDetailData;
    
    let currentBal = openingBalance;
    const ledgerItemsWithBalance = ledgerItems.map(entry => {
      currentBal += (entry.debit ?? 0) - (entry.credit ?? 0);
      return { ...entry, runningBal: currentBal };
    });

    const totalBilling = ledgerItems.reduce((sum, item) => sum + (item.debit || 0), 0);
    const totalRecovery = ledgerItems.reduce((sum, item) => sum + (item.credit || 0), 0);

    const handlePrint = () => {
      printService.setPrintConfig(printProfile, printFontSize);
      const isThermal = printProfile === '80' || printProfile === '58';
      
      printService.triggerPrint(
        <ThermalPrintView 
          profile={printProfile} 
          fontSize={printFontSize} 
          title="Gujjar Milk Shop" 
          subtitle="Digital Statement"
        >
           <div className={`flex flex-col ${isThermal ? 'gap-4' : 'md:flex-row justify-between items-start gap-8'}`}>
              <div className={isThermal ? 'space-y-2' : 'space-y-4'}>
                 <div className="space-y-1">
                    <p className={`${isThermal ? 'text-[8px]' : 'text-[10px]'} font-semibold text-slate-500 uppercase tracking-widest`}>Customer Account / کسٹمر اکاؤنٹ</p>
                    <h2 className={`${isThermal ? 'text-xl' : 'text-2xl'} font-bold text-slate-900 tracking-tight`}>{customer.name}</h2>
                    <p className={`${isThermal ? 'text-lg' : 'text-xl'} font-medium text-slate-700`} dir="rtl">{customer.urduName}</p>
                 </div>
                 
                 <div className="space-y-1">
                    <div className="flex items-center gap-2 text-slate-600">
                       <Phone size={isThermal ? 12 : 14} className="text-slate-400" />
                       <p className={`${isThermal ? 'text-[10px]' : 'text-sm'} font-medium`}>{customer.phone || 'No phone'}</p>
                    </div>
                 </div>

                 <div className={`flex items-center gap-2 bg-slate-50 border border-slate-200 ${isThermal ? 'px-2 py-1' : 'px-3 py-1.5'} rounded-md w-fit`}>
                    <Calendar size={isThermal ? 10 : 14} className="text-slate-500" />
                    <p className={`${isThermal ? 'text-[8px]' : 'text-xs'} font-semibold text-slate-700 uppercase tracking-wider`}>{getMonthName(selectedMonth)} {selectedYear}</p>
                 </div>
              </div>
              <div className={`${isThermal ? 'bg-slate-900 text-white p-4 rounded-xl' : 'bg-slate-900 text-white p-6 rounded-xl text-right min-w-[200px] shadow-sm relative overflow-hidden'}`}>
                 <div className="relative z-10">
                    <p className={`${isThermal ? 'text-[8px]' : 'text-xs'} font-semibold text-slate-300 uppercase mb-1 tracking-widest`}>Final Balance</p>
                    <p className={`${isThermal ? 'text-2xl' : 'text-3xl'} font-mono font-bold tracking-tight`}>Rs. {formatPKR(closingBalance)}</p>
                 </div>
              </div>
           </div>

           <div className={`overflow-x-auto ${isThermal ? 'rounded-lg border mt-4' : 'rounded-xl border border-slate-200 mt-6'}`}>
              <table className="w-full text-left border-collapse">
                 <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr className={`${isThermal ? 'text-[7px]' : 'text-xs'} font-semibold uppercase tracking-wider`}>
                       <th className={isThermal ? 'px-2 py-2' : 'px-6 py-4'}>Date</th>
                       <th className={isThermal ? 'px-2 py-2' : 'px-6 py-4'}>Particulars</th>
                       <th className={`${isThermal ? 'px-2 py-2' : 'px-6 py-4'} text-right`}>D/C</th>
                       <th className={`${isThermal ? 'px-2 py-2' : 'px-6 py-4'} text-right`}>Bal</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                    <tr className="bg-white">
                       <td colSpan={2} className={`${isThermal ? 'px-2 py-2 text-[7px]' : 'px-6 py-4 text-xs'} font-medium text-slate-500 uppercase`}>B/F</td>
                       <td className={isThermal ? 'px-2 py-2 text-right' : 'px-6 py-4 text-right text-slate-400'}>-</td>
                       <td className={`${isThermal ? 'px-2 py-2 text-right text-[10px]' : 'px-6 py-4 text-right text-sm'} font-mono font-semibold text-slate-900 bg-slate-50/50`}>{formatPKR(openingBalance)}</td>
                    </tr>
                    {(() => {
                      let rb = openingBalance;
                      return ledgerItems.map((entry, i) => {
                        rb += (entry.debit ?? 0) - (entry.credit ?? 0);
                        const d = entry as any;
                        const isAdj = d.isAdjustment;
                        const particulars = d.type === 'milk' 
                          ? `${d.liters || 0}L`
                          : 'Cash';
                        return (
                          <tr key={i} className={`bg-white border-l-2 ${isAdj ? 'border-orange-400 bg-orange-50/20' : 'border-transparent'}`}>
                             <td className={`${isThermal ? 'px-2 py-2 text-[8px]' : 'px-6 py-4 text-sm'} font-medium text-slate-500 whitespace-nowrap`}>{parseDateParts(entry.sortDate).day}</td>
                             <td className={`${isThermal ? 'px-2 py-2 text-[8px]' : 'px-6 py-4 text-sm'} font-medium`}>
                                <div className="flex flex-col">
                                   <span className="uppercase text-slate-800">{particulars}</span>
                                   {isAdj && <span className="text-[8px] text-orange-600 mt-0.5">CORR</span>}
                                </div>
                             </td>
                             <td className={`${isThermal ? 'px-2 py-2 text-right text-[8px]' : 'px-6 py-4 text-right text-sm'} font-mono font-medium ${entry.debit !== 0 ? 'text-red-500' : 'text-green-600'}`}>
                                {entry.debit !== 0 ? `+${formatPKR(entry.debit)}` : `-${formatPKR(entry.credit)}`}
                             </td>
                             <td className={`${isThermal ? 'px-2 py-2 text-right text-[8px]' : 'px-6 py-4 text-right text-sm'} font-mono font-semibold text-slate-900 bg-slate-50/50`}>{formatPKR(rb)}</td>
                          </tr>
                        );
                      });
                    })()}
                 </tbody>
              </table>
           </div>
           
           <div className={`pt-6 flex justify-between items-center text-slate-400 font-semibold uppercase ${isThermal ? 'text-[6px] tracking-widest' : 'text-[10px] tracking-widest'}`}>
               <span>DairyPro Cloud Ledger</span>
               <div className={isThermal ? 'flex gap-2' : 'flex gap-10'}>
                  <span>Signature</span>
                  <span>Stamp</span>
               </div>
           </div>
        </ThermalPrintView>
      );
    };

    const handleExportPDF = () => {
      setIsExportingLedger(true);
      setTimeout(() => {
        exportService.exportToPDF(
          'ledger-print-view',
          `${customer.name.replace(/\s+/g, '_')}_Ledger_${getMonthName(selectedMonth)}_${selectedYear}`
        ).then(() => setIsExportingLedger(false));
      }, 500);
    };

    const handleExportExcel = () => {
      exportService.exportLedgerToExcel(
        customer,
        getMonthName(selectedMonth),
        selectedYear,
        openingBalance,
        ledgerItemsWithBalance,
        closingBalance
      );
    };

    const submitAdjustment = () => {
      const amt = parseFloat(adjAmount);
      if (isNaN(amt) || amt <= 0) return alert("Enter valid amount");
      if (!adjNote.trim()) return alert("Enter reason for adjustment");
      onAddAdjustment({ customerId: selectedCustomerId!, type: adjType, amount: amt, note: adjNote });
      setIsAdjModalOpen(false);
      setAdjAmount('');
      setAdjNote('');
    };

    return (
      <div className="p-4 md:p-8 space-y-6 print-ledger-container animate-in fade-in duration-300 bg-slate-50 min-h-full">
        <AnimatePresence>
          {isAdjModalOpen && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
               <motion.div 
                 initial={{ opacity: 0, scale: 0.95, y: 10 }}
                 animate={{ opacity: 1, scale: 1, y: 0 }}
                 exit={{ opacity: 0, scale: 0.95, y: 10 }}
                 className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200"
               >
                  <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                     <h3 className="font-semibold text-lg text-slate-800">Manual Adjustment</h3>
                     <button onClick={() => setIsAdjModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-md transition-all"><X size={20}/></button>
                  </div>
                  <div className="p-6 space-y-6">
                     <div className="flex bg-slate-100 p-1 rounded-lg">
                        <button 
                          onClick={() => setAdjType('DEBIT')}
                          className={`flex-1 py-2.5 rounded-md font-medium text-sm transition-all ${adjType === 'DEBIT' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500'}`}
                        >
                          Debit (+)
                        </button>
                        <button 
                          onClick={() => setAdjType('CREDIT')}
                          className={`flex-1 py-2.5 rounded-md font-medium text-sm transition-all ${adjType === 'CREDIT' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500'}`}
                        >
                          Credit (-)
                        </button>
                     </div>

                     <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Adjustment Amount</label>
                        <input 
                          type="number" 
                          placeholder="Amount in Rs." 
                          className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-lg font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                          value={adjAmount}
                          onChange={e => setAdjAmount(e.target.value)}
                        />
                     </div>

                     <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Reason / Details</label>
                        <textarea 
                          placeholder="Enter reason for this correction..." 
                          className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all h-28 resize-none"
                          value={adjNote}
                          onChange={e => setAdjNote(e.target.value)}
                        />
                     </div>

                     <button 
                        onClick={submitAdjustment}
                        className="w-full py-3.5 bg-slate-900 text-white rounded-lg font-semibold shadow-sm hover:bg-slate-800 active:scale-[0.98] transition-all"
                     >
                        Confirm Correction
                     </button>
                  </div>
               </motion.div>
            </div>
          )}
        </AnimatePresence>
        {/* HIDDEN LEDGER FOR PDF EXPORT */}
        {isExportingLedger && (
          <div className="fixed left-[-9999px] top-0">
            <div id="ledger-print-view" className="bg-white p-4">
              <ThermalPrintView 
                profile="A4" 
                fontSize="md" 
                title="Gujjar Milk Shop" 
                subtitle="Digital Statement"
              >
                 <div className="flex flex-col md:flex-row justify-between items-start gap-8">
                    <div className="space-y-6">
                       <div className="space-y-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer Account / کسٹمر اکاؤنٹ</p>
                          <h2 className="text-4xl font-black text-slate-900 tracking-tight">{customer.name}</h2>
                          <p className="text-4xl font-bold text-blue-600" dir="rtl">{customer.urduName}</p>
                       </div>
                       
                       <div className="space-y-1">
                          <div className="flex items-center gap-2 text-slate-600">
                             <Phone size={16} className="text-blue-500" />
                             <p className="text-sm font-bold tracking-tight">{customer.phone || 'No phone'}</p>
                          </div>
                       </div>

                       <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-lg w-fit">
                          <Calendar size={14} className="text-slate-500" />
                          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{getMonthName(selectedMonth)} {selectedYear}</p>
                       </div>
                    </div>
                    <div className="bg-slate-900 text-white p-10 rounded-[3rem] text-right min-w-[320px] shadow-2xl relative overflow-hidden">
                       <div className="relative z-10">
                          <p className="text-[9px] font-black text-blue-400 uppercase mb-1 tracking-widest">Final Balance / کل بقایا</p>
                          <p className="text-5xl font-black tracking-tighter italic">Rs. {formatPKR(closingBalance)}</p>
                       </div>
                    </div>
                 </div>

                 <div className="overflow-x-auto rounded-[2.5rem] border-2 border-slate-100 mt-8">
                    <table className="w-full text-left font-bold border-collapse">
                       <thead className="bg-slate-900 text-white">
                          <tr className="text-[9px] font-black uppercase tracking-widest">
                             <th className="px-10 py-7">Date</th>
                             <th className="px-10 py-7">Particulars</th>
                             <th className="px-10 py-7 text-right">D/C</th>
                             <th className="px-10 py-7 text-right">Bal</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                          <tr className="bg-slate-50 italic">
                             <td colSpan={2} className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase">B/F</td>
                             <td className="px-10 py-5 text-right">-</td>
                             <td className="px-10 py-5 text-right text-sm font-black text-slate-900">{formatPKR(openingBalance)}</td>
                          </tr>
                          {(() => {
                            let rb = openingBalance;
                            return ledgerItems.map((entry, i) => {
                              rb += (entry.debit ?? 0) - (entry.credit ?? 0);
                              const d = entry as any;
                              const isAdj = d.isAdjustment;
                              const particulars = d.type === 'milk' 
                                ? `${d.liters || 0}L`
                                : 'Cash';
                              return (
                                <tr key={i} className={`bg-white border-l-2 ${isAdj ? 'border-orange-400 bg-orange-50/20' : 'border-transparent'}`}>
                                   <td className="px-6 py-4 text-sm font-medium text-slate-500 whitespace-nowrap">{parseDateParts(entry.sortDate).day}</td>
                                   <td className="px-6 py-4 text-sm font-medium">
                                      <div className="flex flex-col">
                                         <span className="uppercase text-slate-800">{particulars}</span>
                                         {isAdj && <span className="text-[10px] text-orange-600 mt-0.5">CORR</span>}
                                      </div>
                                   </td>
                                   <td className={`px-6 py-4 text-right text-sm font-mono font-medium ${entry.debit !== 0 ? 'text-red-500' : 'text-green-600'}`}>
                                      {entry.debit !== 0 ? `+${formatPKR(entry.debit)}` : `-${formatPKR(entry.credit)}`}
                                   </td>
                                   <td className="px-6 py-4 text-right text-sm font-mono font-semibold text-slate-900 bg-slate-50/50">{formatPKR(rb)}</td>
                                </tr>
                              );
                            });
                          })()}
                       </tbody>
                  <tfoot className="bg-slate-50 text-slate-700 border-t border-slate-200">
                      <tr className="font-semibold text-xs uppercase tracking-wider">
                          <td colSpan={2} className="px-6 py-4 text-right">Monthly Totals / ماہانہ کل</td>
                          <td className="px-6 py-4 text-right text-red-600 font-mono">Rs. {formatPKR(totalBilling)}</td>
                          <td className="px-6 py-4 text-right text-green-600 font-mono">Rs. {formatPKR(totalRecovery)}</td>
                          <td className="px-6 py-4 text-right bg-slate-100 font-bold font-mono text-slate-900 text-sm">Rs. {formatPKR(closingBalance)}</td>
                      </tr>
                  </tfoot>
                    </table>
                 </div>
                 
                 <div className="pt-6 flex justify-between items-center text-slate-400 font-semibold uppercase text-xs tracking-wider">
                     <span>DairyPro Cloud Ledger</span>
                     <div className="flex gap-10">
                        <span>Signature</span>
                        <span>Stamp</span>
                     </div>
                 </div>
              </ThermalPrintView>
            </div>
          </div>
        )}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 no-print">
            <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => setSelectedCustomerId(null)} className="flex items-center gap-2 text-slate-700 font-semibold text-sm bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200 hover:bg-slate-50 transition-all">
                    <ArrowLeft size={16} /> Ledger List
                </button>
                <div className="h-6 w-px bg-slate-200 hidden md:block mx-1" />
                <button 
                  onClick={() => setShowPrintSettings(!showPrintSettings)}
                  className={`p-2 rounded-md transition-all border ${showPrintSettings ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                  <Settings2 size={18}/>
                </button>
                <button 
                  onClick={() => { setAdjType('DEBIT'); setIsAdjModalOpen(true); }}
                  className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 rounded-lg font-semibold text-sm border border-slate-200 hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm"
                >
                    <Plus size={16} className="text-red-500"/> Adj Debit
                </button>
                <button 
                  onClick={() => { setAdjType('CREDIT'); setIsAdjModalOpen(true); }}
                  className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 rounded-lg font-semibold text-sm border border-slate-200 hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm"
                >
                    <Minus size={16} className="text-green-600"/> Adj Credit
                </button>
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
                <button onClick={handlePrint} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg font-semibold text-sm shadow-sm active:scale-95 transition-all">
                    <Printer size={16}/> Print
                </button>
                <button onClick={handleExportPDF} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg font-semibold text-sm shadow-sm hover:bg-slate-50 active:scale-95 transition-all">
                    PDF
                </button>
                <button onClick={handleExportExcel} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg font-semibold text-sm shadow-sm hover:bg-slate-50 active:scale-95 transition-all">
                    Excel
                </button>
            </div>
        </div>

        {/* PRINT SETTINGS PANEL */}
        {showPrintSettings && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm animate-in slide-in-from-top-4 no-print space-y-6 mt-4">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                   <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Paper Size / پیپر کا سائز</label>
                   <div className="flex bg-slate-100 p-1 rounded-lg">
                      <button onClick={() => setPrintProfile('A4')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md font-semibold text-xs transition-all ${printProfile === 'A4' ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}><Monitor size={14}/> A4 Page</button>
                      <button onClick={() => setPrintProfile('80')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md font-semibold text-xs transition-all ${printProfile === '80' ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}><Smartphone size={14}/> 80mm</button>
                      <button onClick={() => setPrintProfile('58')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md font-semibold text-xs transition-all ${printProfile === '58' ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}><Smartphone size={12}/> 58mm</button>
                   </div>
                </div>
                <div className="space-y-2">
                   <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Text Size / لکھائی کا سائز</label>
                   <div className="flex bg-slate-100 p-1 rounded-lg">
                      <button onClick={() => setPrintFontSize('sm')} className={`flex-1 py-2.5 rounded-md font-semibold text-xs transition-all ${printFontSize === 'sm' ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>Small</button>
                      <button onClick={() => setPrintFontSize('md')} className={`flex-1 py-2.5 rounded-md font-semibold text-xs transition-all ${printFontSize === 'md' ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>Normal</button>
                      <button onClick={() => setPrintFontSize('lg')} className={`flex-1 py-2.5 rounded-md font-semibold text-xs transition-all ${printFontSize === 'lg' ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>Large</button>
                   </div>
                </div>
             </div>
          </div>
        )}

        <div className="bg-white p-6 md:p-10 rounded-2xl border border-slate-200 shadow-sm space-y-8 mt-6">
           <div className="flex flex-col md:flex-row justify-between items-start gap-8">
              <div className="space-y-4">
                 <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Customer Account</p>
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{customer.name}</h2>
                    {customer.urduName && <p className="text-xl font-medium text-slate-600" dir="rtl">{customer.urduName}</p>}
                 </div>
                 
                 <div className="flex items-center gap-2 text-slate-600">
                    <Phone size={16} className="text-slate-400" />
                    <p className="text-sm font-medium">{customer.phone || 'No phone number provided'}</p>
                 </div>

                 <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-md w-fit">
                       <Calendar size={14} className="text-slate-500" />
                       <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">{getMonthName(selectedMonth)} {selectedYear}</p>
                    </div>
                    {relevantArchive && (
                      <div className="flex items-center gap-2 bg-slate-800 text-white px-3 py-1.5 rounded-md w-fit">
                         <ShieldCheck size={14} />
                         <p className="text-xs font-semibold uppercase tracking-wider">Locked Archive</p>
                      </div>
                    )}
                 </div>
              </div>
              
              <div className="grid grid-cols-2 md:flex gap-4 w-full md:w-auto">
                 <div className="flex-1 bg-white p-5 rounded-xl border border-slate-200 shadow-sm min-w-[140px]">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Opening</p>
                    <p className="text-lg font-mono font-medium text-slate-700">Rs. {formatPKR(openingBalance)}</p>
                 </div>
                 <div className="flex-1 bg-white p-5 rounded-xl border border-slate-200 shadow-sm min-w-[140px]">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Total Bill</p>
                    <p className="text-lg font-mono font-medium text-red-600">Rs. {formatPKR(totalBilling)}</p>
                 </div>
                 <div className="flex-1 bg-white p-5 rounded-xl border border-slate-200 shadow-sm min-w-[140px]">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Total Rec.</p>
                    <p className="text-lg font-mono font-medium text-green-600">Rs. {formatPKR(totalRecovery)}</p>
                 </div>
                 <div className="flex-1 bg-slate-900 text-white p-5 rounded-xl shadow-md min-w-[160px]">
                    <p className="text-xs font-semibold text-slate-300 uppercase tracking-widest mb-2">Closing Bal</p>
                    <p className="text-2xl font-mono font-bold">Rs. {formatPKR(closingBalance)}</p>
                 </div>
              </div>
           </div>

           <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse">
                 <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr className="text-xs font-semibold uppercase tracking-widest">
                       <th className="px-6 py-4">Date</th>
                       <th className="px-6 py-4">Particulars</th>
                       <th className="px-6 py-4 text-right">Debit (+)</th>
                       <th className="px-6 py-4 text-right">Credit (-)</th>
                       <th className="px-6 py-4 text-right bg-slate-100">Balance</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100 text-sm">
                    <tr className="bg-white">
                       <td colSpan={2} className="px-6 py-4 font-medium text-slate-500">B/F From Prev Month</td>
                       <td className="px-6 py-4 text-right text-slate-400">-</td>
                       <td className="px-6 py-4 text-right text-slate-400">-</td>
                       <td className="px-6 py-4 text-right font-mono font-semibold text-slate-800 bg-slate-50/50">Rs. {formatPKR(openingBalance)}</td>
                    </tr>
                    {ledgerItemsWithBalance.map((entry, i) => {
                      const d = entry as any;
                      const isAdj = d.isAdjustment;
                      const particulars = d.type === 'milk' 
                        ? `${d.liters || 0}L Milk Delivery`
                        : 'Cash Payment';
                      return (
                        <tr key={i} className={`hover:bg-slate-50 transition-colors border-l-4 ${isAdj ? 'border-orange-400 bg-orange-50/20 hover:bg-orange-50/40' : 'border-transparent hover:border-slate-300 bg-white'}`}>
                           <td className="px-6 py-4 text-slate-500 whitespace-nowrap">{parseDateParts(entry.sortDate).day} {getMonthName(selectedMonth).slice(0,3)}</td>
                           <td className="px-6 py-4">
                              <div className="flex flex-col">
                                 <span className="font-medium text-slate-800">{particulars}</span>
                                 {isAdj && <span className="text-xs text-orange-600 flex items-center gap-1 mt-1"><RefreshCcw size={10}/> {d.adjustmentNote}</span>}
                              </div>
                           </td>
                           <td className="px-6 py-4 text-right font-mono">
                              {entry.debit !== 0 ? (
                                 <span className="text-red-600">Rs. {formatPKR(entry.debit)}</span>
                              ) : <span className="text-slate-300">-</span>}
                           </td>
                           <td className="px-6 py-4 text-right font-mono">
                              {entry.credit !== 0 ? (
                                 <span className="text-green-600">Rs. {formatPKR(entry.credit)}</span>
                              ) : <span className="text-slate-300">-</span>}
                           </td>
                           <td className="px-6 py-4 text-right font-mono font-semibold text-slate-800 bg-slate-50/50">Rs. {formatPKR(entry.runningBal)}</td>
                        </tr>
                      );
                    })}
                 </tbody>
              </table>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 animate-in fade-in duration-500 min-h-screen bg-slate-50/50">
      <div className="flex flex-col md:flex-row gap-6 items-center justify-between bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex bg-slate-100 p-1.5 rounded-lg w-full md:w-auto">
          <button onClick={() => setReportType('khata')} className={`flex-1 md:flex-none px-6 py-2 rounded-md font-semibold text-xs tracking-wide transition-all ${reportType === 'khata' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Ledger View</button>
          <button onClick={() => setReportType('pnl')} className={`flex-1 md:flex-none px-6 py-2 rounded-md font-semibold text-xs tracking-wide transition-all ${reportType === 'pnl' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Profit & Loss</button>
        </div>
        
        <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Search customers..." 
              className="pl-10 pr-10 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-full md:w-64 transition-all shadow-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center bg-slate-200 rounded-full text-slate-600 hover:bg-slate-300 transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <select className="flex-1 px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm" value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))}>
              {Array.from({length: 12}).map((_, i) => <option key={i} value={i}>{getMonthName(i)}</option>)}
            </select>
            <select className="flex-1 px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm" value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))}>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button 
              onClick={onSyncArchives}
              title="Sync Balances from Archives"
              className="px-4 py-2.5 bg-white text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm group flex items-center justify-center"
            >
              <RefreshCcw size={16} className="group-hover:rotate-180 transition-transform duration-500" />
            </button>
          </div>
        </div>
      </div>

      {reportType === 'khata' ? (
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {filteredCustomers.map(c => (
              <KhataRow 
                key={c.id}
                customer={c}
                monthDeliveries={indexedMonthDeliveries.get(c.id) || []}
                balance={monthlyBalances[c.id] || 0}
                onSelect={setSelectedCustomerId}
              />
            ))}
          </AnimatePresence>
          {filteredCustomers.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-20 text-center"
            >
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <Search size={32} />
                <p className="font-semibold text-sm tracking-wide">No customers found matching "{searchTerm}"</p>
              </div>
            </motion.div>
          )}
        </div>
      ) : (
        <div className="py-20 text-center text-slate-500 font-semibold uppercase tracking-wide">P&L view is currently calculating based on standard logic.</div>
      )}
    </div>
  );
};

export default React.memo(Reports);
