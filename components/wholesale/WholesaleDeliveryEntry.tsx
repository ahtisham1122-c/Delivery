import React, { useState, useEffect } from 'react';
import { wholesaleDataService } from '../../services/wholesaleDataService';
import { wholesalePrintService } from './WholesalePrintService';
import { WSCustomer, WSProduct, WSDelivery } from '../../types/wholesale';
import { Plus, Trash2, Printer, Save, CheckCircle2, Truck, FileText } from 'lucide-react';

const WholesaleDeliveryEntry: React.FC = () => {
  const [customers, setCustomers] = useState<WSCustomer[]>([]);
  const [products, setProducts] = useState<WSProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'pending'>('idle');
  const [success, setSuccess] = useState(false);

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [customerId, setCustomerId] = useState('');
  const [customerBalance, setCustomerBalance] = useState<number | null>(null);
  
  const [rows, setRows] = useState<{ id: string, productId: string, qty: number, rate: number }[]>([
    { id: '1', productId: '', qty: 0, rate: 0 }
  ]);

  useEffect(() => {
    const loadData = async () => {
      const [custs, prods] = await Promise.all([
        wholesaleDataService.fetchAllWholesaleCustomers(),
        wholesaleDataService.fetchAllProducts()
      ]);
      setCustomers(custs.filter(c => c.active));
      setProducts(prods.filter(p => p.active));
      setLoading(false);
    };
    loadData();
  }, []);

  useEffect(() => {
    if (customerId) {
      wholesaleDataService.getCustomerBalance(customerId).then(setCustomerBalance);
    } else {
      Promise.resolve().then(() => setCustomerBalance(null));
    }
  }, [customerId]);

  const handleAddRow = () => {
    setRows([...rows, { id: Date.now().toString(), productId: '', qty: 0, rate: 0 }]);
  };

  const handleRemoveRow = (id: string) => {
    if (rows.length > 1) {
      setRows(rows.filter(r => r.id !== id));
    }
  };

  const handleRowChange = (id: string, field: string, value: any) => {
    setRows(rows.map(r => {
      if (r.id === id) {
        const newRow = { ...r, [field]: value };
        if (field === 'productId') {
          const prod = products.find(p => p.id === value);
          if (prod) newRow.rate = prod.default_rate;
        }
        return newRow;
      }
      return r;
    }));
  };

  const calculateTotal = () => {
    return rows.reduce((sum, r) => sum + (r.qty * r.rate), 0);
  };

  const handleSave = async (printType?: 'thermal' | 'a4') => {
    if (!customerId || rows.some(r => !r.productId || r.qty <= 0 || r.rate <= 0)) {
      alert('Please fill all required fields correctly.');
      return;
    }

    setSaving(true);
    setSyncStatus('saving');
    
    const entries: WSDelivery[] = rows.map(r => ({
      id: crypto.randomUUID(),
      customer_id: customerId,
      date,
      product_id: r.productId,
      quantity: r.qty,
      rate: r.rate,
      total_amount: r.qty * r.rate
    }));

    const saved = await wholesaleDataService.saveDeliveryEntries(entries);
    
    if (saved) {
      setSuccess(true);
      setSyncStatus(navigator.onLine ? 'saved' : 'pending');
      
      if (printType) {
        const customer = customers.find(c => c.id === customerId);
        const totalAmount = calculateTotal();
        const balanceBefore = customerBalance || 0;
        const balanceAfter = balanceBefore + totalAmount;
        
        const printEntries = entries.map(e => {
          const prod = products.find(p => p.id === e.product_id);
          return {
            ...e,
            product_name: prod?.name || 'Unknown',
            unit: prod?.unit || ''
          };
        });

        if (printType === 'thermal') {
          wholesalePrintService.printWholesaleThermal(printEntries, customer!, date, totalAmount, balanceBefore, balanceAfter);
        } else {
          const invNum = await wholesaleDataService.getNextInvoiceNumber();
          if (!invNum) {
            alert('Delivery saved, but an official invoice number could not be issued. Please retry A4 printing from the ledger after sync is restored.');
            return;
          }
          wholesalePrintService.printWholesaleA4(printEntries, customer!, date, totalAmount, balanceBefore, balanceAfter, invNum);
        }
      }

      setTimeout(() => {
        setSuccess(false);
        setSyncStatus('idle');
        setRows([{ id: Date.now().toString(), productId: '', qty: 0, rate: 0 }]);
        setCustomerId('');
        setCustomerBalance(null);
      }, 2000);
    } else {
      alert('Failed to save delivery.');
      setSyncStatus('idle');
    }
    
    setSaving(false);
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading form...</div>;

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="bg-slate-50 border-b border-slate-100 p-6">
        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
          <Truck className="text-blue-600" />
          New Wholesale Delivery
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
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Customer</label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
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

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Product</th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-32">Qty</th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-32">Rate (Rs)</th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-32 text-right">Total</th>
                <th className="p-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0">
                  <td className="p-3">
                    <select
                      value={row.productId}
                      onChange={(e) => handleRowChange(row.id, 'productId', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select...</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={row.qty || ''}
                      onChange={(e) => handleRowChange(row.id, 'qty', parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      min="0"
                      value={row.rate || ''}
                      onChange={(e) => handleRowChange(row.id, 'rate', parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                  <td className="p-3 text-right font-bold text-slate-700">
                    {(row.qty * row.rate).toLocaleString()}
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => handleRemoveRow(row.id)}
                      disabled={rows.length === 1}
                      className="text-slate-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
            <button
              onClick={handleAddRow}
              className="text-blue-600 hover:text-blue-700 font-bold text-sm flex items-center gap-1"
            >
              <Plus size={16} /> Add Product
            </button>
            <div className="text-lg font-black text-slate-800">
              Grand Total: Rs. {calculateTotal().toLocaleString()}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 justify-end pt-4 border-t border-slate-100">
          {success ? (
            <div className="flex items-center gap-2 text-emerald-600 font-bold px-4 py-3">
              <CheckCircle2 size={20} /> {syncStatus === 'pending' ? 'Saved Offline!' : 'Saved Successfully!'}
            </div>
          ) : (
            <>
              <button
                onClick={() => handleSave()}
                disabled={saving || !customerId || syncStatus === 'saving'}
                className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                <Save size={18} /> {syncStatus === 'saving' ? 'Saving...' : 'Save Only'}
              </button>
              <button
                onClick={() => handleSave('thermal')}
                disabled={saving || !customerId || syncStatus === 'saving'}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50 transition-colors shadow-md shadow-blue-600/20"
              >
                <Printer size={18} /> Save & Thermal Print
              </button>
              <button
                onClick={() => handleSave('a4')}
                disabled={saving || !customerId || syncStatus === 'saving'}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50 transition-colors shadow-md shadow-indigo-600/20"
              >
                <FileText size={18} /> Save & A4 Invoice
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default WholesaleDeliveryEntry;
