import React, { useMemo } from 'react';
import { Wallet, Activity } from 'lucide-react';
import { Customer, Delivery, Payment } from '../types';
import { formatPKR } from '../services/dataStore';

interface ReceivablesViewProps {
  customers: Customer[];
  deliveries: Delivery[];
  payments: Payment[];
  riderFilterId: string;
}

const ReceivablesView: React.FC<ReceivablesViewProps> = ({ customers, deliveries, payments, riderFilterId }) => {
  const filteredCustomers = useMemo(() => {
    let filtered = customers.filter(c => c.active);
    if (riderFilterId !== 'all') {
      filtered = filtered.filter(c => c.riderId === riderFilterId);
    }
    return filtered;
  }, [customers, riderFilterId]);

  const cycleStats = useMemo(() => {
    const stats: Record<string, {
      cycle: string;
      customerCount: number;
      totalOpeningBalance: number;
      totalCurrentMilk: number;
      totalPayments: number;
      totalCollectable: number;
      totalBalance: number;
    }> = {
      'Daily': { cycle: 'Daily', customerCount: 0, totalOpeningBalance: 0, totalCurrentMilk: 0, totalPayments: 0, totalCollectable: 0, totalBalance: 0 },
      '10-Day': { cycle: '10-Day', customerCount: 0, totalOpeningBalance: 0, totalCurrentMilk: 0, totalPayments: 0, totalCollectable: 0, totalBalance: 0 },
      '15-Day': { cycle: '15-Day', customerCount: 0, totalOpeningBalance: 0, totalCurrentMilk: 0, totalPayments: 0, totalCollectable: 0, totalBalance: 0 },
      'Monthly': { cycle: 'Monthly', customerCount: 0, totalOpeningBalance: 0, totalCurrentMilk: 0, totalPayments: 0, totalCollectable: 0, totalBalance: 0 },
    };

    filteredCustomers.forEach(c => {
      const cDeliveries = deliveries.filter(d => d.customerId === c.id && !d.deleted);
      const cPayments = payments.filter(p => p.customerId === c.id && !p.deleted);

      const currentMilkValue = cDeliveries.reduce((sum, d) => sum + (typeof d.totalAmount === 'number' && !isNaN(d.totalAmount) ? d.totalAmount : 0), 0);
      const paymentsReceived = cPayments.reduce((sum, p) => sum + (typeof p.amount === 'number' && !isNaN(p.amount) ? p.amount : 0), 0);
      
      const openingBalance = c.openingBalance || 0;
      
      const collectable = Math.max(0, openingBalance - paymentsReceived);
      const totalBalance = openingBalance + currentMilkValue - paymentsReceived;

      const cycle = c.paymentCycle || 'Monthly';
      if (stats[cycle]) {
        stats[cycle].customerCount++;
        stats[cycle].totalOpeningBalance += openingBalance;
        stats[cycle].totalCurrentMilk += currentMilkValue;
        stats[cycle].totalPayments += paymentsReceived;
        stats[cycle].totalCollectable += collectable;
        stats[cycle].totalBalance += totalBalance;
      }
    });

    return Object.values(stats).filter(s => s.customerCount > 0);
  }, [filteredCustomers, deliveries, payments]);

  const overall = cycleStats.reduce((acc, curr) => ({
    collectable: acc.collectable + curr.totalCollectable,
    currentMilk: acc.currentMilk + curr.totalCurrentMilk,
    balance: acc.balance + curr.totalBalance
  }), { collectable: 0, currentMilk: 0, balance: 0 });

  return (
    <div className="space-y-8">
      <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
           <div className="bg-blue-600 p-4 rounded-3xl text-white shadow-xl shadow-blue-100">
              <Wallet size={32}/>
           </div>
           <div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">Receivables</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">Cycle-wise Collection Data</p>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Total Collectable (Past Dues)</p>
            <p className="text-4xl font-black italic tracking-tighter">Rs. {formatPKR(overall.collectable)}</p>
            <p className="text-xs font-bold text-slate-400 mt-2">Ready to be collected now</p>
          </div>
        </div>
        <div className="bg-white border-2 border-slate-100 p-8 rounded-[2.5rem] shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Current Credit Milk</p>
          <p className="text-4xl font-black italic tracking-tighter text-slate-900">Rs. {formatPKR(overall.currentMilk)}</p>
          <p className="text-xs font-bold text-slate-500 mt-2">Unbilled milk for current cycle</p>
        </div>
        <div className="bg-white border-2 border-slate-100 p-8 rounded-[2.5rem] shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Outstanding</p>
          <p className="text-4xl font-black italic tracking-tighter text-slate-900">Rs. {formatPKR(overall.balance)}</p>
          <p className="text-xs font-bold text-slate-500 mt-2">Collectable + Credit Milk</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3 ml-4">
          <Activity size={18} className="text-blue-600" />
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Cycle Breakdown</h3>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {cycleStats.map(stat => (
            <div key={stat.cycle} className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden p-6 md:p-8 flex flex-col lg:flex-row items-center gap-8">
              <div className="flex flex-col items-center justify-center w-32 h-32 bg-slate-50 rounded-[2rem] border-2 border-slate-100 shrink-0">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cycle</span>
                <span className="text-xl font-black text-slate-900 italic tracking-tighter mt-1 text-center">{stat.cycle}</span>
                <span className="text-[10px] font-bold text-blue-600 mt-2">{stat.customerCount} Customers</span>
              </div>

              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Collectable (Past Dues)</p>
                  <p className="text-2xl font-black italic text-slate-900">Rs. {formatPKR(stat.totalCollectable)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Current Credit Milk</p>
                  <p className="text-2xl font-black italic text-slate-900">Rs. {formatPKR(stat.totalCurrentMilk)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Balance</p>
                  <p className="text-2xl font-black italic text-slate-900">Rs. {formatPKR(stat.totalBalance)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ReceivablesView;
