import React, { useMemo, useEffect, useRef, useState } from 'react';
import { 
  TrendingUp, Users, ClipboardList, Wallet, 
  ArrowUpRight, ArrowDownRight,
  BarChart3, Activity
} from 'lucide-react';
import { Customer, Delivery, Payment, Rider } from '../types';
import { Chart, registerables } from 'https://esm.sh/chart.js';

Chart.register(...registerables);

interface AnalyticsProps {
  customers: Customer[];
  deliveries: Delivery[];
  payments: Payment[];
  riders: Rider[];
  riderFilterId: string;
  balances: Record<string, number>;
}

const Analytics: React.FC<AnalyticsProps> = ({ 
  customers, deliveries, payments, riders, riderFilterId
}) => {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  const chartRef1 = useRef<HTMLCanvasElement>(null);
  const chartRef2 = useRef<HTMLCanvasElement>(null);
  const chartRef3 = useRef<HTMLCanvasElement>(null);
  const chartRef4 = useRef<HTMLCanvasElement>(null);

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return [current - 1, current, current + 1];
  }, []);

  const filteredData = useMemo(() => {
    const dFiltered = (deliveries || []).filter(d => !d.deleted && (riderFilterId === 'all' || d.riderId === riderFilterId));
    const pFiltered = (payments || []).filter(p => {
        if (p.deleted) return false;
        const cust = (customers || []).find(c => c.id === p.customerId);
        return riderFilterId === 'all' || cust?.riderId === riderFilterId;
    });
    const cFiltered = riderFilterId === 'all' ? (customers || []) : (customers || []).filter(c => c.riderId === riderFilterId);

    return { deliveries: dFiltered, payments: pFiltered, customers: cFiltered };
  }, [deliveries, payments, customers, riderFilterId]);

  const stats = useMemo(() => {
    const currentMonthDeliveries = filteredData.deliveries.filter(d => {
      const date = new Date(d.date);
      return date.getMonth() === selectedMonth && date.getFullYear() === selectedYear;
    });

    const prevMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
    const prevYearIdx = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
    
    const prevMonthDeliveries = filteredData.deliveries.filter(d => {
      const date = new Date(d.date);
      return date.getMonth() === prevMonthIdx && date.getFullYear() === prevYearIdx;
    });

    const currentRevenue = currentMonthDeliveries.reduce((a, b) => a + (!isNaN(Number(b.totalAmount)) ? Number(b.totalAmount) : 0), 0);
    const prevRevenue = prevMonthDeliveries.reduce((a, b) => a + (!isNaN(Number(b.totalAmount)) ? Number(b.totalAmount) : 0), 0);
    const revenueGrowth = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : 0;

    const currentLiters = currentMonthDeliveries.reduce((a, b) => a + (!isNaN(Number(b.liters)) ? Number(b.liters) : 0), 0);
    const prevLiters = prevMonthDeliveries.reduce((a, b) => a + (!isNaN(Number(b.liters)) ? Number(b.liters) : 0), 0);
    const litersGrowth = prevLiters > 0 ? ((currentLiters - prevLiters) / prevLiters) * 100 : 0;
    
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const currentDay = new Date().getMonth() === selectedMonth && new Date().getFullYear() === selectedYear ? new Date().getDate() : daysInMonth;
    const avgDailyLiters = currentLiters / (currentDay || 1);
    const prevAvgDailyLiters = prevLiters / daysInMonth;
    const avgDailyLitersGrowth = prevAvgDailyLiters > 0 ? ((avgDailyLiters - prevAvgDailyLiters) / prevAvgDailyLiters) * 100 : 0;

    const currentPayments = filteredData.payments.filter(p => {
      const date = new Date(p.date);
      return date.getMonth() === selectedMonth && date.getFullYear() === selectedYear;
    });
    const totalCollected = currentPayments.reduce((a, b) => a + (!isNaN(Number(b.amount)) ? Number(b.amount) : 0), 0);
    const recoveryRate = currentRevenue > 0 ? (totalCollected / currentRevenue) * 100 : 0;

    const activeCustCount = filteredData.customers.filter(c => c.active).length;

    return { 
      currentRevenue, 
      revenueGrowth, 
      currentLiters, 
      prevLiters,
      litersGrowth,
      recoveryRate, 
      activeCustCount,
      totalCollected,
      prevRevenue,
      avgDailyLiters,
      avgDailyLitersGrowth
    };
  }, [filteredData, selectedMonth, selectedYear]);

  useEffect(() => {
    if (!chartRef1.current || !chartRef2.current || !chartRef3.current || !chartRef4.current) return;

    try {
      const charts = [chartRef1.current, chartRef2.current, chartRef3.current, chartRef4.current].map(canvas => Chart.getChart(canvas));
      charts.forEach(chart => chart?.destroy());

      const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const last6Months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(selectedYear, selectedMonth - i, 1);
        last6Months.push({ month: d.getMonth(), year: d.getFullYear(), label: `${monthNamesShort[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}` });
      }

      const revenueData = last6Months.map(m => {
        return filteredData.deliveries
          .filter(d => {
            if (d.deleted) return false;
            const date = new Date(d.date);
            return date.getMonth() === m.month && date.getFullYear() === m.year;
          })
          .reduce((a, b) => a + (typeof b.totalAmount === 'number' && !isNaN(b.totalAmount) ? b.totalAmount : 0), 0);
      });

      const collectionData = last6Months.map(m => {
          return filteredData.payments
            .filter(p => {
              if (p.deleted) return false;
              const date = new Date(p.date);
              return date.getMonth() === m.month && date.getFullYear() === m.year;
            })
            .reduce((a, b) => a + (typeof b.amount === 'number' && !isNaN(b.amount) ? b.amount : 0), 0);
      });

      new Chart(chartRef1.current, {
        type: 'line',
        data: {
          labels: last6Months.map(m => m.label),
          datasets: [
            {
              label: 'Billing',
              data: revenueData,
              borderColor: '#2563eb',
              backgroundColor: 'rgba(37, 99, 235, 0.1)',
              fill: true,
              tension: 0.4,
              borderWidth: 3,
            },
            {
              label: 'Collection',
              data: collectionData,
              borderColor: '#10b981',
              backgroundColor: 'transparent',
              tension: 0.4,
              borderWidth: 2,
              borderDash: [5, 5],
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false, // Prevents height resizing errors
          plugins: { legend: { display: false } },
          scales: { 
              y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
              x: { grid: { display: false } }
          }
        }
      });

      new Chart(chartRef2.current, {
        type: 'doughnut',
        data: {
          labels: ['Recovered', 'Pending'],
          datasets: [{
            data: [stats.totalCollected, Math.max(0, stats.currentRevenue - stats.totalCollected)],
            backgroundColor: ['#10b981', '#f1f5f9'],
            borderWidth: 0,
          }]
        },
        options: {
          cutout: '80%',
          maintainAspectRatio: false,
          plugins: { legend: { display: false } }
        }
      });

      const routeStats = (riders || []).map(r => {
          const liters = (deliveries || [])
              .filter(d => !d.deleted && d.riderId === r.id && new Date(d.date).getMonth() === selectedMonth && new Date(d.date).getFullYear() === selectedYear)
              .reduce((a, b) => a + (typeof b.liters === 'number' && !isNaN(b.liters) ? b.liters : 0), 0);
          return { name: r.name, liters };
      }).sort((a, b) => b.liters - a.liters);

      new Chart(chartRef3.current, {
          type: 'bar',
          data: {
            labels: routeStats.map(r => r.name),
            datasets: [{
              label: 'Liters',
              data: routeStats.map(r => r.liters),
              backgroundColor: '#2563eb',
              borderRadius: 8,
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false, // Prevents height resizing errors
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true } }
          }
      });

      // Daily Milk Volume Chart
      const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const currentMonthDailyLiters = Array(daysInMonth).fill(0);
      const prevMonthDailyLiters = Array(daysInMonth).fill(0);

      const prevMonthIndex = selectedMonth === 0 ? 11 : selectedMonth - 1;
      const prevYearIndex = selectedMonth === 0 ? selectedYear - 1 : selectedYear;

      filteredData.deliveries.forEach(d => {
        if (d.deleted) return;
        const date = new Date(d.date);
        const day = date.getDate();
        if (date.getMonth() === selectedMonth && date.getFullYear() === selectedYear) {
          const lAmount = typeof d.liters === 'number' && !isNaN(d.liters) ? d.liters : 0;
          currentMonthDailyLiters[day - 1] += lAmount;
        } else if (date.getMonth() === prevMonthIndex && date.getFullYear() === prevYearIndex) {
          if (day <= daysInMonth) {
            const lAmount = typeof d.liters === 'number' && !isNaN(d.liters) ? d.liters : 0;
            prevMonthDailyLiters[day - 1] += lAmount;
          }
        }
      });

      new Chart(chartRef4.current, {
        type: 'line',
        data: {
          labels: Array.from({length: daysInMonth}, (_, i) => i + 1),
          datasets: [
            {
              label: 'Current Month (L)',
              data: currentMonthDailyLiters,
              borderColor: '#2563eb',
              backgroundColor: 'rgba(37, 99, 235, 0.1)',
              fill: true,
              tension: 0.4,
              borderWidth: 3,
            },
            {
              label: 'Previous Month (L)',
              data: prevMonthDailyLiters,
              borderColor: '#94a3b8',
              backgroundColor: 'transparent',
              tension: 0.4,
              borderWidth: 2,
              borderDash: [5, 5],
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { 
            legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { size: 10, weight: 'bold' } } } 
          },
          scales: { 
              y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
              x: { grid: { display: false } }
          }
        }
      });
    } catch (e) {
      console.warn("Analytics Chart Error:", e);
    }

  }, [stats, filteredData, selectedMonth, selectedYear, riders, deliveries]);

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <div className="p-4 md:p-8 space-y-8 pb-40 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row gap-6 items-center justify-between bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
           <div className="bg-blue-600 p-4 rounded-3xl text-white shadow-xl shadow-blue-100">
              <Activity size={28}/>
           </div>
           <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase italic">MOM Trends</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                {riderFilterId === 'all' ? "HQ Global Data" : `Route: ${riders.find(r => r.id === riderFilterId)?.name}`}
              </p>
           </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-2xl border border-slate-200">
            <select className="bg-transparent font-black text-slate-700 outline-none text-[10px] uppercase tracking-widest px-4 py-2" value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}>
                {monthNames.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select className="bg-transparent font-black text-slate-700 outline-none text-[10px] uppercase tracking-widest px-4 py-2" value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}>
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
        </div>
      </div>

      {/* Business Health Summary */}
      <div className="bg-slate-900 rounded-[3.5rem] p-10 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/20 blur-[100px] rounded-full -mr-32 -mt-32" />
        <div className="relative z-10 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Business Health Overview</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Growth Index</p>
              <p className={`text-3xl font-black italic ${stats.revenueGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {stats.revenueGrowth >= 0 ? '+' : ''}{stats.revenueGrowth.toFixed(1)}%
              </p>
              <p className="text-[8px] font-bold text-slate-400 uppercase">vs Previous Month</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Efficiency</p>
              <p className="text-3xl font-black italic text-blue-400">{stats.recoveryRate.toFixed(1)}%</p>
              <p className="text-[8px] font-bold text-slate-400 uppercase">Collection Rate</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Daily Average</p>
              <p className="text-3xl font-black italic text-white">{stats.avgDailyLiters.toFixed(1)} L</p>
              <p className="text-[8px] font-bold text-slate-400 uppercase">Milk Volume / Day</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Market Reach</p>
              <p className="text-3xl font-black italic text-indigo-400">{stats.activeCustCount}</p>
              <p className="text-[8px] font-bold text-slate-400 uppercase">Active Households</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
          <KpiCard title="Revenue" value={`Rs. ${stats.currentRevenue.toLocaleString()}`} change={stats.revenueGrowth} color="blue" icon={<TrendingUp size={20}/>} />
          <KpiCard title="Collection" value={`${stats.recoveryRate.toFixed(1)}%`} color="green" icon={<Wallet size={20}/>} />
          <KpiCard title="Liters" value={`${stats.currentLiters.toFixed(0)} L`} change={stats.litersGrowth} color="indigo" icon={<ClipboardList size={20}/>} />
          <KpiCard title="Avg Daily" value={`${stats.avgDailyLiters.toFixed(1)} L`} change={stats.avgDailyLitersGrowth} color="orange" icon={<Activity size={20}/>} />
          <KpiCard title="Clients" value={stats.activeCustCount.toString()} color="slate" icon={<Users size={20}/>} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         <div className="lg:col-span-2 bg-white p-10 rounded-[3.5rem] border border-slate-200 shadow-sm space-y-8">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <TrendingUp className="text-blue-600" size={18}/> 6-Month Trajectory
            </h3>
            {/* Added relative positioned wrapper with fixed height */}
            <div className="relative w-full h-[300px]">
              <canvas ref={chartRef1}></canvas>
            </div>
         </div>

         <div className="bg-white p-10 rounded-[3.5rem] border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center space-y-6">
            {/* Maintained relative w-48 h-48 wrapper for doughnut chart */}
            <div className="relative w-48 h-48">
                <canvas ref={chartRef2}></canvas>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-3xl font-black text-slate-900 italic">{stats.recoveryRate.toFixed(0)}%</p>
                    <p className="text-[9px] font-black text-slate-400 uppercase">Efficiency</p>
                </div>
            </div>
            <div className="space-y-1">
                <p className="text-xl font-black text-slate-900 italic">Rs. {stats.totalCollected.toLocaleString()}</p>
                <p className="text-[10px] font-black text-green-600 uppercase">Total Cash In</p>
            </div>
         </div>
      </div>

      <div className="bg-white p-10 rounded-[3.5rem] border border-slate-200 shadow-sm space-y-8">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <Activity className="text-blue-600" size={18}/> Daily Milk Volume (Current vs Previous)
          </h3>
          <div className="relative w-full h-[300px]">
            <canvas ref={chartRef4}></canvas>
          </div>
      </div>

      <div className="bg-white p-10 rounded-[3.5rem] border border-slate-200 shadow-sm space-y-8">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <BarChart3 className="text-indigo-600" size={18}/> Route Volume (L)
          </h3>
          {/* Added relative positioned wrapper with fixed height */}
          <div className="relative w-full h-[300px]">
            <canvas ref={chartRef3}></canvas>
          </div>
      </div>
    </div>
  );
};

const KpiCard = ({ title, value, change, color, icon }: { title: string; value: string; change?: number; color: string; icon: React.ReactNode }) => {
    const isPositive = change !== undefined && change > 0;
    
    const colorMap: Record<string, { bg: string, text: string }> = {
      blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
      green: { bg: 'bg-green-50', text: 'text-green-600' },
      indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
      orange: { bg: 'bg-orange-50', text: 'text-orange-600' },
      slate: { bg: 'bg-slate-50', text: 'text-slate-600' }
    };

    const colors = colorMap[color] || colorMap.slate;

    return (
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col gap-4">
            <div className="flex justify-between items-center">
                <div className={`p-3 rounded-2xl ${colors.bg} ${colors.text}`}>{icon}</div>
                {change !== undefined && change !== 0 && (
                    <div className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg ${isPositive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                        {isPositive ? <ArrowUpRight size={10}/> : <ArrowDownRight size={10}/>}
                        {Math.abs(change).toFixed(1)}%
                    </div>
                )}
            </div>
            <div>
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">{title}</p>
                <p className="text-2xl font-black text-slate-900 italic truncate tracking-tighter">{value}</p>
            </div>
        </div>
    );
}

export default Analytics;