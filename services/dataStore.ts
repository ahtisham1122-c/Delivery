
import { Customer, PriceRecord, Delivery, Payment, Rider, RiderLoad } from '../types';

export const INITIAL_RIDERS: Rider[] = [
  // Fixed: Added missing 'version' property for BaseEntity
  { id: 'r1', name: 'Zeeshan Ali', route: 'Model Town / Garden Town', salary: 28000, pin: '1234', role: 'Senior Rider', updatedAt: new Date().toISOString(), version: 0 },
  // Fixed: Added missing 'version' property for BaseEntity
  { id: 'r2', name: 'Imran Khan', route: 'Gulberg / DHA Phase 1', salary: 25000, pin: '5678', role: 'Delivery Boy', updatedAt: new Date().toISOString(), version: 0 }
];

export const INITIAL_CUSTOMERS: Customer[] = [];

export const generateId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
};

/**
 * Standard PKR Formatter for Pakistan (Lakh/Crore system)
 */
export const formatPKR = (amount: number): string => {
  return new Intl.NumberFormat('en-PK', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
};

/**
 * Normalizes a date string to a consistent timestamp for comparison
 */
const getNormalizedTime = (dateStr: string) => {
  // Parse date string safely without timezone shift
  // 'YYYY-MM-DD' must be treated as local date, not UTC
  if (!dateStr) return 0;
  const parts = dateStr.substring(0, 10).split('-');
  if (parts.length !== 3) {
    // Fallback for datetime strings
    const date = new Date(dateStr);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return new Date(year, month, day).getTime();
};

/**
 * Finds the correct price for a specific delivery date.
 * PRIORITIES:
 * 1. customer.customPrice (profile override)
 * 2. prices[] for specific customerId (historical override)
 * 3. prices[] global default
 */
export const findPriceForDate = (
  dateStr: string,
  customer: Customer | undefined,
  prices: PriceRecord[]
): number => {
  // 1. Highest Priority: Profile-level contract price
  if (customer?.customPrice && customer.customPrice > 0) return customer.customPrice;

  const deliveryTime = getNormalizedTime(dateStr);

  // Helper to sort by effective date (recency within the effective period)
  const sortByRecency = (a: PriceRecord, b: PriceRecord) => {
    const aTime = getNormalizedTime(a.effectiveDate);
    const bTime = getNormalizedTime(b.effectiveDate);
    if (aTime !== bTime) return bTime - aTime; 
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  };

  // 2. Secondary: Customer-specific historical records
  if (customer && prices && prices.length > 0) {
    const customerPrices = prices
      .filter(p => p.customerId === customer.id && getNormalizedTime(p.effectiveDate) <= deliveryTime)
      .sort(sortByRecency);
    if (customerPrices.length > 0) return customerPrices[0].price;
  }

  // 3. Tertiary: Global historical records
  const defaultPrices = (prices || [])
    .filter(p => !p.customerId && getNormalizedTime(p.effectiveDate) <= deliveryTime)
    .sort(sortByRecency);

  if (defaultPrices.length > 0) {
    return defaultPrices[0].price;
  }

  // STABILITY FIX: Explicit Error if no rate exists.
  throw new Error(`NO_PRICE_FOUND: No milk price defined for date ${dateStr}. Please add a price record.`);
};

export const INITIAL_PRICES: PriceRecord[] = [
  // Fixed: Added missing 'version' property for BaseEntity
  { id: 'p1', price: 210, effectiveDate: '2025-01-01', updatedAt: new Date().toISOString(), version: 0 }
];

export const INITIAL_DELIVERIES: Delivery[] = [];
export const INITIAL_PAYMENTS: Payment[] = [];
export const INITIAL_LOADS: RiderLoad[] = [];

export const getStoredData = (key: string, defaultValue: any) => {
  const stored = localStorage.getItem(key);
  if (!stored) {
    if (key === 'riderLoads') return INITIAL_LOADS;
    if (key === 'customers') return INITIAL_CUSTOMERS;
    if (key === 'deliveries') return INITIAL_DELIVERIES;
    if (key === 'payments') return INITIAL_PAYMENTS;
    if (key === 'prices') return INITIAL_PRICES;
    if (key === 'riders') return INITIAL_RIDERS;
  }
  return stored ? JSON.parse(stored) : defaultValue;
};

export const BUSINESS_CACHE_KEYS = [
  'customers',
  'riders',
  'deliveries',
  'payments',
  'prices',
  'expenses',
  'riderLoads',
  'archives',
  'auditLogs',
  'closingRecords',
  'draft_payment'
];

export const clearBusinessCache = (): void => {
  BUSINESS_CACHE_KEYS.forEach(key => localStorage.removeItem(key));
  Object.keys(localStorage)
    .filter(key => key.startsWith('draft_d_') || key.startsWith('draft_c_'))
    .forEach(key => localStorage.removeItem(key));
};

export const saveToStore = (key: string, data: any): void => {
  const SERVER_ONLY_KEYS = ['archives', 'auditLogs', 'closingRecords'];
  if (SERVER_ONLY_KEYS.includes(key)) return;
  
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e: any) {
    if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      console.warn('Storage quota exceeded. Clearing non-critical cache.');
      window.dispatchEvent(new CustomEvent('storage_warning', { detail: 'Quota Exceeded' }));
      localStorage.removeItem('auditLogs');
      localStorage.removeItem('archives');
      localStorage.removeItem('closingRecords');
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch {
        console.warn('Could not cache ' + key + ' — will load from server');
      }
    }
  }
};

/**
 * Diagnostic utility to monitor localStorage usage.
 * Call getStorageReport() from browser console to see breakdown.
 */
export const getStorageReport = (): void => {
  let totalChars = 0;
  const report: Array<{key: string, sizeKB: number}> = [];
  
  for (const key of Object.keys(localStorage)) {
    const value = localStorage.getItem(key) || '';
    const sizeKB = Math.round((value.length * 2) / 1024);
    totalChars += value.length;
    report.push({ key, sizeKB });
  }
  
  report.sort((a, b) => b.sizeKB - a.sizeKB);
  
  console.log('=== localStorage Usage Report ===');
  report.forEach(r => {
    console.log(`${r.key}: ${r.sizeKB} KB`);
  });
  console.log(`TOTAL: ${Math.round((totalChars * 2) / 1024)} KB`);
  console.log('=================================');
};
