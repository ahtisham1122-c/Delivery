
import React, { useState } from 'react';
import { TrendingUp, Clock, Plus, User, Info, X, Printer, Settings2, Monitor, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PriceRecord, Customer, Delivery } from '../types';
import { generateId } from '../services/dataStore';
import { supabase } from '../services/supabaseClient';

interface PriceManagementProps {
  prices: PriceRecord[];
  setPrices: React.Dispatch<React.SetStateAction<PriceRecord[]>>;
  customers: Customer[];
  deliveries: Delivery[];
  setDeliveries: React.Dispatch<React.SetStateAction<Delivery[]>>;
  onLogAction?: (price: string) => void;
}

const PriceManagement: React.FC<PriceManagementProps> = ({ prices, setPrices, customers, onLogAction }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'pending'>('idle');
  const [printProfile, setPrintProfile] = useState<'A4' | '80' | '58'>('80');
  const [printFontSize, setPrintFontSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [showPrintSettings, setShowPrintSettings] = useState(false);
  const [formData, setFormData] = useState({
    price: '',
    effectiveDate: new Date().toISOString().split('T')[0],
    customerId: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(formData.price);
    if (isNaN(price) || price <= 0) {
        alert("INVALID PRICE: Rate must be greater than 0.");
        return;
    }

    if (isProcessing || syncStatus === 'saving') return;

    // Double-entry prevention: Check if price for this customer/global and date already exists
    const existingPrice = prices.find(p => 
      (p.customerId || '') === (formData.customerId || '') && 
      p.effectiveDate === formData.effectiveDate
    );

    if (existingPrice) {
      alert("PRICE RECORD EXISTS: A price change for this account and date is already recorded.");
      return;
    }

    setIsProcessing(true);
    setSyncStatus('saving');

    const newPrice: PriceRecord = {
      id: generateId(),
      price: price,
      effectiveDate: formData.effectiveDate,
      customerId: formData.customerId || undefined,
      updatedAt: new Date().toISOString(),
      version: 1
    };
    
    let isCloudSuccess = false;
    try {
      const { error: pErr } = await supabase.from('dp_prices').upsert(newPrice);
      if (pErr) throw pErr;
      isCloudSuccess = true;
    } catch (err) {
      console.error("Cloud save failed:", err);
      alert("FATAL: Cloud record could not be sealed. Check internet connection.");
    }

    if (isCloudSuccess) {
      setSyncStatus('saved');
      setPrices(prev => [...prev, newPrice].sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime()));
      
      if (onLogAction) {
        onLogAction(`${formData.price} Rs starting ${formData.effectiveDate}`);
      }
    } else {
      setSyncStatus('idle');
      setIsProcessing(false);
      return;
    }
    
    setTimeout(() => {
      setIsModalOpen(false);
      setIsProcessing(false);
      setSyncStatus('idle');
    }, 500);
  };

  const getCustomerName = (id?: string) => {
    if (!id) return 'Default (All Customers)';
    return customers.find(c => c.id === id)?.name || 'Unknown';
  };

  return (
    <div className="space-y-6">
      {/* THERMAL PRINT DOCUMENT */}
      <div className={`print-only thermal-${printProfile} print-text-${printFontSize} space-y-4 text-slate-900`}>
        <div className="text-center space-y-1">
          <h1 className="font-black text-lg uppercase tracking-tight">Gujjar Milk Shop</h1>
          <p className="font-bold text-[10px]">Price List / ریٹ لسٹ</p>
          <div className="border-dashed-print"></div>
          <div className="flex justify-between font-black text-[10px]">
            <span>Date: {new Date().toLocaleDateString('en-GB')}</span>
            <span>Ref: #{generateId().substring(0, 8).toUpperCase()}</span>
          </div>
          <div className="border-dashed-print"></div>
        </div>

        <div className="space-y-2">
          {prices.map((record, i) => (
            <div key={i} className="flex justify-between items-start text-[10px] border-b border-black/10 pb-1">
              <div className="flex-1">
                <p className="font-black">{getCustomerName(record.customerId)}</p>
                <p className="opacity-70 text-[8px]">From: {new Date(record.effectiveDate).toLocaleDateString('en-GB')}</p>
              </div>
              <div className="text-right font-black">
                Rs.{record.price}
              </div>
            </div>
          ))}
        </div>

        <div className="border-dashed-print pt-4"></div>
        <p className="text-[8px] text-center font-bold opacity-60">
          Official Price List<br/>
          Gujjar Milk Shop HQ
        </p>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-blue-50 border-l-4 border-blue-500 p-5 md:p-6 rounded-r-xl flex items-start gap-4 shadow-sm no-print"
      >
        <Info className="text-blue-500 mt-1 flex-shrink-0" size={24} />
        <div className="space-y-2">
          <h4 className="font-bold text-blue-900 uppercase text-xs tracking-widest">Financial Safeguard Policy</h4>
          <p className="text-sm text-blue-800 leading-relaxed">
            Historical billing data is immutable. All records are maintained with a 100% auditable chain of custody.
          </p>
        </div>
      </motion.div>

      <div className="flex flex-col md:flex-row justify-between items-center gap-4 px-2 pt-4 no-print">
        <div className="flex items-center justify-between w-full md:w-auto gap-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Historical Price Log</h3>
          <div className="flex items-center gap-2">
            <motion.button 
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowPrintSettings(!showPrintSettings)}
              className={`p-2.5 rounded-xl transition-all ${showPrintSettings ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-slate-100 text-slate-400'}`}
            >
              <Settings2 size={16}/>
            </motion.button>
            <motion.button 
              whileTap={{ scale: 0.9 }}
              onClick={() => window.print()} 
              className="p-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all shadow-lg"
            >
              <Printer size={16} />
            </motion.button>
          </div>
        </div>
        <motion.button 
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            setFormData({
              price: '',
              effectiveDate: new Date().toISOString().split('T')[0],
              customerId: ''
            });
            setIsModalOpen(true);
          }}
          className="bg-blue-600 text-white px-6 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-xl shadow-blue-100 w-full md:w-auto"
        >
          <Plus size={16} />
          Record Price Change
        </motion.button>
      </div>

      {/* PRINT SETTINGS PANEL */}
      <AnimatePresence>
        {showPrintSettings && (
          <motion.div 
            initial={{ opacity: 0, height: 0, y: -20 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -20 }}
            className="bg-white p-6 rounded-[2rem] border-2 border-blue-100 shadow-xl no-print space-y-6 overflow-hidden"
          >
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                <div className="space-y-3">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Paper Size / پیپر کا سائز</p>
                   <div className="flex bg-slate-100 p-1 rounded-2xl">
                      <button onClick={() => setPrintProfile('A4')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-[10px] transition-all ${printProfile === 'A4' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}><Monitor size={14}/> A4 Page</button>
                      <button onClick={() => setPrintProfile('80')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-[10px] transition-all ${printProfile === '80' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}><Smartphone size={14}/> 80mm</button>
                      <button onClick={() => setPrintProfile('58')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-[10px] transition-all ${printProfile === '58' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}><Smartphone size={12}/> 58mm</button>
                   </div>
                </div>
                <div className="space-y-3">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Text Size / لکھائی کا سائز</p>
                   <div className="flex bg-slate-100 p-1 rounded-2xl">
                      <button onClick={() => setPrintFontSize('sm')} className={`flex-1 py-3 rounded-xl font-black text-[10px] transition-all ${printFontSize === 'sm' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Small</button>
                      <button onClick={() => setPrintFontSize('md')} className={`flex-1 py-3 rounded-xl font-black text-[10px] transition-all ${printFontSize === 'md' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Normal</button>
                      <button onClick={() => setPrintFontSize('lg')} className={`flex-1 py-3 rounded-xl font-black text-[10px] transition-all ${printFontSize === 'lg' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Large</button>
                   </div>
                </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-3 no-print">
        <AnimatePresence mode="popLayout">
          {prices.map((record) => {
            const isFuture = new Date(record.effectiveDate) > new Date();
            return (
              <motion.div 
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                key={record.id} 
                className="bg-white p-5 rounded-[2rem] border-2 border-slate-100 flex justify-between items-center group hover:border-blue-200 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${record.customerId ? 'bg-blue-50 text-blue-600' : 'bg-indigo-50 text-indigo-600'}`}>
                    {record.customerId ? <User size={24} /> : <TrendingUp size={24} />}
                  </div>
                  <div>
                    <p className="font-black text-slate-900 text-sm md:text-base line-clamp-1">{getCustomerName(record.customerId)}</p>
                    <div className="flex items-center gap-2 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                      <Clock size={10}/> {new Date(record.effectiveDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                      <span className={isFuture ? 'text-amber-600' : 'text-green-600'}>
                        {isFuture ? 'Upcoming' : 'Active'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl md:text-2xl font-black italic tracking-tighter text-slate-900">
                    Rs. {record.price}
                  </p>
                  <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase mt-1">Per Liter</p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
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
              className="bg-white rounded-t-[2.5rem] md:rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden border-t-8 md:border-8 border-slate-900"
            >
              <div className="p-6 md:p-8 bg-slate-900 text-white flex justify-between items-center">
                <div>
                   <h3 className="font-black text-xl md:text-2xl tracking-tighter uppercase italic">Price Update</h3>
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Audit-Safe Change</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="bg-white/10 p-2 rounded-full"><X size={20} /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Target Account</label>
                  <select 
                    className="w-full px-6 py-4 bg-slate-50 border-4 border-slate-100 rounded-2xl font-black outline-none focus:border-blue-600 appearance-none"
                    value={formData.customerId}
                    onChange={e => setFormData({...formData, customerId: e.target.value})}
                  >
                    <option value="">Global (Default)</option>
                    {[...customers].sort((a, b) => (a.deliveryOrder || 0) - (b.deliveryOrder || 0)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Price (Rs/L)</label>
                    <input 
                      type="number"
                      required
                      className="w-full px-6 py-4 bg-slate-50 border-4 border-slate-100 rounded-2xl font-black text-xl md:text-2xl outline-none focus:border-blue-600 text-center"
                      placeholder="210"
                      value={formData.price}
                      onChange={e => setFormData({...formData, price: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Effective Date</label>
                    <input 
                      type="date"
                      required
                      className="w-full px-6 py-4 bg-slate-50 border-4 border-slate-100 rounded-2xl font-black outline-none focus:border-blue-600 text-sm"
                      value={formData.effectiveDate}
                      onChange={e => setFormData({...formData, effectiveDate: e.target.value})}
                    />
                  </div>
                </div>

                <div className="pt-4 flex flex-col gap-3">
                  <motion.button 
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={isProcessing || syncStatus === 'saving'}
                    className={`w-full py-5 bg-blue-600 text-white rounded-[1.8rem] font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all ${isProcessing || syncStatus === 'saving' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {syncStatus === 'saving' ? 'Saving...' : 'Confirm & Lock Price'}
                  </motion.button>
                  <button 
                    type="button" 
                    onClick={() => setIsModalOpen(false)}
                    className="w-full py-3 text-slate-400 font-black uppercase text-[10px] tracking-widest"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PriceManagement;
