
import React from 'react';

interface ThermalPrintViewProps {
  profile: '80' | '58' | 'A4';
  fontSize: 'sm' | 'md' | 'lg';
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

/**
 * ThermalPrintView: A dedicated component for generating professional thermal receipts.
 * Designed to be rendered to static HTML and injected into an isolated print window.
 */
const APP_LOGO = "https://i.postimg.cc/D8SFv02C/PHOTO_2026_02_21_21_44_10.jpg";

const ThermalPrintView: React.FC<ThermalPrintViewProps> = ({ 
  profile, 
  fontSize, 
  title, 
  subtitle, 
  children 
}) => {
  const containerClass = profile === 'A4' ? 'thermal-A4' : `thermal-${profile}`;
  const textClass = `print-text-${fontSize}`;

  return (
    <div className={`${containerClass} ${textClass} space-y-4 text-slate-900 bg-white mx-auto`}>
      <div className="text-center space-y-2">
        {/* Letterhead Style Logo */}
        <div className="flex justify-center mb-2">
          <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-black">
            <img 
              src={APP_LOGO} 
              alt="Logo" 
              className="w-full h-full object-cover block"
              style={{ filter: 'grayscale(1) contrast(1.5)' }}
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

        <div className="space-y-0.5">
          <h2 className="text-xl font-black uppercase tracking-tighter italic leading-none">{title}</h2>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Premium Dairy Products</p>
        </div>
        
        {/* Shop Contact Info */}
        <div className="flex flex-col items-center gap-0.5 mt-2">
          <p className="text-[9px] font-bold">Street#13, Bazaar#3, Razabad, Faisalabad</p>
          <p className="text-[9px] font-bold">Contact: +92 326 0525249</p>
        </div>

        {subtitle && (
          <div className="mt-2 py-1 bg-slate-900 text-white rounded-sm">
            <p className="text-[9px] font-black uppercase tracking-widest">{subtitle}</p>
          </div>
        )}
        <div className="border-dashed-print mt-2"></div>
      </div>
      
      <div className="print-content">
        {children}
      </div>
      
      <div className={profile === 'A4' ? "pt-12 text-center border-t border-slate-200" : "border-dashed-print"}></div>
      <div className="text-center pt-2">
        <p className={profile === 'A4' ? "text-[10px] font-black uppercase tracking-widest text-slate-400" : "text-[7px] font-black uppercase tracking-[0.2em]"}>
          DairyPro Pakistan Cloud Ledger
        </p>
        <p className={profile === 'A4' ? "hidden" : "text-[6px] font-bold text-slate-500 mt-1 italic"}>
          Quality & Accountability
        </p>
      </div>
    </div>
  );
};

export default ThermalPrintView;
