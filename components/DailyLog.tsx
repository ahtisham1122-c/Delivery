import React, { useState, useMemo } from 'react';
import { 
  Calendar, Search, ClipboardList, Wallet, 
  TrendingUp, ReceiptText, Banknote, Clock,
  Printer, Settings2, Smartphone, Monitor
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Delivery, Payment, Customer, Rider, UserRole } from '../types';
import { printService } from '../services/printService';
import { exportService } from '../services/exportService';
import { SummaryReceipt } from './Receipts';

interface DailyLogProps {
  deliveries: Delivery[];
  payments: Payment[];
  customers: Customer[];
  riders: Rider[];
  riderFilterId: string;
  role: UserRole;
}

const LogRow = React.memo(React.forwardRef<HTMLDivElement, { 
  item: any, 
  customer: Customer | undefined 
}>((props, ref) => {
  const { item, customer } = props;
  return (
    <motion.div 
      ref={ref}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileTap={{ scale: 0.98 }}
      className="bg-white p-5 md:p-6 rounded-[2rem] border-2 border-slate-100 flex justify-between items-center group transition-all"
    >
       <div className="flex items-center gap-4 md:gap-5">
          <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center shadow-sm ${item.type === 'delivery' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'}`}>
             {item.type === 'delivery' ? <ClipboardList size={24}/> : <Banknote size={24}/>}
          </div>
          <div>
             <p className="font-black text-slate-900 text-sm md:text-base line-clamp-1">{customer?.name}</p>
             <div className="flex items-center gap-2 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
               <span className={item.type === 'delivery' ? 'text-blue-600' : 'text-green-600'}>
                 {item.type === 'delivery' ? 'Milk Delivery' : 'Cash Received'}
               </span>
               <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
               <Clock size={10}/> {new Date(item.sortTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
             </div>
          </div>
       </div>
       <div className="text-right">
          <p className={`text-xl md:text-2xl font-black italic tracking-tighter ${item.type === 'delivery' ? 'text-red-500' : 'text-green-600'}`}>
             {item.type === 'delivery' ? `${((item as any).liters ?? 0).toFixed(1)}L` : `Rs.${((item as any).amount ?? 0).toLocaleString()}`}
          </p>
          <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase mt-1" dir="rtl">{customer?.urduName}</p>
       </div>
    </motion.div>
  );
}));

const DailyLog: React.FC<DailyLogProps> = ({ deliveries, payments, customers, riders, riderFilterId, role }) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [searchTerm, setSearchTerm] = useState('');
  
  // PRINT CONFIGURATION
  const [printProfile, setPrintProfile] = useState<'A4' | '80' | '58'>('80');
  const [printFontSize, setPrintFontSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [showPrintSettings, setShowPrintSettings] = useState(false);

  const isOwner = role === UserRole.OWNER;

  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach(c => map.set(c.id, c));
    return map;
  }, [customers]);

  const filteredDeliveries = useMemo(() => {
    return (deliveries || []).filter(d => {
      const isDeleted = d.deleted;
      const isDateMatch = d.date === selectedDate;
      const isRiderMatch = riderFilterId === 'all' ? true : d.riderId === riderFilterId;
      return !isDeleted && isDateMatch && isRiderMatch;
    });
  }, [deliveries, selectedDate, riderFilterId]);

  const filteredPayments = useMemo(() => {
    return (payments || []).filter(p => {
      const isDeleted = p.deleted;
      const isDateMatch = p.date === selectedDate;
      let isRiderMatch = true;
      if (riderFilterId !== 'all') {
        const cust = customers.find(c => c.id === p.customerId);
        isRiderMatch = cust?.riderId === riderFilterId;
      }
      return !isDeleted && isDateMatch && isRiderMatch;
    });
  }, [payments, selectedDate, riderFilterId, customers]);

  const stats = useMemo(() => {
    const milk = filteredDeliveries.reduce((acc, d) => acc + (typeof d.liters === 'number' && !isNaN(d.liters) ? d.liters : 0), 0);
    const bill = filteredDeliveries.reduce((acc, d) => acc + (typeof d.totalAmount === 'number' && !isNaN(d.totalAmount) ? d.totalAmount : 0), 0);
    const recovery = filteredPayments.reduce((acc, p) => acc + (typeof p.amount === 'number' && !isNaN(p.amount) ? p.amount : 0), 0);
    return { milk, bill, recovery };
  }, [filteredDeliveries, filteredPayments]);

  const activityLog = useMemo(() => {
    const combined = [
      ...filteredDeliveries.map(d => ({ ...d, type: 'delivery' as const, sortTime: d.updatedAt })),
      ...filteredPayments.map(p => ({ ...p, type: 'payment' as const, sortTime: p.updatedAt }))
    ].sort((a, b) => new Date(b.sortTime).getTime() - new Date(a.sortTime).getTime());

    return combined.filter(item => {
      const cust = customerMap.get(item.customerId);
      return cust?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
             (cust?.urduName && cust?.urduName.includes(searchTerm));
    });
  }, [filteredDeliveries, filteredPayments, customerMap, searchTerm]);

  const handlePrint = () => {
    printService.setPrintConfig(printProfile, printFontSize);
    
    const printDeliveries = filteredDeliveries.filter(d => {
      const cust = customerMap.get(d.customerId);
      return cust?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
             (cust?.urduName && cust?.urduName.includes(searchTerm));
    });

    const printPayments = filteredPayments.filter(p => {
      const cust = customerMap.get(p.customerId);
      return cust?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
             (cust?.urduName && cust?.urduName.includes(searchTerm));
    });

    printService.triggerPrint(
      <SummaryReceipt 
        date={selectedDate}
        customers={customers}
        deliveries={printDeliveries}
        payments={printPayments}
        profile={printProfile}
        fontSize={printFontSize}
        compact={false}
      />
    );
  };

  const [isExportingSummary, setIsExportingSummary] = useState(false);

  const handleExportPDF = () => {
    setIsExportingSummary(true);
    setTimeout(() => {
      exportService.exportToPDF(
        'daily-log-summary-export',
        `Daily_Summary_${selectedDate}`
      ).then(() => setIsExportingSummary(false));
    }, 500);
  };

  const handleExportExcel = () => {
    const exportDeliveries = filteredDeliveries.filter(d => {
      const cust = customerMap.get(d.customerId);
      return cust?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
             (cust?.urduName && cust?.urduName.includes(searchTerm));
    });

    const exportPayments = filteredPayments.filter(p => {
      const cust = customerMap.get(p.customerId);
      return cust?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
             (cust?.urduName && cust?.urduName.includes(searchTerm));
    });

    exportService.exportSummaryToExcel(
      selectedDate,
      customers,
      exportDeliveries,
      exportPayments
    );
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-4 md:p-8 space-y-6 md:space-y-8 pb-32"
    >
      {/* HIDDEN SUMMARY FOR PDF EXPORT */}
      {isExportingSummary && (
        <div className="fixed left-[-9999px] top-0">
          <div id="daily-log-summary-export" className="bg-white p-4">
            <SummaryReceipt 
              date={selectedDate}
              customers={customers}
              deliveries={filteredDeliveries.filter(d => {
                const cust = customerMap.get(d.customerId);
                return cust?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                       (cust?.urduName && cust?.urduName.includes(searchTerm));
              })}
              payments={filteredPayments.filter(p => {
                const cust = customerMap.get(p.customerId);
                return cust?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                       (cust?.urduName && cust?.urduName.includes(searchTerm));
              })}
              profile="80"
              fontSize="md"
              compact={false}
            />
          </div>
        </div>
      )}
      
      {/* WEB CONTROLS */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 no-print">
         <div className="flex items-center justify-between w-full md:w-auto gap-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Daily Shop Records</h3>
            <motion.button 
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowPrintSettings(!showPrintSettings)}
              className={`p-2.5 rounded-xl transition-all ${showPrintSettings ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-slate-100 text-slate-400'}`}
            >
              <Settings2 size={18}/>
            </motion.button>
         </div>
         
         <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
          <motion.button 
            whileTap={{ scale: 0.98 }}
            onClick={handlePrint}
            className="flex items-center justify-center gap-3 px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95 transition-all w-full md:w-auto"
          >
            <Printer size={16}/> Print
          </motion.button>
          
          <motion.button 
            whileTap={{ scale: 0.98 }}
            onClick={handleExportPDF}
            className="flex items-center justify-center gap-3 px-8 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95 transition-all w-full md:w-auto"
          >
            PDF
          </motion.button>

          <motion.button 
            whileTap={{ scale: 0.98 }}
            onClick={handleExportExcel}
            className="flex items-center justify-center gap-3 px-8 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95 transition-all w-full md:w-auto"
          >
            Excel
          </motion.button>
         </div>
      </div>

      {/* PRINT SETTINGS PANEL */}
      <AnimatePresence>
        {showPrintSettings && (
          <motion.div 
            initial={{ opacity: 0, height: 0, y: -20 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -20 }}
            className="bg-white p-6 rounded-[2rem] border-2 border-blue-100 shadow-xl no-print space-y-6 overflow-hidden"
          >
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* WEB VIEW UI */}
      <div className="bg-white p-6 md:p-14 rounded-[2.5rem] md:rounded-[3.5rem] border-4 border-slate-100 shadow-sm space-y-8 md:space-y-10 no-print">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-center gap-4">
               <div className="bg-blue-600 p-4 rounded-2xl md:rounded-3xl text-white shadow-xl shadow-blue-100">
                  <ReceiptText size={28}/>
               </div>
               <div>
                  <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter uppercase italic">Timeline Summary</h2>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                    {riderFilterId === 'all' ? 'Full Shop Activity' : `Route: ${riders.find(r => r.id === riderFilterId)?.name}`}
                  </p>
               </div>
            </div>
            
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 p-3 px-6 rounded-2xl w-full md:w-auto">
               <Calendar size={18} className="text-slate-400" />
               <input 
                 type="date" 
                 className={`bg-transparent font-black text-slate-700 outline-none text-sm flex-1 ${isOwner ? '' : 'pointer-events-none'}`} 
                 value={selectedDate} 
                 onChange={e => setSelectedDate(e.target.value)} 
               />
            </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            <LogStat icon={<ClipboardList size={20}/>} label="Total Delivered" value={`${(stats.milk ?? 0).toFixed(1)} L`} sub={`Rs. ${(stats.bill ?? 0).toLocaleString()}`} color="blue" />
            <LogStat icon={<Wallet size={20}/>} label="Cash Collected" value={`Rs. ${(stats.recovery ?? 0).toLocaleString()}`} sub="Direct Recovery" color="green" />
            <LogStat icon={<TrendingUp size={20}/>} label="Efficiency" value={`${stats.bill > 0 ? ((stats.recovery / stats.bill) * 100).toFixed(0) : 0}%`} sub="Recovery Rate" color="amber" />
         </div>

         <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pt-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Transaction Feed</h3>
            <div className="relative w-full md:w-64">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
               <input 
                 type="text" 
                 placeholder="Search Feed..." 
                 className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none shadow-sm focus:border-blue-500 transition-all" 
                 value={searchTerm} 
                 onChange={e => setSearchTerm(e.target.value)} 
               />
            </div>
         </div>

         <div className="space-y-3 md:space-y-4">
            <AnimatePresence mode="popLayout">
              {activityLog.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-12 text-center"
                >
                  <p className="text-sm font-bold text-slate-400">No transactions found for this date.</p>
                </motion.div>
              ) : (
                activityLog.map((item, i) => (
                  <LogRow 
                    key={`${item.type}-${item.id || i}`} 
                    item={item} 
                    customer={customerMap.get(item.customerId)} 
                  />
                ))
              )}
            </AnimatePresence>
         </div>
      </div>
    </motion.div>
  );
};

const LogStat = ({ icon, label, value, sub }: { icon: any, label: string, value: string, sub: string, color: 'blue' | 'green' | 'amber' }) => (
  <motion.div 
    whileHover={{ y: -5 }}
    className="p-5 md:p-6 rounded-[2rem] border-2 border-slate-100 bg-slate-50 flex items-center gap-4 md:gap-5 group hover:bg-white transition-all cursor-default"
  >
     <div className={`p-3.5 md:p-4 rounded-2xl bg-slate-900 text-white shadow-lg transition-all group-hover:scale-110`}>{icon}</div>
     <div>
        <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">{label}</p>
        <p className="text-xl md:text-2xl font-black text-slate-900 leading-none italic">{value}</p>
        <p className="text-[9px] md:text-[10px] font-bold text-slate-400 mt-2">{sub}</p>
     </div>
  </motion.div>
);

export default React.memo(DailyLog);
