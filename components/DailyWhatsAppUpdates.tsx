import React, { useState, useMemo } from 'react';
import { Customer, Delivery, Payment, Rider } from '../types';
import { MessageCircle, Calendar, Search } from 'lucide-react';
import { formatPKR } from '../services/dataStore';

interface DailyWhatsAppUpdatesProps {
  customers: Customer[];
  deliveries: Delivery[];
  payments: Payment[];
  riders: Rider[];
  riderFilterId: string;
}

const DailyWhatsAppUpdates: React.FC<DailyWhatsAppUpdatesProps> = ({
  customers,
  deliveries,
  payments,
  riders,
  riderFilterId
}) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [searchTerm, setSearchTerm] = useState('');

  // Filter deliveries and payments for the selected date
  const dailyData = useMemo(() => {
    const dataByCustomer: Record<string, { liters: number; milkAmount: number; paymentAmount: number }> = {};

    deliveries.forEach(d => {
      if (d.date === selectedDate && !d.isAdjustment && !d.deleted) {
        if (!dataByCustomer[d.customerId]) {
          dataByCustomer[d.customerId] = { liters: 0, milkAmount: 0, paymentAmount: 0 };
        }
        dataByCustomer[d.customerId].liters += d.liters || 0;
        dataByCustomer[d.customerId].milkAmount += d.totalAmount || 0;
      }
    });

    payments.forEach(p => {
      if (p.date === selectedDate && !p.isAdjustment && !p.deleted) {
        if (!dataByCustomer[p.customerId]) {
          dataByCustomer[p.customerId] = { liters: 0, milkAmount: 0, paymentAmount: 0 };
        }
        dataByCustomer[p.customerId].paymentAmount += p.amount || 0;
      }
    });

    return dataByCustomer;
  }, [deliveries, payments, selectedDate]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      // Must have activity today
      if (!dailyData[c.id]) return false;
      
      // Rider filter
      const matchesRider = riderFilterId === 'all' ? true : c.riderId === riderFilterId;
      if (!matchesRider) return false;

      // Search filter
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (c.phone && c.phone.includes(searchTerm));
      if (!matchesSearch) return false;

      return true;
    });
  }, [customers, dailyData, riderFilterId, searchTerm]);

  const sendWhatsApp = (customer: Customer) => {
    if (!customer.phone) {
      alert("No phone number found for this customer.");
      return;
    }

    const data = dailyData[customer.id];
    if (!data) return;

    const formattedDate = new Date(selectedDate).toLocaleDateString('en-GB').replace(/\//g, '-');
    
    let message = `*Gujjar Milk Shop - Daily Update*%0A----------------------------%0A*Date:* ${formattedDate}%0A*Customer:* ${customer.name}%0A`;
    
    if (data.liters > 0) {
      message += `*Milk Received:* ${data.liters.toFixed(1)}L (Rs. ${formatPKR(data.milkAmount)})%0A`;
    }
    
    if (data.paymentAmount > 0) {
      message += `*Payment Received:* Rs. ${formatPKR(data.paymentAmount)}%0A`;
    }
    
    message += `----------------------------%0AAssalam-o-Alaikum! Aaj ki entry update kar di gayi hai. Shukriya!`;

    const cleanPhone = customer.phone.replace(/[^0-9]/g, '');
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${message}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6 pb-32">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">Daily Updates</h1>
          <p className="text-slate-500 font-medium">Send daily milk and payment updates via WhatsApp</p>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <div className="flex items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border-2 border-slate-100">
            <Calendar className="text-blue-600 ml-2" size={20} />
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none focus:ring-0 font-black text-slate-700 cursor-pointer"
            />
          </div>
          {filteredCustomers.length > 0 && (
            <button 
              onClick={() => {
                if (confirm(`Are you sure you want to send WhatsApp updates to all ${filteredCustomers.length} customers?`)) {
                  filteredCustomers.forEach((customer, index) => {
                    setTimeout(() => sendWhatsApp(customer), index * 1000);
                  });
                }
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-blue-700 transition-all"
            >
              Send All ({filteredCustomers.length})
            </button>
          )}
        </div>
      </div>

      <p className="text-[10px] text-slate-400 italic">Note: Browser may block multiple popups. Please allow popups for this site.</p>

      <div className="bg-white p-4 rounded-[2rem] shadow-xl shadow-slate-200/50 border-4 border-slate-50 flex items-center gap-4">
        <Search className="text-slate-400" size={24} />
        <input 
          type="text" 
          placeholder="Search customers by name or phone..." 
          className="flex-1 bg-transparent border-none focus:ring-0 text-lg font-medium placeholder:text-slate-300"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="space-y-4">
        {filteredCustomers.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-[2rem] border-2 border-dashed border-slate-200">
            <MessageCircle className="mx-auto text-slate-300 mb-4" size={48} />
            <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest">No Activity Found</h3>
            <p className="text-slate-500 mt-2">No deliveries or payments recorded for this date.</p>
          </div>
        ) : (
          filteredCustomers.map(customer => {
            const data = dailyData[customer.id];
            const rider = riders.find(r => r.id === customer.riderId);
            
            return (
              <div key={customer.id} className="bg-white p-5 rounded-[2rem] shadow-sm border-2 border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all hover:border-blue-200 hover:shadow-md">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">{customer.name}</h3>
                    {rider && (
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-wider">
                        {rider.name}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4 mt-2">
                    {data.liters > 0 && (
                      <div className="flex items-center gap-2 text-blue-700 bg-blue-50 px-3 py-1.5 rounded-xl">
                        <span className="text-xs font-bold uppercase">Milk:</span>
                        <span className="font-black">{data.liters.toFixed(1)}L (Rs. {formatPKR(data.milkAmount)})</span>
                      </div>
                    )}
                    {data.paymentAmount > 0 && (
                      <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl">
                        <span className="text-xs font-bold uppercase">Paid:</span>
                        <span className="font-black">Rs. {formatPKR(data.paymentAmount)}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <button 
                  onClick={() => sendWhatsApp(customer)}
                  disabled={!customer.phone}
                  className={`flex items-center gap-2 px-6 py-4 rounded-2xl font-black uppercase text-sm tracking-wider transition-all shadow-lg active:scale-95 flex-shrink-0 w-full md:w-auto justify-center
                    ${customer.phone 
                      ? 'bg-[#25D366] text-white hover:bg-[#1ebd5b] hover:shadow-[#25D366]/30' 
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'}`}
                >
                  <MessageCircle size={20} />
                  {customer.phone ? 'Send Update' : 'No Phone'}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DailyWhatsAppUpdates;
