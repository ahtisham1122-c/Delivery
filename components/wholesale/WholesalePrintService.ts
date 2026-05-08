import { WSCustomer, WSDelivery } from '../../types/wholesale';

export const wholesalePrintService = {
  printWholesaleThermal(
    entries: (WSDelivery & { product_name: string })[],
    customer: WSCustomer,
    date: string,
    totalAmount: number,
    balanceBefore: number,
    balanceAfter: number
  ) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Thermal Receipt</title>
        <style>
          @page { margin: 0; }
          body { 
            font-family: monospace; 
            width: 80mm; 
            margin: 0 auto; 
            padding: 10px; 
            font-size: 16px; 
            font-weight: 700;
            color: #000;
          }
          .center { text-align: center; }
          .right { text-align: right; }
          .bold { font-weight: 900; }
          .divider { border-top: 1px dashed #000; margin: 10px 0; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 2px 0; text-align: left; }
          th.right, td.right { text-align: right; }
        </style>
      </head>
      <body>
        <div class="center" style="margin-bottom: 10px;">
          <img src="https://i.postimg.cc/D8SFv02C/PHOTO-2026-02-21-21-44-10.jpg" alt="Logo" style="width: 60px; height: auto; margin: 0 auto; border-radius: 8px;" referrerPolicy="no-referrer" />
        </div>
        <div class="center bold" style="font-size: 24px; margin-bottom: 2px;">Gujjar Milk Shop</div>
        <div class="center bold" style="font-size: 16px; margin-bottom: 2px;">St#13, Razabad, Faisalabad</div>
        <div class="center bold" style="font-size: 16px; margin-bottom: 10px;">Phone: +92 326 0525249</div>
        <div class="center" style="margin-bottom: 10px; font-weight: 900; font-size: 18px; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 4px 0;">Wholesale Delivery</div>
        
        <div>Date: ${date}</div>
        <div>Customer: ${customer.name}</div>
        
        <div class="divider"></div>
        
        <div style="margin-bottom: 10px;">
          ${entries.map(e => `
            <div style="margin-bottom: 8px;">
              <div class="bold">${e.product_name}</div>
              <table>
                <tr>
                  <td>Qty: ${e.quantity}</td>
                  <td>Rate: Rs. ${e.rate}</td>
                  <td class="right bold">Rs. ${e.quantity * e.rate}</td>
                </tr>
              </table>
            </div>
          `).join('')}
        </div>
        
        <div class="divider"></div>
        
        <table>
          <tr>
            <td class="bold">Grand Total:</td>
            <td class="right bold">Rs. ${totalAmount}</td>
          </tr>
          <tr>
            <td>Previous Balance:</td>
            <td class="right">Rs. ${balanceBefore}</td>
          </tr>
          <tr>
            <td class="bold">New Balance:</td>
            <td class="right bold">Rs. ${balanceAfter}</td>
          </tr>
        </table>
        
        <div class="divider"></div>
        <div class="center">Thank you for your business!</div>
        
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
  },

  printWholesalePaymentThermal(
    customerName: string,
    date: string,
    amount: number,
    mode: string,
    note: string,
    balanceBefore: number,
    balanceAfter: number
  ) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Payment Receipt</title>
        <style>
          @page { margin: 0; }
          body { font-family: monospace; width: 80mm; margin: 0 auto; padding: 10px; font-size: 16px; font-weight: 700; color: #000; }
          .center { text-align: center; }
          .right { text-align: right; }
          .bold { font-weight: 900; }
          .divider { border-top: 1px dashed #000; margin: 10px 0; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 2px 0; text-align: left; }
          th.right, td.right { text-align: right; }
        </style>
      </head>
      <body>
        <div class="center" style="margin-bottom: 10px;">
          <img src="https://i.postimg.cc/D8SFv02C/PHOTO-2026-02-21-21-44-10.jpg" alt="Logo" style="width: 60px; height: auto; margin: 0 auto; border-radius: 8px;" referrerPolicy="no-referrer" />
        </div>
        <div class="center bold" style="font-size: 24px; margin-bottom: 2px;">Gujjar Milk Shop</div>
        <div class="center bold" style="font-size: 16px; margin-bottom: 2px;">St#13, Razabad, Faisalabad</div>
        <div class="center bold" style="font-size: 16px; margin-bottom: 10px;">Phone: +92 326 0525249</div>
        <div class="center" style="margin-bottom: 10px; font-weight: 900; font-size: 18px; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 4px 0;">Payment Receipt</div>
        
        <div>Date: ${date}</div>
        <div>Customer: ${customerName}</div>
        
        <div class="divider"></div>
        
        <table>
          <tr>
            <td>Amount Received:</td>
            <td class="right bold">Rs. ${amount}</td>
          </tr>
          <tr>
            <td>Payment Mode:</td>
            <td class="right">${mode}</td>
          </tr>
          ${note ? `<tr><td colspan="2">Note: ${note}</td></tr>` : ''}
        </table>
        
        <div class="divider"></div>
        
        <table>
          <tr>
            <td>Previous Balance:</td>
            <td class="right">Rs. ${balanceBefore}</td>
          </tr>
          <tr>
            <td class="bold">New Balance:</td>
            <td class="right bold">Rs. ${balanceAfter}</td>
          </tr>
        </table>
        
        <div class="divider"></div>
        <div class="center">Thank you for your payment!</div>
        
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
  },

  printWholesaleA4(
    entries: (WSDelivery & { product_name: string, unit: string })[],
    customer: WSCustomer,
    date: string,
    totalAmount: number,
    balanceBefore: number,
    balanceAfter: number,
    invoiceNumber: string
  ) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${invoiceNumber}</title>
        <style>
          @page { size: A4; margin: 20mm; }
          body { 
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
            color: #333;
            line-height: 1.5;
          }
          .header { display: flex; justify-content: space-between; margin-bottom: 40px; border-bottom: 2px solid #333; padding-bottom: 20px; }
          .shop-details h1 { margin: 0 0 5px 0; color: #1e3a8a; }
          .invoice-details { text-align: right; }
          .invoice-details h2 { margin: 0 0 10px 0; color: #64748b; text-transform: uppercase; letter-spacing: 2px; }
          .customer-block { margin-bottom: 40px; }
          .customer-block h3 { margin: 0 0 10px 0; color: #64748b; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
          th { background: #f8fafc; padding: 12px; text-align: left; border-bottom: 2px solid #cbd5e1; color: #475569; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; }
          td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
          .right { text-align: right; }
          .totals { width: 50%; margin-left: auto; }
          .totals table th, .totals table td { border: none; padding: 8px 12px; }
          .totals table tr.bold td { font-weight: bold; border-top: 2px solid #333; }
          .footer { margin-top: 60px; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="shop-details" style="display: flex; align-items: center; gap: 15px;">
            <img src="https://i.postimg.cc/D8SFv02C/PHOTO-2026-02-21-21-44-10.jpg" alt="Logo" style="width: 80px; height: auto; border-radius: 8px;" referrerPolicy="no-referrer" />
            <div>
              <h1>Gujjar Milk Shop</h1>
              <div>St#13, Razabad, Faisalabad</div>
              <div>Phone: +92 326 0525249</div>
            </div>
          </div>
          <div class="invoice-details">
            <h2>INVOICE</h2>
            <div><strong>Invoice No:</strong> ${invoiceNumber}</div>
            <div><strong>Date:</strong> ${date}</div>
          </div>
        </div>
        
        <div class="customer-block">
          <h3>Billed To:</h3>
          <div><strong>${customer.name}</strong></div>
          ${customer.address ? `<div>${customer.address}</div>` : ''}
          ${customer.phone ? `<div>Phone: ${customer.phone}</div>` : ''}
          ${customer.contact_person ? `<div>Attn: ${customer.contact_person}</div>` : ''}
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th class="right">Quantity</th>
              <th class="right">Unit</th>
              <th class="right">Rate</th>
              <th class="right">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map(e => `
              <tr>
                <td>${e.product_name}</td>
                <td class="right">${e.quantity}</td>
                <td class="right">${e.unit}</td>
                <td class="right">Rs. ${e.rate}</td>
                <td class="right">Rs. ${e.quantity * e.rate}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="totals">
          <table>
            <tr>
              <td>Subtotal:</td>
              <td class="right">Rs. ${totalAmount}</td>
            </tr>
            <tr>
              <td>Previous Balance:</td>
              <td class="right">Rs. ${balanceBefore}</td>
            </tr>
            <tr class="bold">
              <td>Total Due:</td>
              <td class="right">Rs. ${balanceAfter}</td>
            </tr>
          </table>
        </div>
        
        <div class="footer">
          <div>Thank you for your business!</div>
          <div>Please ensure timely payments according to your ${customer.payment_cycle || 'agreed'} cycle.</div>
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
  }
};
