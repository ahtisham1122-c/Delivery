import React, { useState, useMemo } from 'react';
import { Search, UserPlus, Archive } from 'lucide-react';
import * as ReactWindow from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { Customer, Rider, Delivery, UserRole } from '../../types';
import { getCycleBoundaries } from '../../services/ledgerUtils';
import { GoogleGenAI } from "@google/genai";
import CustomerRow from './CustomerRow';
import CustomerModal from './CustomerModal';

const { FixedSizeList } = ReactWindow as any;

interface CustomerManagementProps {
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  riders: Rider[];
  deliveries: Delivery[];
  payments: Payment[];
  balances: Record<string, number>;
  role: UserRole;
  riderFilterId: string;
}

const CustomerManagement: React.FC<CustomerManagementProps> = ({ 
  customers = [], 
  setCustomers, 
  riders = [], 
  deliveries = [],
  balances = {}, 
  role,
  riderFilterId
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  
  const isOwner = role === UserRole.OWNER;
  
  const riderMap = useMemo(() => {
    const map = new Map<string, Rider>();
    riders.forEach(r => map.set(r.id, r));
    return map;
  }, [riders]);

  const [formData, setFormData] = useState({
    name: '',
    urduName: '',
    phone: '',
    address: '',
    paymentCycle: PaymentCycle.MONTHLY,
    riderId: riders[0]?.id || '',
    customPrice: '',
    openingBalance: '0',
    deliveryOrder: '10' 
  });

  const translateToUrdu = async (englishName: string) => {
    if (!englishName || englishName.trim().length < 2) return;
    
    setIsTranslating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Translate this Pakistani person's name or shop name from English to Urdu script. Return ONLY the Urdu text, no extra words, no phonetic symbols, and no punctuation.
        Examples:
        "Muhammad Arshad" -> "محمد ارشد"
        "Baji Parveen" -> "باجی پروین"
        "Fauji Canteen" -> "فوجی کینٹین"
        Name: "${englishName}"`,
      });
      
      const translatedText = response.text?.trim();
      if (translatedText) {
        setFormData(prev => ({ ...prev, urduName: translatedText }));
      }
    } catch (error) {
      console.error("Translation failed:", error);
    } finally {
      setIsTranslating(false);
    }
  };

  const resetForm = () => {
    setFormData({ 
      name: '', 
      urduName: '',
      phone: '', 
      address: '', 
      paymentCycle: PaymentCycle.MONTHLY, 
      riderId: riders[0]?.id || '', 
      customPrice: '', 
      openingBalance: '0', 
      deliveryOrder: '10' 
    });
    setEditingCustomer(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setModalOpen(true);
  };

  const handleOpenEdit = React.useCallback((customer: Customer) => {
    if (!isOwner) return;
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      urduName: customer.urduName || '',
      phone: customer.phone || '',
      address: customer.address || '',
      paymentCycle: customer.paymentCycle,
      riderId: customer.riderId,
      customPrice: customer.customPrice?.toString() || '',
      openingBalance: customer.openingBalance.toString(),
      deliveryOrder: customer.deliveryOrder.toString()
    });
    setModalOpen(true);
  }, [isOwner]);

  const toggleCustomerStatus = React.useCallback((customer: Customer) => {
    if (!isOwner) return;
    const newStatus = !customer.active;
    const confirmMsg = newStatus 
      ? `Reactivate delivery for ${customer.name}? They will appear on the rider's list again.`
      : `STOP delivery for ${customer.name}? \n\nNOTE: They will remain in this list until their balance is Rs. 0.`;
    
    if (window.confirm(confirmMsg)) {
      setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, active: newStatus, updatedAt: new Date().toISOString() } : c));
    }
  }, [isOwner, setCustomers]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) return;
    if (editingCustomer) {
      setCustomers(customers.map(c => c.id === editingCustomer.id ? {
        ...c,
        name: formData.name,
        urduName: formData.urduName || undefined,
        phone: formData.phone || undefined,
        address: formData.address || undefined,
        paymentCycle: formData.paymentCycle,
        riderId: formData.riderId,
        customPrice: formData.customPrice ? parseFloat(formData.customPrice) : undefined,
        deliveryOrder: parseInt(formData.deliveryOrder) || 10,
        updatedAt: new Date().toISOString()
      } : c));
    } else {
      const newCustomer: Customer = {
        id: generateId(),
        name: formData.name,
        urduName: formData.urduName || undefined,
        phone: formData.phone || undefined,
        address: formData.address || undefined,
        paymentCycle: formData.paymentCycle,
        riderId: formData.riderId,
        customPrice: formData.customPrice ? parseFloat(formData.customPrice) : undefined,
        openingBalance: parseFloat(formData.openingBalance || '0'),
        deliveryOrder: parseInt(formData.deliveryOrder) || 10,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 0
      };
      setCustomers([...customers, newCustomer]);
    }
    setModalOpen(false);
    resetForm();
  };

  const shareKhataOnWhatsApp = React.useCallback((customer: Customer) => {
    if (!customer.phone) {
      alert("No phone number found for this customer.");
      return;
    }
    
    const now = new Date();
    const currentCycle = getCycleBoundaries(now, customer.paymentCycle);
    const previousCycleDate = new Date(currentCycle.start);
    previousCycleDate.setDate(previousCycleDate.getDate() - 1);
    const previousCycle = getCycleBoundaries(previousCycleDate, customer.paymentCycle);

    const previousCycleDeliveries = (deliveries || []).filter(d => {
      const dDate = new Date(d.date);
      dDate.setHours(0,0,0,0);
      return d.customerId === customer.id && dDate >= previousCycle.start && dDate <= previousCycle.end;
    });

    const currentAndFutureDeliveries = (deliveries || []).filter(d => {
      const dDate = new Date(d.date);
      dDate.setHours(0,0,0,0);
      return d.customerId === customer.id && dDate > previousCycle.end;
    });

    const totalLiters = previousCycleDeliveries.reduce((acc, d) => acc + (d.liters || 0), 0);
    const milkAmount = Math.round(previousCycleDeliveries.reduce((a, b) => a + (b.totalAmount || 0), 0));
    const currentAndFutureMilkAmount = currentAndFutureDeliveries.reduce((a, b) => a + (b.totalAmount || 0), 0);

    const overallBalance = balances[customer.id] || 0;
    const netTotal = Math.round(overallBalance - currentAndFutureMilkAmount);
    const remainingBalance = Math.round(netTotal - milkAmount);

    const formatDate = (d: Date) => d.toLocaleDateString('en-GB').replace(/\//g, '-');
    const periodStr = `${formatDate(previousCycle.start)} to ${formatDate(previousCycle.end)}`;

    const message = netTotal > 0 
      ? `*Gujjar Milk Shop - Khata Summary*%0A----------------------------%0A*Customer:* ${customer.name}%0A*Period:* ${periodStr}%0A*Total Milk:* ${totalLiters.toFixed(1)}L%0A*Milk Amount:* Rs. ${milkAmount.toLocaleString()}%0A*Previous Dues:* Rs. ${remainingBalance.toLocaleString()}%0A*Total Amount:* Rs. ${netTotal.toLocaleString()}%0A----------------------------%0AAssalam-o-Alaikum! Aapka Gujjar Milk Shop balance Rs. ${netTotal.toLocaleString()} hai. Bara-e-meherbani payment clear karain. Shukriya!`
      : `*Gujjar Milk Shop - Khata Summary*%0A----------------------------%0A*Customer:* ${customer.name}%0A*Period:* ${periodStr}%0A*Total Milk:* ${totalLiters.toFixed(1)}L%0A*Milk Amount:* Rs. ${milkAmount.toLocaleString()}%0A*Advance Credit:* Rs. ${Math.abs(netTotal).toLocaleString()}%0A----------------------------%0AAssalam-o-Alaikum! Aapka milk shop mein advance Rs. ${Math.abs(netTotal).toLocaleString()} jama hai. Shukriya!`;
    
    const cleanPhone = customer.phone.replace(/[^0-9]/g, '');
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${message}`;
    window.open(whatsappUrl, '_blank');
  }, [balances, deliveries]);

  const filteredCustomers = useMemo(() => (customers || []).filter(c => {
    const matchesRider = riderFilterId === 'all' ? true : c.riderId === riderFilterId;
    if (!matchesRider) return false;

    const balance = balances[c.id] || 0;
    const isRelevant = c.active || Math.abs(balance) > 0.01;
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (c.urduName && c.urduName.includes(searchTerm)) ||
                          (c.phone && c.phone.includes(searchTerm));
    
    return matchesSearch && (showArchived ? true : isRelevant);
  }).sort((a, b) => a.deliveryOrder - b.deliveryOrder), [customers, riderFilterId, balances, searchTerm, showArchived]);

  const Row = React.memo(({ index, style, data }: { index: number, style: React.CSSProperties, data: any }) => {
    const { filteredCustomers, balances, riderMap, isOwner, handleOpenEdit, toggleCustomerStatus, shareKhataOnWhatsApp } = data;
    const customer = filteredCustomers[index];
    if (!customer) return null;
    return (
      <div style={{ ...style, padding: '10px' }}>
        <CustomerRow 
          customer={customer}
          balance={balances[customer.id] || 0}
          rider={riderMap.get(customer.riderId)}
          isOwner={isOwner}
          onEdit={handleOpenEdit}
          onToggleStatus={toggleCustomerStatus}
          onShareWhatsApp={shareKhataOnWhatsApp}
        />
      </div>
    );
  });

  const itemData = useMemo(() => ({
    filteredCustomers,
    balances,
    riderMap,
    isOwner,
    handleOpenEdit,
    toggleCustomerStatus,
    shareKhataOnWhatsApp
  }), [filteredCustomers, balances, riderMap, isOwner, handleOpenEdit, toggleCustomerStatus, shareKhataOnWhatsApp]);

  return (
    <div className="space-y-8 h-full flex flex-col">
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200 no-print">
        <div className="relative w-full md:max-w-xl">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={24} />
          <input
            type="text"
            placeholder="Search Customers..."
            className="w-full pl-16 pr-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-blue-600 transition-all font-bold"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button 
            onClick={() => setShowPrintSettings(!showPrintSettings)}
            className={`p-4 rounded-3xl transition-all ${showPrintSettings ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}
          >
            <Settings2 size={20}/>
          </button>
          <button onClick={() => window.print()} className="p-4 bg-slate-900 text-white rounded-3xl hover:bg-slate-800 transition-all">
            <Printer size={20} />
          </button>
          {isOwner && (
            <button 
              onClick={() => setShowArchived(!showArchived)}
              className={`flex items-center gap-2 px-6 py-4 rounded-3xl font-black uppercase text-xs tracking-widest transition-all ${showArchived ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}
            >
              <Archive size={18} /> {showArchived ? 'Hide Archived' : 'View Archived'}
            </button>
          )}
          {isOwner && (
            <button 
              onClick={handleOpenAdd}
              className="flex items-center gap-3 bg-blue-600 text-white px-8 py-4 rounded-3xl font-black uppercase text-xs tracking-widest hover:bg-slate-900 transition-all shadow-xl shadow-blue-200 flex-1 md:flex-none justify-center"
            >
              <UserPlus size={18} /> Add New
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-[600px]">
        {filteredCustomers.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-[3.5rem] border-4 border-dashed border-slate-100">
            <User className="mx-auto text-slate-200 mb-4" size={64} />
            <p className="font-black text-slate-300 uppercase tracking-widest">No customers found</p>
          </div>
        ) : (
          <AutoSizer>
            {({ height, width }) => (
              <FixedSizeList
                height={height}
                itemCount={filteredCustomers.length}
                itemSize={550}
                width={width}
                itemData={itemData}
                itemKey={(index, data) => data.filteredCustomers[index].id}
                className="scrollbar-hide"
              >
                {Row}
              </FixedSizeList>
            )}
          </AutoSizer>
        )}
      </div>

      <CustomerModal 
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        editingCustomer={editingCustomer}
        formData={formData}
        setFormData={setFormData}
        riders={riders}
        isTranslating={isTranslating}
        translateToUrdu={translateToUrdu}
      />
    </div>
  );
};

export default React.memo(CustomerManagement);
