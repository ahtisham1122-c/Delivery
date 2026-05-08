import React from 'react';
import { X, Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { Customer, PaymentCycle, Rider } from '../../types';

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  editingCustomer: Customer | null;
  formData: any;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  riders: Rider[];
  isTranslating: boolean;
  translateToUrdu: (name: string) => Promise<void>;
}

const CustomerModal: React.FC<CustomerModalProps> = ({
  isOpen, onClose, onSubmit, editingCustomer, formData, setFormData, riders, isTranslating, translateToUrdu
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-2xl overflow-hidden border-8 border-slate-900 animate-in zoom-in-95">
        <div className="p-10 bg-slate-900 text-white flex justify-between items-center">
          <div>
            <h3 className="font-black text-3xl italic tracking-tighter">{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</h3>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.4em] mt-1">Setup Ledger Details</p>
          </div>
          <button onClick={onClose} className="bg-white/10 p-3 rounded-full hover:bg-white/20 transition-all"><X size={24} /></button>
        </div>
        <form onSubmit={onSubmit} className="p-10 space-y-8 overflow-y-auto max-h-[70vh]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Full Name (English)</label>
              <div className="relative">
                <input 
                  required 
                  className="w-full px-8 py-5 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-xl outline-none focus:border-blue-600 transition-all" 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                  onBlur={() => {
                    if (formData.name && !formData.urduName) translateToUrdu(formData.name);
                  }}
                  placeholder="e.g. Ahmed Khan" 
                />
                <button 
                  type="button"
                  onClick={() => translateToUrdu(formData.name)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-blue-100 p-2 rounded-xl text-blue-600 hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                  title="AI Translate to Urdu"
                >
                  {isTranslating ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-blue-500 uppercase tracking-widest ml-2">Urdu Name (Manual or AI)</label>
              <div className="relative">
                <input 
                  dir="rtl" 
                  className={`w-full px-8 py-5 border-4 rounded-3xl font-black text-2xl outline-none transition-all text-right ${isTranslating ? 'bg-blue-50/50 border-blue-200' : 'bg-blue-50 border-blue-100 focus:border-blue-600'}`} 
                  value={formData.urduName} 
                  onChange={e => setFormData({...formData, urduName: e.target.value})} 
                  placeholder="احمد خان" 
                />
                {isTranslating && (
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <Loader2 className="animate-spin text-blue-600" size={24} />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Phone Number</label>
              <input className="w-full px-8 py-5 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-xl outline-none focus:border-blue-600 transition-all" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="03XXXXXXXXX" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Delivery Order</label>
              <input type="number" className="w-full px-8 py-5 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-xl outline-none focus:border-blue-600" value={formData.deliveryOrder} onChange={e => setFormData({...formData, deliveryOrder: e.target.value})} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Delivery Address</label>
            <input className="w-full px-8 py-5 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-xl outline-none focus:border-blue-600 transition-all" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder="House #, Street, Area..." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Payment Cycle</label>
              <select className="w-full px-8 py-5 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-xl outline-none focus:border-blue-600" value={formData.paymentCycle} onChange={e => setFormData({...formData, paymentCycle: e.target.value as PaymentCycle})}>
                {Object.values(PaymentCycle).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Assigned Rider</label>
              <select className="w-full px-8 py-5 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-xl outline-none focus:border-blue-600" value={formData.riderId} onChange={e => setFormData({...formData, riderId: e.target.value})}>
                {riders.map(r => <option key={r.id} value={r.id}>{r.name} ({r.route})</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Custom Price (Opt)</label>
              <input type="number" className="w-full px-8 py-5 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-xl outline-none focus:border-blue-600" value={formData.customPrice} onChange={e => setFormData({...formData, customPrice: e.target.value})} placeholder="Def: 220" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Opening Bal (Rs)</label>
              <input disabled={!!editingCustomer} type="number" className="w-full px-8 py-5 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-xl outline-none focus:border-blue-600 disabled:opacity-50" value={formData.openingBalance} onChange={e => setFormData({...formData, openingBalance: e.target.value})} />
            </div>
          </div>

          <button type="submit" className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-2xl hover:bg-blue-600 transition-all shadow-2xl active:scale-95 flex items-center justify-center gap-4 group">
            {editingCustomer ? 'Update Profile' : 'Save Customer'} <ArrowRight size={32} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default CustomerModal;
