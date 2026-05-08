
import React from 'react';
import { Cloud, CloudOff, RefreshCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SyncStatusBarProps {
  isOnline: boolean;
}

const SyncStatusBar: React.FC<SyncStatusBarProps> = ({
  isOnline
}) => {
  const [syncing, setSyncing] = React.useState(false);
  const [lastSynced, setLastSynced] = React.useState<string | null>(null);

  React.useEffect(() => {
    const handleSyncChange = (e: CustomEvent) => {
      if (e.detail.syncing !== undefined) setSyncing(e.detail.syncing);
      if (e.detail.lastSynced !== undefined) setLastSynced(e.detail.lastSynced);
    };
    window.addEventListener('sync-status-change', handleSyncChange as EventListener);
    return () => window.removeEventListener('sync-status-change', handleSyncChange as EventListener);
  }, []);
  return (
    <motion.div 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="flex items-center gap-4 px-4 py-2 bg-white/50 backdrop-blur-sm border-b border-slate-200 text-xs font-medium text-slate-600"
    >
      <div className="flex items-center gap-1.5">
        <AnimatePresence mode="wait">
          <motion.div
            key={isOnline ? 'online' : 'offline'}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {isOnline ? (
              <Cloud className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <CloudOff className="w-3.5 h-3.5 text-slate-400" />
            )}
          </motion.div>
        </AnimatePresence>
        <span>{isOnline ? 'Cloud Connected' : 'Offline Mode'}</span>
      </div>

      <div className="h-3 w-px bg-slate-200" />

      <div className="flex items-center gap-1.5">
        <AnimatePresence mode="wait">
          {syncing ? (
            <motion.div
              key="syncing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5"
            >
              <RefreshCcw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
              <span className="text-blue-600">Syncing...</span>
            </motion.div>
          ) : (
            <motion.span
              key="last-synced"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Last Synced: {lastSynced || 'Never'}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default SyncStatusBar;
