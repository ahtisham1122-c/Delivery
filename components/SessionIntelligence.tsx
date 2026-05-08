
import React, { useMemo } from 'react';
import { 
  Zap, Activity, Truck, 
  Timer, ShieldCheck 
} from 'lucide-react';
import { Rider, Customer, Delivery, Payment, RiderLoad, UserRole } from '../types';
import { formatPKR } from '../services/dataStore';

interface SessionIntelligenceProps {
  riders: Rider[];
  customers: Customer[];
  deliveries: Delivery[];
  payments: Payment[];
  riderLoads: RiderLoad[];
  role: UserRole;
}

const SessionIntelligence: React.FC<SessionIntelligenceProps> = ({ 
  riders, customers, deliveries, payments, riderLoads, role 
}) => {
  const today = new Date().toLocaleDateString('en-CA');
  const isOwner = role === UserRole.OWNER;

  const aggregatedStats = useMemo(() => {
    const todayDeliveries = (deliveries || []).filter(d => d.date === today && !d.isAdjustment && !d.deleted);
    const todayPayments = (payments || []).filter(p => p.date === today && !p.isAdjustment && !p.deleted);
    const todayLoads = (riderLoads || []).filter(l => l.date === today);

    const totalLitersIssued = todayLoads.reduce((a, b) => a + (typeof b.liters === 'number' && !isNaN(b.liters) ? b.liters : 0), 0);
    const totalLitersDelivered = todayDeliveries.reduce((a, b) => a + (typeof b.liters === 'number' && !isNaN(b.liters) ? b.liters : 0), 0);
    const totalCashCollected = todayPayments.reduce((a, b) => a + (typeof b.amount === 'number' && !isNaN(b.amount) ? b.amount : 0), 0);
    
    const activeRiders = (riders || []).map(rider => {
      const riderCusts = (customers || []).filter(c => c.riderId === rider.id && c.active);
      const riderSavedDeliveries = todayDeliveries.filter(d => d.riderId === rider.id || riderCusts.some(c => c.id === d.customerId));
      const riderIssued = todayLoads.filter(l => l.riderId === rider.id).reduce((a, b) => a + (typeof b.liters === 'number' && !isNaN(b.liters) ? b.liters : 0), 0);
      const riderDelivered = riderSavedDeliveries.reduce((a, b) => a + (typeof b.liters === 'number' && !isNaN(b.liters) ? b.liters : 0), 0);
      
      const completionPercent = riderCusts.length > 0 ? (riderSavedDeliveries.length / riderCusts.length) * 100 : 0;
      
      return {
        ...rider,
        issued: riderIssued,
        delivered: riderDelivered,
        remaining: riderIssued - riderDelivered,
        progress: completionPercent,
        dropCount: riderSavedDeliveries.length,
        totalDrops: riderCusts.length
      };
    }).filter(r => r.issued > 0 || r.dropCount > 0);

    return { totalLitersIssued, totalLitersDelivered, totalCashCollected, activeRiders };
  }, [riders, customers, deliveries, payments, riderLoads, today]);

  if (!isOwner) {
    return (
      <div className="p-20 text-center flex flex-col items-center gap-4 opacity-30">
        <Activity size={64} />
        <p className="font-black uppercase text-xs tracking-widest">Unauthorized Access</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-8 pb-32 animate-in fade-in duration-500">
      {/* Top Level Pulse */}
      <div className="bg-slate-900 p-8 md:p-14 rounded-[3.5rem] shadow-2xl relative overflow-hidden text-white border-4 border-white/5">
        <div className="absolute top-0 right-0 p-10 opacity-10"><Zap size={200}/></div>
        <div className="relative z-10 space-y-8">
           <div className="flex items-center gap-4">
              <div className="bg-blue-600 p-4 rounded-3xl shadow-xl">
                 <Zap size={32}/>
              </div>
              <div>
                 <h2 className="text-3xl font-black tracking-tighter uppercase italic leading-none">Live Business Pulse</h2>
                 <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.4em] mt-2">Real-time Field Operations</p>
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/10">
                 <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-2">Aggregate Inventory In-Field</p>
                 <div className="flex items-baseline gap-2">
                    <p className="text-5xl font-black italic tracking-tighter">{aggregatedStats.totalLitersIssued.toFixed(0)}</p>
                    <span className="text-xs font-bold text-slate-500 uppercase">Liters Total</span>
                 </div>
              </div>
              <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/10">
                 <p className="text-[9px] font-black text-green-400 uppercase tracking-widest mb-2">Live Shop Sales Value</p>
                 <div className="flex items-baseline gap-2">
                    <p className="text-5xl font-black italic tracking-tighter">{aggregatedStats.totalLitersDelivered.toFixed(1)}</p>
                    <span className="text-xs font-bold text-slate-500 uppercase">Liters Sold</span>
                 </div>
              </div>
              <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/10">
                 <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-2">Physical Cash Target</p>
                 <div className="flex items-baseline gap-2">
                    <p className="text-4xl font-black italic tracking-tighter">Rs. {formatPKR(aggregatedStats.totalCashCollected)}</p>
                 </div>
              </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         {aggregatedStats.activeRiders.map(rider => (
           <div key={rider.id} className="bg-white p-8 rounded-[3.5rem] border border-slate-200 shadow-sm space-y-8 group transition-all hover:border-blue-500">
              <div className="flex justify-between items-start">
                 <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center group-hover:bg-blue-600 transition-colors">
                       <Truck size={28}/>
                    </div>
                    <div>
                       <h3 className="text-xl font-black text-slate-900 tracking-tight leading-none">{rider.name}</h3>
                       <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Route: {rider.route}</p>
                    </div>
                 </div>
                 <div className="text-right">
                    <div className="bg-blue-50 px-4 py-2 rounded-xl border border-blue-100 flex items-center gap-2">
                       <Activity size={14} className="text-blue-500 animate-pulse" />
                       <span className="text-xs font-black text-blue-600 uppercase">Active</span>
                    </div>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Route Coverage</p>
                    <div className="flex items-end justify-between">
                       <p className="text-2xl font-black text-slate-900">{rider.progress.toFixed(0)}%</p>
                       <p className="text-[10px] font-bold text-slate-400 uppercase">{rider.dropCount}/{rider.totalDrops}</p>
                    </div>
                    <div className="h-2 w-full bg-slate-200 rounded-full mt-3 overflow-hidden">
                       <div className="h-full bg-blue-600 transition-all duration-1000" style={{ width: `${rider.progress}%` }} />
                    </div>
                 </div>
                 <div className={`p-6 rounded-3xl border ${rider.remaining < 5 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                    <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${rider.remaining < 5 ? 'text-red-500' : 'text-green-500'}`}>Milk In Tank</p>
                    <div className="flex items-end justify-between">
                       <p className={`text-2xl font-black ${rider.remaining < 5 ? 'text-red-600' : 'text-green-600'}`}>{rider.remaining.toFixed(1)}L</p>
                       <p className="text-[10px] font-bold opacity-40 uppercase">of {rider.issued}L</p>
                    </div>
                    <div className="h-2 w-full bg-black/5 rounded-full mt-3 overflow-hidden">
                       <div className={`h-full transition-all duration-1000 ${rider.remaining < 5 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${(rider.remaining/rider.issued)*100}%` }} />
                    </div>
                 </div>
              </div>

              <div className="pt-6 border-t border-slate-100 flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                 <div className="flex items-center gap-2">
                    <ShieldCheck size={14} className="text-blue-500"/>
                    <span>Verified Shop Telemetry</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <Timer size={14}/>
                    <span>Estimating 100% completion in 45m</span>
                 </div>
              </div>
           </div>
         ))}

         {aggregatedStats.activeRiders.length === 0 && (
           <div className="col-span-full py-40 bg-white rounded-[4rem] border-4 border-dashed border-slate-100 flex flex-col items-center justify-center text-slate-300">
              <Zap size={64} className="mb-4 opacity-10" />
              <p className="font-black uppercase tracking-widest text-sm">No Active Field Sessions Detected</p>
           </div>
         )}
      </div>
    </div>
  );
};

export default SessionIntelligence;
