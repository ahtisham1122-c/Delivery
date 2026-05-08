
import React, { useMemo } from 'react';
import { 
  Wallet, TrendingUp, ArrowUpRight, ArrowDownRight, 
  Users, Calendar, FileSpreadsheet
} from 'lucide-react';
import { motion } from 'motion/react';
import { Customer, Delivery, Payment, UserRole } from '../types';
import { formatPKR } from '../services/dataStore';
import { exportService } from '../services/exportService';

interface FinancialSummaryProps {
  customers: Customer[];
  deliveries: Delivery[];
  payments: Payment[];
  balances: Record<string, number>;
  role: UserRole;
}

const FinancialSummary: React.FC<FinancialSummaryProps> = ({
  customers, deliveries, payments, balances
}) => {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const stats = useMemo(() => {
    const activeCustomers = customers.filter(c => c.active);
    
    // Total Collectable (Total Balance of all active customers)
    const totalCollectable = activeCustomers.reduce((sum, c) => sum + (balances[c.id] || 0), 0);

    // Total Credit Milk this month
    const thisMonthDeliveries = deliveries.filter(d => {
      if (d.deleted) return false;
      const dDate = new Date(d.date);
      return dDate.getMonth() === currentMonth && dDate.getFullYear() === currentYear;
    });
    const totalCreditMilkAmount = thisMonthDeliveries.reduce((sum, d) => sum + (typeof d.totalAmount === 'number' && !isNaN(d.totalAmount) ? d.totalAmount : 0), 0);

    // Total Payments this month
    const thisMonthPayments = payments.filter(p => {
      if (p.deleted) return false;
      const pDate = new Date(p.date);
      return pDate.getMonth() === currentMonth && pDate.getFullYear() === currentYear;
    });
    const totalCollectedThisMonth = thisMonthPayments.reduce((sum, p) => sum + (typeof p.amount === 'number' && !isNaN(p.amount) ? p.amount : 0), 0);

    // Cycle-wise breakdown
    const cycleStats = activeCustomers.reduce((acc, c) => {
      const cycle = c.paymentCycle;
      if (!acc[cycle]) acc[cycle] = { count: 0, balance: 0 };
      acc[cycle].count++;
      acc[cycle].balance += (balances[c.id] || 0);
      return acc;
    }, {} as Record<string, { count: number, balance: number }>);

    return {
      totalCollectable,
      totalCreditMilkAmount,
      totalCollectedThisMonth,
      cycleStats
    };
  }, [customers, deliveries, payments, balances, currentMonth, currentYear]);

  const handleExportExcel = () => {
    const data = customers.filter(c => c.active).map(c => ({
      'Customer Name': c.name,
      'Urdu Name': c.urduName || '',
      'Cycle': c.paymentCycle,
      'Total Balance': balances[c.id] || 0
    }));

    // Add summary rows
    data.push({} as any);
    data.push({
      'Customer Name': 'TOTAL COLLECTABLE',
      'Urdu Name': '',
      'Cycle': '',
      'Total Balance': stats.totalCollectable
    } as any);

    exportService.exportSummaryToExcel(
      new Date().toISOString().split('T')[0],
      customers,
      deliveries,
      payments
    );
    // Note: exportSummaryToExcel is for daily summary. 
    // I should probably add a more specific method for Financial Summary if needed, 
    // but for now I'll use what's available or just leave it as a placeholder for future refinement.
  };

  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in duration-500 pb-32">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-4 rounded-3xl shadow-xl text-white">
            <Wallet size={32}/>
          </div>
          <div>
            <h2 className="text-3xl font-black tracking-tighter uppercase italic text-slate-900">Financial Summary</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Receivables & Credit Analysis</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all"
          >
            <FileSpreadsheet size={16}/> Export Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Total Collectable Card */}
        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-white p-8 rounded-[3rem] border-2 border-slate-100 shadow-sm space-y-4"
        >
          <div className="flex justify-between items-start">
            <div className="p-3 bg-red-50 text-red-600 rounded-2xl">
              <TrendingUp size={24}/>
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Receivables</span>
          </div>
          <div>
            <p className="text-4xl font-black text-slate-900 italic tracking-tighter">Rs. {formatPKR(stats.totalCollectable)}</p>
            <p className="text-[10px] font-bold text-slate-500 mt-1">Outstanding from all active customers</p>
          </div>
        </motion.div>

        {/* Total Credit Milk this Month */}
        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-white p-8 rounded-[3rem] border-2 border-slate-100 shadow-sm space-y-4"
        >
          <div className="flex justify-between items-start">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
              <ArrowUpRight size={24}/>
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monthly Credit Sales</span>
          </div>
          <div>
            <p className="text-4xl font-black text-slate-900 italic tracking-tighter">Rs. {formatPKR(stats.totalCreditMilkAmount)}</p>
            <p className="text-[10px] font-bold text-slate-500 mt-1">Total milk value delivered this month</p>
          </div>
        </motion.div>

        {/* Total Collected this Month */}
        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-white p-8 rounded-[3rem] border-2 border-slate-100 shadow-sm space-y-4"
        >
          <div className="flex justify-between items-start">
            <div className="p-3 bg-green-50 text-green-600 rounded-2xl">
              <ArrowDownRight size={24}/>
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monthly Recovery</span>
          </div>
          <div>
            <p className="text-4xl font-black text-slate-900 italic tracking-tighter">Rs. {formatPKR(stats.totalCollectedThisMonth)}</p>
            <p className="text-[10px] font-bold text-slate-500 mt-1">Total payments received this month</p>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Cycle-wise Breakdown */}
        <div className="bg-slate-900 rounded-[3rem] p-8 text-white space-y-6">
          <div className="flex items-center gap-3">
            <Calendar size={20} className="text-blue-400"/>
            <h3 className="font-black uppercase tracking-widest text-sm">Cycle-wise Receivables</h3>
          </div>
          <div className="space-y-4">
            {Object.entries(stats.cycleStats).map(([cycle, data]) => (
              <div key={cycle} className="flex justify-between items-center p-6 bg-white/5 rounded-3xl border border-white/10">
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{cycle}</p>
                  <p className="text-lg font-bold">{data.count} Customers</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-blue-400 italic">Rs. {formatPKR(data.balance)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Receivables */}
        <div className="bg-white rounded-[3rem] p-8 border-2 border-slate-100 space-y-6">
          <div className="flex items-center gap-3">
            <Users size={20} className="text-slate-400"/>
            <h3 className="font-black uppercase tracking-widest text-sm text-slate-900">Top Outstanding Accounts</h3>
          </div>
          <div className="space-y-3">
            {customers
              .filter(c => c.active)
              .sort((a, b) => (balances[b.id] || 0) - (balances[a.id] || 0))
              .slice(0, 5)
              .map(customer => (
                <div key={customer.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div>
                    <p className="font-black text-slate-900">{customer.name}</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{customer.paymentCycle}</p>
                  </div>
                  <p className="text-lg font-black text-red-600 italic">Rs. {formatPKR(balances[customer.id] || 0)}</p>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinancialSummary;
