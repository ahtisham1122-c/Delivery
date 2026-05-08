
import React from 'react';
import { Customer, Delivery, Payment } from '../types';
import { formatPKR, generateId } from '../services/dataStore';
import { getCycleBoundaries } from '../services/ledgerUtils';
import ThermalPrintView from './ThermalPrintView';

interface IndividualReceiptProps {
  customer: Customer;
  deliveries: Delivery[];
  balances: Record<string, number>;
  profile: '80' | '58' | 'A4';
  fontSize: 'sm' | 'md' | 'lg';
}

export const IndividualReceipt: React.FC<IndividualReceiptProps> = ({
  customer,
  deliveries,
  balances,
  profile,
  fontSize
}) => {
  const now = new Date();
  
  const currentCycle = getCycleBoundaries(now, customer.paymentCycle);
  const previousCycleDate = new Date(currentCycle.start);
  previousCycleDate.setDate(previousCycleDate.getDate() - 1);
  const previousCycle = getCycleBoundaries(previousCycleDate, customer.paymentCycle);

  const previousCycleDeliveries = deliveries.filter(d => {
    if (d.deleted) return false;
    const dDate = new Date(d.date);
    dDate.setHours(0,0,0,0);
    return d.customerId === customer.id && dDate >= previousCycle.start && dDate <= previousCycle.end;
  });

  const currentAndFutureDeliveries = deliveries.filter(d => {
    if (d.deleted) return false;
    const dDate = new Date(d.date);
    dDate.setHours(0,0,0,0);
    return d.customerId === customer.id && dDate > previousCycle.end;
  });

  const totalMilk = previousCycleDeliveries.reduce((a, b) => a + (typeof b.liters === 'number' && !isNaN(b.liters) ? b.liters : 0), 0);
  const milkAmount = Math.round(previousCycleDeliveries.reduce((a, b) => a + (typeof b.totalAmount === 'number' && !isNaN(b.totalAmount) ? b.totalAmount : 0), 0));
  
  const currentAndFutureMilkAmount = currentAndFutureDeliveries.reduce((a, b) => a + (typeof b.totalAmount === 'number' && !isNaN(b.totalAmount) ? b.totalAmount : 0), 0);

  const overallBalance = balances[customer.id] || 0;
  const netTotal = Math.round(overallBalance - currentAndFutureMilkAmount);
  const remainingBalance = Math.round(netTotal - milkAmount);

  const formatDate = (d: Date) => d.toLocaleDateString('en-GB').replace(/\//g, '-');

  return (
    <ThermalPrintView 
      profile={profile} 
      fontSize={fontSize} 
      title="Gujjar Milk Shop" 
      subtitle="Digital Billing Slip"
    >
      <div className="space-y-1 text-xs">
        <div className="flex justify-between font-black">
          <span>Date: {new Date().toLocaleDateString('en-GB')}</span>
          <span>Ref: #{generateId().substring(0, 4).toUpperCase()}</span>
        </div>
      </div>

      <div className="space-y-1 text-xs mt-2">
        <div className="flex justify-between font-black items-start">
          <span className="flex-shrink-0 mr-2">Customer / کسٹمر:</span>
          <div className="text-right flex flex-col items-end">
            <span className="text-base break-words" dir="rtl">{customer.urduName || customer.name}</span>
          </div>
        </div>
        <div className="flex justify-between">
          <span>Account ID / اکاؤنٹ آئی ڈی:</span>
          <span>{customer.id.substring(0, 6).toUpperCase()}</span>
        </div>
        <div className="flex justify-between">
          <span>Cycle / سائیکل:</span>
          <span>{customer.paymentCycle}</span>
        </div>
        <div className="flex justify-between">
          <span>Period / مدت:</span>
          <span>{formatDate(previousCycle.start)} to {formatDate(previousCycle.end)}</span>
        </div>
      </div>

      <div className="border-dashed-print my-2"></div>

      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span>Total Milk / کل دودھ:</span>
          <span className="font-black">{totalMilk.toFixed(1)}L</span>
        </div>
        <div className="flex justify-between font-black text-sm pt-1">
          <span>Milk Amount / دودھ کی رقم:</span>
          <span>Rs. {formatPKR(milkAmount)}</span>
        </div>
      </div>

      <div className="border-dashed-print my-2"></div>

      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span>Previous Dues / پچھلا بقایا:</span>
          <span>Rs. {formatPKR(remainingBalance)}</span>
        </div>
        <div className="flex justify-between font-black text-base pt-2 bg-slate-100 p-2">
          <span>TOTAL AMOUNT / کل رقم:</span>
          <span>Rs. {formatPKR(netTotal)}</span>
        </div>
      </div>

      <div className="border-dashed-print my-4"></div>
      <div className="text-center space-y-1">
        <p className="font-black text-xs uppercase">Thank You for your Business! / آپ کے کاروبار کا شکریہ</p>
        <p className="text-[10px] opacity-70 italic">Please keep this receipt for your records. / براہ کرم یہ رسید اپنے ریکارڈ کے لیے رکھیں۔</p>
        <p className="text-[10px] opacity-50 pt-2">DairyPro Pakistan Cloud Ledger</p>
      </div>
    </ThermalPrintView>
  );
};

interface SummaryReceiptProps {
  date: string;
  customers: Customer[];
  deliveries: Delivery[];
  payments: Payment[];
  profile: '80' | '58' | 'A4';
  fontSize: 'sm' | 'md' | 'lg';
  compact?: boolean;
}

export const SummaryReceipt: React.FC<SummaryReceiptProps> = ({
  date,
  customers,
  deliveries,
  payments,
  profile,
  fontSize,
  compact = false
}) => {
  const todayDeliveries = deliveries.filter(d => d.date === date && !d.isAdjustment && !d.deleted);
  const todayPayments = payments.filter(p => p.date === date && !p.isAdjustment && !p.deleted);
  
  const totalLiters = todayDeliveries.reduce((a, b) => a + (typeof b.liters === 'number' && !isNaN(b.liters) ? b.liters : 0), 0);
  const totalBill = todayDeliveries.reduce((a, b) => a + (typeof b.totalAmount === 'number' && !isNaN(b.totalAmount) ? b.totalAmount : 0), 0);
  const totalRecovery = todayPayments.reduce((a, b) => a + (typeof b.amount === 'number' && !isNaN(b.amount) ? b.amount : 0), 0);

  return (
    <ThermalPrintView 
      profile={profile} 
      fontSize={fontSize} 
      title="Gujjar Milk Shop" 
      subtitle={compact ? "Main Summary" : "Daily Summary Report"}
    >
      <div className="space-y-1 text-xs">
        <div className="flex justify-between font-black">
          <span>Date / تاریخ: {date}</span>
          <span>Ref: #{generateId().substring(0, 4).toUpperCase()}</span>
        </div>
      </div>

      <div className="border-dashed-print my-2"></div>

      <div className="space-y-3 text-xs">
        <div className="flex justify-between items-center py-1">
          <span className="font-black uppercase">Total Milk Delivered / کل دودھ دیا گیا:</span>
          <span className="text-xl font-black italic">{totalLiters.toFixed(1)}L</span>
        </div>
        
        <div className="flex justify-between items-center py-1">
          <span className="font-black uppercase">Total Billing / کل بلنگ:</span>
          <span className="text-lg font-black italic">Rs. {formatPKR(totalBill)}</span>
        </div>

        <div className="flex justify-between items-center py-2 bg-slate-100 px-2 rounded-lg border-2 border-slate-900">
          <span className="font-black uppercase text-sm">Cash from Rider / رائیڈر سے کیش:</span>
          <span className="text-2xl font-black italic">Rs. {formatPKR(totalRecovery)}</span>
        </div>
      </div>

      {!compact && (
        <>
          <div className="border-dashed-print my-2"></div>
          <p className="text-center font-black uppercase text-xs">Customer Activity / کسٹمر کی سرگرمی</p>
          <div className="border-dashed-print my-2"></div>

          <div className="space-y-3">
            {todayDeliveries.map((d, i) => {
              const cust = customers.find(c => c.id === d.customerId);
              return (
                <div key={i} className="flex justify-between items-start text-xs">
                  <div className="flex-1 mr-2">
                    <p className="font-black leading-tight break-words text-sm" dir="rtl">{cust?.urduName || cust?.name}</p>
                    <p className="opacity-70 text-[10px]">Milk Delivery / دودھ کی ترسیل</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-black">{d.liters.toFixed(1)}L</p>
                    <p className="text-[10px]">Rs.{formatPKR(d.totalAmount)}</p>
                  </div>
                </div>
              );
            })}
            {todayPayments.map((p, i) => {
              const cust = customers.find(c => c.id === p.customerId);
              return (
                <div key={`p-${i}`} className="flex justify-between items-start text-xs">
                  <div className="flex-1 mr-2">
                    <p className="font-black leading-tight break-words text-sm" dir="rtl">{cust?.urduName || cust?.name}</p>
                    <p className="opacity-70 text-[10px] text-green-600">Cash Payment / نقد ادائیگی</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-black text-green-600">Rs.{formatPKR(p.amount)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <div className="border-dashed-print my-4"></div>
      <div className="text-center space-y-1">
        <p className="font-black text-xs uppercase tracking-widest">End of Summary / خلاصہ ختم</p>
        <p className="text-[10px] opacity-50">DairyPro Pakistan • {date}</p>
      </div>
    </ThermalPrintView>
  );
};
