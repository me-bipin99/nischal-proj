import { Schema, model } from "mongoose";
import type { IProductDocument } from "../types/models";

const productSchema = new Schema<IProductDocument>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true },
    name: { type: String, required: true },
    sku: { type: String, required: true },
    category: { type: String, default: "" },
    stock: { type: Number, default: 0 },
    unit: { type: String, default: "pcs" },
    unitPrice: { type: Number, required: true },
    costPrice: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 0 },
    supplier: { type: String, default: "" },
    image: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

productSchema.index({ storeId: 1, sku: 1 }, { unique: true });

export const Product = model<IProductDocument>("Product", productSchema);
