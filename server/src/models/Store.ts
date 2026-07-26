import { Schema, model } from "mongoose";
import type { IStoreDocument } from "../types/models";

const notificationsSchema = new Schema(
  {
    emailAlerts: { type: Boolean, default: true },
    lowStockAlerts: { type: Boolean, default: true },
    dailySalesSummary: { type: Boolean, default: false },
    weeklyForecastReport: { type: Boolean, default: false },
  },
  { _id: false }
);

const storeSchema = new Schema<IStoreDocument>(
  {
    name: { type: String, required: true },
    currency: { type: String, default: "USD ($)" },
    timezone: { type: String, default: "America/New_York (UTC-05:00)" },
    lowStockThreshold: { type: Number, default: 15 },
    taxRate: { type: Number, default: 8.5 },
    receiptFooter: { type: String, default: "" },
    notifications: { type: notificationsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export const Store = model<IStoreDocument>("Store", storeSchema);
