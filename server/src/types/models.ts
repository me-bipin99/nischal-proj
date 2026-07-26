import { Types } from "mongoose";

export interface IStoreNotifications {
  emailAlerts: boolean;
  lowStockAlerts: boolean;
  dailySalesSummary: boolean;
  weeklyForecastReport: boolean;
}

export interface IStoreDocument {
  _id: Types.ObjectId;
  name: string;
  currency: string;
  timezone: string;
  lowStockThreshold: number;
  taxRate: number;
  receiptFooter: string;
  notifications: IStoreNotifications;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDocument {
  _id: Types.ObjectId;
  storeId: Types.ObjectId;
  fullName: string;
  email: string;
  passwordHash: string;
  role: string;
  phone: string;
  avatar: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProductDocument {
  _id: Types.ObjectId;
  storeId: Types.ObjectId;
  name: string;
  sku: string;
  category: string;
  stock: number;
  unit: string;
  unitPrice: number;
  costPrice: number;
  reorderLevel: number;
  supplier: string;
  image: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISaleDocument {
  _id: Types.ObjectId;
  storeId: Types.ObjectId;
  invoiceNo: string;
  date: Date;
  time: Date;
  customerName: string;
  productId: Types.ObjectId;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  paymentMethod: string;
  status: string;
  recordedBy: Types.ObjectId;
  createdAt: Date;
}

export type AlertSeverity = "critical" | "warning";
export type AlertStatus = "unread" | "read";

export interface IAlertDocument {
  _id: Types.ObjectId;
  storeId: Types.ObjectId;
  productId: Types.ObjectId;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  recommendedReorderQty: number;
  createdAt: Date;
  updatedAt: Date;
}
