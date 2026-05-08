
import React from 'react';
import { 
  Calendar, CheckCircle, ClipboardList, Wallet, AlertCircle, Clock, Filter, 
  ArrowDownLeft, Fuel, Container, Target, TrendingDown, TrendingUp,
  History as HistoryIcon, Info, ArrowRight, ShieldCheck as ShieldIcon,
  ReceiptText, Printer, Settings2, Monitor, Smartphone
} from 'lucide-react';
import { Rider, RiderClosingRecord } from '../types';
import { formatPKR } from '../services/dataStore';
import { printService } from '../services/printService';
import ThermalPrintView from './ThermalPrintView';

interface AuditHistoryProps {
  closingRecords: RiderClosingRecord[];
  riders: Rider[];
}

const AuditHistory: React.FC<AuditHistoryProps> = ({ closingRecords, riders }) => {
  const [printProfile, setPrintProfile] = React.useState<'A4' | '80' | '58'>('80');
  const [printFontSize, setPrintFontSize] = React.useState<'sm' | 'md' | 'lg'>('md');
  const [showPrintSettings, setShowPrintSettings] = React.useState(false);

  const handlePrint = (record: RiderClosingRecord) => {
    const rider = riders.find(r => r.id === record.riderId);
    const dispatched = record.morningLoadLiters ?? 0;
    const delivered = record.appDeliveriesLiters ?? 0;
    const returned = record.returnedMilkLiters ?? 0;
    const wastage = record.wastageLiters ?? 0;
    const milkAccounted = delivered + returned + wastage;
    const milkVariance = milkAccounted - dispatched;
    const recovery = record.expectedCashRecovery ?? 0;
    const expense = record.expenseDeductions ?? 0;
    const expectedNetCash = recovery - expense;
    const received = record.physicalCashReceived ?? 0;
    const cashGap = received - expectedNetCash;

    printService.setPrintConfig(printProfile, printFontSize);
    printService.triggerPrint(
      <ThermalPrintView 
        profile={printProfile} 
        fontSize={printFontSize} 
        title="Gujjar Milk Shop" 
        subtitle="Verified Audit Receipt"
      >
        <div className="space-y-1 text-xs">
          <div className="flex justify-between font-black">
            <span>Date / تاریخ: {new Date(record.date).toLocaleDateString('en-GB')}</span>
            <span>Ref: #{record.id.substring(0, 8).toUpperCase()}</span>
          </div>
        </div>

        <div className="border-dashed-print my-2"></div>

        <div className="space-y-1 text-xs">
           <p className="font-black uppercase">Staff / سٹاف: {rider?.name}</p>
           <p className="text-[10px] opacity-70">Time / وقت: {new Date(record.timestamp).toLocaleTimeString()}</p>
        </div>

        <div className="border-dashed-print my-2"></div>
        <p className="text-center font-black uppercase text-xs">Milk Audit / دودھ کا حساب</p>
        <div className="border-dashed-print my-2"></div>
        
        <div className="space-y-1 text-xs">
          <div className="flex justify-between"><span>Dispatched / بھیجا گیا:</span> <span>{dispatched.toFixed(1)}L</span></div>
          <div className="flex justify-between"><span>Delivered / دیا گیا:</span> <span>{delivered.toFixed(1)}L</span></div>
          <div className="flex justify-between"><span>Returned / واپس آیا:</span> <span>{returned.toFixed(1)}L</span></div>
          <div className="flex justify-between"><span>Wastage / ضائع ہوا:</span> <span>{wastage.toFixed(1)}L</span></div>
          <div className="flex justify-between font-black border-t border-black pt-1 mt-1">
            <span>Variance / فرق:</span> 
            <span className={milkVariance < -0.1 ? "text-red-500" : ""}>{milkVariance.toFixed(1)}L</span>
          </div>
        </div>

        <div className="border-dashed-print my-2"></div>
        <p className="text-center font-black uppercase text-xs">Cash Audit / کیش کا حساب</p>
        <div className="border-dashed-print my-2"></div>

        <div className="space-y-1 text-xs">
          <div className="flex justify-between"><span>Recovery / وصولی:</span> <span>Rs.{formatPKR(recovery)}</span></div>
          <div className="flex justify-between"><span>Expenses / خرچہ:</span> <span>-Rs.{formatPKR(expense)}</span></div>
          <div className="flex justify-between"><span>Target / ٹارگٹ:</span> <span>Rs.{formatPKR(expectedNetCash)}</span></div>
          <div className="flex justify-between"><span>Received / وصول ہوا:</span> <span>Rs.{formatPKR(received)}</span></div>
          <div className="flex justify-between font-black border-t border-black pt-1 mt-1 bg-slate-100 p-1">
            <span>Cash Gap / کیش کا فرق:</span> 
            <span className={cashGap < -10 ? "text-red-500" : ""}>Rs.{formatPKR(cashGap)}</span>
          </div>
        </div>

        {record.auditRemarks && (
          <>
            <div className="border-dashed-print my-2"></div>
            <p className="text-[10px] italic">Remarks / ریمارکس: {record.auditRemarks}</p>
          </>
        )}

        <div className="border-dashed-print my-4"></div>
        <div className="text-center space-y-1">
          <p className="font-black text-xs uppercase tracking-widest">Digitally Sealed Audit / ڈیجیٹل تصدیق شدہ حساب</p>
          <p className="text-[10px] opacity-50">Gujjar Milk Shop HQ • {record.date}</p>
        </div>
      </ThermalPrintView>
    );
  };

  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in duration-500 pb-32">

      {/* Professional Header */}
      <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 no-print">
        <div className="flex items-center gap-4">
           <div className="bg-slate-900 p-4 rounded-3xl text-white shadow-xl shadow-slate-200">
              <ReceiptText size={32}/>
           </div>
           <div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">Accountability Ledger</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">Verified Shop Audit Trail (Rs. PKR)</p>
           </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowPrintSettings(!showPrintSettings)}
            className={`p-4 rounded-2xl transition-all ${showPrintSettings ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}
          >
            <Settings2 size={20}/>
          </button>
          <div className="flex items-center gap-3 bg-blue-600 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-100">
            <Filter size={14} className="text-blue-200"/> {closingRecords.length} Audits Found
          </div>
        </div>
      </div>

      {/* PRINT SETTINGS PANEL */}
      {showPrintSettings && (
        <div className="bg-white p-6 rounded-[2rem] border-2 border-blue-100 shadow-xl animate-in slide-in-from-top-4 no-print space-y-6">
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
        </div>
      )}

      <div className="space-y-12">
        {closingRecords.length === 0 ? (
          <div className="py-40 text-center bg-white rounded-[4rem] border-4 border-dashed border-slate-100 flex flex-col items-center justify-center">
            <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6">
               <HistoryIcon className="text-slate-200" size={48} />
            </div>
            <p className="font-black text-slate-300 uppercase tracking-widest text-sm">No historical audits in vault</p>
          </div>
        ) : (
          closingRecords.map(record => {
            const rider = riders.find(r => r.id === record.riderId);
            
            // MILK CALCULATIONS
            const dispatched = record.morningLoadLiters ?? 0;
            const delivered = record.appDeliveriesLiters ?? 0;
            const returned = record.returnedMilkLiters ?? 0;
            const wastage = record.wastageLiters ?? 0;
            const milkAccounted = delivered + returned + wastage;
            const milkVariance = milkAccounted - dispatched;
            const isMilkShortage = milkVariance < -0.1;
            
            // CASH CALCULATIONS
            const recovery = record.expectedCashRecovery ?? 0;
            const expense = record.expenseDeductions ?? 0;
            const expectedNetCash = recovery - expense;
            const received = record.physicalCashReceived ?? 0;
            const cashGap = received - expectedNetCash;
            const isCashShortage = cashGap < -10;

            const isPerfect = !isMilkShortage && !isCashShortage;

            return (
              <div key={record.id} className="bg-white rounded-[3.5rem] border border-slate-200 shadow-sm overflow-hidden transition-all group relative hover:border-blue-400">
                {/* Status Indicator */}
                <div className={`h-3 w-full ${isPerfect ? 'bg-green-500' : 'bg-red-500'}`}></div>

                {/* Audit Header */}
                <div className="p-8 md:p-10 bg-slate-900 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div className="flex items-center gap-6">
                     <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center shadow-2xl transition-transform group-hover:scale-105 ${isPerfect ? 'bg-green-600' : 'bg-red-600'}`}>
                        {isPerfect ? <ShieldIcon size={40}/> : <AlertCircle size={40}/>}
                     </div>
                     <div>
                        <h4 className="font-black text-4xl uppercase tracking-tighter italic leading-none">{rider?.name || 'Staff Member'}</h4>
                        <div className="flex flex-wrap items-center gap-4 text-[10px] font-black text-slate-500 uppercase tracking-widest mt-3">
                           <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl border border-white/5">
                              <Calendar size={12} className="text-blue-400"/> {new Date(record.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                           </div>
                           <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl border border-white/5">
                              <Clock size={12} className="text-blue-400"/> {new Date(record.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                           </div>
                        </div>
                     </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2">
                     <div className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 shadow-lg ${isPerfect ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                        {isPerfect ? <CheckCircle size={16}/> : <AlertCircle size={16}/>}
                        {isPerfect ? 'Audit Clear' : 'Discrepancy Detected'}
                     </div>
                     <p className="text-[8px] font-bold text-slate-500 uppercase tracking-[0.3em]">ID: {record.id.toUpperCase()}</p>
                  </div>
                  <button 
                    onClick={() => handlePrint(record)}
                    className="bg-white/10 p-3 rounded-xl hover:bg-white/20 transition-all text-white flex items-center gap-2 text-[10px] font-black uppercase tracking-widest no-print"
                  >
                    <Printer size={16}/> Print
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
                   {/* MILK RECONCILIATION */}
                   <div className="p-10 space-y-8">
                      <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                         <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><ClipboardList size={20}/></div>
                            <h5 className="text-xs font-black text-slate-900 uppercase tracking-widest">Milk Reconciliation</h5>
                         </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                         <AuditSlipItem label="Taken from Shop" value={`${dispatched.toFixed(1)} L`} icon={<Container size={14}/>} />
                         <AuditSlipItem label="Total Logged Delivery" value={`${delivered.toFixed(1)} L`} icon={<Target size={14}/>} color="text-blue-600" />
                         <AuditSlipItem label="Returned to Shop" value={`${returned.toFixed(1)} L`} icon={<ArrowDownLeft size={14}/>} />
                         <AuditSlipItem label="Reported Wastage" value={`${wastage.toFixed(1)} L`} icon={<TrendingDown size={14}/>} color="text-orange-500" />
                      </div>

                      <div className={`p-8 rounded-3xl border-2 flex justify-between items-center transition-all ${isMilkShortage ? 'bg-red-50 border-red-200 text-red-600' : 'bg-green-50 border-green-200 text-green-600'}`}>
                         <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">
                               {isMilkShortage ? 'Milk Shortage' : 'Balanced / Surplus'}
                            </p>
                            <p className="text-4xl font-black italic mt-1 tracking-tighter">{milkVariance.toFixed(1)} L</p>
                         </div>
                         {isMilkShortage ? <TrendingDown size={48} className="opacity-40" /> : <TrendingUp size={48} className="opacity-40" />}
                      </div>
                   </div>

                   {/* CASH RECONCILIATION */}
                   <div className="p-10 space-y-8 bg-slate-50/30">
                      <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                         <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-50 text-green-600 rounded-xl"><Wallet size={20}/></div>
                            <h5 className="text-xs font-black text-slate-900 uppercase tracking-widest">Financial Reconciliation</h5>
                         </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                         <AuditSlipItem label="Gross App Recovery" value={`Rs. ${formatPKR(recovery)}`} icon={<TrendingUp size={14}/>} />
                         <AuditSlipItem label="Rider Expenses" value={`- Rs. ${formatPKR(expense)}`} icon={<Fuel size={14}/>} color="text-red-500" />
                         <AuditSlipItem label="Expected Galla" value={`Rs. ${formatPKR(expectedNetCash)}`} icon={<Wallet size={14}/>} />
                         <AuditSlipItem label="Physical Handover" value={`Rs. ${formatPKR(received)}`} icon={<CheckCircle size={14}/>} color="text-green-600" />
                      </div>

                      <div className={`p-8 rounded-3xl border-2 flex justify-between items-center transition-all ${isCashShortage ? 'bg-red-600 border-red-700 text-white shadow-xl shadow-red-100' : 'bg-slate-900 border-slate-800 text-white'}`}>
                         <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">
                               {isCashShortage ? 'Cash Shortage' : 'Perfect Balance'}
                            </p>
                            <p className="text-4xl font-black italic mt-1 tracking-tighter">Rs. {formatPKR(cashGap)}</p>
                         </div>
                         {isCashShortage ? <ArrowRight size={48} className="rotate-45 opacity-40" /> : <ShieldCheck size={48} className="opacity-40" />}
                      </div>
                   </div>
                </div>

                {/* Tracking Footer */}
                <div className="px-10 py-6 bg-white border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
                   <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><Info size={16}/></div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase leading-none">Record is digitally sealed and synchronized to cloud HQ.</p>
                   </div>
                   <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Audit Result:</span>
                      <div className="flex items-center gap-2">
                         <div className={`w-2.5 h-2.5 rounded-full ${isPerfect ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></div>
                         <span className="text-[10px] font-black text-slate-900 uppercase">
                           {isPerfect ? 'Verified Correct' : 'Follow-up Required'}
                         </span>
                      </div>
                   </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const AuditSlipItem = ({ label, value, icon, color = "text-slate-900" }: { label: string, value: string, icon: any, color?: string }) => (
  <div className="bg-white p-5 rounded-3xl border border-slate-100 flex flex-col gap-2 shadow-sm hover:shadow-md transition-all">
     <div className="flex items-center gap-2 text-slate-400">
        <div className="p-1.5 bg-slate-50 rounded-lg">{icon}</div>
        <span className="text-[8px] font-black uppercase tracking-widest leading-none">{label}</span>
     </div>
     <p className={`text-base font-black italic tracking-tight leading-none ${color}`}>{value}</p>
  </div>
);

const ShieldCheck = ({ size, className }: { size: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export default AuditHistory;
