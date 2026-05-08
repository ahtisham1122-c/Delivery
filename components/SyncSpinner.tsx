import React, { useState, useEffect } from 'react';
import { RefreshCcw } from 'lucide-react';

const SyncSpinner: React.FC = () => {
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const handleSyncChange = (e: CustomEvent) => {
      if (e.detail.syncing !== undefined) setSyncing(e.detail.syncing);
    };
    window.addEventListener('sync-status-change', handleSyncChange as EventListener);
    return () => window.removeEventListener('sync-status-change', handleSyncChange as EventListener);
  }, []);

  return <RefreshCcw size={18} className={syncing ? 'animate-spin' : ''} />;
};

export default SyncSpinner;
