import { Types } from "mongoose";
import { Alert } from "../models/Alert";
import { Product } from "../models/Product";
import { Sale } from "../models/Sale";
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
  sellerResponse: string;
  timestamp: Date;
}

function buildMessage(severity: AlertSeverity, stock: number): string {
  if (stock === 0) return "Out of Stock! This product needs immediate restocking.";
  if (severity === "critical") return `Critical low stock (${stock} left). Restock soon.`;
  return "Stock level dropped below threshold. Consider restocking.";
}

// ── EOQ (Economic Order Quantity) ─────────────────────────────────────────────
//
// Classic Wilson EOQ formula:  Q* = sqrt( 2 × D × S / H )
//
//   D  — Annual demand (units/year).
//        Derived from actual sales of this product over the last 90 days,
//        scaled up to 365 days.  Falls back to reorderLevel × 12 when there
//        is no sales history yet (one reorder per month assumption).
//
//   S  — Ordering cost per purchase order ($20 fixed).
//        We don't track supplier ordering costs in the schema, so $20 is the
//        industry-standard retail default for a small/mid-size store.
//
//   H  — Annual holding cost per unit.
//        = costPrice × 0.25  (25% of unit cost — covers warehousing, capital
//          tie-up, shrinkage, obsolescence; standard retail rule-of-thumb).
//        Falls back to unitPrice × 0.20 when costPrice is not set.
//        Minimum $0.01 to avoid division-by-zero.
//
// The result is:
//   • Rounded to the nearest whole unit.
//   • Floored at reorderLevel (never suggest less than the safety threshold).
//   • Capped at annualDemand (never suggest more than a full year of stock).
//
async function computeEOQ(
  storeId: Types.ObjectId,
  product: IProductDocument
): Promise<number> {
  // ── D: annual demand from real sales history ─────────────────────────────
  const lookbackDays = 90;
  const windowStart  = new Date();
  windowStart.setUTCDate(windowStart.getUTCDate() - lookbackDays);

  const rows = await Sale.aggregate<{ totalQty: number }>([
    {
      $match: {
        storeId,
        productId: product._id,
        date: { $gte: windowStart },
      },
    },
    { $group: { _id: null, totalQty: { $sum: "$quantity" } } },
  ]);

  const unitsSoldIn90Days = rows[0]?.totalQty ?? 0;
  // Scale to annual demand; use reorderLevel × 12 as fallback when no history
  const annualDemand = unitsSoldIn90Days > 0
    ? Math.round((unitsSoldIn90Days / lookbackDays) * 365)
    : (product.reorderLevel || 1) * 12;

  // ── S: fixed ordering cost per order ────────────────────────────────────
  const orderingCost = 20; // USD per order

  // ── H: annual holding cost per unit ─────────────────────────────────────
  const baseCost    = product.costPrice > 0 ? product.costPrice : product.unitPrice * 0.8;
  const holdingCost = Math.max(0.01, baseCost * 0.25);

  // ── EOQ formula ──────────────────────────────────────────────────────────
  const rawEOQ = Math.sqrt((2 * annualDemand * orderingCost) / holdingCost);
  const eoq    = Math.round(rawEOQ);

  // Floor: never suggest less than the reorder threshold
  // Ceiling: never suggest more than a full year's demand
  const floor   = Math.max(1, product.reorderLevel);
  const ceiling = Math.max(floor, annualDemand);

  return Math.min(ceiling, Math.max(floor, eoq));
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
    // Stock is healthy — only delete the alert if it hasn't been restocked by a
    // supplier yet.  Restocked (and acknowledged) alerts must stay visible on the
    // dashboard until the user explicitly dismisses them.
    await Alert.deleteOne({
      storeId: storeObjectId,
      productId: product._id,
      status: { $nin: ["restocked", "acknowledged"] },
    });
    return;
  }

  // If an alert already exists in restocked/acknowledged state for this product,
  // leave it untouched — the supplier already responded and the user hasn't
  // dismissed it yet.  A new low-stock alert will be created fresh once the user
  // acknowledges and the existing one is cleared.
  const existing = await Alert.findOne({ storeId: storeObjectId, productId: product._id });
  if (existing && (existing.status === "restocked" || existing.status === "acknowledged")) {
    return;
  }

  const recommendedReorderQty = await computeEOQ(storeObjectId, product as IProductDocument);
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
    sellerResponse: alert.sellerResponse ?? "",
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
  // If the alert is restocked, move it to "acknowledged" so it's clearly
  // completed and checkProduct won't protect it from being cleaned up.
  // For all other statuses, mark as "read" as normal.
  const existing = await Alert.findOne({ _id: alertId, storeId: new Types.ObjectId(storeId) });
  const nextStatus = existing?.status === "restocked" ? "acknowledged" : "read";

  const alert = await Alert.findOneAndUpdate(
    { _id: alertId, storeId: new Types.ObjectId(storeId) },
    { status: nextStatus },
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
