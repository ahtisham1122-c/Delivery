
import React, { useState } from 'react';
import { Bike, Plus, X, Key, Map, Edit2, Banknote, Activity, BadgeCheck, FileText, Printer, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Rider, UserRole, Customer } from '../types';
import { formatPKR, generateId } from '../services/dataStore';
import { supabase } from '../services/supabaseClient';

interface StaffManagementProps {
  riders: Rider[];
  setRiders: React.Dispatch<React.SetStateAction<Rider[]>>;
  role: UserRole;
  riderId?: string;
  customers: Customer[];
  balances: Record<string, number>;
}

const StaffManagement: React.FC<StaffManagementProps> = ({ riders, setRiders, role, riderId, customers, balances }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRider, setEditingRider] = useState<Rider | null>(null);
  const [viewingRouteSheetRiderId, setViewingRouteSheetRiderId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'pending'>('idle');
  
  const [formData, setFormData] = useState({
    name: '',
    route: '',
    pin: '',
    salary: '',
    roleName: 'Delivery Boy'
  });

  const isOwner = role === UserRole.OWNER;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessing || syncStatus === 'saving') return;
    setIsProcessing(true);
    setSyncStatus('saving');

    let updatedRider: Rider;

    if (editingRider) {
      updatedRider = {
        ...editingRider,
        name: formData.name,
        route: formData.route,
        pin: formData.pin.padStart(4, '0'),
        salary: parseFloat(formData.salary) || 0,
        role: formData.roleName,
        updatedAt: new Date().toISOString(),
        version: (editingRider.version || 0) + 1
      };
    } else {
      updatedRider = {
        id: generateId(),
        name: formData.name,
        route: formData.route,
        pin: formData.pin.padStart(4, '0'),
        role: formData.roleName,
        salary: parseFloat(formData.salary) || 0,
        updatedAt: new Date().toISOString(),
        version: 1
      };
    }

    let isCloudSuccess = false;
    let cloudErrorMsg = '';
    try {
      const { error: rErr } = await supabase.from('dp_riders').upsert(updatedRider);
      if (rErr) throw rErr;
      isCloudSuccess = true;
    } catch (err: any) {
      console.error("Cloud save failed:", err);
      cloudErrorMsg = err?.message || String(err);
    }

    if (isCloudSuccess) {
      setSyncStatus('saved');
      if (editingRider) {
        setRiders(riders.map(r => r.id === editingRider.id ? updatedRider : r));
      } else {
        setRiders([...riders, updatedRider]);
      }
    } else {
      setSyncStatus('idle');
      setIsProcessing(false);
      if (cloudErrorMsg.includes('Concurrency Conflict')) {
        alert("RECORD ALREADY CHANGED: Another user edited this rider. Please refresh to see latest data.");
      } else {
        alert("STAFF SYNC FAILED: Staff information not synced to cloud. Check internet.");
      }
      return;
    }

    setTimeout(() => {
      setIsModalOpen(false);
      setEditingRider(null);
      setIsProcessing(false);
      setSyncStatus('idle');
    }, 500);
  };

  const handleOpenEdit = (rider: Rider) => {
    setEditingRider(rider);
    setFormData({
      name: rider.name,
      route: rider.route,
      pin: rider.pin,
      salary: rider.salary.toString(),
      roleName: rider.role
    });
    setIsModalOpen(true);
  };

  const visibleRiders = isOwner ? riders : riders.filter(r => r.id === riderId);

  // ROUTE SHEET LOGIC
  if (viewingRouteSheetRiderId) {
    const targetRider = riders.find(r => r.id === viewingRouteSheetRiderId);
    const routeCustomers = customers
      .filter(c => c.riderId === viewingRouteSheetRiderId && c.active)
      .sort((a, b) => a.deliveryOrder - b.deliveryOrder);

    const handlePrint = () => {
      const event = new CustomEvent('trigger-thermal-print', {
        detail: {
          type: 'route-sheet',
          profile: '80', // Route sheet needs more width, default to 80
          fontSize: 'sm',
          data: {
            riderName: targetRider?.name,
            route: targetRider?.route,
            routeCustomers: routeCustomers.map(c => ({
              name: c.name,
              urduName: c.urduName,
              balance: balances[c.id] || 0
            }))
          }
        }
      });
      window.dispatchEvent(event);
    };

    return (
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="p-4 md:p-8 space-y-8"
      >
         <div className="flex justify-between items-center no-print">
            <motion.button 
              whileTap={{ scale: 0.95 }}
              onClick={() => setViewingRouteSheetRiderId(null)} 
              className="flex items-center gap-2 px-4 md:px-6 py-3 bg-white border border-slate-200 text-slate-500 rounded-xl font-black uppercase text-[10px] shadow-sm"
            >
               <ChevronLeft size={16}/> Back
            </motion.button>
            <motion.button 
              whileTap={{ scale: 0.95 }}
              onClick={handlePrint} 
              className="flex items-center gap-2 px-6 md:px-8 py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px] shadow-lg"
            >
               <Printer size={16}/> Print
            </motion.button>
         </div>

         <div className="bg-white p-6 md:p-10 rounded-[2.5rem] md:rounded-[3rem] border-4 border-slate-100 shadow-sm space-y-10 print-ledger-container overflow-x-auto">
            <div className="flex flex-col md:flex-row justify-between items-start border-b-4 border-slate-900 pb-8 gap-4">
               <div>
                  <h2 className="text-2xl md:text-4xl font-black text-slate-900 tracking-tighter uppercase italic leading-none">Route Sheet</h2>
                  <p className="text-blue-600 font-black text-base md:text-lg uppercase tracking-widest mt-2">{targetRider?.name} - {targetRider?.route}</p>
               </div>
               <div className="text-left md:text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Printed On</p>
                  <p className="text-base md:text-lg font-bold">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
               </div>
            </div>

            <table className="w-full text-left font-bold border-collapse min-w-[600px]">
               <thead>
                  <tr className="bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest">
                     <th className="px-6 py-5 border-r border-white/10">Order</th>
                     <th className="px-6 py-5 border-r border-white/10">Customer Name</th>
                     <th className="px-6 py-5 border-r border-white/10">Cycle</th>
                     <th className="px-6 py-5 border-r border-white/10">Opening Balance</th>
                     <th className="px-6 py-5 border-r border-white/10">Today (L)</th>
                     <th className="px-6 py-5">Cash Received</th>
                  </tr>
               </thead>
               <tbody className="divide-y-2 divide-slate-100 border-b-2 border-slate-100">
                  {routeCustomers.map((c, idx) => (
                    <tr key={c.id} className="text-sm">
                       <td className="px-6 py-6 font-black text-slate-400">{idx + 1}</td>
                       <td className="px-6 py-6">
                          <p className="text-slate-900 font-black">{c.name}</p>
                          <p className="text-lg font-bold text-blue-600" dir="rtl">{c.urduName}</p>
                       </td>
                       <td className="px-6 py-6 font-black text-[10px] uppercase text-slate-400">{c.paymentCycle}</td>
                       <td className="px-6 py-6 font-black text-slate-900">Rs. {formatPKR(balances[c.id] || 0)}</td>
                       <td className="px-6 py-6 border-x-2 border-slate-100 bg-slate-50/50"></td>
                       <td className="px-6 py-6"></td>
                    </tr>
                  ))}
               </tbody>
            </table>
            
            <div className="pt-8 flex justify-between items-center text-slate-400 font-black uppercase text-[8px] tracking-[0.4em]">
               <span>Digital Ledger - Gujjar Milk Shop</span>
               <span>End of Route Verification Stamp Required</span>
            </div>
         </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row justify-between items-center bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] border-2 border-slate-100 shadow-sm gap-4"
      >
        <div className="flex items-center gap-4 w-full sm:w-auto">
           <div className="bg-slate-900 p-3 md:p-4 rounded-xl md:rounded-2xl text-white">
              <Activity size={20} className="md:w-6 md:h-6"/>
           </div>
           <div>
              <h3 className="text-xl md:text-2xl font-black text-slate-800 tracking-tighter uppercase">Staff Hub</h3>
              <p className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Team & Payroll Accounts</p>
           </div>
        </div>
        {isOwner && (
          <motion.button 
            whileTap={{ scale: 0.95 }}
            onClick={() => { setEditingRider(null); setFormData({name: '', route: '', pin: '', salary: '', roleName: 'Delivery Boy'}); setIsModalOpen(true); }}
            className="w-full sm:w-auto bg-blue-600 text-white px-6 md:px-8 py-4 rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-widest hover:bg-slate-900 transition-all shadow-lg shadow-blue-100"
          >
            Add New Staff
          </motion.button>
        )}
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        <AnimatePresence mode="popLayout">
          {visibleRiders.map(rider => (
            <motion.div 
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              key={rider.id} 
              className="bg-white p-6 md:p-8 rounded-[2.5rem] md:rounded-[3.5rem] border-2 border-slate-100 shadow-sm relative overflow-hidden group hover:border-blue-600 transition-all"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="bg-slate-900 text-white w-14 h-14 md:w-16 md:h-16 rounded-2xl md:rounded-[1.5rem] flex items-center justify-center shadow-lg group-hover:bg-blue-600 transition-colors">
                  <Bike size={28} className="md:w-8 md:h-8" />
                </div>
                <div className="flex flex-col items-end">
                  <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[8px] font-black uppercase tracking-widest border border-blue-100">
                    {rider.role || 'Delivery Boy'}
                  </span>
                </div>
              </div>
              
              <div className="space-y-1">
                <h3 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight leading-tight truncate">{rider.name}</h3>
                <p className="text-blue-500 font-bold text-[9px] md:text-[10px] uppercase tracking-widest flex items-center gap-1">
                  <Map size={10} /> {rider.route}
                </p>
              </div>
              
              <div className="space-y-3 pt-6 mt-6 border-t border-slate-50">
                <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Key size={12}/> Login PIN
                  </span>
                  <span className="font-black text-slate-900 text-lg tracking-[0.2em]">{rider.pin}</span>
                </div>
                
                <div className="flex justify-between items-center bg-green-50/50 p-4 rounded-2xl border border-green-100">
                  <span className="text-[9px] font-black text-green-600 uppercase tracking-widest flex items-center gap-2">
                    <Banknote size={12}/> Salary
                  </span>
                  <span className="font-black text-slate-900 text-base">Rs. {formatPKR(rider.salary || 0)}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <motion.button 
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setViewingRouteSheetRiderId(rider.id)} 
                    className="py-3 bg-slate-100 text-slate-600 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-slate-200"
                  >
                    <FileText size={12}/> Route Sheet
                  </motion.button>
                  {isOwner && (
                    <motion.button 
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleOpenEdit(rider)} 
                      className="py-3 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <Edit2 size={12}/> Edit
                    </motion.button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isOwner && (
          <motion.button 
            layout
            whileTap={{ scale: 0.98 }}
            onClick={() => { setEditingRider(null); setFormData({name: '', route: '', pin: '', salary: '', roleName: 'Delivery Boy'}); setIsModalOpen(true); }}
            className="border-4 border-dashed border-slate-200 rounded-[2.5rem] md:rounded-[3.5rem] p-8 md:p-12 flex flex-col items-center justify-center text-slate-300 hover:border-blue-400 hover:text-blue-600 transition-all group active:scale-95 bg-slate-50/50 min-h-[300px]"
          >
            <div className="bg-white p-4 rounded-full shadow-sm group-hover:scale-110 transition-transform">
              <Plus size={32} className="group-hover:rotate-90 transition-transform duration-500" />
            </div>
            <span className="font-black text-xs md:text-sm uppercase tracking-widest mt-4">Add Staff Member</span>
          </motion.button>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[150] flex items-end md:items-center justify-center p-0 md:p-4"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-t-[2.5rem] md:rounded-[3rem] shadow-2xl w-full max-w-xl border-t-8 md:border-8 border-slate-900 overflow-hidden"
            >
              <div className="p-6 md:p-8 bg-slate-900 text-white flex justify-between items-center">
                <div>
                  <h3 className="font-black text-xl md:text-2xl uppercase italic tracking-tighter">{editingRider ? 'Update Profile' : 'New Staff Account'}</h3>
                  <p className="text-slate-500 text-[8px] md:text-[10px] font-black uppercase tracking-widest mt-1">Management Controls</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-all"><X size={20} /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-4 md:space-y-6 max-h-[75vh] overflow-y-auto">
                <div className="space-y-1.5">
                  <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Full Name</label>
                  <input required className="w-full p-4 md:p-5 bg-slate-50 border-4 border-slate-100 rounded-2xl font-black outline-none focus:border-blue-600 transition-all text-sm md:text-base" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Imran Khan" />
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="space-y-1.5">
                      <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Route Name</label>
                      <input required className="w-full p-4 md:p-5 bg-slate-50 border-4 border-slate-100 rounded-2xl font-black outline-none text-sm focus:border-blue-600 transition-all" value={formData.route} onChange={e => setFormData({...formData, route: e.target.value})} placeholder="e.g. Gulberg" />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">4-Digit PIN</label>
                      <input 
                        required 
                        maxLength={4} 
                        inputMode="numeric" 
                        className="w-full p-4 md:p-5 bg-slate-50 border-4 border-slate-100 rounded-2xl font-black outline-none text-center tracking-[0.4em] text-lg focus:border-blue-600 transition-all" 
                        value={formData.pin} 
                        onChange={e => setFormData({...formData, pin: e.target.value.replace(/\D/g, '')})} 
                        placeholder="****" 
                      />
                   </div>
                </div>
                
                <div className="space-y-1.5">
                   <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Monthly Salary (Rs)</label>
                   <div className="relative">
                      <input type="number" required className="w-full pl-12 p-4 md:p-5 bg-slate-50 border-4 border-slate-100 rounded-2xl font-black outline-none text-sm md:text-base focus:border-blue-600 transition-all" value={formData.salary} onChange={e => setFormData({...formData, salary: e.target.value})} placeholder="Rs. 25,000" />
                      <Banknote className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                   </div>
                </div>

                <div className="pt-4">
                  <motion.button 
                    whileTap={{ scale: 0.98 }}
                    type="submit" 
                    disabled={isProcessing || syncStatus === 'saving'}
                    className={`w-full py-5 bg-blue-600 text-white rounded-[1.8rem] font-black uppercase text-xs md:text-sm tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 ${isProcessing || syncStatus === 'saving' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {syncStatus === 'saving' ? 'Saving...' : editingRider ? 'Save Changes' : 'Register Staff'} <BadgeCheck size={18} />
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default React.memo(StaffManagement);
