import { Schema, model } from "mongoose";
import type { ISaleDocument } from "../types/models";

const saleSchema = new Schema<ISaleDocument>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true },
    invoiceNo: { type: String, required: true },
    date: { type: Date, required: true },
    time: { type: Date, required: true },
    customerName: { type: String, default: "" },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    paymentMethod: { type: String, required: true },
    status: { type: String, default: "Completed" },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

saleSchema.index({ storeId: 1, invoiceNo: 1 }, { unique: true });

export const Sale = model<ISaleDocument>("Sale", saleSchema);
