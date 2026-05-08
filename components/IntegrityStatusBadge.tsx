import React, { useState, useEffect } from 'react';
import { UserRole } from '../types';

interface IntegrityStatusBadgeProps {
  initialStatus: 'verified' | 'syncing' | 'conflict' | 'warning';
  role: UserRole;
}

const IntegrityStatusBadge: React.FC<IntegrityStatusBadgeProps> = ({ initialStatus, role }) => {
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    const handleStatusChange = (e: CustomEvent) => {
      setStatus(e.detail.status);
    };
    window.addEventListener('integrity-status-change', handleStatusChange as EventListener);
    return () => window.removeEventListener('integrity-status-change', handleStatusChange as EventListener);
  }, []);

  return (
    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border ${status === 'verified' ? 'bg-green-50 border-green-200 text-green-600' : status === 'syncing' ? 'bg-amber-50 border-amber-200 text-amber-600' : status === 'warning' ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-red-50 border-red-200 text-red-600'}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${status === 'verified' ? 'bg-green-500' : status === 'syncing' ? 'bg-amber-500 animate-pulse' : status === 'warning' ? 'bg-orange-500 animate-pulse' : 'bg-red-500 animate-pulse'}`} />
      <span className="text-[8px] font-black uppercase tracking-widest">
        {status === 'verified' ? 'Verified' : status === 'syncing' ? 'Syncing' : status === 'warning' ? (role === UserRole.OWNER ? 'Storage Warning' : 'Verified') : 'Drift'}
      </span>
    </div>
  );
};

export default IntegrityStatusBadge;
