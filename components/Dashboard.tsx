
import React, { useMemo, useState } from 'react';
import { 
  TrendingUp, Droplets, AlertCircle, Wallet, PieChart, 
  CheckCircle, Database, ShieldCheck,
  QrCode, X, Copy, Check, Trophy, Star, MessageSquare,
  Printer, BarChart3, ClipboardList, History, ArrowRight
} from 'lucide-react';
import { motion } from 'motion/react';
import { Customer, Delivery, Payment, Expense, Rider, UserRole, RiderClosingRecord, PaymentCycle } from '../types';
import { formatPKR } from '../services/dataStore';
import { calculateCycleBreakdown } from '../services/ledgerUtils';
import { printService } from '../services/printService';
import { exportService } from '../services/exportService';
import { SummaryReceipt } from './Receipts';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import RiderPerformanceGrid from './RiderPerformanceGrid';

interface DashboardProps {
  customers: Customer[];
  deliveries: Delivery[];
  payments: Payment[];
  expenses: Expense[];
  riders: Rider[];
  role: UserRole;
  closingRecords: RiderClosingRecord[];
  balances: Record<string, number>;
  riderFilterId: string;
  setActiveTab: (tab: string) => void;
  // Phase 5: optional callback so the Owner Dashboard's per-rider tiles
  // can switch the global rider filter directly. Owner-only feature.
  onSelectRider?: (riderId: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  customers, deliveries, payments, expenses, riders, role, balances, riderFilterId, setActiveTab, onSelectRider
}) => {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedRiderForInvite, setSelectedRiderForInvite] = useState<Rider | null>(null);
  const [copied, setCopied] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const isOwner = role === UserRole.OWNER;
  const currentRider = riders.find(r => r.id === riderFilterId);
  
  const filteredDeliveries = useMemo(() => 
    riderFilterId === 'all' ? (deliveries || []).filter(d => !d.deleted) : (deliveries || []).filter(d => d.riderId === riderFilterId && !d.deleted),
  [deliveries, riderFilterId]);

  const filteredPayments = useMemo(() => {
    if (riderFilterId === 'all') return (payments || []).filter(p => !p.deleted);
    return (payments || []).filter(p => !p.deleted && customers.find(c => c.id === p.customerId)?.riderId === riderFilterId);
  }, [payments, customers, riderFilterId]);

  const filteredExpenses = useMemo(() => 
    riderFilterId === 'all' ? (expenses || []) : (expenses || []).filter(e => e.riderId === riderFilterId),
  [expenses, riderFilterId]);

  const todayDeliveries = useMemo(() => filteredDeliveries.filter(d => d.date === today), [filteredDeliveries, today]);
  const todayLiters = todayDeliveries.reduce((acc: number, d: Delivery) => {
    const val = Number(d.liters);
    return acc + (isNaN(val) ? 0 : val);
  }, 0);
  const todaySales = Math.round(todayDeliveries.reduce((acc: number, d: Delivery) => {
    const val = Number(d.totalAmount);
    return acc + (isNaN(val) ? 0 : val);
  }, 0));

  const routeLoading = useMemo(() => {
    return (riders || []).map(rider => {
      const routeLiters = (deliveries || [])
        .filter(d => d.date === today && d.riderId === rider.id && !d.deleted)
        .reduce((acc: number, d: Delivery) => acc + (!isNaN(Number(d.liters)) ? Number(d.liters) : 0), 0);
      const routeCash = (payments || [])
        .filter(p => p.date === today && !p.deleted && customers.find(c => c.id === p.customerId)?.riderId === rider.id)
        .reduce((acc: number, p) => acc + (!isNaN(Number(p.amount)) ? Number(p.amount) : 0), 0);
      return { ...rider, liters: routeLiters, cash: routeCash };
    }).sort((a, b) => b.liters - a.liters);
  }, [riders, deliveries, payments, customers, today]);

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const monthlyStats = useMemo(() => {
    const mDeliveries = filteredDeliveries.filter(d => {
      const date = new Date(d.date);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });
    const mPayments = filteredPayments.filter(p => {
      const date = new Date(p.date);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });
    const mExpenses = filteredExpenses.filter(e => {
      const date = new Date(e.date);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });

    const sales = Math.round(mDeliveries.reduce((acc: number, b: Delivery) => {
      const val = Number(b.totalAmount);
      return acc + (isNaN(val) ? 0 : val);
    }, 0));
    const cash = Math.round(mPayments.reduce((acc: number, b: Payment) => {
      const val = Number(b.amount);
      return acc + (isNaN(val) ? 0 : val);
    }, 0));
    const exp = Math.round(mExpenses.reduce((acc: number, b: Expense) => {
      const val = Number(b.amount);
      return acc + (isNaN(val) ? 0 : val);
    }, 0));
    const salaries = riderFilterId === 'all' 
      ? (riders || []).reduce((acc: number, b: Rider) => acc + (b.salary || 0), 0)
      : (currentRider?.salary || 0);

    const filteredCustomerIds = riderFilterId === 'all' 
      ? (customers || []).map(c => c.id) 
      : (customers || []).filter(c => c.riderId === riderFilterId).map(c => c.id);

    const cycleBreakdown = (() => {
      const aggregated: Record<string, { name: string; type: PaymentCycle; amount: number; start: Date }> = {};
      
      const targetCustomers = riderFilterId === 'all' 
        ? (customers || []) 
        : (customers || []).filter(c => c.riderId === riderFilterId);

      targetCustomers.forEach(customer => {
        const breakdown = calculateCycleBreakdown(customer, deliveries, payments, balances[customer.id] || 0);
        breakdown.forEach(item => {
          const key = `${customer.paymentCycle}-${item.cycleName}`;
          if (!aggregated[key]) {
            aggregated[key] = { 
              name: item.cycleName, 
              type: customer.paymentCycle, 
              amount: 0,
              start: item.startDate
            };
          }
          aggregated[key].amount += item.outstanding;
        });
      });

      return Object.values(aggregated).sort((a, b) => a.start.getTime() - b.start.getTime());
    })();

    const positiveDues = Math.round(filteredCustomerIds.reduce((acc: number, id: string) => {
        const bal = balances[id] || 0;
        return acc + (bal > 0 ? bal : 0);
    }, 0));

    const totalAdvances = Math.round(filteredCustomerIds.reduce((acc: number, id: string) => {
        const bal = balances[id] || 0;
        return acc + (bal < 0 ? Math.abs(bal) : 0);
    }, 0));

    return { sales, cash, exp, salaries, marketDues: positiveDues, advancedCash: totalAdvances, cycleBreakdown };
  }, [filteredDeliveries, filteredPayments, filteredExpenses, riders, balances, currentMonth, currentYear, riderFilterId, customers, currentRider, deliveries, payments]);

  const recentTransactions = useMemo(() => {
    const combined = [
      ...(payments || []).filter(p => !p.deleted).map(p => ({ ...p, type: 'payment' })),
      ...(deliveries || []).filter(d => !d.deleted).map(d => ({ ...d, type: 'delivery' }))
    ].sort((a, b) => new Date(b.updatedAt || b.date).getTime() - new Date(a.updatedAt || a.date).getTime());
    return combined.slice(0, 6);
  }, [payments, deliveries]);

  const highDuesCustomers = useMemo(() => {
    return customers
      .filter(c => (balances[c.id] || 0) > 5000)
      .sort((a, b) => (balances[b.id] || 0) - (balances[a.id] || 0))
      .slice(0, 4);
  }, [customers, balances]);

  const chartData = useMemo(() => {
    const salesMap = new Map<string, number>();
    const cashMap = new Map<string, number>();
    const dates: string[] = [];
    
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const dateSet = new Set(dates);

    filteredDeliveries.forEach(del => {
      if (dateSet.has(del.date)) {
        salesMap.set(del.date, (salesMap.get(del.date) || 0) + (del.totalAmount || 0));
      }
    });

    filteredPayments.forEach(pay => {
      if (dateSet.has(pay.date)) {
        cashMap.set(pay.date, (cashMap.get(pay.date) || 0) + (pay.amount || 0));
      }
    });

    return dates.map(dateStr => {
      const d = new Date(dateStr);
      return {
        name: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        sales: Math.round(salesMap.get(dateStr) || 0),
        cash: Math.round(cashMap.get(dateStr) || 0)
      };
    });
  }, [filteredDeliveries, filteredPayments]);

  const shareDailyReport = () => {
    const dateFormatted = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const message = `*Gujjar Milk Shop - Daily Report*%0A----------------------------%0A*Date:* ${dateFormatted}%0A*Route:* ${riderFilterId === 'all' ? 'All Routes' : currentRider?.name}%0A----------------------------%0A*Milk Sold:* ${todayLiters.toFixed(1)} Liters%0A*Today Sales:* Rs. ${formatPKR(todaySales)}%0A*Cash Collected:* Rs. ${formatPKR(monthlyStats.cash)}%0A*Market Dues:* Rs. ${formatPKR(monthlyStats.marketDues)}%0A----------------------------%0AGenerated via Gujjar Digital Vault.`;
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrintSummary = () => {
    printService.triggerPrint(
      <SummaryReceipt 
        date={today}
        customers={customers}
        deliveries={deliveries}
        payments={payments}
        profile="80"
        fontSize="md"
        compact={true}
      />
    );
  };

  const [isExportingSummary, setIsExportingSummary] = useState(false);

  const handleExportPDF = () => {
    setIsExportingSummary(true);
    setTimeout(() => {
      exportService.exportToPDF(
        'dashboard-summary-export',
        `Daily_Summary_${today}`
      ).then(() => setIsExportingSummary(false));
    }, 500);
  };

  const handleExportExcel = () => {
    exportService.exportSummaryToExcel(
      today,
      customers,
      deliveries,
      payments
    );
  };

  return (
    <div className="p-4 md:p-8 space-y-6 pb-24">
      {/* HIDDEN SUMMARY FOR PDF EXPORT */}
      {isExportingSummary && (
        <div className="fixed left-[-9999px] top-0">
          <div id="dashboard-summary-export" className="bg-white p-4">
            <SummaryReceipt 
              date={today}
              customers={customers}
              deliveries={deliveries}
              payments={payments}
              profile="80"
              fontSize="md"
              compact={true}
            />
          </div>
        </div>
      )}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center mb-2 px-2"
      >
         <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Business Pulse</h2>
         <div className="flex gap-2">
            {isOwner && (
              <div className="flex gap-2">
                <button 
                  onClick={handlePrintSummary}
                  className="flex items-center gap-2 text-blue-600 font-black text-[9px] uppercase tracking-widest bg-blue-50 px-4 py-2 rounded-xl border border-blue-100 active:scale-95 transition-all"
                >
                  <Printer size={12}/> Print
                </button>
                <button 
                  onClick={handleExportPDF}
                  className="flex items-center gap-2 text-slate-600 font-black text-[9px] uppercase tracking-widest bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 active:scale-95 transition-all"
                >
                  PDF
                </button>
                <button 
                  onClick={handleExportExcel}
                  className="flex items-center gap-2 text-slate-600 font-black text-[9px] uppercase tracking-widest bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 active:scale-95 transition-all"
                >
                  Excel
                </button>
              </div>
            )}
            {isOwner && (
              <button 
                onClick={shareDailyReport}
                className="flex items-center gap-2 text-green-600 font-black text-[9px] uppercase tracking-widest bg-green-50 px-4 py-2 rounded-xl border border-green-100 active:scale-95 transition-all"
              >
                <MessageSquare size={12}/> Share
              </button>
            )}
         </div>
      </motion.div>

      {/* Quick Actions Bento */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setActiveTab('milk')} 
          className="p-6 bg-blue-600 rounded-[2rem] text-white flex flex-col items-center justify-center gap-3 shadow-xl shadow-blue-200/50"
        >
          <div className="bg-white/20 p-3 rounded-2xl">
            <Droplets size={24} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest">Add Milk</span>
        </motion.button>
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setActiveTab('billing')} 
          className="p-6 bg-slate-900 rounded-[2rem] text-white flex flex-col items-center justify-center gap-3 shadow-xl shadow-slate-200/50"
        >
          <div className="bg-white/10 p-3 rounded-2xl">
            <Wallet size={24} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest">Collect Cash</span>
        </motion.button>
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setActiveTab('ledger')} 
          className="p-6 bg-white border border-slate-200 rounded-[2rem] text-slate-900 flex flex-col items-center justify-center gap-3 shadow-sm"
        >
          <div className="bg-blue-50 p-3 rounded-2xl">
            <ClipboardList size={24} className="text-blue-600" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest">Ledger</span>
        </motion.button>
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setActiveTab('log')} 
          className="p-6 bg-white border border-slate-200 rounded-[2rem] text-slate-900 flex flex-col items-center justify-center gap-3 shadow-sm"
        >
          <div className="bg-slate-50 p-3 rounded-2xl">
            <History size={24} className="text-slate-600" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest">Activity</span>
        </motion.button>
      </div>

      {/* Phase 5: per-rider scoreboard. Visible only when Owner is on
          the all-riders view; tapping a rider tile switches the global
          filter so every other screen drills in to that rider. */}
      {isOwner && riderFilterId === 'all' && onSelectRider && (
        <RiderPerformanceGrid
          riders={riders}
          customers={customers}
          deliveries={deliveries}
          payments={payments}
          balances={balances}
          onSelectRider={onSelectRider}
        />
      )}

      {isOwner && riderFilterId === 'all' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-slate-900 p-6 md:p-8 rounded-[3rem] shadow-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-10 opacity-10"><Trophy size={150} className="text-white"/></div>
          <div className="relative z-10 space-y-6">
             <div className="flex items-center gap-4">
                <div className="bg-amber-500 p-3 rounded-2xl"><Star size={24} className="text-white"/></div>
                <div>
                   <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">Daily Efficiency</h2>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rider Rankings Today</p>
                </div>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {routeLoading.slice(0, 4).map((rider, i) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    key={rider.id} 
                    className="bg-white/5 border border-white/10 p-5 rounded-2xl flex items-center justify-between"
                  >
                     <div className="flex items-center gap-4">
                        <span className="text-2xl font-black text-slate-700 italic">#{i+1}</span>
                        <div>
                           <p className="font-black text-white">{rider.name}</p>
                           <p className="text-[9px] font-bold text-slate-500 uppercase">{rider.route}</p>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-lg font-black text-amber-500 italic">{(rider.liters ?? 0).toFixed(1)}L</p>
                        <p className="text-[8px] font-black text-slate-600 uppercase">Rs. {formatPKR(rider.cash || 0)}</p>
                     </div>
                  </motion.div>
                ))}
             </div>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardCard icon={<TrendingUp size={22}/>} label="Today Sale" value={`Rs. ${formatPKR(todaySales)}`} color="text-green-600" delay={0.1} />
          <DashboardCard icon={<Droplets size={22}/>} label="Milk Sold" value={`${(todayLiters ?? 0).toFixed(1)} L`} color="text-blue-600" delay={0.2} />
          <DashboardCard icon={<Wallet size={22}/>} label="Net Cash" value={`Rs. ${formatPKR(monthlyStats.cash)}`} color="text-slate-900" delay={0.3} />
          <DashboardCard icon={<AlertCircle size={22}/>} label="Market Dues" value={`Rs. ${formatPKR(monthlyStats.marketDues)}`} color="text-red-600" delay={0.4} />
      </div>

      {/* Revenue Trend Chart */}
      <div className="bg-white p-8 md:p-10 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-8">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <BarChart3 size={24} className="text-blue-600" />
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Revenue vs Recovery Trend</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sales</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cash</span>
            </div>
          </div>
        </div>

        <div className="h-[300px] w-full min-h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 9, fontWeight: 900, fill: '#94a3b8' }}
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 9, fontWeight: 900, fill: '#94a3b8' }}
                tickFormatter={(value) => `Rs.${value > 1000 ? (value/1000).toFixed(0) + 'k' : value}`}
              />
              <Tooltip 
                contentStyle={{ 
                  borderRadius: '16px', 
                  border: 'none', 
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  fontSize: '10px',
                  fontWeight: '900',
                  textTransform: 'uppercase'
                }}
              />
              <Area 
                type="monotone" 
                dataKey="sales" 
                stroke="#3b82f6" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorSales)" 
              />
              <Area 
                type="monotone" 
                dataKey="cash" 
                stroke="#10b981" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorCash)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* High Dues Alert Section */}
      {isOwner && highDuesCustomers.length > 0 && (
        <div className="bg-red-50 p-8 rounded-[2.5rem] border border-red-100 space-y-6">
          <div className="flex items-center gap-3">
            <AlertCircle size={24} className="text-red-600" />
            <h3 className="text-sm font-black text-red-900 uppercase tracking-widest">High Dues Alert</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {highDuesCustomers.map(customer => (
              <div key={customer.id} className="bg-white p-5 rounded-2xl border border-red-200 flex flex-col justify-between shadow-sm">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{customer.paymentCycle}</p>
                  <p className="font-black text-slate-900 text-sm truncate">{customer.name}</p>
                </div>
                <div className="mt-4 flex justify-between items-end">
                  <p className="text-xl font-black text-red-600 italic tracking-tighter">Rs. {formatPKR(balances[customer.id])}</p>
                  <button onClick={() => setActiveTab('billing')} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all">
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cycle-Based Breakdown View */}
      <div className="bg-white p-8 md:p-10 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Database size={24} className="text-blue-600" />
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Previous Dues Breakdown</h3>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 rounded-full border border-blue-100">
            <ShieldCheck size={12} className="text-blue-600" />
            <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest">Derived from Ledger</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {monthlyStats.cycleBreakdown.length > 0 ? (
            monthlyStats.cycleBreakdown.map((cycle) => (
              <div key={`${cycle.type}-${cycle.name}`} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center group hover:border-blue-200 transition-all">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{cycle.type} Cycle</p>
                  <p className="font-black text-slate-900 text-sm">{cycle.name}</p>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-black italic tracking-tighter ${cycle.amount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    Rs. {formatPKR(Math.abs(cycle.amount))}
                    {cycle.amount < 0 && <span className="text-[10px] ml-1 not-italic">(Adv)</span>}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-10 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No outstanding cycles found</p>
            </div>
          )}
        </div>

        <div className="pt-6 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total Breakdown Sum</p>
              <p className="text-xl font-black text-slate-900">Rs. {formatPKR(monthlyStats.cycleBreakdown.reduce((s, c) => s + c.amount, 0))}</p>
            </div>
            <div className="h-8 w-[1px] bg-slate-200 hidden md:block"></div>
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Global Balance</p>
              <p className="text-xl font-black text-blue-600">Rs. {formatPKR(monthlyStats.marketDues - monthlyStats.advancedCash)}</p>
            </div>
          </div>
          
          {Math.abs(monthlyStats.cycleBreakdown.reduce((s, c) => s + c.amount, 0) - (monthlyStats.marketDues - monthlyStats.advancedCash)) < 1 ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-600 rounded-xl border border-green-100">
              <CheckCircle size={14} />
              <span className="text-[9px] font-black uppercase tracking-widest">Integrity Verified</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl border border-red-100">
              <AlertCircle size={14} />
              <span className="text-[9px] font-black uppercase tracking-widest">Balance Mismatch</span>
            </div>
          )}
        </div>
      </div>

      {isOwner && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-8 md:p-10 rounded-[2.5rem] border border-slate-200 shadow-sm">
             <div className="flex items-center gap-3 mb-8">
               <PieChart size={24} className="text-blue-600" />
               <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Monthly Performance</h3>
             </div>
             <div className="space-y-4">
                <div className="flex justify-between items-center p-5 bg-slate-50 rounded-2xl border border-slate-100">
                   <span className="text-[10px] font-black text-slate-500 uppercase">Gross Billing</span>
                   <span className="font-black text-slate-900 text-lg">Rs. {formatPKR(monthlyStats.sales)}</span>
                </div>
                <div className="flex justify-between items-center p-5 bg-slate-50 rounded-2xl border border-slate-100">
                   <span className="text-[10px] font-black text-slate-500 uppercase">Recovery (Cash)</span>
                   <span className="font-black text-green-600 text-lg">Rs. {formatPKR(monthlyStats.cash)}</span>
                </div>
                <div className="flex justify-between items-center p-5 bg-slate-50 rounded-2xl border border-slate-100">
                   <span className="text-[10px] font-black text-slate-500 uppercase">Field Costs</span>
                   <span className="font-black text-red-500 text-lg">- Rs. {formatPKR((monthlyStats.exp ?? 0) + (monthlyStats.salaries ?? 0))}</span>
                </div>
                <div className="pt-6 border-t-2 border-slate-50 flex justify-between items-center">
                   <span className="text-base font-black text-blue-900 uppercase">Net Profit</span>
                   <span className="text-3xl font-black text-blue-600 italic">Rs. {formatPKR((monthlyStats.sales ?? 0) - (monthlyStats.salaries ?? 0) - (monthlyStats.exp ?? 0))}</span>
                </div>
             </div>
          </div>
          
          <div className="bg-white p-8 md:p-10 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col">
             <div className="flex items-center justify-between mb-8">
               <div className="flex items-center gap-3">
                 <History size={24} className="text-slate-400" />
                 <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Recent Activity</h3>
               </div>
               <button onClick={() => setActiveTab('log')} className="text-[9px] font-black text-blue-600 uppercase tracking-widest hover:underline">View All</button>
             </div>
             <div className="flex-1 space-y-4">
                {recentTransactions.map((tx: any) => {
                  const customer = customers.find(c => c.id === tx.customerId);
                  return (
                    <div key={tx.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tx.type === 'payment' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                          {tx.type === 'payment' ? <Wallet size={18} /> : <Droplets size={18} />}
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-900">{customer?.name || 'Unknown'}</p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">{tx.type === 'payment' ? 'Cash Received' : 'Milk Delivered'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-black ${tx.type === 'payment' ? 'text-green-600' : 'text-slate-900'}`}>
                          {tx.type === 'payment' ? `+ Rs. ${formatPKR(tx.amount)}` : `${tx.liters.toFixed(1)} L`}
                        </p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase">{new Date(tx.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                      </div>
                    </div>
                  );
                })}
                {recentTransactions.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full opacity-20">
                    <History size={48} />
                    <p className="text-[10px] font-black uppercase tracking-widest mt-4">No recent activity</p>
                  </div>
                )}
             </div>
          </div>
        </div>
      )}

      {showInviteModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[70] flex items-center justify-center p-4" onClick={() => setShowInviteModal(false)}>
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-lg border-8 border-slate-900 flex flex-col animate-in zoom-in-95 overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div>
                    <h3 className="font-black text-2xl tracking-tighter uppercase italic">Mobile App Setup</h3>
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mt-1">Staff Onboarding</p>
                 </div>
                 <button onClick={() => setShowInviteModal(false)} className="bg-white/10 p-2 rounded-full hover:bg-red-500 transition-colors"><X size={20}/></button>
              </div>
              <div className="p-8 space-y-8 overflow-y-auto">
                 <div className="space-y-4">
                    <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-blue-600 pl-4">Step 1: Share Link</h4>
                    <div className="bg-slate-50 p-4 rounded-2xl flex items-center justify-between border border-slate-100">
                       <p className="text-[10px] font-bold text-slate-500 truncate mr-4">{window.location.href}</p>
                       <button 
                        onClick={handleCopyLink}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${copied ? 'bg-green-500 text-white' : 'bg-blue-600 text-white'}`}
                       >
                         {copied ? <Check size={14}/> : <Copy size={14}/>} {copied ? 'Copied' : 'Copy'}
                       </button>
                    </div>
                 </div>
                 <div className="space-y-4">
                    <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-green-600 pl-4">Step 2: Assign Profile</h4>
                    <div className="grid grid-cols-2 gap-3">
                       {riders.map(r => (
                         <button key={r.id} onClick={() => setSelectedRiderForInvite(r)} className={`p-4 rounded-2xl border-2 font-black uppercase text-[10px] transition-all ${selectedRiderForInvite?.id === r.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-500 border-slate-100 hover:border-slate-300'}`}>
                           {r.name}
                         </button>
                       ))}
                    </div>
                 </div>
                 {selectedRiderForInvite && (
                   <div className="bg-blue-600 p-8 rounded-[2rem] text-white text-center shadow-xl shadow-blue-100 relative">
                      <div className="absolute top-4 right-4 text-white/20"><QrCode size={32}/></div>
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">Access Card</p>
                      <h5 className="text-3xl font-black mb-4">{selectedRiderForInvite.name}</h5>
                      <div className="bg-white/10 p-4 rounded-2xl inline-block px-10 border border-white/20">
                         <p className="text-[8px] font-black uppercase tracking-[0.3em] mb-1">Login PIN</p>
                         <p className="text-4xl font-black tracking-[0.4em]">{selectedRiderForInvite.pin}</p>
                      </div>
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const DashboardCard = React.memo(({ icon, label, value, color, delay = 0 }: { icon: any, label: string, value: string, color: string, delay?: number }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className="bg-white p-5 md:p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col gap-2"
  >
     <div className="flex items-center gap-3">
       <div className={`p-2 rounded-xl bg-slate-50 ${color}`}>{icon}</div>
       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
     </div>
     <p className={`text-lg font-black truncate ${color}`}>{value}</p>
  </motion.div>
));

export default React.memo(Dashboard);
