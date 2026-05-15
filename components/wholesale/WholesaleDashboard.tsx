import React, { useEffect, useState } from 'react';
import { wholesaleDataService } from '../../services/wholesaleDataService';
import { TrendingUp, Droplets, Wallet, Users, ArrowRight, FileText } from 'lucide-react';

interface WholesaleDashboardProps {
  onNavigate: (tab: string) => void;
}

const WholesaleDashboard: React.FC<WholesaleDashboardProps> = ({ onNavigate }) => {
  const [summary, setSummary] = useState({
    totalOutstanding: 0,
    todayMilkLiters: 0,
    todayYogurtKg: 0,
    todayCash: 0,
    topCustomers: [] as { name: string, balance: number }[]
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async (isSilent = false) => {
      if (!isSilent) setLoading(true);
      const data = await wholesaleDataService.fetchDashboardSummary();
      setSummary(data);
      if (!isSilent) setLoading(false);
    };
    loadData();

    const handlePoll = () => {
      loadData(true);
    };
    window.addEventListener('wholesale_poll', handlePoll);
    return () => window.removeEventListener('wholesale_poll', handlePoll);
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-500">Loading wholesale dashboard...</div>;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Wholesale Overview</h1>
          <p className="text-slate-500 text-sm mt-1">Today's snapshot and outstanding balances</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => onNavigate('delivery')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md shadow-blue-600/20 flex items-center gap-2 transition-all active:scale-95"
          >
            New Delivery <ArrowRight size={16} />
          </button>
          <button
            onClick={() => onNavigate('payment')}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md shadow-emerald-500/20 flex items-center gap-2 transition-all active:scale-95"
          >
            Receive Payment <ArrowRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
            <TrendingUp size={24} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Outstanding</p>
            <p className="text-2xl font-black text-slate-800">Rs. {Number(summary?.totalOutstanding ?? 0).toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
            <Droplets size={24} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Today's Milk</p>
            <p className="text-2xl font-black text-slate-800">{Number(summary?.todayMilkLiters ?? 0)} L</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
            <Droplets size={24} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Today's Yogurt</p>
            <p className="text-2xl font-black text-slate-800">{Number(summary?.todayYogurtKg ?? 0)} Kg</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <Wallet size={24} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Today's Cash</p>
            <p className="text-2xl font-black text-slate-800">Rs. {Number(summary?.todayCash ?? 0).toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Users size={20} className="text-blue-600" />
            Top Outstanding Balances
          </h2>
          {(summary?.topCustomers || []).length === 0 ? (
            <p className="text-slate-500 text-sm py-4">No outstanding balances found.</p>
          ) : (
            <div className="space-y-3">
              {(summary?.topCustomers || []).map((c, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <span className="font-bold text-slate-700">{c?.name || ''}</span>
                  <span className="font-black text-red-600">Rs. {Number(c?.balance ?? 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl shadow-lg p-6 text-white flex flex-col justify-center items-center text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm">
            <FileText size={32} />
          </div>
          <h3 className="text-xl font-black mb-2">Detailed Ledger</h3>
          <p className="text-blue-100 text-sm mb-6">View complete transaction history, generate statements, and track payments.</p>
          <button
            onClick={() => onNavigate('ledger')}
            className="bg-white text-blue-700 hover:bg-blue-50 w-full py-3 rounded-xl font-bold transition-colors shadow-md"
          >
            Open Ledger
          </button>
        </div>
      </div>
    </div>
  );
};

export default WholesaleDashboard;
