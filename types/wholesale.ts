export interface WSCustomer {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  address?: string;
  payment_cycle?: string;
  opening_balance: number;
  active: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  deleted?: boolean;
  version?: number;
}

export interface WSProduct {
  id: string;
  name: string;
  unit: string;
  default_rate: number;
  active: boolean;
  updated_at?: string;
  deleted?: boolean;
  version?: number;
}

export interface WSDelivery {
  id: string;
  customer_id: string;
  date: string;
  product_id: string;
  quantity: number;
  rate: number;
  total_amount?: number;
  note?: string;
  is_adjustment?: boolean;
  adjustment_note?: string;
  linked_delivery_id?: string;
  created_at?: string;
  updated_at?: string;
  deleted?: boolean;
  version?: number;
}

export interface WSPayment {
  id: string;
  customer_id: string;
  date: string;
  amount: number;
  mode?: string;
  note?: string;
  client_request_id?: string;
  created_at?: string;
  updated_at?: string;
  deleted?: boolean;
  version?: number;
}

export interface WSLedgerEntry {
  id: string;
  date: string;
  customer_id: string;
  type: 'delivery' | 'payment';
  product_id?: string;
  product_name?: string;
  quantity?: number;
  rate?: number;
  amount: number; // debit for delivery, credit for payment
  note?: string;
  is_adjustment?: boolean;
  adjustment_note?: string;
  created_at: string;
}
