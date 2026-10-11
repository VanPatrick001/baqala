import type { Translations } from '../lib/format';

export interface Tax {
  id: number;
  code: string;
  name: string;
  type: 'PERCENT' | 'FIXED';
  rate: number;
  appliesTo: 'SALES' | 'PURCHASES' | 'BOTH';
  isActive?: number | boolean;
  translations?: Translations;
  productCount?: number;
}

export interface Product {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  unitId: number;
  unitCode: string;
  allowsDecimal: number;
  supplierId: number | null;
  supplierName: string | null;
  purchasePrice: number;
  avgCost: number;
  salePrice: number;
  stockQty: number;
  minStock: number;
  reorderQty: number;
  trackExpiry: number;
  isWeighed: number;
  isActive: number;
  stockStatus: 'OK' | 'LOW' | 'OUT';
  nextExpiry: string | null;
  translations: Translations;
  taxes: Tax[] | null;
  promotion: { id: number; type: 'PERCENT' | 'FIXED'; value: number; endsAt: string } | null;
  batches?: Batch[];
}

export interface Batch {
  id: number;
  productId?: number;
  productName?: string;
  sku?: string;
  translations?: Translations;
  batchNo: string | null;
  expiryDate: string | null;
  daysLeft: number | null;
  qtyRemaining: number;
  unitCost: number;
  value?: number;
  receivedAt: string;
}

export interface Category {
  id: number;
  parentId: number | null;
  code: string;
  name: string;
  sortOrder: number;
  isActive: number;
  translations: Translations;
  productCount: number;
}

export interface Customer {
  id: number;
  code: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  creditLimit: number;
  balance: number;
  isWalkIn: number;
}

export interface Supplier {
  id: number;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxNumber: string | null;
  leadTimeDays: number;
  balance: number;
  isActive: number;
}

export interface Receipt {
  id: number;
  receiptNo: string;
  status: 'COMPLETED' | 'VOIDED';
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  paidTotal: number;
  changeDue: number;
  language: 'en' | 'ur' | 'ar';
  createdAt: string;
  cashier: string;
  customerName: string | null;
  customerBalance: number | null;
  voidReason: string | null;
  items: { id: number; productName: string; translations: Translations; quantity: number; unitPrice: number; discount: number; taxAmount: number; lineTotal: number; promotionId: number | null }[];
  taxes: { code: string; name: string; type: string; rate: number; translations: Translations; taxable: number; amount: number }[];
  payments: { method: string; amount: number; reference: string | null }[];
  store: { name: string; address: string; phone: string; taxNumber: string; footer: string; currency: string; widthMm: number };
}

export interface CashSession {
  id: number;
  registerId: number;
  registerName: string;
  status: 'OPEN' | 'CLOSED';
  openingFloat: number;
  expectedCash: number | null;
  countedCash: number | null;
  difference: number | null;
  currentExpectedCash: number;
  openedAt: string;
  closedAt: string | null;
  openedBy: string;
  closedBy: string | null;
  sales: { tickets: number; total: number; taxTotal: number; changeGiven: number; voided: number };
  payments: { method: string; amount: number }[];
  movements: { category: string; direction: 'IN' | 'OUT'; method: string; amount: number; count: number }[];
}

export interface SmartAlert {
  id: number;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  status: 'NEW' | 'ACKNOWLEDGED' | 'DISMISSED' | 'RESOLVED';
  productId: number | null;
  messageKey: string;
  payload: Record<string, any>;
  score: number;
  firstSeenAt: string;
  lastSeenAt: string;
  translations: Translations;
  handledBy: string | null;
}

export interface Meta {
  languages: { code: string; name: string; nativeName: string; direction: string }[];
  roles: { id: number; code: string; name: string }[];
  units: { id: number; code: string; name: string; allowsDecimal: number }[];
  cashCategories: { id: number; code: string; name: string; direction: 'IN' | 'OUT' | 'BOTH'; isOperatingExpense: number; isSystem: number }[];
  registers: { id: number; code: string; name: string }[];
}
