import { Schema, model, Types } from "mongoose";

export type OrderStatus = "pending" | "confirmed" | "cancelled";

export interface IPurchaseOrderDocument {
  _id: Types.ObjectId;
  storeId: Types.ObjectId;
  alertId: Types.ObjectId;
  productId: Types.ObjectId;
  productName: string;
  sku: string;
  quantity: number;
  confirmToken: string;       // one-time token embedded in confirmation link
  status: OrderStatus;
  restockEta?: string;        // human-readable ETA chosen by supplier e.g. "Instant", "Tomorrow", "2026-09-20"
  confirmedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const purchaseOrderSchema = new Schema<IPurchaseOrderDocument>(
  {
    storeId:     { type: Schema.Types.ObjectId, ref: "Store",   required: true },
    alertId:     { type: Schema.Types.ObjectId, ref: "Alert",   required: true },
    productId:   { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    sku:         { type: String, required: true },
    quantity:    { type: Number, required: true },
    confirmToken:{ type: String, required: true, unique: true },
    status:      { type: String, enum: ["pending", "confirmed", "cancelled"], default: "pending" },
    restockEta:  { type: String, default: "" },
    confirmedAt: { type: Date },
  },
  { timestamps: true }
);

purchaseOrderSchema.index({ storeId: 1, alertId: 1 });

export const PurchaseOrder = model<IPurchaseOrderDocument>("PurchaseOrder", purchaseOrderSchema);
