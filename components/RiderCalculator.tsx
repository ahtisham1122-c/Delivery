
import React, { useState, useEffect } from 'react';
import { X, Wallet, Minus, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Customer, PriceRecord } from '../types';
import { findPriceForDate } from '../services/dataStore';

interface RiderCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCustomer?: Customer | null;
  prices: PriceRecord[];
  balances: Record<string, number>;
}

const RiderCalculator: React.FC<RiderCalculatorProps> = ({ 
  isOpen, onClose, selectedCustomer, prices, balances 
}) => {
  const [liters, setLiters] = useState<string>('0');
  const [customRate, setCustomRate] = useState<string>('0');
  const [customBalance, setCustomBalance] = useState<string>('0');
  
  const today = new Date().toLocaleDateString('en-CA');

  // Sync with customer data when opened
  useEffect(() => {
    const syncData = () => {
      if (selectedCustomer && isOpen) {
        let rate = 210; // Sensible default fallback for calc UI only
        try {
          rate = findPriceForDate(today, selectedCustomer, prices);
        } catch (e) {
          // Log error internally but don't crash the calculator
          console.warn("Pricing lookup failed for calculator:", e);
        }
        const balance = balances[selectedCustomer.id] || 0;
        setCustomRate(rate.toString());
        setCustomBalance(Math.round(balance).toString());
        setLiters('0'); // Reset input liters for new calculation
      } else if (isOpen) {
        // Default state for generic calculator
        setLiters('0');
        setCustomRate('210');
        setCustomBalance('0');
      }
    };
    
    const t = setTimeout(syncData, 0);
    return () => clearTimeout(t);
  }, [selectedCustomer, isOpen, prices, balances, today]);

  const currentLiters = parseFloat(liters) || 0;
  const currentRate = parseFloat(customRate) || 0;
  const currentBalance = parseFloat(customBalance) || 0;
  const todayBill = currentLiters * currentRate;
  const totalToAsk = Math.round(todayBill + currentBalance);

  const handleNumpad = (val: string) => {
    if (val === 'C') {
      setLiters('0');
    } else if (val === 'back') {
      setLiters(liters.length > 1 ? liters.slice(0, -1) : '0');
    } else {
      setLiters(liters === '0' && val !== '.' ? val : liters + val);
    }
  };

  const addLiters = (val: number) => {
    const current = parseFloat(liters) || 0;
    setLiters((current + val).toString());
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center no-print">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/95 backdrop-blur-xl"
          />
          <motion.div 
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="bg-white w-full max-w-lg rounded-t-[3rem] md:rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh] relative z-10"
          >
            {/* Header */}
            <div className="p-8 bg-blue-600 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-black text-2xl tracking-tighter uppercase italic">Payment Calculator</h3>
                <p className="text-blue-200 text-[10px] font-black uppercase tracking-widest mt-1">
                  {selectedCustomer ? `Customer: ${selectedCustomer.name}` : 'Quick Counter'}
                </p>
              </div>
              <button onClick={onClose} className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Main Display Area */}
              <div className="bg-slate-900 rounded-[2.5rem] p-8 text-center relative overflow-hidden shadow-2xl">
                 <div className="absolute top-0 right-0 p-8 opacity-10"><Wallet size={120} className="text-white"/></div>
                 <div className="relative z-10 space-y-1">
                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">Total Amount to Ask / کل رقم</p>
                    <p className="text-6xl font-black text-white italic tracking-tighter">
                       Rs. {totalToAsk.toLocaleString()}
                    </p>
                    <div className="pt-4 flex justify-center items-center gap-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                       <span className="bg-white/5 px-3 py-1 rounded-lg">{currentLiters}L × {currentRate}</span>
                       <span>+</span>
                       <span className="bg-white/5 px-3 py-1 rounded-lg">Bal {currentBalance}</span>
                    </div>
                 </div>
              </div>

              {/* Quick Increment Buttons */}
              <div className="grid grid-cols-4 gap-3">
                 {[0.5, 1, 2, 5].map(val => (
                   <button 
                     key={val} 
                     onClick={() => addLiters(val)}
                     className="py-4 bg-blue-50 text-blue-600 rounded-2xl font-black text-sm hover:bg-blue-100 active:scale-95 transition-all border border-blue-100"
                   >
                     +{val}L
                   </button>
                 ))}
              </div>

              {/* Input Fields (Small but editable) */}
              <div className="grid grid-cols-3 gap-3">
                 <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Liters</p>
                    <p className="text-lg font-black text-slate-900">{liters}</p>
                 </div>
                 <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Rate</p>
                    <input 
                      type="number" 
                      inputMode="decimal"
                      className="w-full bg-transparent text-center font-black text-lg text-slate-900 outline-none" 
                      value={customRate} 
                      onChange={e => setCustomRate(e.target.value)}
                    />
                 </div>
                 <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Balance</p>
                    <input 
                      type="number" 
                      inputMode="decimal"
                      className="w-full bg-transparent text-center font-black text-lg text-slate-900 outline-none" 
                      value={customBalance} 
                      onChange={e => setCustomBalance(e.target.value)}
                    />
                 </div>
              </div>

              {/* Numpad */}
              <div className="grid grid-cols-3 gap-3 pb-6">
                 {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'].map((key) => (
                   <button 
                     key={key}
                     onClick={() => handleNumpad(key)}
                     className={`h-16 rounded-2xl font-black text-xl transition-all active:scale-90 flex items-center justify-center ${
                       key === 'back' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-slate-100 text-slate-700 border border-slate-200'
                     }`}
                   >
                     {key === 'back' ? <Minus size={20}/> : key}
                   </button>
                 ))}
                 <button 
                    onClick={() => setLiters('0')}
                    className="col-span-2 h-16 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest active:scale-95 transition-all"
                 >
                    Clear Liters
                 </button>
                 <button 
                    onClick={onClose}
                    className="h-16 bg-green-600 text-white rounded-2xl font-black flex items-center justify-center active:scale-95 transition-all shadow-lg"
                 >
                    <Check size={28}/>
                 </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default RiderCalculator;
