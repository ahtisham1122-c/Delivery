import React, { useState, useEffect, useMemo } from 'react';
import { wholesaleDataService } from '../../services/wholesaleDataService';
import { wholesalePrintService } from './WholesalePrintService';
import { WSCustomer, WSLedgerEntry, WSProduct, WSDelivery, WSPayment } from '../../types/wholesale';
import { FileText, Printer, Search, Calendar, Filter, Edit2, Trash2, X, Save } from 'lucide-react';

const WholesaleLedger: React.FC = () => {
  const [customers, setCustomers] = useState<WSCustomer[]>([]);
  const [products, setProducts] = useState<WSProduct[]>([]);
  const [ledger, setLedger] = useState<WSLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [customerId, setCustomerId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const [editingEntry, setEditingEntry] = useState<WSLedgerEntry | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      wholesaleDataService.fetchAllWholesaleCustomers(),
      wholesaleDataService.fetchAllProducts()
    ]).then(([custs, prods]) => {
      setCustomers(custs);
      setProducts(prods);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const loadLedger = async (isSilent = false) => {
      if (!isSilent) setLoading(true);
      const data = await wholesaleDataService.fetchLedger(
        customerId || undefined,
        fromDate || undefined,
        toDate || undefined
      );
      setLedger(data);
      if (!isSilent) setLoading(false);
    };
    loadLedger();

    const handlePoll = () => {
      loadLedger(true);
    };
    window.addEventListener('wholesale_poll', handlePoll);
    return () => window.removeEventListener('wholesale_poll', handlePoll);
  }, [customerId, fromDate, toDate]);

  const filteredLedger = useMemo(() => {
    let filtered = ledger;
    if (typeFilter !== 'all') {
      filtered = filtered.filter(e => e.type === typeFilter);
    }
    return filtered;
  }, [ledger, typeFilter]);

  const calculateRunningBalance = () => {
    if (!customerId) return [];
    
    const customer = customers.find(c => c.id === customerId);
    let currentBalance = customer?.opening_balance || 0;
    
    return filteredLedger.map(entry => {
      if (entry.type === 'delivery') {
        currentBalance += entry.amount;
      } else {
        currentBalance -= entry.amount;
      }
      return { ...entry, runningBalance: currentBalance };
    });
  };

  const ledgerWithBalance = calculateRunningBalance();

  const printReceipt = async (entry: WSLedgerEntry & { runningBalance?: number }, type: 'thermal' | 'a4') => {
    const customer = customers.find(c => c.id === entry.customer_id);
    if (!customer) return;

    let balanceAfter = entry.runningBalance;
    
    // If runningBalance is not available (e.g., when viewing all customers), calculate it
    if (balanceAfter === undefined) {
      const customerEntries = ledger.filter(e => e.customer_id === entry.customer_id);
      let currentBalance = customer.opening_balance || 0;
      for (const e of customerEntries) {
        if (e.type === 'delivery') {
          currentBalance += e.amount;
        } else {
          currentBalance -= e.amount;
        }
        if (e.id === entry.id) {
          balanceAfter = currentBalance;
          break;
        }
      }
    }

    const finalBalanceAfter = balanceAfter || 0;
    const balanceBefore = entry.type === 'delivery' 
      ? finalBalanceAfter - entry.amount 
      : finalBalanceAfter + entry.amount;

    if (entry.type === 'payment') {
      wholesalePrintService.printWholesalePaymentThermal(
        customer.name,
        entry.date,
        entry.amount,
        'Cash', // Defaulting to cash as we don't have mode in ledger entry
        entry.note || '',
        balanceBefore,
        finalBalanceAfter
      );
    } else {
      const deliveryEntry = {
        id: entry.id,
        customer_id: entry.customer_id,
        date: entry.date,
        product_id: '', // Not needed for print
        quantity: entry.quantity || 0,
        rate: entry.rate || 0,
        total_amount: entry.amount,
        product_name: entry.product_name || 'Item',
        unit: '' // Not needed for print
      };

      if (type === 'thermal') {
        wholesalePrintService.printWholesaleThermal([deliveryEntry], customer, entry.date, entry.amount, balanceBefore, finalBalanceAfter);
      } else {
        const invNum = await wholesaleDataService.getNextInvoiceNumber();
        if (!invNum) {
          alert('Official invoice number could not be issued. Please retry after sync is restored.');
          return;
        }
        wholesalePrintService.printWholesaleA4([deliveryEntry], customer, entry.date, entry.amount, balanceBefore, finalBalanceAfter, invNum);
      }
    }
  };

  const handleDelete = async (entry: WSLedgerEntry) => {
    if (!window.confirm(`Are you sure you want to delete this ${entry.type}?`)) return;
    
    let success = false;
    if (entry.type === 'delivery') {
      success = await wholesaleDataService.deleteDelivery(entry.id);
    } else {
      success = await wholesaleDataService.deletePayment(entry.id);
    }

    if (success) {
      setLedger(ledger.filter(e => e.id !== entry.id));
    } else {
      alert('Failed to delete entry');
    }
  };

  const startEdit = (entry: WSLedgerEntry) => {
    setEditingEntry(entry);
    setEditForm({
      date: entry.date,
      amount: entry.amount,
      note: entry.note || '',
      quantity: entry.quantity || 0,
      rate: entry.rate || 0,
      product_id: entry.product_id || ''
    });
  };

  const handleSaveEdit = async () => {
    if (!editingEntry) return;
    setIsSaving(true);

    let success = false;
    if (editingEntry.type === 'delivery') {
      const delivery: WSDelivery = {
        id: editingEntry.id,
        customer_id: editingEntry.customer_id,
        date: editForm.date,
        product_id: editForm.product_id,
        quantity: Number(editForm.quantity),
        rate: Number(editForm.rate),
        note: editForm.note,
        total_amount: Number(editForm.quantity) * Number(editForm.rate)
      };
      const res = await wholesaleDataService.saveDeliveryEntries([delivery]);
      success = !!res;
    } else {
      const payment: WSPayment = {
        id: editingEntry.id,
        customer_id: editingEntry.customer_id,
        date: editForm.date,
        amount: Number(editForm.amount),
        note: editForm.note
      };
      const res = await wholesaleDataService.savePayment(payment);
      success = !!res;
    }

    if (success) {
      // Reload ledger
      const data = await wholesaleDataService.fetchLedger(
        customerId || undefined,
        fromDate || undefined,
        toDate || undefined
      );
      setLedger(data);
      setEditingEntry(null);
    } else {
      alert('Failed to update entry');
    }
    setIsSaving(false);
  };

  const printStatement = () => {
    if (!customerId) {
      alert('Please select a customer to print a statement.');
      return;
    }

    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Statement - ${customer.name}</title>
        <style>
          @page { size: A4; margin: 20mm; }
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; line-height: 1.5; font-size: 12px; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
          .header h1 { margin: 0 0 5px 0; color: #1e3a8a; font-size: 24px; }
          .customer-details { margin-bottom: 30px; }
          .customer-details h3 { margin: 0 0 5px 0; color: #64748b; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background: #f8fafc; padding: 10px; text-align: left; border-bottom: 2px solid #cbd5e1; color: #475569; text-transform: uppercase; font-size: 10px; letter-spacing: 1px; }
          td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
          .right { text-align: right; }
          .debit { color: #dc2626; }
          .credit { color: #059669; }
          .bold { font-weight: bold; }
          .summary { width: 40%; margin-left: auto; border: 1px solid #e2e8f0; padding: 15px; background: #f8fafc; }
          .summary-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
          .summary-row.total { font-weight: bold; border-top: 2px solid #cbd5e1; padding-top: 10px; margin-top: 5px; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="display: flex; justify-content: center; margin-bottom: 10px;">
            <img src="https://i.postimg.cc/D8SFv02C/PHOTO-2026-02-21-21-44-10.jpg" alt="Logo" style="width: 80px; height: auto; border-radius: 8px;" referrerPolicy="no-referrer" />
          </div>
          <h1>Gujjar Milk Shop</h1>
          <div>St#13, Razabad, Faisalabad | Phone: +92 326 0525249</div>
          <div style="margin-top: 10px; font-weight: bold; font-size: 16px;">Wholesale Customer Statement</div>
          <div>${fromDate ? `From: ${fromDate}` : ''} ${toDate ? `To: ${toDate}` : ''}</div>
        </div>
        
        <div class="customer-details">
          <h3>Customer Information</h3>
          <div class="bold" style="font-size: 16px;">${customer.name}</div>
          ${customer.address ? `<div>${customer.address}</div>` : ''}
          ${customer.phone ? `<div>Phone: ${customer.phone}</div>` : ''}
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th class="right">Debit (Rs)</th>
              <th class="right">Credit (Rs)</th>
              <th class="right">Balance (Rs)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>-</td>
              <td class="bold">Opening Balance</td>
              <td class="right"></td>
              <td class="right"></td>
              <td class="right bold">${customer.opening_balance.toLocaleString()}</td>
            </tr>
            ${ledgerWithBalance.map(e => `
              <tr>
                <td>${e.date}</td>
                <td>
                  ${e.type === 'delivery' ? `Delivery: ${e.product_name} (${e.quantity} @ ${e.rate})` : `Payment Received ${e.note ? `(${e.note})` : ''}`}
                </td>
                <td class="right debit">${e.type === 'delivery' ? e.amount.toLocaleString() : ''}</td>
                <td class="right credit">${e.type === 'payment' ? e.amount.toLocaleString() : ''}</td>
                <td class="right bold">${e.runningBalance.toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="summary">
          <div class="summary-row">
            <span>Opening Balance:</span>
            <span>Rs. ${customer.opening_balance.toLocaleString()}</span>
          </div>
          <div class="summary-row">
            <span>Total Deliveries (Debit):</span>
            <span class="debit">Rs. ${filteredLedger.filter(e => e.type === 'delivery').reduce((s, e) => s + e.amount, 0).toLocaleString()}</span>
          </div>
          <div class="summary-row">
            <span>Total Payments (Credit):</span>
            <span class="credit">Rs. ${filteredLedger.filter(e => e.type === 'payment').reduce((s, e) => s + e.amount, 0).toLocaleString()}</span>
          </div>
          <div class="summary-row total">
            <span>Closing Balance:</span>
            <span>Rs. ${(ledgerWithBalance.length > 0 ? ledgerWithBalance[ledgerWithBalance.length - 1].runningBalance : customer.opening_balance).toLocaleString()}</span>
          </div>
        </div>
        
        <script>
          window.onload = () => {
            window.print();
            setTimeout(() => window.close(), 500);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden h-full flex flex-col">
      <div className="bg-slate-50 border-b border-slate-100 p-4 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
          <FileText className="text-blue-600" />
          Wholesale Ledger
        </h2>
        
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
            >
              <option value="">All Customers</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
            <Calendar size={16} className="text-slate-400" />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="text-sm border-none focus:outline-none bg-transparent"
            />
            <span className="text-slate-300">-</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="text-sm border-none focus:outline-none bg-transparent"
            />
          </div>

          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
            <Filter size={16} className="text-slate-400" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="text-sm border-none focus:outline-none bg-transparent font-medium"
            >
              <option value="all">All Entries</option>
              <option value="delivery">Deliveries Only</option>
              <option value="payment">Payments Only</option>
            </select>
          </div>

          <button
            onClick={printStatement}
            disabled={!customerId}
            className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50 transition-colors"
          >
            <Printer size={16} /> Print Statement
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-500">Loading ledger...</div>
        ) : filteredLedger.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <FileText size={48} className="text-slate-200 mb-4" />
            <p className="font-medium">No ledger entries found.</p>
            <p className="text-sm">Try adjusting your filters.</p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                  {!customerId && <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Customer</th>}
                  <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Description</th>
                  <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Debit (Rs)</th>
                  <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Credit (Rs)</th>
                  {customerId && <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Balance</th>}
                  <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {customerId && (
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <td className="p-3 text-sm text-slate-500">-</td>
                    <td className="p-3 text-sm font-bold text-slate-700">Opening Balance</td>
                    <td className="p-3 text-right"></td>
                    <td className="p-3 text-right"></td>
                    <td className="p-3 text-right font-black text-slate-800">
                      {customers.find(c => c.id === customerId)?.opening_balance.toLocaleString()}
                    </td>
                    <td className="p-3"></td>
                  </tr>
                )}
                {(customerId ? ledgerWithBalance : filteredLedger).map((entry, idx) => (
                  <tr key={entry.id + idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="p-3 text-sm text-slate-600">{entry.date}</td>
                    {!customerId && (
                      <td className="p-3 text-sm font-medium text-slate-800">
                        {customers.find(c => c.id === entry.customer_id)?.name || 'Unknown'}
                      </td>
                    )}
                    <td className="p-3 text-sm text-slate-700">
                      {entry.type === 'delivery' ? (
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-red-500"></span>
                          Delivery: {entry.product_name} ({entry.quantity} @ {entry.rate})
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          Payment Received {entry.note ? `(${entry.note})` : ''}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-sm font-bold text-red-600 text-right">
                      {entry.type === 'delivery' ? entry.amount.toLocaleString() : '-'}
                    </td>
                    <td className="p-3 text-sm font-bold text-emerald-600 text-right">
                      {entry.type === 'payment' ? entry.amount.toLocaleString() : '-'}
                    </td>
                    {customerId && (
                      <td className={`p-3 text-sm font-black text-right ${'runningBalance' in entry && (entry.runningBalance as number) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {'runningBalance' in entry ? (entry.runningBalance as number).toLocaleString() : ''}
                      </td>
                    )}
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => startEdit(entry)}
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Edit Entry"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(entry)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Entry"
                        >
                          <Trash2 size={16} />
                        </button>
                        <button
                          onClick={() => printReceipt(entry, 'thermal')}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Print Thermal Receipt"
                        >
                          <Printer size={16} />
                        </button>
                        <button
                          onClick={() => printReceipt(entry, 'a4')}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Print A4 Invoice"
                        >
                          <FileText size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingEntry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Edit2 size={18} className="text-amber-500" />
                Edit {editingEntry.type === 'delivery' ? 'Delivery' : 'Payment'}
              </h3>
              <button onClick={() => setEditingEntry(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date</label>
                <input
                  type="date"
                  value={editForm.date}
                  onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {editingEntry.type === 'delivery' ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Product</label>
                    <select
                      value={editForm.product_id}
                      onChange={e => setEditForm({ ...editForm, product_id: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select Product</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Quantity</label>
                      <input
                        type="number"
                        value={editForm.quantity}
                        onChange={e => setEditForm({ ...editForm, quantity: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Rate</label>
                      <input
                        type="number"
                        value={editForm.rate}
                        onChange={e => setEditForm({ ...editForm, rate: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Amount</label>
                  <input
                    type="number"
                    value={editForm.amount}
                    onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Note</label>
                <input
                  type="text"
                  value={editForm.note}
                  onChange={e => setEditForm({ ...editForm, note: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Optional note"
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                onClick={() => setEditingEntry(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                {isSaving ? 'Saving...' : <><Save size={16} /> Save Changes</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WholesaleLedger;
