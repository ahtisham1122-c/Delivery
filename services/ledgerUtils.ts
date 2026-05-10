
import { Customer, Delivery, Payment, PaymentCycle } from '../types';

export interface CycleBreakdown {
  cycleName: string;
  startDate: Date;
  endDate: Date;
  outstanding: number;
}

/**
 * Returns the start and end dates for the cycle containing the given date.
 */
export const getCycleBoundaries = (date: Date, cycleType: PaymentCycle): { start: Date; end: Date; name: string } => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  let start: Date;
  let end: Date;
  let name: string;

  const monthName = date.toLocaleString('default', { month: 'short' });

  switch (cycleType) {
    case PaymentCycle.TEN_DAY:
      if (day <= 10) {
        start = new Date(year, month, 1);
        end = new Date(year, month, 10);
        name = `1-10 ${monthName}`;
      } else if (day <= 20) {
        start = new Date(year, month, 11);
        end = new Date(year, month, 20);
        name = `11-20 ${monthName}`;
      } else {
        start = new Date(year, month, 21);
        end = new Date(year, month + 1, 0); // Last day of month
        name = `21-${end.getDate()} ${monthName}`;
      }
      break;

    case PaymentCycle.FIFTEEN_DAY:
      if (day <= 15) {
        start = new Date(year, month, 1);
        end = new Date(year, month, 15);
        name = `1-15 ${monthName}`;
      } else {
        start = new Date(year, month, 16);
        end = new Date(year, month + 1, 0);
        name = `16-${end.getDate()} ${monthName}`;
      }
      break;

    case PaymentCycle.MONTHLY:
      start = new Date(year, month, 1);
      end = new Date(year, month + 1, 0);
      name = `${date.toLocaleString('default', { month: 'long' })} ${year}`;
      break;

    case PaymentCycle.DAILY:
    default:
      start = new Date(year, month, day);
      end = new Date(year, month, day);
      name = `${day} ${monthName}`;
      break;
  }

  // Set times to start/end of day for accurate comparison
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end, name };
};

/**
 * Calculates the outstanding balance per cycle for a customer.
 * Follows the FIFO (First-In-First-Out) principle for payments.
 */
export const calculateCycleBreakdown = (
  customer: Customer,
  deliveries: Delivery[],
  payments: Payment[],
  authoritativeBalance?: number,
  referenceDate: Date = new Date()
): CycleBreakdown[] => {
  const customerDeliveries = deliveries
    .filter(d => d.customerId === customer.id && !d.deleted)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const customerPayments = payments
    .filter(p => p.customerId === customer.id && !p.deleted);

  const totalPayments = customerPayments.reduce((sum, p) => {
    const val = Number(p.amount);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);
  
  // The "Total Credit" is the sum of all payments.
  // If opening balance is negative, it's an advance (credit).
  const startBal = Number(customer.openingBalance) || 0;
  let availableCredit = totalPayments + (startBal < 0 ? Math.abs(startBal) : 0);

  // The "Debits" are opening balance (if positive) and all deliveries.
  const debits: { amount: number; date: Date; isOpening?: boolean }[] = [];
  
  if (startBal > 0) {
    // Opening balance is treated as the oldest debit. 
    // We use a very old date or the customer's creation date.
    debits.push({ 
      amount: startBal, 
      date: new Date(customer.createdAt || '2000-01-01'),
      isOpening: true 
    });
  }

  customerDeliveries.forEach(d => {
    debits.push({ amount: d.totalAmount || 0, date: new Date(d.date) });
  });

  // Apply credit to debits in FIFO order
  const outstandingDebits = debits.map(debit => {
    const amountToCover = Math.min(debit.amount, availableCredit);
    availableCredit -= amountToCover;
    return { ...debit, outstanding: debit.amount - amountToCover };
  });

  // Group outstanding debits by cycle
  const breakdownMap = new Map<string, CycleBreakdown>();

  outstandingDebits.forEach(debit => {
    // If it's an opening balance, we might want to put it in a special "Previous" cycle
    // or the cycle it belongs to based on its date.
    // For simplicity and to match "Previous Dues", we'll use its date.
    const { start, end, name } = getCycleBoundaries(debit.date, customer.paymentCycle);
    
    const existing = breakdownMap.get(name);
    if (existing) {
      existing.outstanding += debit.outstanding;
    } else {
      breakdownMap.set(name, {
        cycleName: name,
        startDate: start,
        endDate: end,
        outstanding: debit.outstanding
      });
    }
  });

  // If there's still available credit left (Advance Payment), 
  // we show it as a negative outstanding in the current/latest cycle.
  if (availableCredit > 0) {
    const { start, end, name } = getCycleBoundaries(referenceDate, customer.paymentCycle);
    const existing = breakdownMap.get(name);
    if (existing) {
      existing.outstanding -= availableCredit;
    } else {
      breakdownMap.set(name, {
        cycleName: name,
        startDate: start,
        endDate: end,
        outstanding: -availableCredit
      });
    }
  }

  // Convert map to array and sort by date (oldest first)
  let breakdowns = Array.from(breakdownMap.values())
    .filter(b => Math.abs(b.outstanding) > 0.01) // Filter out zero balances
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  // Consolidate all past cycles into the immediate previous cycle
  const currentCycleInfo = getCycleBoundaries(referenceDate, customer.paymentCycle);
  
  const pastBreakdowns = breakdowns.filter(b => b.startDate.getTime() < currentCycleInfo.start.getTime());
  const currentAndFutureBreakdowns = breakdowns.filter(b => b.startDate.getTime() >= currentCycleInfo.start.getTime());

  if (pastBreakdowns.length > 0) {
    const previousCycleDate = new Date(currentCycleInfo.start.getTime() - 1);
    const previousCycleInfo = getCycleBoundaries(previousCycleDate, customer.paymentCycle);
    
    const totalPastOutstanding = pastBreakdowns.reduce((sum, b) => sum + b.outstanding, 0);
    
    if (Math.abs(totalPastOutstanding) > 0.01) {
      const consolidatedPastCycle: CycleBreakdown = {
        cycleName: previousCycleInfo.name,
        startDate: previousCycleInfo.start,
        endDate: previousCycleInfo.end,
        outstanding: totalPastOutstanding
      };
      breakdowns = [consolidatedPastCycle, ...currentAndFutureBreakdowns];
    } else {
      breakdowns = [...currentAndFutureBreakdowns];
    }
  }

  if (authoritativeBalance === undefined || authoritativeBalance === null) {
    return breakdowns;
  }

  const roundedBalance = Math.round(Number(authoritativeBalance) * 100) / 100;
  if (Math.abs(roundedBalance) <= 0.01) {
    return [];
  }

  const breakdownTotal = Math.round(
    breakdowns.reduce((sum, b) => sum + b.outstanding, 0) * 100
  ) / 100;
  const difference = Math.round((roundedBalance - breakdownTotal) * 100) / 100;

  if (Math.abs(difference) <= 0.01) {
    return breakdowns;
  }

  if (breakdowns.length === 0) {
    const { start, end, name } = getCycleBoundaries(referenceDate, customer.paymentCycle);
    return [{
      cycleName: name,
      startDate: start,
      endDate: end,
      outstanding: roundedBalance
    }];
  }

  const adjusted = [...breakdowns];
  const sameDirectionIndex = adjusted.findIndex(b => Math.sign(b.outstanding) === Math.sign(roundedBalance));
  const targetIndex = sameDirectionIndex >= 0 ? sameDirectionIndex : 0;
  adjusted[targetIndex] = {
    ...adjusted[targetIndex],
    outstanding: Math.round((adjusted[targetIndex].outstanding + difference) * 100) / 100
  };

  return adjusted.filter(b => Math.abs(b.outstanding) > 0.01);
};
