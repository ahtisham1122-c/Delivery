import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, Calendar, ChevronRight, Search,
  Printer, RefreshCcw, Phone, Settings2, Monitor, Smartphone,
  Plus, Minus, X, ShieldCheck, FileText
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
      className={`group relative overflow-hidden bg-white p-4 md:p-5 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-blue-300 hover:shadow-lg transition-all ${!customer.active ? 'opacity-60 bg-slate-50' : ''}`}
    >
      <div className="absolute left-0 top-0 h-full w-1 bg-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="grid grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_auto_auto] gap-4 items-center">
        <div className="w-11 h-11 rounded-lg shadow-sm bg-slate-900 border border-slate-800 flex items-center justify-center text-white font-black text-sm">
          {customer.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black text-sm md:text-base text-slate-950 truncate">{customer.name}</p>
            {!customer.active && <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-black text-slate-500 uppercase">Inactive</span>}
          </div>
          {customer.urduName && <p className="text-sm text-slate-500 font-semibold truncate" dir="rtl">{customer.urduName}</p>}
          <p className="text-[11px] font-bold text-slate-400 uppercase mt-1">Order #{customer.deliveryOrder || 0} · {customer.paymentCycle}</p>
        </div>
        <div className="col-span-2 md:col-span-1 bg-slate-50 border border-slate-200 rounded-lg p-3 md:min-w-[150px]">
          <p className="text-[10px] font-black text-slate-400 uppercase">Current Bill</p>
          <p className="font-mono text-sm md:text-base font-black text-slate-800 mt-1">Rs. {formatPKR(mBill)}</p>
        </div>
        <div className="col-span-2 md:col-span-1 flex items-center justify-between md:justify-end gap-4">
          <div className="text-left md:text-right">
            <p className="text-[10px] font-black text-slate-400 uppercase">Closing Balance</p>
            <p className={`font-mono font-black text-lg ${balance > 0.01 ? 'text-red-600' : balance < -0.01 ? 'text-blue-600' : 'text-emerald-600'}`}>
              Rs. {formatPKR(Math.abs(balance))}
            </p>
            <p className="text-[10px] font-bold text-slate-400 uppercase">{balance > 0.01 ? 'Receivable' : balance < -0.01 ? 'Advance' : 'Settled'}</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-400 group-hover:text-blue-600 group-hover:border-blue-200 flex items-center justify-center transition-colors">
            <ChevronRight size={18}/>
          </div>
        </div>
      </div>
    </motion.div>
  );
}));

const Reports: React.FC<ReportsProps> = ({ 
  customers, deliveries, payments, riderFilterId, archives, onAddAdjustment
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

  const ledgerListStats = useMemo(() => {
    const visibleCustomerIds = new Set(filteredCustomers.map(c => c.id));
    const totalReceivable = filteredCustomers.reduce((sum, c) => {
      const bal = Number(monthlyBalances[c.id]) || 0;
      return sum + (bal > 0 ? bal : 0);
    }, 0);
    const totalAdvance = filteredCustomers.reduce((sum, c) => {
      const bal = Number(monthlyBalances[c.id]) || 0;
      return sum + (bal < 0 ? Math.abs(bal) : 0);
    }, 0);
    const monthlyBilling = Array.from(indexedMonthDeliveries.entries()).reduce((sum, [customerId, rows]) => {
      if (!visibleCustomerIds.has(customerId)) return sum;
      return sum + rows.reduce((inner, d) => inner + (Number(d.totalAmount) || 0), 0);
    }, 0);
    return {
      customers: filteredCustomers.length,
      totalReceivable: Math.round(totalReceivable * 100) / 100,
      totalAdvance: Math.round(totalAdvance * 100) / 100,
      monthlyBilling: Math.round(monthlyBilling * 100) / 100
    };
  }, [filteredCustomers, monthlyBalances, indexedMonthDeliveries]);

  if (selectedCustomerId && customerDetailData) {
    const { customer, openingBalance, ledgerItems, closingBalance } = customerDetailData;
    
    let currentBal = openingBalance;
    const ledgerItemsWithBalance = ledgerItems.map(entry => {
      currentBal += (entry.debit ?? 0) - (entry.credit ?? 0);
      return { ...entry, runningBal: currentBal };
    });

    const totalBilling = ledgerItems.reduce((sum, item) => sum + (item.debit || 0), 0);
    const totalRecovery = ledgerItems.reduce((sum, item) => sum + (item.credit || 0), 0);
    const totalLiters = ledgerItems.reduce((sum, item) => sum + (item.type === 'milk' ? Number((item as any).liters || 0) : 0), 0);
    const balanceTone = closingBalance > 0.01 ? 'text-red-600' : closingBalance < -0.01 ? 'text-blue-600' : 'text-green-600';

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

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mt-6 overflow-hidden">
           <div className="p-5 md:p-8 border-b border-slate-200 bg-slate-950 text-white">
              <div className="flex flex-col lg:flex-row justify-between gap-8">
                 <div className="space-y-5">
                    <div className="flex items-start gap-4">
                       <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/10 text-white flex items-center justify-center shadow-sm">
                          <FileText size={22} />
                       </div>
                       <div className="min-w-0">
                          <p className="text-[11px] font-black text-slate-400 uppercase">Customer Statement</p>
                          <h2 className="text-2xl md:text-3xl font-black text-white">{customer.name}</h2>
                          {customer.urduName && <p className="text-xl font-semibold text-cyan-300 mt-1" dir="rtl">{customer.urduName}</p>}
                       </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                       <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 text-xs font-bold text-slate-100">
                          <Calendar size={14} /> {getMonthName(selectedMonth)} {selectedYear}
                       </span>
                       <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 text-xs font-bold text-slate-100">
                          <Phone size={14} /> {customer.phone || 'No phone'}
                       </span>
                       {relevantArchive && (
                         <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold">
                            <ShieldCheck size={14} /> Locked Archive
                         </span>
                       )}
                    </div>
                 </div>

                 <div className="lg:text-right bg-white text-slate-950 rounded-xl p-5 min-w-full lg:min-w-[280px]">
                    <p className="text-[11px] font-black text-slate-500 uppercase">Closing Balance</p>
                    <p className={`text-3xl md:text-4xl font-black mt-2 ${balanceTone}`}>Rs. {formatPKR(Math.abs(closingBalance))}</p>
                    <p className="text-xs font-bold text-slate-500 mt-1">
                      {closingBalance > 0.01 ? 'Receivable from customer' : closingBalance < -0.01 ? 'Customer advance' : 'Account settled'}
                    </p>
                 </div>
              </div>
           </div>

           <div className="grid grid-cols-2 lg:grid-cols-5 bg-white">
              {[
                ['Opening', `Rs. ${formatPKR(openingBalance)}`, 'text-slate-800', 'bg-slate-50'],
                ['Milk Qty', `${totalLiters.toFixed(1)}L`, 'text-blue-700', 'bg-blue-50'],
                ['Billing', `Rs. ${formatPKR(totalBilling)}`, 'text-red-600', 'bg-red-50'],
                ['Recovery', `Rs. ${formatPKR(totalRecovery)}`, 'text-emerald-700', 'bg-emerald-50'],
                ['Entries', ledgerItems.length.toString(), 'text-slate-800', 'bg-slate-50']
              ].map(([label, value, color, bg]) => (
                <div key={label} className="p-4 md:p-5 border-r border-b border-slate-200 last:border-r-0">
                  <div className={`${bg} rounded-xl border border-white p-3`}>
                    <p className="text-[10px] font-black text-slate-500 uppercase">{label}</p>
                    <p className={`text-base md:text-lg font-black font-mono mt-1 ${color}`}>{value}</p>
                  </div>
                </div>
              ))}
           </div>

           <div className="md:hidden p-4 space-y-3 bg-slate-50 border-t border-slate-200">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase">Opening Balance</span>
                  <span className="font-mono font-black text-slate-900">Rs. {formatPKR(openingBalance)}</span>
                </div>
              </div>
              {ledgerItemsWithBalance.map((entry, i) => {
                const d = entry as any;
                const isAdj = d.isAdjustment;
                const particulars = d.type === 'milk' ? `${d.liters || 0}L` : 'Cash';
                return (
                  <div key={i} className={`bg-white rounded-xl border p-4 shadow-sm ${isAdj ? 'border-orange-200' : d.type === 'milk' ? 'border-blue-100' : 'border-emerald-100'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-black text-slate-400 uppercase">{parseDateParts(entry.sortDate).day} {getMonthName(selectedMonth).slice(0, 3)}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`inline-flex px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${d.type === 'milk' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>
                            {d.type === 'milk' ? 'Milk' : 'Payment'}
                          </span>
                          <span className="font-black text-slate-900">{particulars}</span>
                        </div>
                        {isAdj && <p className="text-xs text-orange-600 flex items-center gap-1 mt-2"><RefreshCcw size={10}/> {d.adjustmentNote}</p>}
                      </div>
                      <div className="text-right">
                        <p className={`font-mono font-black ${entry.debit !== 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                          {entry.debit !== 0 ? `+ Rs. ${formatPKR(entry.debit)}` : `- Rs. ${formatPKR(entry.credit)}`}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-2">Balance</p>
                        <p className="font-mono font-black text-slate-950">Rs. {formatPKR(entry.runningBal)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
           </div>

           <div className="hidden md:block overflow-x-auto border-t border-slate-200">
              <table className="w-full text-left border-collapse">
                 <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <tr className="text-[11px] font-black uppercase">
                       <th className="px-6 py-4">Date</th>
                       <th className="px-6 py-4">Particulars</th>
                       <th className="px-6 py-4 text-right">Debit</th>
                       <th className="px-6 py-4 text-right">Credit</th>
                       <th className="px-6 py-4 text-right bg-slate-100">Running Balance</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100 text-sm">
                    <tr className="bg-white">
                       <td className="px-6 py-4 text-slate-500 whitespace-nowrap font-bold">B/F</td>
                       <td className="px-6 py-4">
                         <span className="inline-flex px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-black text-slate-600 uppercase">Opening Balance</span>
                       </td>
                       <td className="px-6 py-4 text-right text-slate-300">-</td>
                       <td className="px-6 py-4 text-right text-slate-300">-</td>
                       <td className="px-6 py-4 text-right font-mono font-black text-slate-900 bg-slate-50">Rs. {formatPKR(openingBalance)}</td>
                    </tr>
                    {ledgerItemsWithBalance.map((entry, i) => {
                      const d = entry as any;
                      const isAdj = d.isAdjustment;
                      const particulars = d.type === 'milk' ? `${d.liters || 0}L` : 'Cash';
                      return (
                        <tr key={i} className={`hover:bg-slate-50 transition-colors border-l-4 ${isAdj ? 'border-orange-400 bg-orange-50/40' : d.type === 'milk' ? 'border-blue-500 bg-white' : 'border-emerald-500 bg-white'}`}>
                           <td className="px-6 py-4 text-slate-500 whitespace-nowrap font-bold">{parseDateParts(entry.sortDate).day} {getMonthName(selectedMonth).slice(0,3)}</td>
                           <td className="px-6 py-4">
                              <div className="flex flex-col gap-1">
                                 <div className="flex items-center gap-2">
                                   <span className={`inline-flex px-2.5 py-1 rounded-lg text-[11px] font-black uppercase ${d.type === 'milk' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                                     {d.type === 'milk' ? 'Milk' : 'Payment'}
                                   </span>
                                   <span className="font-black text-slate-900">{particulars}</span>
                                 </div>
                                 {isAdj && <span className="text-xs text-orange-600 flex items-center gap-1 mt-1"><RefreshCcw size={10}/> {d.adjustmentNote}</span>}
                              </div>
                           </td>
                           <td className="px-6 py-4 text-right font-mono">
                              {entry.debit !== 0 ? <span className="text-red-600 font-black">Rs. {formatPKR(entry.debit)}</span> : <span className="text-slate-300">-</span>}
                           </td>
                           <td className="px-6 py-4 text-right font-mono">
                              {entry.credit !== 0 ? <span className="text-emerald-700 font-black">Rs. {formatPKR(entry.credit)}</span> : <span className="text-slate-300">-</span>}
                           </td>
                           <td className="px-6 py-4 text-right font-mono font-black text-slate-900 bg-slate-50">Rs. {formatPKR(entry.runningBal)}</td>
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
    <div className="p-4 md:p-8 space-y-6 animate-in fade-in duration-500 min-h-screen bg-slate-100">
      <div className="bg-slate-950 text-white rounded-2xl border border-slate-900 shadow-sm overflow-hidden">
        <div className="p-5 md:p-7 flex flex-col xl:flex-row gap-6 justify-between">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 text-[11px] font-black text-slate-300 uppercase">
              <ShieldCheck size={14} /> Accounting Ledger
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-white">Customer Accounts</h1>
              <p className="text-sm font-semibold text-slate-400 mt-1">{getMonthName(selectedMonth)} {selectedYear} · {ledgerListStats.customers} visible accounts</p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full xl:max-w-3xl">
            {[
              ['Receivable', `Rs. ${formatPKR(ledgerListStats.totalReceivable)}`, 'text-red-300'],
              ['Advance', `Rs. ${formatPKR(ledgerListStats.totalAdvance)}`, 'text-cyan-300'],
              ['Month Bill', `Rs. ${formatPKR(ledgerListStats.monthlyBilling)}`, 'text-amber-200'],
              ['Accounts', ledgerListStats.customers.toString(), 'text-white']
            ].map(([label, value, color]) => (
              <div key={label} className="bg-white/10 border border-white/10 rounded-xl p-4">
                <p className="text-[10px] font-black text-slate-400 uppercase">{label}</p>
                <p className={`font-mono font-black text-base md:text-lg mt-1 ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-4 md:p-5 border-t border-white/10">
          <div className="flex flex-col lg:flex-row gap-4 justify-between">
            <div className="flex bg-slate-100 p-1.5 rounded-xl w-full lg:w-auto">
              <button onClick={() => setReportType('khata')} className={`flex-1 lg:flex-none px-5 py-2.5 rounded-lg font-black text-xs transition-all ${reportType === 'khata' ? 'bg-white shadow-sm text-slate-950 border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>Ledger View</button>
              <button onClick={() => setReportType('pnl')} className={`flex-1 lg:flex-none px-5 py-2.5 rounded-lg font-black text-xs transition-all ${reportType === 'pnl' ? 'bg-white shadow-sm text-slate-950 border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>Profit & Loss</button>
            </div>
            
            <div className="flex flex-col md:flex-row gap-3 w-full lg:w-auto">
              <div className="relative flex-1 md:min-w-[280px]">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input 
                  type="text" 
                  placeholder="Search customer name..." 
                  className="pl-11 pr-10 py-3 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 w-full transition-all"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center bg-slate-100 rounded-lg text-slate-500 hover:bg-slate-200 transition-colors"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select className="px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-black text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))}>
                  {Array.from({length: 12}).map((_, i) => <option key={i} value={i}>{getMonthName(i)}</option>)}
                </select>
                <select className="px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-black text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))}>
                  {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {reportType === 'khata' ? (
        <div className="space-y-3">
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
              className="py-20 text-center bg-white rounded-2xl border border-slate-200"
            >
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <Search size={32} />
                <p className="font-bold text-sm">No customers found matching "{searchTerm}"</p>
              </div>
            </motion.div>
          )}
        </div>
      ) : (
        <div className="py-20 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 font-bold uppercase">P&L view is currently calculating based on standard logic.</div>
      )}
    </div>
  );
};

export default React.memo(Reports);
