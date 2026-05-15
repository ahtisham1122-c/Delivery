import React, { useState, useEffect } from 'react';
import { wholesaleDataService } from '../../services/wholesaleDataService';
import { WSCustomer } from '../../types/wholesale';
import { Users, Plus, Save, Edit2, CheckCircle2, XCircle } from 'lucide-react';

const WholesaleCustomerManager: React.FC = () => {
  const [customers, setCustomers] = useState<WSCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'pending'>('idle');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<WSCustomer>>({});

  useEffect(() => {
    loadCustomers();

    const handlePoll = () => {
      loadCustomers(true);
    };
    window.addEventListener('wholesale_poll', handlePoll);
    return () => window.removeEventListener('wholesale_poll', handlePoll);
  }, []);

  const loadCustomers = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    const data = await wholesaleDataService.fetchAllWholesaleCustomers();
    setCustomers(data);
    if (!isSilent) setLoading(false);
  };

  const handleEdit = (customer: WSCustomer) => {
    setEditingId(customer.id);
    setFormData(customer);
  };

  const handleAddNew = () => {
    // No client-side UUID — the database generates the id via gen_random_uuid()
    // inside save_ws_customer(). This keeps the form working on HTTP / older
    // browsers where crypto.randomUUID() is undefined.
    setEditingId('__new__');
    setFormData({
      name: '',
      contact_person: '',
      phone: '',
      address: '',
      payment_cycle: 'Weekly',
      opening_balance: 0,
      active: true,
      notes: ''
    });
  };

  const handleSave = async () => {
    if (!formData.name) {
      alert('Customer name is required.');
      return;
    }

    setSaving(true);
    setSyncStatus('saving');
    try {
      const saved = await wholesaleDataService.saveWholesaleCustomer(formData as WSCustomer);
      if (saved) {
        setSyncStatus(navigator.onLine ? 'saved' : 'pending');
        setTimeout(() => {
          setEditingId(null);
          setFormData({});
          setSyncStatus('idle');
          loadCustomers();
        }, 500);
      } else {
        alert('Failed to save customer (no response from server).');
        setSyncStatus('idle');
      }
    } catch (err: any) {
      alert('Failed to save customer:\n\n' + (err?.message || String(err)));
      setSyncStatus('idle');
    }
    setSaving(false);
  };

  const handleToggleActive = async (customer: WSCustomer) => {
    setSyncStatus('saving');
    const updated = { ...customer, active: !customer.active };
    try {
      const saved = await wholesaleDataService.saveWholesaleCustomer(updated);
      if (saved) {
        setSyncStatus(navigator.onLine ? 'saved' : 'pending');
        setTimeout(() => setSyncStatus('idle'), 500);
      } else {
        setSyncStatus('idle');
      }
    } catch (err: any) {
      alert('Failed to toggle customer:\n\n' + (err?.message || String(err)));
      setSyncStatus('idle');
    }
    loadCustomers();
  };

  if (loading && customers.length === 0) {
    return <div className="p-8 text-center text-slate-500">Loading customers...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <Users className="text-blue-600" />
            Wholesale Customers
          </h2>
          <p className="text-sm text-slate-500 mt-1">Manage hotels, restaurants, and bulk buyers</p>
        </div>
        <button
          onClick={handleAddNew}
          disabled={editingId !== null}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50 transition-colors shadow-md shadow-blue-600/20"
        >
          <Plus size={16} /> Add Customer
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Name / Business</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contact Info</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Payment Cycle</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Opening Bal.</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Status</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {editingId && !customers.find(c => c.id === editingId) && (
              <tr className="border-b border-slate-200 bg-blue-50/50">
                <td className="p-4" colSpan={6}>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Business Name *</label>
                      <input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Hotel Name" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Contact Person</label>
                      <input type="text" value={formData.contact_person || ''} onChange={e => setFormData({...formData, contact_person: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Manager Name" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Phone</label>
                      <input type="text" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="0300-0000000" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-500 mb-1">Address</label>
                      <input type="text" value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Full Address" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Payment Cycle</label>
                      <select value={formData.payment_cycle || 'Weekly'} onChange={e => setFormData({...formData, payment_cycle: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                        <option value="Daily">Daily</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Bi-Weekly">Bi-Weekly</option>
                        <option value="Monthly">Monthly</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Opening Balance (Rs)</label>
                      <input type="number" value={formData.opening_balance || 0} onChange={e => setFormData({...formData, opening_balance: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-500 mb-1">Notes</label>
                      <input type="text" value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Any special instructions..." />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingId(null)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">Cancel</button>
                    <button onClick={handleSave} disabled={saving || syncStatus === 'saving'} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50"><Save size={16} /> {syncStatus === 'saving' ? 'Saving...' : 'Save Customer'}</button>
                  </div>
                </td>
              </tr>
            )}

            {customers.map(customer => (
              editingId === customer.id ? (
                <tr key={customer.id} className="border-b border-slate-200 bg-blue-50/50">
                  <td className="p-4" colSpan={6}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Business Name *</label>
                        <input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Contact Person</label>
                        <input type="text" value={formData.contact_person || ''} onChange={e => setFormData({...formData, contact_person: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Phone</label>
                        <input type="text" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-500 mb-1">Address</label>
                        <input type="text" value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Payment Cycle</label>
                        <select value={formData.payment_cycle || 'Weekly'} onChange={e => setFormData({...formData, payment_cycle: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                          <option value="Daily">Daily</option>
                          <option value="Weekly">Weekly</option>
                          <option value="Bi-Weekly">Bi-Weekly</option>
                          <option value="Monthly">Monthly</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Opening Balance (Rs)</label>
                        <input type="number" value={formData.opening_balance || 0} onChange={e => setFormData({...formData, opening_balance: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-500 mb-1">Notes</label>
                        <input type="text" value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditingId(null)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">Cancel</button>
                      <button onClick={handleSave} disabled={saving || syncStatus === 'saving'} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50"><Save size={16} /> {syncStatus === 'saving' ? 'Saving...' : 'Update Customer'}</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={customer.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${!customer.active ? 'opacity-60' : ''}`}>
                  <td className="p-4">
                    <div className="font-bold text-slate-800">{customer.name}</div>
                    {customer.notes && <div className="text-xs text-slate-500 truncate max-w-[200px]">{customer.notes}</div>}
                  </td>
                  <td className="p-4">
                    <div className="text-sm text-slate-700">{customer.contact_person || '-'}</div>
                    <div className="text-xs text-slate-500">{customer.phone || '-'}</div>
                  </td>
                  <td className="p-4 text-sm text-slate-600">{customer.payment_cycle || '-'}</td>
                  <td className="p-4 text-right font-bold text-slate-700">Rs. {Number(customer.opening_balance ?? 0).toLocaleString()}</td>
                  <td className="p-4 text-center">
                    <button 
                      onClick={() => handleToggleActive(customer)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${customer.active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {customer.active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                      {customer.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => handleEdit(customer)}
                      disabled={editingId !== null}
                      className="text-blue-600 hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50 disabled:opacity-50 transition-colors"
                    >
                      <Edit2 size={18} />
                    </button>
                  </td>
                </tr>
              )
            ))}
            
            {customers.length === 0 && !editingId && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">
                  No wholesale customers found. Click "Add Customer" to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WholesaleCustomerManager;
