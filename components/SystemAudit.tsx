
import React, { useState, useMemo } from 'react';
import { 
  Shield, Search, Clock, User, 
  ChevronRight, Database, Activity
} from 'lucide-react';
import { AuditLog, Customer } from '../types';
import { motion } from 'motion/react';

interface SystemAuditProps {
  logs: AuditLog[];
  customers: Customer[];
}

const SystemAudit: React.FC<SystemAuditProps> = ({ logs, customers }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'Customer' | 'Delivery' | 'Payment' | 'System'>('all');

  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach(c => map.set(c.id, c));
    return map;
  }, [customers]);

  const filteredLogs = useMemo(() => {
    return (logs || [])
      .filter(log => {
        if (filterType !== 'all' && log.entityType !== filterType) return false;
        if (searchTerm) {
          const searchLower = searchTerm.toLowerCase();
          const entityMatch = log.entityId.toLowerCase().includes(searchLower) || 
                             log.action.toLowerCase().includes(searchLower) ||
                             log.performedBy.toLowerCase().includes(searchLower);
          
          let customerMatch = false;
          if (log.entityType === 'Customer') {
            const cust = customerMap.get(log.entityId);
            customerMatch = cust?.name.toLowerCase().includes(searchLower) || false;
          } else if (log.entityType === 'Delivery' || log.entityType === 'Payment') {
             // In some cases entityId is the record ID, not customer ID
             // But we can't easily map back without more data
          }
          
          return entityMatch || customerMatch;
        }
        return true;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [logs, filterType, searchTerm, customerMap]);

  const getActionColor = (action: string) => {
    switch (action) {
      case 'CREATE': return 'bg-green-100 text-green-600 border-green-200';
      case 'UPDATE': return 'bg-blue-100 text-blue-600 border-blue-200';
      case 'DELETE': return 'bg-red-100 text-red-600 border-red-200';
      case 'SYNC_REJECTED': return 'bg-amber-100 text-amber-600 border-amber-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
      <div className="bg-slate-900 rounded-[3rem] p-10 md:p-14 text-white relative overflow-hidden shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div className="space-y-6">
            <div className="flex items-center gap-5">
              <div className="bg-blue-600 p-5 rounded-[2rem] shadow-xl shadow-blue-500/20">
                <Shield size={36} />
              </div>
              <div>
                <h2 className="text-4xl font-black tracking-tighter uppercase italic">System Audit</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mt-1">Data Integrity & Traceability</p>
              </div>
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[2.5rem] min-w-[200px] text-center">
             <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Events</p>
             <p className="text-4xl font-black italic tracking-tighter">{logs.length}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-center justify-between bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
        <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full md:w-auto overflow-x-auto scrollbar-hide">
          {['all', 'Customer', 'Delivery', 'Payment', 'System'].map((type) => (
            <button 
              key={type}
              onClick={() => setFilterType(type as any)} 
              className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${filterType === type ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
            >
              {type}
            </button>
          ))}
        </div>
        
        <div className="relative group w-full md:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500" size={18} />
          <input 
            type="text" 
            placeholder="Search logs..." 
            className="w-full pl-12 pr-10 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-[10px] font-bold outline-none focus:border-blue-500 focus:bg-white transition-all"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-4">
        {filteredLogs.length === 0 ? (
          <div className="py-40 flex flex-col items-center justify-center text-slate-300 opacity-50 bg-white rounded-[3rem] border border-dashed border-slate-200">
            <Activity size={64} className="mb-4" />
            <p className="font-black text-lg uppercase tracking-[0.4em]">No Audit Events</p>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <motion.div 
              key={log.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] p-8 border border-slate-100 flex flex-col md:flex-row items-start md:items-center gap-6 group hover:border-blue-200 transition-all shadow-sm"
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border-2 ${getActionColor(log.action)}`}>
                <Database size={24} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase border ${getActionColor(log.action)}`}>
                    {log.action}
                  </span>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {log.entityType}
                  </span>
                  <h4 className="text-sm font-black text-slate-900 tracking-tight truncate">
                    {log.entityType === 'Customer' && customerMap.get(log.entityId) ? customerMap.get(log.entityId)?.name : `ID: ${log.entityId}`}
                  </h4>
                </div>
                <div className="flex items-center gap-4 mt-2 text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <User size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                      {log.performedBy}
                    </span>
                  </div>
                </div>
              </div>

              {log.conflictReason && (
                <div className="px-4 py-2 bg-red-50 text-red-600 rounded-xl border border-red-100 text-[8px] font-black uppercase tracking-tighter">
                  {log.conflictReason}
                </div>
              )}

              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all">
                  <ChevronRight size={20} />
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

export default SystemAudit;
