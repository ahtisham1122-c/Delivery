import React from 'react';
import { User, UserX, MapPin, MessageCircle, Edit2, Power, RefreshCcw } from 'lucide-react';
import { Customer, Rider } from '../../types';

interface CustomerRowProps {
  customer: Customer;
  balance: number;
  rider: Rider | undefined;
  isOwner: boolean;
  onEdit: (c: Customer) => void;
  onToggleStatus: (c: Customer) => void;
  onShareWhatsApp: (c: Customer) => void;
}

const CustomerRow: React.FC<CustomerRowProps> = ({ 
  customer, 
  balance, 
  rider, 
  isOwner, 
  onEdit, 
  onToggleStatus, 
  onShareWhatsApp 
}) => {
  const isAdvance = balance < -0.01;

  return (
    <div className={`bg-white p-8 rounded-[3.5rem] border-4 shadow-sm relative overflow-hidden group transition-all hover:shadow-2xl ${!customer.active ? 'border-red-100 bg-red-50/10' : 'border-slate-100 hover:border-blue-600'}`}>
      <div className="flex justify-between items-start mb-6">
        <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-xl text-white ${!customer.active ? 'bg-red-500' : 'bg-slate-900'}`}>
          {customer.active ? <User size={32} /> : <UserX size={32} />}
        </div>
        <div className="flex flex-col items-end gap-2">
           <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${customer.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {customer.active ? 'Active' : 'Stopped'}
          </span>
          {isAdvance && (
            <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-100 text-blue-700">
              Advance / ایڈوانس
            </span>
          )}
          <p className="text-[10px] font-black text-slate-400 mt-1 uppercase">Route ID: {customer.deliveryOrder}</p>
        </div>
      </div>

      <div className="space-y-1">
        <h3 className={`text-2xl font-black truncate ${!customer.active ? 'text-red-900 opacity-60' : 'text-slate-900'}`}>{customer.name}</h3>
        {customer.urduName && (
          <p className="text-3xl font-bold text-blue-600 text-right" dir="rtl">{customer.urduName}</p>
        )}
      </div>
      <p className="text-xs font-bold text-slate-400 flex items-center gap-2 mt-2">
        <MapPin size={12} className="text-blue-500" /> {customer.address || 'No address saved'}
      </p>

      <div className={`mt-6 p-6 rounded-3xl border flex justify-between items-center transition-colors ${isAdvance ? 'bg-blue-50/50 border-blue-100' : 'bg-slate-50 border-slate-100 group-hover:bg-slate-100'}`}>
         <div>
           <p className={`text-[10px] font-black uppercase tracking-widest ${isAdvance ? 'text-blue-400' : 'text-slate-400'}`}>
             {isAdvance ? 'Advance Credit' : 'Net Balance'}
           </p>
           <p className={`text-2xl font-black mt-1 ${isAdvance ? 'text-blue-600' : (balance > 0.01 ? 'text-red-600' : 'text-green-600')}`}>
            Rs. {Math.abs(Math.round(balance)).toLocaleString()}
           </p>
         </div>
         <div className="text-right">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rider</p>
            <p className="font-bold text-slate-700 text-xs">{rider?.name || 'Unassigned'}</p>
         </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4">
        <button 
          onClick={() => onShareWhatsApp(customer)}
          className="flex items-center justify-center gap-2 py-4 bg-green-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-green-600 transition-all shadow-lg active:scale-95"
        >
          <MessageCircle size={16} /> Share Khata
        </button>
        {isOwner && (
          <button 
            onClick={() => onEdit(customer)}
            className="flex items-center justify-center gap-2 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-sm active:scale-95"
          >
            <Edit2 size={16} /> Edit
          </button>
        )}
      </div>
      
      {isOwner && (
        <button 
          onClick={() => onToggleStatus(customer)}
          className={`mt-4 w-full py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${customer.active ? 'bg-red-50 text-red-600 hover:bg-red-600 hover:text-white' : 'bg-green-50 text-green-600 hover:bg-green-600 hover:text-white'}`}
        >
          {customer.active ? <><Power size={14}/> Stop Delivery</> : <><RefreshCcw size={14}/> Resume Service</>}
        </button>
      )}
    </div>
  );
};

export default CustomerRow;
