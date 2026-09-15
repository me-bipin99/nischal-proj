/**
 * Dev/test seed script — wipes and repopulates the configured MongoDB
 * database with one store, one Admin user, rich historical sales (90 days),
 * products, alerts, and a handful of confirmed purchase orders.
 *
 * Usage: `npm run seed` (from `server/`).
 *
 * Refuses to run when NODE_ENV=production.
 */
import mongoose, { Types } from "mongoose";
import crypto from "crypto";
import { env } from "./src/config/env";
import { Store } from "./src/models/Store";
import { User } from "./src/models/User";
import { Product } from "./src/models/Product";
import { Sale } from "./src/models/Sale";
import { Alert } from "./src/models/Alert";
import { PurchaseOrder } from "./src/models/PurchaseOrder";
import { hashPassword } from "./src/services/authService";

// ── Credentials ───────────────────────────────────────────────────────────────
const SEED_STORE_NAME     = "ShopSense Demo Store";
const SEED_ADMIN_NAME     = "Admin";
const SEED_ADMIN_EMAIL    = "admin@shop.com";
const SEED_ADMIN_PASSWORD = "admin123";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Seeded PRNG so the dataset is deterministic across re-seeds. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);

function randBetween(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function utcDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

const PAYMENT_METHODS = ["Credit Card", "Debit Card", "Cash", "Apple Pay", "Google Pay"];
const CUSTOMER_NAMES  = [
  "Sarah Jenkins","David Miller","Emma Watson","Michael Chang","Lisa Ray",
  "Robert Fox","Amanda Seyfried","James Wilson","Priya Sharma","Carlos Ruiz",
  "Nina Brown","Tom Baker","Yuki Tanaka","Alice Chen","Mark Evans",
  "Sophie Turner","Ben Harris","Zara Ahmed","Lucas Novak","Mia Torres",
];

// ── Product catalogue ─────────────────────────────────────────────────────────

interface ProductSeed {
  id: string;
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
  /** daily sales qty range [min, max] — drives how much history this product gets */
  dailyRange: [number, number];
  /** 0..1 — how likely this product sells on any given day */
  salesFrequency: number;
}

const PRODUCTS: ProductSeed[] = [
  {
    id: "P1", name: "Organic Espresso Beans 500g",        sku: "BEV-ESP-001",
    category: "Beverages",                                  stock: 8,   unit: "pcs",
    unitPrice: 24.25, costPrice: 14.50, reorderLevel: 15,
    supplier: "RoastMaster Roastery",
    image: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=200&q=80",
    dailyRange: [1, 4], salesFrequency: 0.85,
  },
  {
    id: "P2", name: "Wireless Bluetooth Earbuds Pro",      sku: "ELE-EAR-042",
    category: "Electronics & Accessories",                  stock: 42,  unit: "pcs",
    unitPrice: 129.99, costPrice: 75.00, reorderLevel: 10,
    supplier: "TechGear Global",
    image: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=200&q=80",
    dailyRange: [1, 3], salesFrequency: 0.70,
  },
  {
    id: "P3", name: "Hydrating Facial Cleanser 200ml",     sku: "PER-FAC-108",
    category: "Personal Care & Cosmetics",                  stock: 65,  unit: "bottle",
    unitPrice: 24.00, costPrice: 11.20, reorderLevel: 20,
    supplier: "GlowSkin Organics",
    image: "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=200&q=80",
    dailyRange: [1, 5], salesFrequency: 0.75,
  },
  {
    id: "P4", name: "Eco-Friendly Dishwashing Gel 1L",     sku: "HOM-CLN-019",
    category: "Home & Cleaning",                            stock: 5,   unit: "bottle",
    unitPrice: 11.90, costPrice: 6.10, reorderLevel: 12,
    supplier: "PureHome Essentials",
    image: "https://images.unsplash.com/photo-1585842378054-ee2e52f94ba2?auto=format&fit=crop&w=200&q=80",
    dailyRange: [2, 6], salesFrequency: 0.80,
  },
  {
    id: "P5", name: "Artisanal Dark Chocolate 85%",        sku: "FOO-CHO-007",
    category: "Packaged Foods & Snacks",                    stock: 120, unit: "pack",
    unitPrice: 4.50, costPrice: 2.10, reorderLevel: 30,
    supplier: "CocoaCraft Ltd",
    image: "https://images.unsplash.com/photo-1549007994-cb92caebd54b?auto=format&fit=crop&w=200&q=80",
    dailyRange: [3, 10], salesFrequency: 0.90,
  },
  {
    id: "P6", name: "Smart LED Desk Lamp Touch Control",   sku: "ELE-LMP-015",
    category: "Electronics & Accessories",                  stock: 0,   unit: "pcs",
    unitPrice: 49.90, costPrice: 28.00, reorderLevel: 8,
    supplier: "Lumina Innovations",
    image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=200&q=80",
    dailyRange: [1, 2], salesFrequency: 0.50,
  },
  {
    id: "P7", name: "Sparkling Mineral Water 750ml",       sku: "BEV-WAT-003",
    category: "Beverages",                                  stock: 140, unit: "bottle",
    unitPrice: 3.20, costPrice: 1.40, reorderLevel: 40,
    supplier: "Alpine Springs Water",
    image: "https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=200&q=80",
    dailyRange: [5, 20], salesFrequency: 0.95,
  },
  {
    id: "P8", name: "Organic Green Tea Matcha 100g",       sku: "BEV-TEA-012",
    category: "Beverages",                                  stock: 4,   unit: "pack",
    unitPrice: 18.50, costPrice: 9.80, reorderLevel: 10,
    supplier: "Kyoto Leaf Tea Co.",
    image: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=200&q=80",
    dailyRange: [1, 4], salesFrequency: 0.80,
  },
  {
    id: "P9", name: "Microfiber All-Purpose Cloth 5-Pack", sku: "HOM-CLN-088",
    category: "Home & Cleaning",                            stock: 85,  unit: "box",
    unitPrice: 8.99, costPrice: 3.90, reorderLevel: 25,
    supplier: "PureHome Essentials",
    image: "https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=200&q=80",
    dailyRange: [2, 8], salesFrequency: 0.85,
  },
  {
    id: "P10", name: "Vitamin C Radiance Serum 30ml",      sku: "PER-SRM-033",
    category: "Personal Care & Cosmetics",                  stock: 2,   unit: "bottle",
    unitPrice: 34.00, costPrice: 16.50, reorderLevel: 12,
    supplier: "GlowSkin Organics",
    image: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=200&q=80",
    dailyRange: [1, 3], salesFrequency: 0.75,
  },
  {
    id: "P11", name: "Cold Brew Coffee Concentrate 500ml", sku: "BEV-CBR-022",
    category: "Beverages",                                  stock: 30,  unit: "bottle",
    unitPrice: 15.99, costPrice: 7.50, reorderLevel: 20,
    supplier: "RoastMaster Roastery",
    image: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=200&q=80",
    dailyRange: [1, 5], salesFrequency: 0.78,
  },
  {
    id: "P12", name: "Bamboo Toothbrush Pack of 4",        sku: "PER-TBR-011",
    category: "Personal Care & Cosmetics",                  stock: 55,  unit: "pack",
    unitPrice: 9.50, costPrice: 4.20, reorderLevel: 20,
    supplier: "EcoSmile Co.",
    image: "https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?auto=format&fit=crop&w=200&q=80",
    dailyRange: [2, 7], salesFrequency: 0.70,
  },
  {
    id: "P13", name: "Stainless Steel Water Bottle 1L",    sku: "HOM-BTL-044",
    category: "Home & Cleaning",                            stock: 70,  unit: "pcs",
    unitPrice: 22.00, costPrice: 10.50, reorderLevel: 15,
    supplier: "PureHome Essentials",
    image: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=200&q=80",
    dailyRange: [1, 4], salesFrequency: 0.72,
  },
  {
    id: "P14", name: "Protein Granola Bar Box 12-Pack",    sku: "FOO-GRN-031",
    category: "Packaged Foods & Snacks",                    stock: 90,  unit: "box",
    unitPrice: 18.90, costPrice: 9.00, reorderLevel: 25,
    supplier: "NutriSnack Foods",
    image: "https://images.unsplash.com/photo-1571748982800-fa51082c2224?auto=format&fit=crop&w=200&q=80",
    dailyRange: [2, 8], salesFrequency: 0.88,
  },
  {
    id: "P15", name: "USB-C Fast Charging Cable 2m",       sku: "ELE-CBL-067",
    category: "Electronics & Accessories",                  stock: 110, unit: "pcs",
    unitPrice: 14.99, costPrice: 5.50, reorderLevel: 30,
    supplier: "TechGear Global",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=200&q=80",
    dailyRange: [3, 12], salesFrequency: 0.90,
  },
];

// ── Alert seed data ────────────────────────────────────────────────────────────

interface AlertSeed {
  productId: string;
  severity: "critical" | "warning";
  status: "unread" | "read" | "processing" | "restocked" | "acknowledged";
  message: string;
  sellerResponse: string;
  recommendedReorderQty: number;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (env.nodeEnv === "production") {
    console.error("Refusing to seed in production — this wipes existing data.");
    process.exit(1);
  }

  console.log(`Connecting to ${env.mongodbUri} ...`);
  await mongoose.connect(env.mongodbUri);

  console.log("Wiping collections...");
  await Promise.all([
    Store.deleteMany({}),
    User.deleteMany({}),
    Product.deleteMany({}),
    Sale.deleteMany({}),
    Alert.deleteMany({}),
    PurchaseOrder.deleteMany({}),
  ]);

  // ── Store & Admin ─────────────────────────────────────────────────────────
  console.log("Creating store and admin...");
  const store = await Store.create({ name: SEED_STORE_NAME });
  const passwordHash = await hashPassword(SEED_ADMIN_PASSWORD);
  const admin = await User.create({
    storeId: store._id,
    fullName: SEED_ADMIN_NAME,
    email: SEED_ADMIN_EMAIL,
    passwordHash,
    role: "Admin",
  });

  // ── Products ──────────────────────────────────────────────────────────────
  console.log(`Creating ${PRODUCTS.length} products...`);
  const productIdMap = new Map<string, Types.ObjectId>();
  for (const p of PRODUCTS) {
    const doc = await Product.create({
      storeId: store._id,
      name: p.name, sku: p.sku, category: p.category,
      stock: p.stock, unit: p.unit,
      unitPrice: p.unitPrice, costPrice: p.costPrice,
      reorderLevel: p.reorderLevel,
      supplier: p.supplier, image: p.image, isActive: true,
    });
    productIdMap.set(p.id, doc._id);
  }

  // ── Historical Sales — 90 days ending yesterday ───────────────────────────
  // Strategy:
  //   • Base daily revenue grows from ~$320 (day 0) to ~$620 (day 89) with a
  //     gentle upward trend plus realistic noise (weekends spike slightly).
  //   • Each day, 4-10 individual sale transactions are generated across random
  //     products, totalling roughly the target daily revenue.
  //   • Invoice numbers are sequential from INV-2026-0001.

  console.log("Generating 90 days of historical sales...");
  const today = new Date(Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate()
  ));
  const startDay = addDays(today, -90);

  let invoiceCounter = 1;
  let saleCount = 0;

  for (let dayOffset = 0; dayOffset < 90; dayOffset++) {
    const currentDay = addDays(startDay, dayOffset);
    const dayOfWeek = currentDay.getUTCDay(); // 0=Sun, 6=Sat
    const isWeekend  = dayOfWeek === 0 || dayOfWeek === 6;

    // Gentle upward trend: base revenue grows ~$3/day, weekends +20%
    const baseDailyRevenue = 320 + dayOffset * 3.3 + (isWeekend ? 60 : 0);
    // Add noise ±15%
    const noiseFactor = 0.85 + rand() * 0.30;
    const targetRevenue = baseDailyRevenue * noiseFactor;

    // Generate 5-12 transactions to hit target revenue
    const txCount = randBetween(5, 12);
    let dayRevenue = 0;

    for (let t = 0; t < txCount; t++) {
      // Pick a random product weighted by salesFrequency
      let product: ProductSeed | null = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = PRODUCTS[randBetween(0, PRODUCTS.length - 1)];
        if (rand() < candidate.salesFrequency) { product = candidate; break; }
      }
      if (!product) product = PRODUCTS[0];

      const productObjId = productIdMap.get(product.id)!;
      const qty = randBetween(product.dailyRange[0], product.dailyRange[1]);
      const total = parseFloat((qty * product.unitPrice).toFixed(2));
      dayRevenue += total;

      // Spread transactions through the business day (8 AM – 7 PM)
      const hourUTC = randBetween(8, 19);
      const minUTC  = randBetween(0, 59);
      const txDate  = new Date(currentDay);
      txDate.setUTCHours(hourUTC, minUTC, 0, 0);

      const invoiceNo = `INV-2026-${String(invoiceCounter).padStart(4, "0")}`;
      invoiceCounter++;

      await Sale.create({
        storeId:       store._id,
        invoiceNo,
        date:          txDate,
        time:          txDate,
        customerName:  CUSTOMER_NAMES[randBetween(0, CUSTOMER_NAMES.length - 1)],
        productId:     productObjId,
        quantity:      qty,
        unitPrice:     product.unitPrice,
        totalAmount:   total,
        paymentMethod: PAYMENT_METHODS[randBetween(0, PAYMENT_METHODS.length - 1)],
        status:        rand() < 0.97 ? "Completed" : "Refunded",
        recordedBy:    admin._id,
      });
      saleCount++;

      // Stop generating transactions once we've passed target revenue
      if (dayRevenue >= targetRevenue) break;
    }
  }

  // ── Alerts ────────────────────────────────────────────────────────────────
  console.log("Creating alerts...");
  const alertSeeds: AlertSeed[] = [
    // ── Active low-stock alerts (unread / read / processing) ──────────────
    {
      productId: "P1", severity: "warning", status: "unread",
      message: "Stock level dropped below threshold. Consider restocking.",
      sellerResponse: "",
      recommendedReorderQty: 22,
    },
    {
      productId: "P4", severity: "critical", status: "unread",
      message: "Critical low stock (5 left). Restock soon.",
      sellerResponse: "",
      recommendedReorderQty: 19,
    },
    {
      productId: "P6", severity: "critical", status: "unread",
      message: "Out of Stock! This product needs immediate restocking.",
      sellerResponse: "",
      recommendedReorderQty: 16,
    },
    {
      productId: "P2", severity: "warning", status: "processing",
      message: "Reorder in progress — awaiting supplier confirmation for Wireless Bluetooth Earbuds Pro.",
      sellerResponse: "",
      recommendedReorderQty: 20,
    },

    // ── Restocked alerts — seller responded, visible on dashboard ─────────
    {
      productId: "P5", severity: "warning", status: "restocked",
      message: "✅ Restocked by supplier — 60 units of Artisanal Dark Chocolate 85% confirmed. Stock now at 60 — ETA: Delivered.",
      sellerResponse: "Delivered",
      recommendedReorderQty: 60,
    },
    {
      productId: "P8", severity: "warning", status: "restocked",
      message: "✅ Restocked by supplier — 16 units of Organic Green Tea Matcha 100g confirmed. Stock now at 20 — ETA: Will be delivered by tomorrow.",
      sellerResponse: "Will be delivered by tomorrow",
      recommendedReorderQty: 16,
    },
    {
      productId: "P10", severity: "critical", status: "restocked",
      message: "✅ Restocked by supplier — 22 units of Vitamin C Radiance Serum 30ml confirmed. Stock now at 24 — ETA: Within 3 Days.",
      sellerResponse: "Within 3 Days",
      recommendedReorderQty: 22,
    },
    {
      productId: "P3", severity: "warning", status: "restocked",
      message: "✅ Restocked by supplier — 40 units of Hydrating Facial Cleanser 200ml confirmed. Stock now at 40 — ETA: Within 1 Week.",
      sellerResponse: "Within 1 Week",
      recommendedReorderQty: 40,
    },
    {
      productId: "P13", severity: "warning", status: "restocked",
      message: "✅ Restocked by supplier — 30 units of Stainless Steel Water Bottle 1L confirmed. Stock now at 30 — ETA: Delivered.",
      sellerResponse: "Delivered",
      recommendedReorderQty: 30,
    },
    {
      productId: "P14", severity: "warning", status: "restocked",
      message: "✅ Restocked by supplier — 50 units of Protein Granola Bar Box 12-Pack confirmed. Stock now at 50 — ETA: Will be delivered by tomorrow.",
      sellerResponse: "Will be delivered by tomorrow",
      recommendedReorderQty: 50,
    },
    {
      productId: "P15", severity: "warning", status: "restocked",
      message: "✅ Restocked by supplier — 60 units of USB-C Fast Charging Cable 2m confirmed. Stock now at 60 — ETA: Within 3 Days.",
      sellerResponse: "Within 3 Days",
      recommendedReorderQty: 60,
    },
    {
      productId: "P11", severity: "warning", status: "restocked",
      message: "✅ Restocked by supplier — 40 units of Cold Brew Coffee Concentrate 500ml confirmed. Stock now at 40 — ETA: Within 1 Week.",
      sellerResponse: "Within 1 Week",
      recommendedReorderQty: 40,
    },
  ];

  const restockedCount = alertSeeds.filter(a => a.status === "restocked").length;

  const alertIdMap = new Map<string, Types.ObjectId>();
  for (const a of alertSeeds) {
    const productObjId = productIdMap.get(a.productId)!;
    const doc = await Alert.create({
      storeId: store._id,
      productId: productObjId,
      severity: a.severity,
      status: a.status,
      message: a.message,
      sellerResponse: a.sellerResponse,
      recommendedReorderQty: a.recommendedReorderQty,
    });
    alertIdMap.set(a.productId, doc._id);
  }

  // ── Purchase Orders — confirmed for every restocked alert ─────────────────
  console.log("Creating purchase orders...");

  const restockedOrders: Array<{
    pid: string; name: string; sku: string; qty: number; eta: string; daysAgo: number;
  }> = [
    { pid: "P5",  name: "Artisanal Dark Chocolate 85%",         sku: "FOO-CHO-007", qty: 60, eta: "Delivered",                     daysAgo: 1 },
    { pid: "P8",  name: "Organic Green Tea Matcha 100g",        sku: "BEV-TEA-012", qty: 16, eta: "Will be delivered by tomorrow",  daysAgo: 2 },
    { pid: "P10", name: "Vitamin C Radiance Serum 30ml",        sku: "PER-SRM-033", qty: 22, eta: "Within 3 Days",                  daysAgo: 2 },
    { pid: "P3",  name: "Hydrating Facial Cleanser 200ml",      sku: "PER-FAC-108", qty: 40, eta: "Within 1 Week",                  daysAgo: 3 },
    { pid: "P13", name: "Stainless Steel Water Bottle 1L",      sku: "HOM-BTL-044", qty: 30, eta: "Delivered",                     daysAgo: 1 },
    { pid: "P14", name: "Protein Granola Bar Box 12-Pack",      sku: "FOO-GRN-031", qty: 50, eta: "Will be delivered by tomorrow",  daysAgo: 2 },
    { pid: "P15", name: "USB-C Fast Charging Cable 2m",         sku: "ELE-CBL-067", qty: 60, eta: "Within 3 Days",                  daysAgo: 3 },
    { pid: "P11", name: "Cold Brew Coffee Concentrate 500ml",   sku: "BEV-CBR-022", qty: 40, eta: "Within 1 Week",                  daysAgo: 4 },
  ];

  for (const o of restockedOrders) {
    const alertId   = alertIdMap.get(o.pid)!;
    const productId = productIdMap.get(o.pid)!;
    await PurchaseOrder.create({
      storeId:      store._id,
      alertId,
      productId,
      productName:  o.name,
      sku:          o.sku,
      quantity:     o.qty,
      confirmToken: crypto.randomBytes(32).toString("hex"),
      status:       "confirmed",
      restockEta:   o.eta,
      confirmedAt:  addDays(today, -o.daysAgo),
    });
  }

  // Pending order — Wireless Earbuds (P2, processing alert)
  const p2AlertId   = alertIdMap.get("P2")!;
  const p2ProductId = productIdMap.get("P2")!;
  await PurchaseOrder.create({
    storeId:      store._id,
    alertId:      p2AlertId,
    productId:    p2ProductId,
    productName:  "Wireless Bluetooth Earbuds Pro",
    sku:          "ELE-EAR-042",
    quantity:     20,
    confirmToken: crypto.randomBytes(32).toString("hex"),
    status:       "pending",
    restockEta:   "",
  });

  await mongoose.disconnect();

  console.log("");
  console.log("✅  Seed complete:");
  console.log(`    Store:           ${store.name}`);
  console.log(`    Products:        ${PRODUCTS.length}`);
  console.log(`    Sales:           ${saleCount} (across 90 days)`);
  console.log(`    Alerts:          ${alertSeeds.length} (${restockedCount} restocked with seller responses)`);
  console.log(`    Purchase orders: ${restockedOrders.length + 1} (${restockedOrders.length} confirmed, 1 pending)`);
  console.log("");
  console.log("    Login → admin@shop.com / admin123");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
