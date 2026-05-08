
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

type PrintProfile = '80' | '58' | 'A4';
type PrintFontSize = 'sm' | 'md' | 'lg';

interface PrintState {
  isPrinting: boolean;
  profile: PrintProfile;
  fontSize: PrintFontSize;
}

class PrintManager {
  private state: PrintState = {
    isPrinting: false,
    profile: '80',
    fontSize: 'md'
  };

  setPrintConfig(profile: PrintProfile, fontSize: PrintFontSize) {
    this.state.profile = profile;
    this.state.fontSize = fontSize;
  }

  /**
   * Professional Isolated Thermal Printing
   * Opens a dedicated window, injects styles and content, then prints.
   */
  triggerPrint(content: React.ReactElement) {
    const { profile, fontSize } = this.state;
    
    // Create isolated print window
    const printWindow = window.open('', '_blank', 'width=600,height=800');
    if (!printWindow) {
      alert('Print blocked! Please allow popups for this application.');
      return;
    }

    // Render component to static HTML
    const htmlContent = renderToStaticMarkup(content);

    // Inject professional thermal styles
    const styles = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
      
      html, body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      body {
        margin: 0;
        padding: 0;
        font-family: 'Inter', sans-serif;
        background: white;
        color: #000000;
      }

      .thermal-58 { width: 58mm; max-width: 58mm; margin: 0 auto; }
      .thermal-80 { width: 80mm; max-width: 80mm; margin: 0 auto; }
      .thermal-A4 { width: 210mm; padding: 20mm; margin: 0 auto; }

      .print-text-sm { font-size: 14px; font-weight: 700; }
      .print-text-md { font-size: 16px; font-weight: 700; }
      .print-text-lg { font-size: 20px; font-weight: 900; }

      .font-black { font-weight: 900 !important; }
      .font-bold { font-weight: 700 !important; }
      .font-mono { font-family: 'Courier New', Courier, monospace; }
      .uppercase { text-transform: uppercase; }
      .italic { font-style: normal !important; } /* Italics are hard to read on thermal printers */
      .tracking-tighter { letter-spacing: 0 !important; } /* Tighter tracking blurs on thermal */
      .tracking-widest { letter-spacing: 0.05em !important; }
      .tracking-\\[0\\.2em\\] { letter-spacing: 0.1em !important; }
      
      .text-center { text-align: center; }
      .text-right { text-align: right; }
      
      /* Upscale all text sizes for thermal clarity */
      .text-\\[10px\\] { font-size: 14px !important; }
      .text-xs { font-size: 16px !important; }
      .text-sm { font-size: 18px !important; }
      .text-base { font-size: 20px !important; }
      .text-lg { font-size: 24px !important; }
      .text-xl { font-size: 28px !important; }
      .text-2xl { font-size: 32px !important; }
      .text-3xl { font-size: 38px !important; }
      
      .flex { display: flex; }
      .justify-between { justify-content: space-between; }
      .items-center { align-items: center; }
      .items-start { align-items: flex-start; }
      .flex-col { flex-direction: column; }
      .flex-1 { flex: 1; }
      .gap-0.5 { gap: 0.125rem; }
      .gap-2 { gap: 0.5rem; }
      
      .space-y-0.5 > * + * { margin-top: 0.125rem; }
      .space-y-1 > * + * { margin-top: 0.25rem; }
      .space-y-2 > * + * { margin-top: 0.5rem; }
      .space-y-4 > * + * { margin-top: 1rem; }
      
      .mt-1 { margin-top: 0.25rem; }
      .mt-2 { margin-top: 0.5rem; }
      .mt-4 { margin-top: 1rem; }
      .mb-2 { margin-bottom: 0.5rem; }
      .my-2 { margin-top: 0.5rem; margin-bottom: 0.5rem; }
      .my-4 { margin-top: 1rem; margin-bottom: 1rem; }
      .pt-1 { padding-top: 0.25rem; }
      .pt-2 { padding-top: 0.5rem; }
      .pt-12 { padding-top: 3rem; }
      .p-1 { padding: 0.25rem; }
      .p-2 { padding: 0.5rem; }
      
      .bg-slate-100 { background-color: #ffffff !important; border: 1px solid #000000 !important; }
      .bg-slate-900 { background-color: #000000 !important; }
      .bg-white { background-color: #ffffff !important; }
      .text-white { color: #ffffff !important; }
      
      .text-slate-900 { color: #000000 !important; }
      .text-slate-500 { color: #000000 !important; }
      .text-slate-400 { color: #000000 !important; }
      .text-green-600 { color: #000000 !important; }
      .text-green-400 { color: #000000 !important; }
      .text-blue-600 { color: #000000 !important; }
      .text-red-500 { color: #000000 !important; }
      .text-red-400 { color: #000000 !important; }
      .text-blue-400 { color: #ffffff !important; }
      
      .opacity-70 { opacity: 1 !important; }
      .opacity-60 { opacity: 1 !important; }
      .opacity-50 { opacity: 1 !important; }
      
      .h-1 { height: 0.25rem; }
      .w-16 { width: 4rem; }
      .h-16 { height: 4rem; }
      .w-20 { width: 5rem; }
      .h-20 { height: 5rem; }
      .w-full { width: 100%; }
      .h-full { height: 100%; }
      .mx-auto { margin-left: auto; margin-right: auto; }
      .rounded-full { border-radius: 9999px; }
      .rounded-sm { border-radius: 0.125rem; }
      .rounded-lg { border-radius: 0.5rem; }
      .rounded-xl { border-radius: 0.75rem; }
      .rounded-2xl { border-radius: 1rem; }
      .overflow-hidden { overflow: hidden; }
      .object-cover { object-fit: cover; }
      .shadow-sm { box-shadow: none; }
      
      .border { border: 1px solid #000000; }
      .border-2 { border: 2px solid #000000; }
      .border-4 { border: 4px solid #000000; }
      .border-t { border-top: 1px solid #000000; }
      .border-l-2 { border-left: 2px solid #000000; }
      .border-black { border-color: #000000; }
      .border-slate-900 { border-color: #000000; }
      .border-slate-200 { border-color: #000000; }

      .border-dashed-print {
        border-top: 2px dashed #000;
        margin: 12px 0;
        width: 100%;
      }

      @media print {
        @page { 
          margin: 0; 
          size: 80mm auto; 
        }
        body { 
          margin: 0; 
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .no-print { display: none; }
      }
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Receipt</title>
          <style>${styles}</style>
        </head>
        <body class="print-text-${fontSize}">
          <div class="thermal-${profile}">
            ${htmlContent}
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 1000);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  getState() {
    return this.state;
  }
}

export const printService = new PrintManager();
