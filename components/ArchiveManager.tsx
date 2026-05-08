
import React, { useState, useEffect } from 'react';
import { Archive, Download, ChevronRight, X, Calendar, ClipboardList, Lock, ShieldCheck } from 'lucide-react';
import { MonthlyArchive, Rider, Customer, UserRole } from '../types';
import { relationalDataService } from '../services/relationalDataService';

interface ArchiveManagerProps {
  archives: MonthlyArchive[];
  riders: Rider[];
  customers: Customer[];
  onCloseMonth: (year: number, month: number) => void;
  role: UserRole;
}

const ArchiveManager: React.FC<ArchiveManagerProps> = ({ archives: parentArchives, onCloseMonth, role, customers }) => {
  const [selectedArchive, setSelectedArchive] = useState<MonthlyArchive | null>(null);
  const [localArchives, setLocalArchives] = useState<MonthlyArchive[]>([]);

  // Fallback fetch if parent is empty
  useEffect(() => {
    if (parentArchives.length === 0) {
      relationalDataService.fetchTable('dp_archives')
        .then(data => {
          const unpacked = data.map((arc: any) => {
            if (arc.payload) {
              const { payload, ...rest } = arc;
              const unpackedPayload = typeof payload === 'string' ? JSON.parse(payload) : payload;
              return { ...rest, ...unpackedPayload };
            }
            return arc;
          });
          setLocalArchives(unpacked);
        });
    }
  }, [parentArchives]);

  const archives = parentArchives.length > 0 ? parentArchives : localArchives;

  const getMonthName = (m: number) => new Date(2000, m).toLocaleString('default', { month: 'long' });
  const isOwner = role === UserRole.OWNER;

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-8">
      <div className="bg-white p-10 rounded-[3rem] border-2 border-slate-100 shadow-sm flex items-center gap-6">
        <div className="bg-slate-900 p-5 rounded-2xl text-white shadow-lg">
          <Archive size={32} />
        </div>
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Data Archives</h2>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">Locked Months & historical ledger data</p>
        </div>
      </div>

      {isOwner && (
        <div className="bg-amber-50 p-10 rounded-[3rem] border-4 border-amber-200 border-dashed space-y-6">
            <div className="flex items-center gap-4">
               <div className="p-3 bg-amber-200 text-amber-700 rounded-2xl"><Lock size={24}/></div>
               <div>
                  <h3 className="text-xl font-black text-amber-900 uppercase">Period Closing Utility</h3>
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Financial Hard Close</p>
               </div>
            </div>
            <p className="text-xs text-amber-800 leading-relaxed font-bold">
               Finalize the active ledger for <span className="font-black underline">{getMonthName(currentMonth)} {currentYear}</span>. This will lock records, archive them, and carry forward all customer balances to next month.
            </p>
            <button 
              onClick={() => onCloseMonth(currentYear, currentMonth)}
              className="w-full py-5 bg-amber-600 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl shadow-amber-200 hover:bg-slate-900 transition-all flex items-center justify-center gap-3"
            >
               <ShieldCheck size={20}/> Formal Close Period
            </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {archives.length === 0 ? (
          <div className="col-span-full py-20 bg-white rounded-[3rem] border-4 border-dashed border-slate-100 flex flex-col items-center justify-center text-slate-300">
             <Archive size={64} className="mb-4 opacity-20" />
             <p className="font-black uppercase tracking-widest">No closed months archived yet.</p>
          </div>
        ) : (
          archives.map((arc, i) => (
            <div key={i} className="bg-white p-8 rounded-[3rem] border-4 border-slate-100 shadow-sm hover:border-blue-600 transition-all group">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-black text-slate-900">{getMonthName(arc.month)}</h3>
                  <p className="text-blue-600 font-black text-sm">{arc.year}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl text-slate-400">
                  <Calendar size={24} />
                </div>
              </div>
              <div className="space-y-4 mb-8">
                 <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-400 uppercase">Deliveries</span>
                    <span className="text-slate-900">{arc.deliveries.length} entries</span>
                 </div>
                 <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-400 uppercase">Payments</span>
                    <span className="text-slate-900">{arc.payments.length} entries</span>
                 </div>
              </div>
              <button 
                onClick={() => setSelectedArchive(arc)}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 group-hover:bg-blue-600 transition-all"
              >
                Open Archive <ChevronRight size={16} />
              </button>
            </div>
          ))
        )}
      </div>

      {selectedArchive && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[4rem] shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden border-8 border-slate-900 flex flex-col">
             <div className="p-10 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-4">
                   <div className="bg-blue-600 p-4 rounded-2xl shadow-lg"><Archive size={28} /></div>
                   <div>
                      <h3 className="font-black text-3xl tracking-tighter uppercase">{getMonthName(selectedArchive.month)} {selectedArchive.year}</h3>
                      <p className="text-blue-400 text-[10px] font-black uppercase tracking-[0.4em] mt-1">Locked Historical Data</p>
                   </div>
                </div>
                <button onClick={() => setSelectedArchive(null)} className="bg-white/10 p-3 rounded-full hover:bg-white/20 transition-all"><X size={28} /></button>
             </div>
             <div className="flex-1 overflow-y-auto p-10 space-y-10 bg-slate-50">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                       <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Total Sales</p>
                       <p className="text-2xl font-black">Rs. {selectedArchive.deliveries.reduce((a, b) => a + (Number(b.totalAmount) || 0), 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                       <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Total Recovered</p>
                       <p className="text-2xl font-black text-green-600">Rs. {selectedArchive.payments.reduce((a, b) => a + (Number(b.amount) || 0), 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                       <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Total Expenses</p>
                       <p className="text-2xl font-black text-red-500">Rs. {selectedArchive.expenses.reduce((a, b) => a + (Number(b.amount) || 0), 0).toLocaleString()}</p>
                    </div>
                </div>

                <div className="space-y-4">
                   <h4 className="font-black uppercase tracking-widest text-xs text-slate-400 flex items-center gap-2 px-2"><ClipboardList size={14}/> Top Deliveries</h4>
                   <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden">
                      {selectedArchive.deliveries.slice(0, 10).map((d, i) => (
                        <div key={i} className="px-8 py-4 border-b border-slate-50 flex justify-between items-center text-sm">
                           <span className="font-bold text-slate-800">{customers.find(c => c.id === d.customerId)?.name}</span>
                           <span className="font-black">{d.liters} L</span>
                           <span className="text-slate-400">{new Date(d.date).toLocaleDateString()}</span>
                        </div>
                      ))}
                      <p className="p-4 text-center text-[10px] font-black text-slate-300 uppercase">...showing top 10 of {selectedArchive.deliveries.length} records</p>
                   </div>
                </div>
             </div>
             <div className="p-10 border-t-4 border-slate-100 bg-white flex justify-end gap-4">
                <button className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs flex items-center gap-2"><Download size={18}/> Download CSV</button>
                <button onClick={() => setSelectedArchive(null)} className="px-8 py-4 border-2 border-slate-100 text-slate-400 rounded-2xl font-black uppercase text-xs">Close Viewer</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArchiveManager;
