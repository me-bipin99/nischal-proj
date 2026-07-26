import { Schema, model } from "mongoose";
import type { IAlertDocument } from "../types/models";

const alertSchema = new Schema<IAlertDocument>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    severity: { type: String, enum: ["critical", "warning"], required: true },
    status: { type: String, enum: ["unread", "read"], default: "unread" },
    message: { type: String, required: true },
    recommendedReorderQty: { type: Number, default: 0 },
  },
  { timestamps: true }
);

alertSchema.index({ storeId: 1, productId: 1 });

export const Alert = model<IAlertDocument>("Alert", alertSchema);
