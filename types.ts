
export enum PaymentCycle {
  DAILY = 'Daily',
  TEN_DAY = '10-Day',
  FIFTEEN_DAY = '15-Day',
  MONTHLY = 'Monthly'
}

export enum UserRole {
  OWNER = 'Owner',
  RIDER = 'Rider'
}

export enum PaymentMode {
  CASH = 'Cash',
  BANK = 'Bank Transfer',
  WALLET = 'Wallet (JazzCash/EasyPaisa)'
}

export interface BaseEntity {
  id: string;
  updatedAt: string;
  version: number; // For Optimistic Concurrency Control (OCC)
  deleted?: boolean;
}

export interface AuditLog extends BaseEntity {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'SYNC_REJECTED';
  entityId: string;
  entityType: 'Customer' | 'Delivery' | 'Payment' | 'Price' | 'System';
  oldValue?: any;
  newValue?: any;
  performedBy: string;
  timestamp: string;
  conflictReason?: 'REVISION_MISMATCH' | 'CONSTRAINT_VIOLATION' | 'IMMUTABILITY_BREACH';
}

export interface Customer extends BaseEntity {
  name: string;
  urduName?: string;
  phone?: string;
  address?: string;
  paymentCycle: PaymentCycle;
  riderId: string;
  customPrice?: number;
  openingBalance: number; 
  deliveryOrder: number;
  active: boolean;
  createdAt: string;
}

export interface PriceRecord extends BaseEntity {
  price: number;
  effectiveDate: string; 
  customerId?: string; 
}

export interface Delivery extends BaseEntity {
  customerId: string;
  date: string; 
  liters: number;
  priceAtTime: number;
  totalAmount: number;
  riderId: string;
  isLocked: boolean; 
  isAdjustment?: boolean;
  adjustmentNote?: string;
  adjustmentTag?: string; // e.g., 'ONE_TIME_PRICE_FIX'
  linkedDeliveryId?: string; // Reference to original record
}

export interface Payment extends BaseEntity {
  customerId: string;
  date: string;
  amount: number;
  mode: PaymentMode;
  note?: string;
  isAdjustment?: boolean;
  adjustmentNote?: string;
  adjustmentTag?: string;
  linkedDeliveryId?: string;
}

export interface Rider extends BaseEntity {
  name: string;
  route: string;
  pin: string;
  role: string; 
  salary: number;
}

export interface RiderLoad extends BaseEntity {
  riderId: string;
  date: string;
  liters: number;
  timestamp: string;
}

export interface RiderClosingRecord extends BaseEntity {
  riderId: string;
  date: string;
  morningLoadLiters: number;
  appDeliveriesLiters: number;
  returnedMilkLiters: number;
  wastageLiters: number;
  expectedCashRecovery: number;
  expenseDeductions: number;
  physicalCashReceived: number;
  auditRemarks?: string; 
  timestamp: string;
}

export type ExpenseType = 'Petrol' | 'Repair' | 'Baraf (Ice)' | 'Generator' | 'Salary' | 'Utility' | 'Other';

export interface Expense extends BaseEntity {
  riderId?: string; 
  date: string;
  amount: number;
  type: ExpenseType;
  note?: string;
}

export interface MonthlyArchive extends BaseEntity {
  year: number;
  month: number;
  deliveries: Delivery[];
  payments: Payment[];
  expenses: Expense[];
  closingBalances: Record<string, number>;
}

export interface MonthLock {
  month: number;
  year: number;
}

export interface CloudConfig {
  supabaseUrl: string;
  supabaseKey: string;
  businessId: string;
  status: 'connected' | 'disconnected';
}
