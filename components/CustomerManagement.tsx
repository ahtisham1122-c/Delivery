import React, { useState, useMemo } from 'react';
import { 
  Search, UserX, MapPin, Edit2, X, 
  UserPlus, User, ArrowRight, 
  MessageCircle, Sparkles, Loader2,
  Archive, RefreshCcw, Power, Printer, Settings2, Monitor, Smartphone, Phone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Customer, PaymentCycle, Rider, Delivery, Payment, UserRole } from '../types';
import { generateId } from '../services/dataStore';
import { getCycleBoundaries } from '../services/ledgerUtils';
import { supabase } from '../services/supabaseClient';
import { relationalDataService } from '../services/relationalDataService';
import { GoogleGenAI } from "@google/genai";

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

const CustomerRow = React.memo(React.forwardRef<HTMLDivElement, { 
  customer: Customer, 
  balance: number, 
  rider: Rider | undefined, 
  isOwner: boolean, 
  isProcessing: boolean,
  syncStatus: string,
  onEdit: (c: Customer) => void, 
  onToggleStatus: (c: Customer) => void, 
  onShareWhatsApp: (c: Customer) => void 
}>((props, ref) => {
  const { customer, balance, rider, isOwner, isProcessing, syncStatus, onEdit, onToggleStatus, onShareWhatsApp } = props;
  const isAdvance = balance < -0.01;

  return (
    <motion.div 
      ref={ref}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`bg-white p-4 sm:p-6 xl:p-7 rounded-[2rem] xl:rounded-[2.5rem] border-2 sm:border-4 shadow-sm relative overflow-hidden group transition-all hover:shadow-xl ${!customer.active ? 'border-red-100 bg-red-50/10' : 'border-slate-100 hover:border-blue-600'}`}
    >
      <div className="flex justify-between items-start gap-3 mb-5">
        <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex shrink-0 items-center justify-center shadow-lg text-white ${!customer.active ? 'bg-red-500' : 'bg-slate-900'}`}>
          {customer.active ? <User size={26} /> : <UserX size={26} />}
        </div>
        <div className="flex flex-col items-end gap-2 min-w-0">
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
        <h3 className={`text-xl sm:text-2xl font-black truncate ${!customer.active ? 'text-red-900 opacity-60' : 'text-slate-900'}`}>{customer.name}</h3>
        {customer.urduName && (
          <p className="text-2xl sm:text-3xl font-bold text-blue-600 text-right leading-tight" dir="rtl">{customer.urduName}</p>
        )}
      </div>
      <p className="text-xs font-bold text-slate-400 flex items-center gap-2 mt-2">
        <MapPin size={12} className="text-blue-500" /> {customer.address || 'No address saved'}
      </p>

      <div className={`mt-5 p-4 sm:p-5 rounded-3xl border flex justify-between items-center gap-3 transition-colors ${isAdvance ? 'bg-blue-50/50 border-blue-100' : 'bg-slate-50 border-slate-100 group-hover:bg-slate-100'}`}>
         <div>
           <p className={`text-[10px] font-black uppercase tracking-widest ${isAdvance ? 'text-blue-400' : 'text-slate-400'}`}>
             {isAdvance ? 'Advance Credit' : 'Net Balance'}
           </p>
           <p className={`text-xl sm:text-2xl font-black mt-1 ${isAdvance ? 'text-blue-600' : (balance > 0.01 ? 'text-red-600' : 'text-green-600')}`}>
            Rs. {Math.abs(Math.round(balance)).toLocaleString()}
           </p>
         </div>
         <div className="text-right min-w-0">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rider</p>
            <p className="font-bold text-slate-700 text-xs truncate">{rider?.name || 'Unassigned'}</p>
         </div>
      </div>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button 
          onClick={() => onShareWhatsApp(customer)}
          className="flex items-center justify-center gap-2 py-3.5 bg-green-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-green-600 transition-all shadow-lg active:scale-95"
        >
          <MessageCircle size={16} /> Share Khata
        </button>
        {isOwner && (
          <button 
            onClick={() => onEdit(customer)}
            className="flex items-center justify-center gap-2 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-sm active:scale-95"
          >
            <Edit2 size={16} /> Edit
          </button>
        )}
      </div>
      
      {isOwner && (
        <button 
          onClick={() => onToggleStatus(customer)}
          disabled={isProcessing || syncStatus === 'saving'}
          className={`mt-3 w-full py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${customer.active ? 'bg-red-50 text-red-600 hover:bg-red-600 hover:text-white' : 'bg-green-50 text-green-600 hover:bg-green-600 hover:text-white'} ${isProcessing || syncStatus === 'saving' ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {syncStatus === 'saving' ? <><Loader2 size={14} className="animate-spin"/> Processing...</> : (customer.active ? <><Power size={14}/> Stop Delivery</> : <><RefreshCcw size={14}/> Resume Service</>)}
        </button>
      )}
    </motion.div>
  );
}));

const CustomerManagement: React.FC<CustomerManagementProps> = ({ 
  customers = [], 
  setCustomers, 
  riders = [], 
  balances = {}, 
  role,
  riderFilterId
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'pending'>('idle');
  const [showArchived, setShowArchived] = useState(false);
  const [statusView, setStatusView] = useState<'all' | 'active' | 'due' | 'advance' | 'stopped'>('all');
  const [printProfile, setPrintProfile] = useState<'A4' | '80' | '58'>('80');
  const [printFontSize, setPrintFontSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [showPrintSettings, setShowPrintSettings] = useState(false);
  
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

  React.useEffect(() => {
    if (!formData.riderId && riders.length > 0) {
      setFormData(prev => ({ ...prev, riderId: riders[0].id }));
    }
  }, [formData.riderId, riders]);

  const translateToUrdu = async (englishName: string) => {
    if (!englishName || englishName.trim().length < 2) return;
    
    setIsTranslating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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

  const handleOpenEdit = (customer: Customer) => {
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
  };

  const toggleCustomerStatus = async (customer: Customer) => {
    if (!isOwner) return;
    if (isProcessing || syncStatus === 'saving') return;
    
    const newStatus = !customer.active;
    const confirmMsg = newStatus 
      ? `Reactivate delivery for ${customer.name}? They will appear on the rider's list again.`
      : `STOP delivery for ${customer.name}? \n\nNOTE: They will remain in this list until their balance is Rs. 0.`;
    
    if (window.confirm(confirmMsg)) {
      setIsProcessing(true);
      setSyncStatus('saving');
      
      const updatedCustomer = { 
        ...customer, 
        active: newStatus, 
        updatedAt: new Date().toISOString(),
        version: (customer.version || 0) + 1
      };
      
      let isCloudSuccess = false;
      let cloudErrorMsg = '';
      try {
        const { error: cErr } = await supabase.from('dp_customers').upsert(relationalDataService.toSnakeCase(updatedCustomer));
        if (cErr) throw cErr;
        isCloudSuccess = true;
      } catch (err: any) {
        console.error("Cloud save failed:", err);
        cloudErrorMsg = err?.message || String(err);
      }

      if (isCloudSuccess) {
        setSyncStatus('saved');
        setCustomers(customers.map(c => c.id === customer.id ? updatedCustomer : c));
      } else {
        setSyncStatus('idle');
        setIsProcessing(false);
        if (cloudErrorMsg.includes('Concurrency Conflict')) {
          alert('RECORD ALREADY CHANGED: Another user edited this customer. Please refresh to see latest data.');
        } else {
          alert("SYNC FAILURE: Status change not pushed to cloud. Please reconnect.");
        }
        return;
      }
      
      setTimeout(() => {
        setIsProcessing(false);
        setSyncStatus('idle');
      }, 500);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) return;
    if (isProcessing || syncStatus === 'saving') return;

    const selectedRiderId = formData.riderId || riders[0]?.id || '';
    if (!selectedRiderId) {
      alert("PROFILE NOT SAVED: Please create or load at least one rider before adding a customer.");
      return;
    }
    
    setIsProcessing(true);
    setSyncStatus('saving');

    let updatedCustomer: Customer;

    if (editingCustomer) {
      updatedCustomer = {
        ...editingCustomer,
        name: formData.name,
        urduName: formData.urduName || undefined,
        phone: formData.phone || undefined,
        address: formData.address || undefined,
        paymentCycle: formData.paymentCycle,
        riderId: selectedRiderId,
        customPrice: formData.customPrice ? parseFloat(formData.customPrice) : undefined,
        deliveryOrder: parseInt(formData.deliveryOrder) || 10,
        updatedAt: new Date().toISOString(),
        version: (editingCustomer.version || 0) + 1
      };
    } else {
      updatedCustomer = {
        id: generateId(),
        name: formData.name,
        urduName: formData.urduName || undefined,
        phone: formData.phone || undefined,
        address: formData.address || undefined,
        paymentCycle: formData.paymentCycle,
        riderId: selectedRiderId,
        customPrice: formData.customPrice ? parseFloat(formData.customPrice) : undefined,
        openingBalance: parseFloat(formData.openingBalance || '0'),
        deliveryOrder: parseInt(formData.deliveryOrder) || 10,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };
    }

    let isCloudSuccess = false;
    let cloudErrorMsg = '';
    try {
      const { error: cErr } = await supabase.from('dp_customers').upsert(relationalDataService.toSnakeCase(updatedCustomer));
      if (cErr) throw cErr;
      isCloudSuccess = true;
    } catch (err: any) {
      console.error("Cloud save failed:", err);
      cloudErrorMsg = err?.message || String(err);
    }

    if (isCloudSuccess) {
      setSyncStatus('saved');
      if (editingCustomer) {
        setCustomers(customers.map(c => c.id === editingCustomer.id ? updatedCustomer : c));
      } else {
        setCustomers([...customers, updatedCustomer]);
      }
    } else {
      setSyncStatus('idle');
      setIsProcessing(false);
      if (cloudErrorMsg.includes('Concurrency Conflict')) {
        alert('RECORD ALREADY CHANGED: Another user edited this customer. Please refresh to see latest data.');
      } else {
        alert(`PROFILE SYNC FAILED: Information not committed to cloud.\n\n${cloudErrorMsg || 'Please reconnect and try again.'}`);
      }
      return;
    }

    setTimeout(() => {
      setModalOpen(false);
      resetForm();
      setIsProcessing(false);
      setSyncStatus('idle');
    }, 500);
  };

  const shareKhataOnWhatsApp = (customer: Customer) => {
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
  };

  const scopedCustomers = useMemo(() => (customers || []).filter(c => (
    riderFilterId === 'all' ? true : c.riderId === riderFilterId
  )), [customers, riderFilterId]);

  const customerStats = useMemo(() => {
    return scopedCustomers.reduce((acc, customer) => {
      const balance = balances[customer.id] || 0;
      if (customer.active) acc.active += 1;
      if (!customer.active) acc.stopped += 1;
      if (balance > 0.01) acc.due += 1;
      if (balance < -0.01) acc.advance += 1;
      return acc;
    }, { total: scopedCustomers.length, active: 0, stopped: 0, due: 0, advance: 0 });
  }, [scopedCustomers, balances]);

  const filteredCustomers = scopedCustomers.filter(c => {
    const balance = balances[c.id] || 0;
    const isRelevant = c.active || Math.abs(balance) > 0.01 || statusView === 'stopped';
    const matchesStatus =
      statusView === 'all' ||
      (statusView === 'active' && c.active) ||
      (statusView === 'due' && balance > 0.01) ||
      (statusView === 'advance' && balance < -0.01) ||
      (statusView === 'stopped' && !c.active);
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (c.urduName && c.urduName.includes(searchTerm)) ||
                          (c.phone && c.phone.includes(searchTerm)) ||
                          (c.address && c.address.toLowerCase().includes(searchTerm.toLowerCase()));
    
    return matchesSearch && matchesStatus && (showArchived ? true : isRelevant);
  }).sort((a, b) => (a.deliveryOrder || 0) - (b.deliveryOrder || 0));

  const statusFilters = [
    { id: 'all', label: 'All', value: customerStats.total },
    { id: 'active', label: 'Active', value: customerStats.active },
    { id: 'due', label: 'Due', value: customerStats.due },
    { id: 'advance', label: 'Advance', value: customerStats.advance },
    { id: 'stopped', label: 'Stopped', value: customerStats.stopped },
  ] as const;

  return (
    <div className="space-y-8">
      {/* THERMAL PRINT DOCUMENT */}
      <div className={`print-only thermal-${printProfile} print-text-${printFontSize} space-y-4 text-slate-900`}>
        <div className="text-center space-y-1">
          <h1 className="font-black text-lg uppercase tracking-tight">Gujjar Milk Shop</h1>
          <p className="font-bold text-[10px]">Customer Route List</p>
          <div className="border-dashed-print"></div>
          <div className="flex justify-between font-black text-[10px]">
            <span>Date: {new Date().toLocaleDateString('en-GB')}</span>
            <span>Route: {riderFilterId === 'all' ? 'All Routes' : riders.find(r => r.id === riderFilterId)?.name}</span>
          </div>
          <div className="border-dashed-print"></div>
        </div>

        <div className="space-y-2">
          {filteredCustomers.sort((a, b) => a.deliveryOrder - b.deliveryOrder).map((c, i) => (
            <div key={i} className="flex justify-between items-start text-[10px] border-b border-black/10 pb-1">
              <div className="flex-1">
                <p className="font-black">#{c.deliveryOrder} {c.name}</p>
                {c.urduName && <p className="text-right text-sm font-bold" dir="rtl">{c.urduName}</p>}
                <p className="opacity-70 text-[8px]">{c.address}</p>
              </div>
              <div className="text-right">
                <p className="font-black">Rs.{Math.round(balances[c.id] || 0).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="border-dashed-print pt-4"></div>
        <p className="text-[8px] text-center font-bold opacity-60">
          Route Sheet - Keep Safe<br/>
          Gujjar Milk Shop HQ
        </p>
      </div>

      <div className="bg-white p-4 sm:p-5 md:p-6 rounded-[2rem] md:rounded-[2.5rem] shadow-sm border border-slate-200 no-print space-y-5">
        <div className="flex flex-col lg:flex-row gap-5 justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-slate-900 text-white flex shrink-0 items-center justify-center shadow-lg">
                <User size={24} />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Customer Profiles</h2>
                <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-[0.16em] sm:tracking-[0.25em]">Route, rider, cycle, balance</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:min-w-[500px]">
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Profiles</p>
              <p className="text-lg sm:text-xl font-black text-slate-900">{customerStats.total}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Active</p>
              <p className="text-lg sm:text-xl font-black text-emerald-700">{customerStats.active}</p>
            </div>
            <div className="rounded-2xl bg-rose-50 border border-rose-100 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-rose-600">Due</p>
              <p className="text-lg sm:text-xl font-black text-rose-700">{customerStats.due}</p>
            </div>
            <div className="rounded-2xl bg-sky-50 border border-sky-100 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-sky-600">Advance</p>
              <p className="text-lg sm:text-xl font-black text-sky-700">{customerStats.advance}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-3 justify-between items-stretch xl:items-center">
          <div className="relative w-full xl:max-w-md 2xl:max-w-lg">
            <Search className="absolute left-5 sm:left-6 top-1/2 -translate-y-1/2 text-slate-400" size={22} />
            <input
              type="text"
              placeholder="Search name, phone, area..."
              className="w-full pl-14 sm:pl-16 pr-5 sm:pr-6 py-3.5 sm:py-4 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-blue-500 transition-all font-bold"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex overflow-x-auto gap-2 pb-1 xl:pb-0">
            {statusFilters.map(filter => (
              <button
                key={filter.id}
                onClick={() => setStatusView(filter.id)}
                className={`shrink-0 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  statusView === filter.id ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {filter.label} <span className="ml-1 opacity-70">{filter.value}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 w-full justify-end">
          <motion.button 
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowPrintSettings(!showPrintSettings)}
            className={`p-3.5 sm:p-4 rounded-3xl transition-all ${showPrintSettings ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}
          >
            <Settings2 size={20}/>
          </motion.button>
          <motion.button 
            whileTap={{ scale: 0.95 }}
            onClick={() => window.print()} 
            className="p-3.5 sm:p-4 bg-slate-900 text-white rounded-3xl hover:bg-slate-800 transition-all"
          >
            <Printer size={20} />
          </motion.button>
          {isOwner && (
            <motion.button 
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowArchived(!showArchived)}
              className={`flex flex-1 sm:flex-none items-center justify-center gap-2 px-4 sm:px-6 py-3.5 sm:py-4 rounded-3xl font-black uppercase text-[10px] sm:text-xs tracking-widest transition-all ${showArchived ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}
            >
              <Archive size={18} /> {showArchived ? 'Hide Stopped' : 'Show Stopped'}
            </motion.button>
          )}
          {isOwner && (
            <motion.button 
              whileTap={{ scale: 0.95 }}
              onClick={handleOpenAdd}
              className="flex flex-1 sm:flex-none items-center justify-center gap-2 sm:gap-3 bg-blue-600 text-white px-5 sm:px-8 py-3.5 sm:py-4 rounded-3xl font-black uppercase text-[10px] sm:text-xs tracking-widest hover:bg-slate-900 transition-all shadow-xl shadow-blue-200"
            >
              <UserPlus size={18} /> Add New
            </motion.button>
          )}
        </div>
      </div>

      {/* PRINT SETTINGS PANEL */}
      <AnimatePresence>
        {showPrintSettings && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white p-6 rounded-[2rem] border-2 border-blue-100 shadow-xl no-print space-y-6"
          >
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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

      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 sm:gap-6 xl:gap-8">
        <AnimatePresence mode="popLayout">
          {filteredCustomers.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full py-20 text-center bg-white rounded-[3.5rem] border-4 border-dashed border-slate-100"
            >
              <User className="mx-auto text-slate-200 mb-4" size={64} />
              <p className="font-black text-slate-300 uppercase tracking-widest">No customers found</p>
            </motion.div>
          ) : (
            filteredCustomers.map(customer => (
              <CustomerRow 
                key={customer.id}
                customer={customer}
                balance={balances[customer.id] || 0}
                rider={riderMap.get(customer.riderId)}
                isOwner={isOwner}
                isProcessing={isProcessing}
                syncStatus={syncStatus}
                onEdit={handleOpenEdit}
                onToggleStatus={toggleCustomerStatus}
                onShareWhatsApp={shareKhataOnWhatsApp}
              />
            ))
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isModalOpen && isOwner && (
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
              className="bg-white rounded-t-[2.5rem] md:rounded-[3.5rem] shadow-2xl w-full max-w-2xl overflow-hidden border-t-8 md:border-8 border-slate-900"
            >
              <div className="p-6 md:p-10 bg-slate-900 text-white flex justify-between items-center">
                <div>
                  <h3 className="font-black text-2xl md:text-3xl italic tracking-tighter uppercase leading-none">{editingCustomer ? 'Edit Profile' : 'New Customer'}</h3>
                  <p className="text-slate-500 text-[8px] md:text-[10px] font-black uppercase tracking-[0.4em] mt-1">Setup Ledger Details</p>
                </div>
                <button onClick={() => setModalOpen(false)} className="bg-white/10 p-2 md:p-3 rounded-full hover:bg-white/20 transition-all"><X size={20} /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 md:p-10 space-y-6 md:space-y-8 overflow-y-auto max-h-[75vh]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Full Name (English)</label>
                    <div className="relative">
                      <input 
                        required 
                        className="w-full px-6 md:px-8 py-4 md:py-5 bg-slate-50 border-4 border-slate-100 rounded-2xl md:rounded-3xl font-black text-lg md:text-xl outline-none focus:border-blue-600 transition-all" 
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
                        className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 bg-blue-100 p-2 rounded-xl text-blue-600 hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                        title="AI Translate to Urdu"
                      >
                        {isTranslating ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest ml-4">Urdu Name (Manual or AI)</label>
                    <div className="relative">
                      <input 
                        dir="rtl" 
                        className={`w-full px-6 md:px-8 py-4 md:py-5 border-4 rounded-2xl md:rounded-3xl font-black text-xl md:text-2xl outline-none transition-all text-right ${isTranslating ? 'bg-blue-50/50 border-blue-200' : 'bg-blue-50 border-blue-100 focus:border-blue-600'}`} 
                        value={formData.urduName} 
                        onChange={e => setFormData({...formData, urduName: e.target.value})} 
                        placeholder="احمد خان" 
                      />
                      {isTranslating && (
                        <div className="absolute left-4 top-1/2 -translate-y-1/2">
                          <Loader2 className="animate-spin text-blue-600" size={20} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Phone Number</label>
                    <div className="relative">
                      <input className="w-full pl-12 pr-6 py-4 md:py-5 bg-slate-50 border-4 border-slate-100 rounded-2xl md:rounded-3xl font-black text-lg md:text-xl outline-none focus:border-blue-600 transition-all" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="03XXXXXXXXX" />
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Delivery Order</label>
                    <input type="number" className="w-full px-6 md:px-8 py-4 md:py-5 bg-slate-50 border-4 border-slate-100 rounded-2xl md:rounded-3xl font-black text-lg md:text-xl outline-none focus:border-blue-600" value={formData.deliveryOrder} onChange={e => setFormData({...formData, deliveryOrder: e.target.value})} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Delivery Address</label>
                  <div className="relative">
                    <input className="w-full pl-12 pr-6 py-4 md:py-5 bg-slate-50 border-4 border-slate-100 rounded-2xl md:rounded-3xl font-black text-lg md:text-xl outline-none focus:border-blue-600 transition-all" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder="House #, Street, Area..." />
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Payment Cycle</label>
                    <select className="w-full px-6 md:px-8 py-4 md:py-5 bg-slate-50 border-4 border-slate-100 rounded-2xl md:rounded-3xl font-black text-lg md:text-xl outline-none focus:border-blue-600" value={formData.paymentCycle} onChange={e => setFormData({...formData, paymentCycle: e.target.value as PaymentCycle})}>
                      {Object.values(PaymentCycle).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Assigned Rider</label>
                    <select className="w-full px-6 md:px-8 py-4 md:py-5 bg-slate-50 border-4 border-slate-100 rounded-2xl md:rounded-3xl font-black text-lg md:text-xl outline-none focus:border-blue-600 disabled:opacity-50" value={formData.riderId} onChange={e => setFormData({...formData, riderId: e.target.value})} disabled={riders.length === 0}>
                      {riders.length === 0 && <option value="">No riders loaded</option>}
                      {riders.map(r => <option key={r.id} value={r.id}>{r.name} ({r.route})</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Custom Price (Opt)</label>
                    <input type="number" className="w-full px-6 md:px-8 py-4 md:py-5 bg-slate-50 border-4 border-slate-100 rounded-2xl md:rounded-3xl font-black text-lg md:text-xl outline-none focus:border-blue-600" value={formData.customPrice} onChange={e => setFormData({...formData, customPrice: e.target.value})} placeholder="Def: 220" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Opening Bal (Rs)</label>
                    <input disabled={!!editingCustomer} type="number" className="w-full px-6 md:px-8 py-4 md:py-5 bg-slate-50 border-4 border-slate-100 rounded-2xl md:rounded-3xl font-black text-lg md:text-xl outline-none focus:border-blue-600 disabled:opacity-50" value={formData.openingBalance} onChange={e => setFormData({...formData, openingBalance: e.target.value})} />
                  </div>
                </div>

                <div className="pt-4">
                  <motion.button 
                    whileTap={{ scale: 0.98 }}
                    disabled={isProcessing || syncStatus === 'saving'}
                    type="submit" 
                    className={`w-full py-5 md:py-6 bg-blue-600 text-white rounded-[1.8rem] md:rounded-[2rem] font-black text-xl md:text-2xl hover:bg-slate-900 transition-all shadow-2xl active:scale-95 flex items-center justify-center gap-4 group ${isProcessing || syncStatus === 'saving' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {syncStatus === 'saving' ? 'Saving...' : editingCustomer ? 'Update Profile' : 'Save Customer'} <ArrowRight size={28} />
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


export default React.memo(CustomerManagement);
