/**
 * orderService.ts
 *
 * Handles the purchase-order lifecycle:
 *  1. createOrder()   — called when user clicks "Reorder" on an alert.
 *                       Creates a PurchaseOrder (status: pending), marks the
 *                       alert as "processing", and fires a confirmation email
 *                       to the supplier via Ethereal.
 *
 *  2. confirmOrder()  — called when the supplier clicks an ETA link in the email.
 *                       Validates the one-time token, stores the chosen ETA,
 *                       restocks the product, marks the alert as "restocked",
 *                       and the order as "confirmed".
 */

import crypto from "crypto";
import { Types } from "mongoose";
import { PurchaseOrder } from "../models/PurchaseOrder";
import { Alert } from "../models/Alert";
import { Product } from "../models/Product";
import { Store } from "../models/Store";
import { sendReorderConfirmationEmail } from "./mailService";
import { checkProduct } from "./alertService";
import { env } from "../config/env";

export class OrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderError";
  }
}

// ─── Create Order ─────────────────────────────────────────────────────────────

export async function createOrder(
  storeId: string,
  alertId: string
): Promise<{ orderId: string; productName: string }> {
  const storeObjectId = new Types.ObjectId(storeId);

  const alert = await Alert.findOne({ _id: alertId, storeId: storeObjectId });
  if (!alert) throw new OrderError("Alert not found.");

  if (alert.status === "processing") {
    throw new OrderError("A reorder is already in progress for this product.");
  }
  if (alert.status === "restocked") {
    throw new OrderError("This product has already been restocked.");
  }

  const product = await Product.findOne({ _id: alert.productId, storeId: storeObjectId });
  if (!product) throw new OrderError("Product not found.");

  const store = await Store.findById(storeObjectId);
  const storeName = store?.name ?? "ShopSense Store";

  // Cancel any previous pending order for the same alert (idempotent re-orders)
  await PurchaseOrder.updateMany(
    { alertId: alert._id, status: "pending" },
    { status: "cancelled" }
  );

  const confirmToken = crypto.randomBytes(32).toString("hex");

  const order = await PurchaseOrder.create({
    storeId: storeObjectId,
    alertId: alert._id,
    productId: product._id,
    productName: product.name,
    sku: product.sku,
    quantity: alert.recommendedReorderQty,
    confirmToken,
    status: "pending",
  });

  await Alert.findByIdAndUpdate(alert._id, {
    status: "processing",
    message: `Reorder in progress — awaiting supplier confirmation for ${product.name}.`,
  });

  // Build ETA-specific confirm URLs — each button in the email points to one
  const baseConfirm = `${env.serverUrl}/api/orders/${confirmToken}/confirm`;

  const etaOptions = [
    { label: "Delivered",                  value: "Delivered" },
    { label: "Will be delivered by tomorrow", value: "Will be delivered by tomorrow" },
    { label: "Within 3 Days",              value: "Within 3 Days" },
    { label: "Within 1 Week",              value: "Within 1 Week" },
  ];

  const etaLinks = etaOptions.map((opt) => ({
    label: opt.label,
    url: `${baseConfirm}?eta=${encodeURIComponent(opt.value)}`,
  }));

  sendReorderConfirmationEmail({
    productName: product.name,
    sku: product.sku,
    quantity: alert.recommendedReorderQty,
    storeName,
    etaLinks,
  }).catch((err) => {
    console.error("Failed to send reorder email:", err?.message ?? err);
  });

  return { orderId: order._id.toString(), productName: product.name };
}

// ─── Confirm Order ────────────────────────────────────────────────────────────

export interface ConfirmOrderResult {
  productName: string;
  newStock: number;
  quantity: number;
  restockEta: string;
}

export async function confirmOrder(
  confirmToken: string,
  restockEta: string = "Not specified"
): Promise<ConfirmOrderResult> {
  const order = await PurchaseOrder.findOne({ confirmToken, status: "pending" });
  if (!order) throw new OrderError("Invalid or already-used confirmation link.");

  const product = await Product.findById(order.productId);
  if (!product) throw new OrderError("Product no longer exists.");

  const newStock = product.reorderLevel * 2;
  product.stock = newStock;
  await product.save();

  order.status = "confirmed";
  order.confirmedAt = new Date();
  order.restockEta = restockEta;
  await order.save();

  const etaDisplay = restockEta && restockEta !== "Not specified"
    ? ` — ETA: ${restockEta}`
    : "";

  await Alert.findByIdAndUpdate(order.alertId, {
    status: "restocked",
    sellerResponse: restockEta !== "Not specified" ? restockEta : "",
    message: `✅ Restocked by supplier — ${order.quantity} units of ${product.name} confirmed. Stock now at ${newStock}${etaDisplay}.`,
  });

  await checkProduct(order.storeId.toString(), product._id.toString());

  return {
    productName: product.name,
    newStock,
    quantity: order.quantity,
    restockEta,
  };
}
