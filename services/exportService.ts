
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { Customer, Delivery, Payment } from '../types';
import { getCycleBoundaries } from './ledgerUtils';

class ExportManager {
  /**
   * Exports a DOM element to PDF
   */
  async exportToPDF(elementId: string, fileName: string) {
    const element = document.getElementById(elementId);
    if (!element) {
      console.error(`Element with id ${elementId} not found`);
      return;
    }

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${fileName}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  }

  /**
   * Exports individual billing data to Excel
   */
  exportBillingToExcel(customer: Customer, deliveries: Delivery[], balances: Record<string, number>) {
    const now = new Date();
    const currentCycle = getCycleBoundaries(now, customer.paymentCycle);
    const previousCycleDate = new Date(currentCycle.start);
    previousCycleDate.setDate(previousCycleDate.getDate() - 1);
    const previousCycle = getCycleBoundaries(previousCycleDate, customer.paymentCycle);

    const previousCycleDeliveries = deliveries.filter(d => {
      const dDate = new Date(d.date);
      dDate.setHours(0,0,0,0);
      return d.customerId === customer.id && dDate >= previousCycle.start && dDate <= previousCycle.end;
    });

    const currentAndFutureDeliveries = deliveries.filter(d => {
      const dDate = new Date(d.date);
      dDate.setHours(0,0,0,0);
      return d.customerId === customer.id && dDate > previousCycle.end;
    });

    const totalMilk = previousCycleDeliveries.reduce((a, b) => a + (b.liters || 0), 0);
    const milkAmount = Math.round(previousCycleDeliveries.reduce((a, b) => a + (b.totalAmount || 0), 0));
    const currentAndFutureMilkAmount = currentAndFutureDeliveries.reduce((a, b) => a + (b.totalAmount || 0), 0);
    const overallBalance = balances[customer.id] || 0;
    const netTotal = Math.round(overallBalance - currentAndFutureMilkAmount);
    const remainingBalance = Math.round(netTotal - milkAmount);

    const data = [
      ['Billing Receipt - Gujjar Milk Shop'],
      ['Customer Name', customer.name],
      ['Urdu Name', customer.urduName || ''],
      ['Account ID', customer.id.substring(0, 6).toUpperCase()],
      ['Payment Cycle', customer.paymentCycle],
      ['Billing Period', `${previousCycle.start.toLocaleDateString()} to ${previousCycle.end.toLocaleDateString()}`],
      [''],
      ['Date', 'Liters', 'Rate', 'Amount'],
      ...previousCycleDeliveries.map(d => [d.date, d.liters, d.rate, d.totalAmount]),
      [''],
      ['Summary'],
      ['Total Milk (Liters)', totalMilk.toFixed(1)],
      ['Milk Amount (Rs.)', milkAmount],
      ['Previous Dues (Rs.)', remainingBalance],
      ['Total Payable (Rs.)', netTotal],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Billing');
    XLSX.writeFile(wb, `Billing_${customer.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  /**
   * Exports summary data to Excel
   */
  exportSummaryToExcel(date: string, customers: Customer[], deliveries: Delivery[], payments: Payment[]) {
    const todayDeliveries = deliveries.filter(d => d.date === date && !d.isAdjustment);
    const todayPayments = payments.filter(p => p.date === date && !p.isAdjustment);

    const deliveryData = todayDeliveries.map(d => {
      const cust = customers.find(c => c.id === d.customerId);
      return {
        'Customer Name': cust?.name || 'Unknown',
        'Urdu Name': cust?.urduName || '',
        'Liters': d.liters,
        'Rate': d.rate,
        'Amount': d.totalAmount,
        'Type': 'Delivery'
      };
    });

    const paymentData = todayPayments.map(p => {
      const cust = customers.find(c => c.id === p.customerId);
      return {
        'Customer Name': cust?.name || 'Unknown',
        'Urdu Name': cust?.urduName || '',
        'Liters': 0,
        'Rate': 0,
        'Amount': p.amount,
        'Type': 'Payment'
      };
    });

    const combinedData = [...deliveryData, ...paymentData];
    
    const ws = XLSX.utils.json_to_sheet(combinedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Summary');
    
    // Add totals
    const totalLiters = todayDeliveries.reduce((a, b) => a + (b.liters || 0), 0);
    const totalBill = todayDeliveries.reduce((a, b) => a + (b.totalAmount || 0), 0);
    const totalRecovery = todayPayments.reduce((a, b) => a + (b.amount || 0), 0);

    XLSX.utils.sheet_add_aoa(ws, [
      [],
      ['Total Milk Delivered', totalLiters],
      ['Total Billing', totalBill],
      ['Total Recovery', totalRecovery]
    ], { origin: -1 });

    XLSX.writeFile(wb, `Daily_Summary_${date}.xlsx`);
  }

  /**
   * Exports ledger data to Excel
   */
  exportLedgerToExcel(
    customer: Customer,
    monthName: string,
    year: number,
    openingBalance: number,
    ledgerItems: any[],
    closingBalance: number
  ) {
    const data = [
      {
        'Date': 'B/F',
        'Particulars': 'Opening Balance',
        'Debit (+)': '',
        'Credit (-)': '',
        'Balance': openingBalance
      },
      ...ledgerItems.map(item => ({
        'Date': item.sortDate,
        'Particulars': item.type === 'milk' ? `${item.liters}L Milk` : 'Cash Payment',
        'Debit (+)': item.debit || '',
        'Credit (-)': item.credit || '',
        'Balance': item.runningBal
      })),
      {
        'Date': 'C/F',
        'Particulars': 'Closing Balance',
        'Debit (+)': '',
        'Credit (-)': '',
        'Balance': closingBalance
      }
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
    XLSX.writeFile(wb, `${customer.name.replace(/\s+/g, '_')}_Ledger_${monthName}_${year}.xlsx`);
  }
}

export const exportService = new ExportManager();
