/**
 * Dev/test seed script — wipes and repopulates the configured MongoDB
 * database with one store, one Admin user, and realistic products/sales/
 * alerts adapted from `shopsense/assets/mock/*.json`.
 *
 * Usage: `npm run seed` (from `server/`).
 *
 * Refuses to run when NODE_ENV=production, since it deletes all existing
 * data in the target database first.
 */
import fs from "fs";
import path from "path";
import mongoose, { Types } from "mongoose";
import { env } from "./src/config/env";
import { Store } from "./src/models/Store";
import { User } from "./src/models/User";
import { Product } from "./src/models/Product";
import { Sale } from "./src/models/Sale";
import { Alert } from "./src/models/Alert";
import { hashPassword } from "./src/services/authService";

const MOCK_DIR = path.resolve(__dirname, "../shopsense/assets/mock");

const SEED_STORE_NAME = "ShopSense Demo Store";
const SEED_ADMIN_NAME = "Alex Morgan";
const SEED_ADMIN_EMAIL = "admin@shopsense.dev";
const SEED_ADMIN_PASSWORD = "ShopSense123!";

interface MockProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  stock: number;
  unit: string;
  unitPrice: number;
  costPrice: number;
  reorderLevel: number;
  image?: string;
  supplier?: string;
}

interface MockSale {
  invoiceNo: string;
  date: string; // "2026-07-24"
  time: string; // "10:42 AM"
  customerName?: string;
  productId: string; // references MockProduct.id
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  paymentMethod: string;
  status?: string;
}

interface MockAlert {
  productId: string; // references MockProduct.id
  severity: "critical" | "warning";
  status?: "unread" | "read";
  message: string;
  recommendedReorderQty?: number;
}

function readMock<T>(fileName: string): T {
  const filePath = path.join(MOCK_DIR, fileName);
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

/** Combines a "YYYY-MM-DD" date string and a "hh:mm AM/PM" time string into one Date. */
function parseDateTime(dateStr: string, timeStr: string): Date {
  const [rawTime, meridiem] = timeStr.split(" ");
  const [hourStr, minuteStr] = rawTime.split(":");
  let hours = Number(hourStr);
  const minutes = Number(minuteStr);
  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;

  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours, minutes));
}

async function main(): Promise<void> {
  if (env.nodeEnv === "production") {
    console.error(
      "Refusing to run seed.ts with NODE_ENV=production — this script wipes existing data. " +
        "Run it against a dev/test database only."
    );
    process.exit(1);
  }

  console.log(`Connecting to ${env.mongodbUri} ...`);
  await mongoose.connect(env.mongodbUri);

  console.log("Wiping existing collections (Store, User, Product, Sale, Alert)...");
  await Promise.all([
    Store.deleteMany({}),
    User.deleteMany({}),
    Product.deleteMany({}),
    Sale.deleteMany({}),
    Alert.deleteMany({}),
  ]);

  console.log("Creating store and admin user...");
  const store = await Store.create({ name: SEED_STORE_NAME });
  const passwordHash = await hashPassword(SEED_ADMIN_PASSWORD);
  const admin = await User.create({
    storeId: store._id,
    fullName: SEED_ADMIN_NAME,
    email: SEED_ADMIN_EMAIL,
    passwordHash,
    role: "Admin",
  });

  console.log("Importing products...");
  const mockProducts = readMock<MockProduct[]>("products.json");
  // Maps the mock dataset's string ids (e.g. "PRD-1001") to the real
  // ObjectIds assigned by Mongo, so sales/alerts below can reference the
  // correct product documents.
  const productIdMap = new Map<string, Types.ObjectId>();
  let productCount = 0;
  for (const mp of mockProducts) {
    const product = await Product.create({
      storeId: store._id,
      name: mp.name,
      sku: mp.sku,
      category: mp.category,
      stock: mp.stock,
      unit: mp.unit,
      unitPrice: mp.unitPrice,
      costPrice: mp.costPrice,
      reorderLevel: mp.reorderLevel,
      supplier: mp.supplier ?? "",
      image: mp.image ?? "",
      isActive: true,
    });
    productIdMap.set(mp.id, product._id);
    productCount += 1;
  }

  console.log("Importing sales...");
  const mockSalesFile = readMock<{ sales: MockSale[] }>("sales.json");
  let saleCount = 0;
  for (const ms of mockSalesFile.sales) {
    const productObjectId = productIdMap.get(ms.productId);
    if (!productObjectId) continue; // skip sales referencing a product not in this seed set
    await Sale.create({
      storeId: store._id,
      invoiceNo: ms.invoiceNo,
      date: parseDateTime(ms.date, ms.time),
      time: parseDateTime(ms.date, ms.time),
      customerName: ms.customerName ?? "",
      productId: productObjectId,
      quantity: ms.quantity,
      unitPrice: ms.unitPrice,
      totalAmount: ms.totalAmount ?? ms.unitPrice * ms.quantity,
      paymentMethod: ms.paymentMethod,
      status: ms.status ?? "Completed",
      recordedBy: admin._id,
    });
    saleCount += 1;
  }

  console.log("Importing alerts...");
  const mockAlerts = readMock<MockAlert[]>("alerts.json");
  let alertCount = 0;
  for (const ma of mockAlerts) {
    const productObjectId = productIdMap.get(ma.productId);
    if (!productObjectId) continue;
    await Alert.create({
      storeId: store._id,
      productId: productObjectId,
      severity: ma.severity,
      status: ma.status ?? "unread",
      message: ma.message,
      recommendedReorderQty: ma.recommendedReorderQty ?? 0,
    });
    alertCount += 1;
  }

  await mongoose.disconnect();

  console.log("");
  console.log("Seed complete:");
  console.log(`  Store:    ${store.name} (${store._id.toString()})`);
  console.log(`  Products: ${productCount}`);
  console.log(`  Sales:    ${saleCount}`);
  console.log(`  Alerts:   ${alertCount}`);
  console.log("");
  console.log("Seeded admin login credentials:");
  console.log(`  Email:    ${SEED_ADMIN_EMAIL}`);
  console.log(`  Password: ${SEED_ADMIN_PASSWORD}`);
}

main().catch((err) => {
  console.error("Seed script failed:", err);
  process.exit(1);
});
