
import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, Calendar as CalendarIcon, Users, 
  Package, CreditCard, Wallet, ArrowRight,
  BarChart3, Activity, ChevronLeft, ChevronRight
} from 'lucide-react';
import { MonthlyArchive, Delivery, Payment, Customer } from '../types';
import { formatPKR } from '../services/dataStore';
import ReceivablesView from './ReceivablesView';

// Re-using sub-components logic from previous files but merged into one cohesive experience

interface BusinessInsightsProps {
  archives: MonthlyArchive[];
  deliveries: Delivery[];
  payments: Payment[];
  customers: Customer[];
  riderFilterId: string;
}

interface MonthlyStats {
  year: number;
  month: number;
  monthName: string;
  totalLiters: number;
  totalSales: number;
  totalPayments: number;
  pendingBalance: number;
  totalClosingBalance: number;
  activeCustomers: number;
  isCurrent: boolean;
}

const BusinessInsights: React.FC<BusinessInsightsProps> = ({ 
  archives, 
  deliveries, 
  payments,
  customers,
  riderFilterId
}) => {
  const [activeView, setActiveView] = useState<'summary' | 'calendar' | 'receivables'>('summary');
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // --- SUMMARY LOGIC ---
  const summaryData = useMemo(() => {
    const stats: MonthlyStats[] = [];
    
    // 1. Process Archives
    archives.forEach(archive => {
      const monthName = new Date(archive.year, archive.month).toLocaleString('default', { month: 'long' });
      const totalLiters = archive.deliveries.reduce((sum, d) => sum + (d.liters || 0), 0);
      const totalSales = archive.deliveries.reduce((sum, d) => sum + (d.totalAmount || 0), 0);
      const totalPayments = archive.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const activeCustomers = new Set(archive.deliveries.map(d => d.customerId)).size;

      const totalClosingBalance = archive.closingBalances ? Object.values(archive.closingBalances).reduce((sum, bal) => sum + bal, 0) : 0;

      stats.push({
        year: archive.year,
        month: archive.month,
        monthName,
        totalLiters,
        totalSales,
        totalPayments,
        pendingBalance: totalSales - totalPayments,
        totalClosingBalance,
        activeCustomers,
        isCurrent: false
      });
    });

    // 2. Process Current Month
    const now = new Date();
    const currentLiters = (deliveries || []).reduce((sum, d) => sum + ((!d.deleted && typeof d.liters === 'number' && !isNaN(d.liters)) ? d.liters : 0), 0);
    const currentSales = (deliveries || []).reduce((sum, d) => sum + ((!d.deleted && typeof d.totalAmount === 'number' && !isNaN(d.totalAmount)) ? d.totalAmount : 0), 0);
    const currentPayments = (payments || []).reduce((sum, p) => sum + ((!p.deleted && typeof p.amount === 'number' && !isNaN(p.amount)) ? p.amount : 0), 0);
    const currentActive = new Set((deliveries || []).filter(d => !d.deleted).map(d => d.customerId)).size;
    const currentClosingBalance = (customers || []).reduce((sum, c) => sum + (c.balance || 0), 0);

    stats.push({
      year: now.getFullYear(),
      month: now.getMonth(),
      monthName: now.toLocaleString('default', { month: 'long' }),
      totalLiters: currentLiters,
      totalSales: currentSales,
      totalPayments: currentPayments,
      pendingBalance: currentSales - currentPayments,
      totalClosingBalance: currentClosingBalance,
      activeCustomers: currentActive,
      isCurrent: true
    });

    return stats.sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month));
  }, [archives, deliveries, payments, customers]);

  const overallStats = useMemo(() => {
    return summaryData.reduce((acc, curr) => ({
      liters: acc.liters + curr.totalLiters,
      sales: acc.sales + curr.totalSales,
      payments: acc.payments + curr.totalPayments,
      balance: acc.balance + curr.pendingBalance
    }), { liters: 0, sales: 0, payments: 0, balance: 0 });
  }, [summaryData]);

  // --- CALENDAR LOGIC ---
  const calendarMonth = viewDate.getMonth();
  const calendarYear = viewDate.getFullYear();
  const calendarMonthName = viewDate.toLocaleString('default', { month: 'long' });
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1).getDay();

  const relevantArchive = useMemo(() => {
    return archives.find(a => a.year === calendarYear && a.month === calendarMonth);
  }, [archives, calendarYear, calendarMonth]);

  const sourceDeliveries = relevantArchive ? relevantArchive.deliveries : deliveries;
  const sourcePayments = relevantArchive ? relevantArchive.payments : payments;

  const filteredDeliveries = useMemo(() => {
    return riderFilterId === 'all' ? sourceDeliveries : sourceDeliveries.filter(d => d.riderId === riderFilterId);
  }, [sourceDeliveries, riderFilterId]);

  const dailyStats = useMemo(() => {
    const stats: Record<number, { liters: number, sales: number, payments: number }> = {};
    for (let i = 1; i <= daysInMonth; i++) stats[i] = { liters: 0, sales: 0, payments: 0 };

    filteredDeliveries.forEach(d => {
      if (d.deleted) return;
      const dDate = new Date(d.date);
      if (dDate.getFullYear() === calendarYear && dDate.getMonth() === calendarMonth) {
        const day = dDate.getDate();
        if (stats[day]) {
          stats[day].liters += (typeof d.liters === 'number' && !isNaN(d.liters) ? d.liters : 0);
          stats[day].sales += (typeof d.totalAmount === 'number' && !isNaN(d.totalAmount) ? d.totalAmount : 0);
        }
      }
    });

    sourcePayments.forEach(p => {
      if (p.deleted) return;
      const pDate = new Date(p.date);
      if (pDate.getFullYear() === calendarYear && pDate.getMonth() === calendarMonth) {
        const day = pDate.getDate();
        if (stats[day]) stats[day].payments += (typeof p.amount === 'number' && !isNaN(p.amount) ? p.amount : 0);
      }
    });

    return stats;
  }, [filteredDeliveries, sourcePayments, calendarYear, calendarMonth, daysInMonth]);

  const monthTotals = useMemo(() => {
    return Object.values(dailyStats).reduce((acc, curr) => ({
      liters: acc.liters + curr.liters,
      sales: acc.sales + curr.sales,
      payments: acc.payments + curr.payments
    }), { liters: 0, sales: 0, payments: 0 });
  }, [dailyStats]);

  const openCalendarForMonth = (year: number, month: number) => {
    setViewDate(new Date(year, month, 1));
    setActiveView('calendar');
    setSelectedDay(null);
  };

  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in duration-500 pb-40">
      {/* View Toggle */}
      <div className="flex bg-white p-2 rounded-[2.5rem] border border-slate-200 shadow-sm w-fit mx-auto md:mx-0 overflow-x-auto max-w-full">
        <button 
          onClick={() => setActiveView('summary')}
          className={`px-6 md:px-8 py-3 rounded-[1.8rem] font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${activeView === 'summary' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <BarChart3 size={14}/> Overview
        </button>
        <button 
          onClick={() => setActiveView('calendar')}
          className={`px-6 md:px-8 py-3 rounded-[1.8rem] font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${activeView === 'calendar' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <CalendarIcon size={14}/> Daily Progress
        </button>
        <button 
          onClick={() => setActiveView('receivables')}
          className={`px-6 md:px-8 py-3 rounded-[1.8rem] font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${activeView === 'receivables' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <Wallet size={14}/> Receivables
        </button>
      </div>

      {activeView === 'summary' ? (
        <div className="space-y-8">
          {/* Summary Header */}
          <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-4">
               <div className="bg-blue-600 p-4 rounded-3xl text-white shadow-xl shadow-blue-100">
                  <TrendingUp size={32}/>
               </div>
               <div>
                  <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">Performance Hub</h2>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">Growth & Efficiency Analytics</p>
               </div>
            </div>
            <div className="flex items-center gap-3 bg-slate-100 px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500">
              <Activity size={14} className="text-blue-500"/> {summaryData.length} Periods Tracked
            </div>
          </div>

          {/* KPI Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <SummaryCard label="Lifetime Sales" value={`Rs. ${formatPKR(overallStats.sales)}`} icon={<TrendingUp size={24}/>} color="bg-blue-600" subValue={`${overallStats.liters.toFixed(0)}L Total Volume`} />
            <SummaryCard label="Total Recovery" value={`Rs. ${formatPKR(overallStats.payments)}`} icon={<CreditCard size={24}/>} color="bg-green-600" subValue={`${((overallStats.payments / overallStats.sales) * 100 || 0).toFixed(1)}% Recovery Rate`} />
            <SummaryCard label="Outstanding" value={`Rs. ${formatPKR(overallStats.balance)}`} icon={<Wallet size={24}/>} color="bg-red-600" subValue="Total Pending Dues" />
            <SummaryCard label="Active Clients" value={customers.filter(c => c.active).length.toString()} icon={<Users size={24}/>} color="bg-slate-900" subValue="Registered Active Reach" />
          </div>

          {/* Previous Month Finance Snapshot */}
          {summaryData.length > 1 && (
            <div className="bg-slate-900 text-white rounded-[3rem] p-8 md:p-10 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none">
                <BarChart3 size={200} />
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-8">
                  <div className="bg-white/10 p-3 rounded-2xl">
                    <CalendarIcon size={24} className="text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black italic uppercase tracking-tighter">Previous Month Finance</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{summaryData[1].monthName} {summaryData[1].year}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white/5 border border-white/10 p-6 rounded-[2rem]">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Milk Delivered</p>
                    <p className="text-3xl font-black italic tracking-tighter">{summaryData[1].totalLiters.toFixed(1)}L</p>
                    <p className="text-sm font-bold text-blue-400 mt-1">Rs. {formatPKR(summaryData[1].totalSales)}</p>
                  </div>
                  
                  <div className="bg-white/5 border border-white/10 p-6 rounded-[2rem]">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Payment Collected</p>
                    <p className="text-3xl font-black italic tracking-tighter text-green-400">Rs. {formatPKR(summaryData[1].totalPayments)}</p>
                    <p className="text-sm font-bold text-slate-400 mt-1">Recovery: {Math.round((summaryData[1].totalPayments / summaryData[1].totalSales) * 100 || 0)}%</p>
                  </div>

                  <div className="bg-white/5 border border-white/10 p-6 rounded-[2rem]">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Remaining Balance</p>
                    <p className="text-3xl font-black italic tracking-tighter text-red-400">Rs. {formatPKR(summaryData[1].totalClosingBalance)}</p>
                    <p className="text-sm font-bold text-slate-400 mt-1">Total pending from all customers</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Monthly List */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 ml-4">
              <Activity size={18} className="text-blue-600" />
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Monthly Performance Logs</h3>
            </div>

            {summaryData.length === 0 ? (
              <div className="bg-white p-20 rounded-[3rem] border-4 border-dashed border-slate-100 flex flex-col items-center justify-center text-center">
                <CalendarIcon size={64} className="text-slate-200 mb-4" />
                <p className="text-slate-400 font-black uppercase tracking-widest">No monthly data recorded yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {summaryData.map((month) => (
                  <div key={`${month.year}-${month.month}`} className="bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden group hover:border-blue-400 transition-all">
                    <div className="p-8 md:p-10 flex flex-col lg:flex-row items-center gap-8">
                      <div className="flex flex-col items-center justify-center w-32 h-32 bg-slate-50 rounded-[2.5rem] border-2 border-slate-100 group-hover:bg-blue-50 group-hover:border-blue-100 transition-all">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{month.year}</span>
                        <span className="text-2xl font-black text-slate-900 italic tracking-tighter leading-none mt-1">{month.monthName.substring(0, 3)}</span>
                        {month.isCurrent && <span className="mt-2 px-2 py-0.5 bg-blue-600 text-white text-[7px] font-black uppercase rounded-full animate-pulse">Live</span>}
                      </div>

                      <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-8 w-full">
                        <MetricItem label="Milk Volume" value={`${month.totalLiters.toFixed(1)} L`} icon={<Package size={14}/>} />
                        <MetricItem label="Sales Value" value={`Rs. ${formatPKR(month.totalSales)}`} icon={<TrendingUp size={14}/>} color="text-blue-600" />
                        <MetricItem label="Payments" value={`Rs. ${formatPKR(month.totalPayments)}`} icon={<CreditCard size={14}/>} color="text-green-600" />
                        <MetricItem label="Active Clients" value={month.activeCustomers.toString()} icon={<Users size={14}/>} />
                      </div>

                      <div className="flex flex-col items-center gap-4">
                        <div className="w-full lg:w-48 p-6 bg-slate-50 rounded-3xl border border-slate-100 flex flex-col items-center justify-center">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Recovery</p>
                          <div className="relative w-16 h-16 flex items-center justify-center">
                            <svg className="w-full h-full rotate-[-90deg]">
                              <circle cx="32" cy="32" r="28" fill="transparent" stroke="#e2e8f0" strokeWidth="6" />
                              <circle cx="32" cy="32" r="28" fill="transparent" stroke="#2563eb" strokeWidth="6" strokeDasharray={175.9} strokeDashoffset={175.9 * (1 - (month.totalPayments / month.totalSales || 0))} strokeLinecap="round" />
                            </svg>
                            <span className="absolute text-[10px] font-black text-slate-900">{Math.round((month.totalPayments / month.totalSales) * 100 || 0)}%</span>
                          </div>
                        </div>
                        <button 
                          onClick={() => openCalendarForMonth(month.year, month.month)}
                          className="w-full py-3 bg-slate-900 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-blue-600 transition-all"
                        >
                          Daily Details <ArrowRight size={12}/>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : activeView === 'receivables' ? (
        <ReceivablesView 
          customers={customers}
          deliveries={deliveries}
          payments={payments}
          riderFilterId={riderFilterId}
        />
      ) : (
        <div className="space-y-8">
          {/* Calendar Header */}
          <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-4">
               <div className="bg-blue-600 p-4 rounded-3xl text-white shadow-xl shadow-blue-100">
                  <CalendarIcon size={32}/>
               </div>
               <div>
                  <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">Daily Progress</h2>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">{calendarMonthName} {calendarYear} Logs</p>
               </div>
            </div>

            <div className="flex items-center gap-4 bg-slate-100 p-2 rounded-[2rem] border border-slate-200">
              <button onClick={() => setViewDate(new Date(calendarYear, calendarMonth - 1, 1))} className="p-3 bg-white rounded-2xl text-slate-600 shadow-sm hover:bg-blue-600 hover:text-white transition-all">
                <ChevronLeft size={20}/>
              </button>
              <div className="px-6 text-center min-w-[160px]">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{calendarYear}</p>
                <p className="text-xl font-black text-slate-900 italic tracking-tighter uppercase">{calendarMonthName}</p>
              </div>
              <button onClick={() => setViewDate(new Date(calendarYear, calendarMonth + 1, 1))} className="p-3 bg-white rounded-2xl text-slate-600 shadow-sm hover:bg-blue-600 hover:text-white transition-all">
                <ChevronRight size={20}/>
              </button>
            </div>
          </div>

          {/* Calendar Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex items-center gap-6 group hover:border-blue-400 transition-all">
              <div className="bg-blue-50 p-4 rounded-2xl text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all"><Package size={24}/></div>
              <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Month Volume</p><p className="text-2xl font-black text-slate-900 italic tracking-tighter">{monthTotals.liters.toFixed(1)} L</p></div>
            </div>
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex items-center gap-6 group hover:border-green-400 transition-all">
              <div className="bg-green-50 p-4 rounded-2xl text-green-600 group-hover:bg-green-600 group-hover:text-white transition-all"><TrendingUp size={24}/></div>
              <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Month Sales</p><p className="text-2xl font-black text-slate-900 italic tracking-tighter">Rs. {formatPKR(monthTotals.sales)}</p></div>
            </div>
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex items-center gap-6 group hover:border-amber-400 transition-all">
              <div className="bg-amber-50 p-4 rounded-2xl text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-all"><CreditCard size={24}/></div>
              <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Month Recovery</p><p className="text-2xl font-black text-slate-900 italic tracking-tighter">Rs. {formatPKR(monthTotals.payments)}</p></div>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="space-y-6">
            <div className="grid grid-cols-7 gap-2 md:gap-4 text-center">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} className="text-[10px] font-black text-slate-400 uppercase tracking-widest py-2">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2 md:gap-4">
              {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`pad-${i}`} className="h-24 md:h-32 bg-slate-50/50 border border-slate-100 rounded-2xl"></div>)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const d = i + 1;
                const dayStat = dailyStats[d];
                const isToday = new Date().getDate() === d && new Date().getMonth() === calendarMonth && new Date().getFullYear() === calendarYear;
                const isSelected = selectedDay === d;
                return (
                  <button key={d} onClick={() => setSelectedDay(d)} className={`h-24 md:h-32 p-3 border-2 rounded-3xl flex flex-col justify-between transition-all group relative overflow-hidden ${isSelected ? 'bg-blue-600 border-blue-600 text-white shadow-xl scale-105 z-10' : isToday ? 'bg-white border-blue-200 text-slate-900 hover:border-blue-400' : 'bg-white border-slate-100 text-slate-900 hover:border-blue-200'}`}>
                    <div className="flex justify-between items-start"><span className={`text-lg font-black italic ${isSelected ? 'text-white' : 'text-slate-900'}`}>{d}</span>{isToday && !isSelected && <div className="w-2 h-2 bg-blue-600 rounded-full animate-ping"></div>}</div>
                    <div className="space-y-1 text-left">
                      {dayStat.liters > 0 && <div className={`flex items-center gap-1 text-[8px] font-black uppercase tracking-tighter ${isSelected ? 'text-blue-100' : 'text-blue-600'}`}><Package size={8}/> {dayStat.liters.toFixed(0)}L</div>}
                      {dayStat.payments > 0 && <div className={`flex items-center gap-1 text-[8px] font-black uppercase tracking-tighter ${isSelected ? 'text-green-100' : 'text-green-600'}`}><CreditCard size={8}/> Rs.{formatPKR(dayStat.payments)}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Day Panel */}
          {selectedDay && (
            <div className="bg-slate-900 text-white p-10 rounded-[3.5rem] shadow-2xl animate-in slide-in-from-bottom-10">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-3xl font-black italic">{selectedDay}</div>
                  <div>
                    <h3 className="text-2xl font-black tracking-tighter uppercase italic">{calendarMonthName} {selectedDay}, {calendarYear}</h3>
                    <p className="text-blue-400 text-[10px] font-black uppercase tracking-widest">Daily Performance Breakdown</p>
                  </div>
                </div>
                <button onClick={() => setSelectedDay(null)} className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all"><ArrowRight size={24} className="rotate-180" /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                <div className="space-y-2"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Milk Dispatched</p><p className="text-4xl font-black italic tracking-tighter">{dailyStats[selectedDay].liters.toFixed(1)} <span className="text-xl text-blue-400">Liters</span></p></div>
                <div className="space-y-2"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Billing Amount</p><p className="text-4xl font-black italic tracking-tighter">Rs. {formatPKR(dailyStats[selectedDay].sales)}</p></div>
                <div className="space-y-2"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cash Collected</p><p className="text-4xl font-black italic tracking-tighter text-green-400">Rs. {formatPKR(dailyStats[selectedDay].payments)}</p></div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const SummaryCard = ({ label, value, icon, color, subValue }: { label: string, value: string, icon: any, color: string, subValue: string }) => (
  <div className={`${color} p-8 rounded-[3rem] text-white shadow-2xl shadow-blue-100 relative overflow-hidden group`}>
    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">{React.cloneElement(icon, { size: 80 })}</div>
    <div className="relative z-10 space-y-4">
      <div className="flex items-center gap-3"><div className="bg-white/20 p-2 rounded-xl">{icon}</div><span className="text-[10px] font-black uppercase tracking-widest opacity-80">{label}</span></div>
      <div><h4 className="text-3xl font-black italic tracking-tighter leading-none">{value}</h4><p className="text-[10px] font-bold opacity-60 mt-2">{subValue}</p></div>
    </div>
  </div>
);

const MetricItem = ({ label, value, icon, color = "text-slate-900" }: { label: string, value: string, icon: any, color?: string }) => (
  <div className="space-y-2">
    <div className="flex items-center gap-2 text-slate-400"><div className="p-1.5 bg-slate-50 rounded-lg">{icon}</div><span className="text-[8px] font-black uppercase tracking-widest leading-none">{label}</span></div>
    <p className={`text-xl font-black italic tracking-tight leading-none ${color}`}>{value}</p>
  </div>
);

export default BusinessInsights;
