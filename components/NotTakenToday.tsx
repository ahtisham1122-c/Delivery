
import React, { useMemo, useState } from 'react';
import { 
  UserX, Search, Bike, MapPin, Calendar, 
  Clock, AlertTriangle, CheckCircle, Info, ShieldCheck
} from 'lucide-react';
import { Customer, Delivery, Rider, MonthlyArchive } from '../types';

interface NotTakenTodayProps {
  customers: Customer[];
  deliveries: Delivery[];
  riders: Rider[];
  riderFilterId: string;
  archives: MonthlyArchive[];
}

const NotTakenToday: React.FC<NotTakenTodayProps> = ({ 
  customers, deliveries, riders, riderFilterId, archives 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('en-CA'));

  const archiveContext = useMemo(() => {
    const dt = new Date(selectedDate);
    return (archives || []).find(a => a.month === dt.getMonth() && a.year === dt.getFullYear());
  }, [selectedDate, archives]);

  const activeDeliveries = useMemo(() => {
    if (archiveContext) return (archiveContext.deliveries || []).filter(d => !d.deleted);
    return (deliveries || []).filter(d => !d.deleted);
  }, [archiveContext, deliveries]);

  const missingCustomers = useMemo(() => {
    // 1. Get all customers who are CURRENTLY active
    const active = (customers || []).filter(c => c.active);

    // 2. Identify who has NOT taken milk on the selected date
    return active.filter(c => {
      const belongsToFilteredRider = riderFilterId === 'all' || c.riderId === riderFilterId;
      if (!belongsToFilteredRider) return false;

      const takenOnSelectedDate = (activeDeliveries || []).some(d => d.customerId === c.id && d.date === selectedDate);
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           (c.urduName && c.urduName.includes(searchTerm));

      return !takenOnSelectedDate && matchesSearch;
    }).map(c => {
      // Find the last delivery date relative to the selected date for context
      // We look through all deliveries + archives to find the absolute last seen
      const allSourceDeliveries = (deliveries || []).filter(d => !d.deleted);
      (archives || []).forEach(a => {
        if (a.deliveries) {
           allSourceDeliveries.push(...a.deliveries.filter(d => !d.deleted));
        }
      });

      const customerDeliveries = allSourceDeliveries
        .filter(d => d.customerId === c.id && d.date < selectedDate)
        .sort((a, b) => b.date.localeCompare(a.date));
      
      return {
        ...c,
        lastDelivery: customerDeliveries[0] ? customerDeliveries[0].date : 'No History'
      };
    }).sort((a, b) => a.deliveryOrder - b.deliveryOrder);
  }, [customers, activeDeliveries, selectedDate, riderFilterId, searchTerm, deliveries, archives]);

  const stats = useMemo(() => {
    const totalActive = customers.filter(c => c.active && (riderFilterId === 'all' || c.riderId === riderFilterId)).length;
    const missingCount = missingCustomers.length;
    const completionRate = totalActive > 0 ? ((totalActive - missingCount) / totalActive) * 100 : 0;
    
    return { totalActive, missingCount, completionRate };
  }, [customers, missingCustomers, riderFilterId]);

  const isToday = selectedDate === new Date().toLocaleDateString('en-CA');

  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in duration-500 pb-32">
      {/* Overview Stats */}
      <div className={`p-8 md:p-12 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden transition-colors duration-500 ${isToday ? 'bg-slate-900' : 'bg-indigo-900'}`}>
        <div className="absolute top-0 right-0 p-10 opacity-10"><UserX size={150}/></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-end gap-8">
           <div className="space-y-4">
              <div className="flex items-center gap-4">
                 <div className="bg-indigo-600 p-4 rounded-3xl shadow-xl">
                    {isToday ? <AlertTriangle size={32}/> : <Calendar size={32}/>}
                 </div>
                 <div>
                    <h2 className="text-3xl font-black tracking-tighter uppercase italic">
                      {isToday ? 'Missing Drops' : 'Historical Audit'}
                    </h2>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                      {riderFilterId === 'all' ? "Global Operational Audit" : `Route: ${riders.find(r => r.id === riderFilterId)?.name}`}
                    </p>
                 </div>
              </div>
              <p className="text-5xl font-black text-white italic tracking-tighter">
                {stats.missingCount} <span className="text-lg text-slate-500 not-italic uppercase tracking-widest font-black ml-2">Skipped</span>
              </p>
           </div>
           <div className="flex flex-col items-end gap-3">
              {archiveContext && (
                <div className="bg-white/10 px-4 py-2 rounded-xl flex items-center gap-2 border border-white/10">
                   <ShieldCheck size={14} className="text-green-400"/>
                   <span className="text-[8px] font-black uppercase tracking-widest">Pulling from Archive</span>
                </div>
              )}
              <div className="bg-white/5 border border-white/10 px-8 py-6 rounded-[2rem] text-right">
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Coverage progress</p>
                  <p className="text-3xl font-black italic">{stats.completionRate.toFixed(0)}% <span className="text-xs text-slate-500">Delivered</span></p>
              </div>
           </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex flex-col md:flex-row gap-6 items-center justify-between bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-center gap-6 w-full md:w-auto">
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 p-3 px-6 rounded-2xl w-full md:w-auto">
                <Calendar size={18} className="text-indigo-500" />
                <input 
                  type="date" 
                  className="bg-transparent font-black text-slate-700 outline-none text-xs uppercase tracking-widest"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                />
            </div>
            <div className="h-8 w-px bg-slate-200 hidden md:block"></div>
            <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Info size={16}/></div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filtered Operational View</p>
            </div>
        </div>
        
        <div className="relative w-full md:w-80">
           <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
           <input 
            type="text" placeholder="Search missing names..." 
            className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-[10px] font-black text-slate-700 outline-none focus:border-indigo-600 transition-all"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
           />
        </div>
      </div>

      {/* Missing Customer Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {missingCustomers.map(c => {
          const rider = riders.find(r => r.id === c.riderId);
          return (
            <div key={c.id} className="bg-white rounded-[3rem] p-8 border border-slate-200 flex flex-col gap-6 shadow-sm hover:shadow-xl transition-all group">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h4 className="font-black text-slate-900 text-lg truncate group-hover:text-indigo-600 transition-colors">{c.name}</h4>
                  <p className="text-2xl font-bold text-slate-400 group-hover:text-blue-500 transition-colors" dir="rtl">{c.urduName}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl text-slate-400">
                   <UserX size={20}/>
                </div>
              </div>

              <div className="space-y-4">
                 <div className="flex items-center gap-3">
                    <Bike size={14} className="text-slate-300"/>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{rider?.name || 'Unassigned'}</span>
                 </div>
                 <div className="flex items-center gap-3">
                    <MapPin size={14} className="text-slate-300"/>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest truncate">{c.route || c.address || 'No Area Logged'}</span>
                 </div>
              </div>

              <div className="mt-auto pt-6 border-t border-slate-50 flex justify-between items-center">
                 <div>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Last Delivery Before Date</p>
                    <div className="flex items-center gap-2 mt-1">
                       <Clock size={12} className="text-indigo-500"/>
                       <span className="text-xs font-black text-slate-900 italic">
                         {c.lastDelivery !== 'No History' ? new Date(c.lastDelivery).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'No Record'}
                       </span>
                    </div>
                 </div>
                 <div className="bg-slate-900 text-white w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs">
                    #{c.deliveryOrder}
                 </div>
              </div>
            </div>
          );
        })}

        {missingCustomers.length === 0 && (
          <div className="col-span-full py-32 flex flex-col items-center justify-center bg-white rounded-[4rem] border-4 border-dashed border-slate-100 opacity-40">
             <CheckCircle size={64} className="text-green-500 mb-6" />
             <p className="font-black text-slate-400 uppercase tracking-[0.4em] text-sm">No missing entries for this date</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotTakenToday;
