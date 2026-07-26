import { Types } from "mongoose";
import { Alert } from "../models/Alert";
import { Product } from "../models/Product";
import type { AlertSeverity, IAlertDocument, IProductDocument } from "../types/models";

export class AlertNotFoundError extends Error {
  constructor(message = "Alert not found") {
    super(message);
    this.name = "AlertNotFoundError";
  }
}

export class ProductNotFoundError extends Error {
  constructor(message = "Product not found") {
    super(message);
    this.name = "ProductNotFoundError";
  }
}

export interface AlertResponse {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  category: string;
  currentStock: number;
  reorderLevel: number;
  recommendedReorderQty: number;
  severity: AlertSeverity;
  status: string;
  message: string;
  timestamp: Date;
}

function buildMessage(severity: AlertSeverity, stock: number): string {
  if (stock === 0) return "Out of Stock! This product needs immediate restocking.";
  if (severity === "critical") return `Critical low stock (${stock} left). Restock soon.`;
  return "Stock level dropped below threshold. Consider restocking.";
}

export async function checkProduct(storeId: string, productId: string): Promise<void> {
  const storeObjectId = new Types.ObjectId(storeId);
  const product = await Product.findOne({ _id: productId, storeId: storeObjectId });
  if (!product) return;

  const threshold = product.reorderLevel;
  const stock = product.stock;

  let severity: AlertSeverity | null = null;
  if (stock === 0) {
    severity = "critical";
  } else if (stock <= threshold * 0.3) {
    severity = "critical";
  } else if (stock <= threshold) {
    severity = "warning";
  }

  if (!severity) {
    await Alert.deleteOne({ storeId: storeObjectId, productId: product._id });
    return;
  }

  const recommendedReorderQty = Math.max(0, threshold * 2 - stock);
  const message = buildMessage(severity, stock);

  await Alert.findOneAndUpdate(
    { storeId: storeObjectId, productId: product._id },
    { severity, message, recommendedReorderQty, $setOnInsert: { status: "unread" } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
}

function toResponse(
  alert: IAlertDocument & { productId: IProductDocument }
): AlertResponse {
  const product = alert.productId;
  return {
    id: alert._id.toString(),
    productId: product._id.toString(),
    productName: product.name,
    sku: product.sku,
    category: product.category,
    currentStock: product.stock,
    reorderLevel: product.reorderLevel,
    recommendedReorderQty: alert.recommendedReorderQty,
    severity: alert.severity,
    status: alert.status,
    message: alert.message,
    timestamp: alert.updatedAt,
  };
}

export async function getActiveAlerts(storeId: string): Promise<AlertResponse[]> {
  const alerts = await Alert.find({ storeId: new Types.ObjectId(storeId) })
    .populate<{ productId: IProductDocument }>("productId")
    .sort({ severity: 1, updatedAt: -1 });

  const withProduct = alerts.filter((a) => a.productId != null) as unknown as (IAlertDocument & {
    productId: IProductDocument;
  })[];

  const severityRank: Record<AlertSeverity, number> = { critical: 0, warning: 1 };
  withProduct.sort((a, b) => {
    const rankDiff = severityRank[a.severity] - severityRank[b.severity];
    if (rankDiff !== 0) return rankDiff;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  return withProduct.map(toResponse);
}

export async function markRead(storeId: string, alertId: string): Promise<AlertResponse> {
  const alert = await Alert.findOneAndUpdate(
    { _id: alertId, storeId: new Types.ObjectId(storeId) },
    { status: "read" },
    { returnDocument: "after" }
  ).populate<{ productId: IProductDocument }>("productId");

  if (!alert || !alert.productId) throw new AlertNotFoundError();
  return toResponse(alert as unknown as IAlertDocument & { productId: IProductDocument });
}

export async function reorderProduct(
  storeId: string,
  productId: string
): Promise<IProductDocument> {
  const storeObjectId = new Types.ObjectId(storeId);
  const product = await Product.findOne({ _id: productId, storeId: storeObjectId });
  if (!product) throw new ProductNotFoundError();

  product.stock = product.reorderLevel * 2;
  await product.save();
  await checkProduct(storeId, product._id.toString());
  return product;
}

export async function reorderByAlertId(storeId: string, alertId: string): Promise<IProductDocument> {
  const alert = await Alert.findOne({ _id: alertId, storeId: new Types.ObjectId(storeId) });
  if (!alert) throw new AlertNotFoundError();
  return reorderProduct(storeId, alert.productId.toString());
}

export async function reorderAll(storeId: string): Promise<number> {
  const storeObjectId = new Types.ObjectId(storeId);
  const alerts = await Alert.find({ storeId: storeObjectId });
  let count = 0;
  for (const alert of alerts) {
    try {
      await reorderProduct(storeId, alert.productId.toString());
      count += 1;
    } catch {
      // product may have been deleted since the alert was created; skip it
    }
  }
  return count;
}

export async function getAlertCount(storeId: string): Promise<number> {
  return Alert.countDocuments({ storeId: new Types.ObjectId(storeId), status: "unread" });
}

export async function sweepAllProducts(): Promise<void> {
  const products = await Product.find({}, { _id: 1, storeId: 1 });
  for (const product of products) {
    await checkProduct(product.storeId.toString(), product._id.toString());
  }
}
