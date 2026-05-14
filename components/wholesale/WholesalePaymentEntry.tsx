import React, { useState, useEffect } from 'react';
import { wholesaleDataService } from '../../services/wholesaleDataService';
import { wholesalePrintService } from './WholesalePrintService';
import { WSCustomer, WSPayment } from '../../types/wholesale';
import { Wallet, Save, Printer, CheckCircle2 } from 'lucide-react';

const WholesalePaymentEntry: React.FC = () => {
  const [customers, setCustomers] = useState<WSCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'pending'>('idle');
  const [success, setSuccess] = useState(false);

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [mode, setMode] = useState('Cash');
  const [note, setNote] = useState('');
  
  const [customerBalance, setCustomerBalance] = useState<number | null>(null);

  useEffect(() => {
    wholesaleDataService.fetchAllWholesaleCustomers().then(custs => {
      setCustomers(custs.filter(c => c.active));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (customerId) {
      wholesaleDataService.getCustomerBalance(customerId).then(setCustomerBalance);
    } else {
      Promise.resolve().then(() => setCustomerBalance(null));
    }
  }, [customerId]);

  const handleSave = async (printReceipt: boolean) => {
    if (!customerId || !amount || amount <= 0) {
      alert('Please enter a valid amount and select a customer.');
      return;
    }

    setSaving(true);
    setSyncStatus('saving');
    
    const payment: WSPayment = {
      // No client id — DB issues one. client_request_id added by the service.
      customer_id: customerId,
      date,
      amount: Number(amount),
      mode,
      note
    } as WSPayment;

    try {
      const saved = await wholesaleDataService.savePayment(payment);

      if (saved) {
        setSuccess(true);
        setSyncStatus(navigator.onLine ? 'saved' : 'pending');

        if (printReceipt) {
          const customer = customers.find(c => c.id === customerId);
          const balanceBefore = customerBalance || 0;
          const balanceAfter = balanceBefore - Number(amount);

          wholesalePrintService.printWholesalePaymentThermal(
            customer?.name || 'Unknown',
            date,
            Number(amount),
            mode,
            note,
            balanceBefore,
            balanceAfter
          );
        }

        setTimeout(() => {
          setSuccess(false);
          setSyncStatus('idle');
          setAmount('');
          setNote('');
          setCustomerId('');
          setCustomerBalance(null);
        }, 2000);
      } else {
        alert('Failed to save payment (no response from server).');
        setSyncStatus('idle');
      }
    } catch (err: any) {
      alert('Failed to save payment:\n\n' + (err?.message || String(err)));
      setSyncStatus('idle');
    }

    setSaving(false);
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading form...</div>;

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="bg-emerald-50 border-b border-emerald-100 p-6">
        <h2 className="text-xl font-black text-emerald-800 flex items-center gap-2">
          <Wallet className="text-emerald-600" />
          Receive Wholesale Payment
        </h2>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            />
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Customer</label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            >
              <option value="">Select Customer...</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {customerBalance !== null && (
              <p className="text-sm mt-2 font-medium text-slate-600">
                Current Balance: <span className={customerBalance > 0 ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold'}>Rs. {customerBalance.toLocaleString()}</span>
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Amount (Rs)</label>
          <input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || '')}
            placeholder="0"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-2xl font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Payment Mode</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            >
              <option value="Cash">Cash</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cheque">Cheque</option>
              <option value="Easypaisa/JazzCash">Easypaisa/JazzCash</option>
            </select>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Note (Optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., Cheque #123456"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 justify-end pt-6 border-t border-slate-100">
          {success ? (
            <div className="flex items-center gap-2 text-emerald-600 font-bold px-4 py-3">
              <CheckCircle2 size={20} /> {syncStatus === 'pending' ? 'Saved Offline!' : 'Payment Saved!'}
            </div>
          ) : (
            <>
              <button
                onClick={() => handleSave(false)}
                disabled={saving || !customerId || !amount || syncStatus === 'saving'}
                className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                <Save size={18} /> {syncStatus === 'saving' ? 'Saving...' : 'Save Only'}
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={saving || !customerId || !amount || syncStatus === 'saving'}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50 transition-colors shadow-md shadow-emerald-600/20"
              >
                <Printer size={18} /> Save & Print Receipt
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default WholesalePaymentEntry;
