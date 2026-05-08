import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutDashboard, Truck, Wallet, FileText, Users } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

import WholesaleDashboard from './WholesaleDashboard';
import WholesaleDeliveryEntry from './WholesaleDeliveryEntry';
import WholesalePaymentEntry from './WholesalePaymentEntry';
import WholesaleLedger from './WholesaleLedger';
import WholesaleCustomerManager from './WholesaleCustomerManager';

const WholesaleHub: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshWholesaleData = () => {
    setRefreshKey(prev => prev + 1);
  };

  useEffect(() => {
    // Subscribe to wholesale table changes
    const channel = supabase
      .channel('wholesale-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'ws_deliveries' },
        () => { refreshWholesaleData(); }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'ws_payments' },
        () => { refreshWholesaleData(); }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'ws_wholesale_customers' },
        () => { refreshWholesaleData(); }
      )
      .subscribe();

    // Also listen for manual poll event from App.tsx
    const handlePoll = () => refreshWholesaleData();
    window.addEventListener('wholesale_poll', handlePoll);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('wholesale_poll', handlePoll);
    };
  }, []);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'delivery', label: 'Delivery Entry', icon: <Truck size={18} /> },
    { id: 'payment', label: 'Payments', icon: <Wallet size={18} /> },
    { id: 'ledger', label: 'Ledger', icon: <FileText size={18} /> },
    { id: 'customers', label: 'Customers', icon: <Users size={18} /> },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <WholesaleDashboard onNavigate={setActiveTab} />;
      case 'delivery':
        return <WholesaleDeliveryEntry />;
      case 'payment':
        return <WholesalePaymentEntry />;
      case 'ledger':
        return <WholesaleLedger />;
      case 'customers':
        return <WholesaleCustomerManager />;
      default:
        return <WholesaleDashboard onNavigate={setActiveTab} />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-20">
        <div className="flex items-center gap-3 overflow-x-auto hide-scrollbar pb-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6" key={refreshKey}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default WholesaleHub;
