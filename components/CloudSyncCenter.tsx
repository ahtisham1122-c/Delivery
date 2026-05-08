
import React, { useState } from 'react';
import { 
  Cloud, 
  RefreshCcw, 
  ArrowRight,
  Link2,
  HelpCircle,
  DownloadCloud,
  Download,
  ShieldAlert,
  AlertTriangle
} from 'lucide-react';
import { CloudConfig } from '../types';

interface CloudSyncCenterProps {
  config: CloudConfig;
  setConfig: React.Dispatch<React.SetStateAction<CloudConfig>>;
  onSync: () => void;
  onRestore: () => void;
  isSyncing: boolean;
  lastSync: string | null;
  totalRecordsCount: number;
  onDownloadBackup: () => void;
}

const CloudSyncCenter: React.FC<CloudSyncCenterProps> = ({ 
  config, setConfig, onSync, onRestore, isSyncing, lastSync, totalRecordsCount, onDownloadBackup 
}) => {
  const [localUrl, setLocalUrl] = useState(config.supabaseUrl || '');
  const [localKey, setLocalKey] = useState(config.supabaseKey || '');
  const [localBusinessId, setLocalBusinessId] = useState(config.businessId || '');
  const [showHelp, setShowHelp] = useState<string | null>(null);

  const storageHealth = Math.min(100, (totalRecordsCount / 10000) * 100); 

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setConfig({ 
      ...config, 
      supabaseUrl: localUrl, 
      supabaseKey: localKey, 
      businessId: localBusinessId,
      status: 'connected' 
    });
    alert("Supabase Credentials Saved.");
  };

  return (
    <div className="p-4 md:p-8 space-y-8 pb-24">
      {/* Cloud Status Header */}
      <div className="bg-slate-900 p-8 md:p-12 rounded-[3.5rem] text-white relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-center md:text-left space-y-2">
            <div className="flex items-center justify-center md:justify-start gap-3">
              <div className={`p-3 rounded-2xl ${config.status === 'connected' ? 'bg-green-500 shadow-green-500/20' : 'bg-slate-700'} shadow-xl transition-all`}>
                <Cloud size={32} />
              </div>
              <h2 className="text-3xl font-black italic tracking-tighter uppercase">Cloud Vault</h2>
            </div>
            <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px]">Multi-Device Synchronization</p>
          </div>

          <div className="flex flex-col items-center md:items-end gap-4">
             <div className="flex items-center gap-4 bg-white/5 border border-white/10 px-6 py-4 rounded-3xl">
                <div>
                   <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest text-right">Last Pulse</p>
                   <p className="text-lg font-black text-blue-400">{lastSync || 'Never Synced'}</p>
                </div>
                <button 
                  disabled={isSyncing || !config.supabaseUrl}
                  onClick={onSync}
                  className={`p-4 rounded-2xl transition-all ${isSyncing ? 'bg-blue-600 animate-spin' : 'bg-white/10 hover:bg-white/20'}`}
                >
                  <RefreshCcw size={24} />
                </button>
             </div>
          </div>
        </div>
      </div>

      {/* NEW: System Maintenance Section (Moved from Dashboard) */}
      <div className="bg-white p-8 md:p-12 rounded-[3rem] border border-slate-200 shadow-sm flex flex-col md:flex-row gap-8 items-center">
        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-3">
             <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl"><ShieldAlert size={24}/></div>
             <h3 className="text-xl font-black text-slate-900 tracking-tighter uppercase">Local Health</h3>
          </div>
          <p className="text-xs font-bold text-slate-500 leading-relaxed">
            Your phone is currently storing <span className="text-slate-900 font-black">{totalRecordsCount.toLocaleString()} entries</span>. 
            Once this hits 10,000, consider using the Archive feature to keep the app fast.
          </p>
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
              <span>Local Storage Fill</span>
              <span>{storageHealth.toFixed(1)}%</span>
            </div>
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
              <div 
                className={`h-full transition-all duration-1000 ${storageHealth > 80 ? 'bg-red-500' : 'bg-blue-500'}`} 
                style={{ width: `${storageHealth}%` }}
              ></div>
            </div>
          </div>
        </div>
        <div className="w-full md:w-auto">
           <button 
              onClick={onDownloadBackup}
              className="w-full md:px-10 py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl flex items-center justify-center gap-3"
            >
              <Download size={18} /> Download Manual JSON
            </button>
            <p className="text-center text-[8px] font-bold text-slate-400 uppercase mt-2 tracking-widest">Emergency Offline Backup</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Setup Form */}
        <div className="bg-white p-8 md:p-12 rounded-[3rem] border border-slate-200 shadow-sm space-y-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><Link2 size={24}/></div>
            <h3 className="text-xl font-black text-slate-900 tracking-tighter uppercase">Supabase Connection</h3>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Business ID (Unique)</label>
                <button type="button" onClick={() => setShowHelp(showHelp === 'bid' ? null : 'bid')} className="text-blue-500 hover:text-blue-700 mr-4"><HelpCircle size={14}/></button>
              </div>
              <input 
                required
                className="w-full px-8 py-5 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-xl outline-none focus:border-blue-600 transition-all"
                placeholder="MADINA-DAIRY"
                value={localBusinessId}
                onChange={e => setLocalBusinessId(e.target.value.toUpperCase().replace(/\s/g, '-'))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Supabase Project URL</label>
              <input required className="w-full px-8 py-5 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-lg outline-none focus:border-blue-600" value={localUrl} onChange={e => setLocalUrl(e.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Anon / Public Key</label>
              <input required type="password" className="w-full px-8 py-5 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-lg outline-none focus:border-blue-600" value={localKey} onChange={e => setLocalKey(e.target.value)} />
            </div>
            
            <button type="submit" className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-xl hover:bg-blue-600 shadow-2xl transition-all flex items-center justify-center gap-4">
               Update Credentials <ArrowRight size={24} />
            </button>
          </form>
        </div>

        {/* Restore Section */}
        <div className="bg-slate-50 p-8 md:p-12 rounded-[3rem] border border-slate-200 shadow-inner space-y-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white text-slate-900 rounded-2xl shadow-sm"><DownloadCloud size={24}/></div>
            <h3 className="text-xl font-black text-slate-900 tracking-tighter uppercase">Data Recovery</h3>
          </div>
          
          <p className="text-xs font-bold text-slate-500 leading-relaxed">
            Switching phones? Use this to pull all your shop data back from the cloud instantly.
          </p>

          <button 
            disabled={isSyncing || !config.supabaseUrl}
            onClick={onRestore}
            className="w-full py-6 bg-white border-4 border-slate-200 text-slate-900 rounded-[2rem] font-black text-xl hover:border-blue-600 hover:text-blue-600 transition-all active:scale-95 flex items-center justify-center gap-4 shadow-sm"
          >
            Restore Everything <DownloadCloud size={24} />
          </button>

          <div className="bg-amber-100 border-2 border-amber-200 p-6 rounded-[2rem] flex items-start gap-4">
            <AlertTriangle className="text-amber-600 shrink-0" size={24} />
            <div>
              <p className="text-[11px] font-black text-amber-900 uppercase">Warning</p>
              <p className="text-[10px] text-amber-800 font-bold leading-tight mt-1">
                Restoring data will replace everything currently on this phone.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CloudSyncCenter;
