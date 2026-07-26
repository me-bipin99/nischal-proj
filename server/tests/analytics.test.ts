import request from "supertest";
import { Types } from "mongoose";
import { createApp } from "../src/app";
import { createTestUser } from "./helpers/auth";
import { Sale } from "../src/models/Sale";

const app = createApp();

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function createProduct(token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/products")
    .set(authHeader(token))
    .send({
      name: "Widget",
      sku: `SKU-${Math.random().toString(36).slice(2, 8)}`,
      category: "General",
      stock: 1000,
      unit: "pcs",
      unitPrice: 10,
      costPrice: 5,
      reorderLevel: 10,
      ...overrides,
    });
  return res.body;
}

function startOfUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function seedSale(
  storeId: string,
  productId: string,
  userId: string,
  dayOffset: number,
  quantity: number
) {
  const today = startOfUTCDay(new Date());
  const date = new Date(today);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  await Sale.create({
    storeId: new Types.ObjectId(storeId),
    invoiceNo: `SEED-${productId}-${dayOffset}-${Math.random().toString(36).slice(2, 6)}`,
    date,
    time: date,
    customerName: "",
    productId: new Types.ObjectId(productId),
    quantity,
    unitPrice: 10,
    totalAmount: 10 * quantity,
    paymentMethod: "Cash",
    status: "Completed",
    recordedBy: new Types.ObjectId(userId),
  });
}

describe("GET /api/analytics/clusters", () => {
  it("returns { unclustered: true, products } with fewer than 3 active products", async () => {
    const { token } = await createTestUser();
    await createProduct(token);
    await createProduct(token);

    const res = await request(app).get("/api/analytics/clusters?timeframe=month").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.unclustered).toBe(true);
    expect(res.body.products).toHaveLength(2);
  });

  it("assigns a high-steady product to fastMoving, a spiky product to seasonal, and a low-steady product to slowMoving", async () => {
    const { token, store, user } = await createTestUser();
    const fastProduct = await createProduct(token, { name: "Fast Product", sku: "FAST-1" });
    const seasonalProduct = await createProduct(token, { name: "Seasonal Product", sku: "SEAS-1" });
    const slowProduct = await createProduct(token, { name: "Slow Product", sku: "SLOW-1" });

    const storeId = store._id.toString();
    const userId = user._id.toString();

    // Fast: steady quantity 10 every day for 30 days.
    for (let offset = -30; offset <= -1; offset++) {
      await seedSale(storeId, fastProduct.id, userId, offset, 10);
    }
    // Seasonal: one big spike, otherwise silent -> highly variable.
    await seedSale(storeId, seasonalProduct.id, userId, -15, 100);
    // Slow: steady but very low quantity every day.
    for (let offset = -30; offset <= -1; offset++) {
      await seedSale(storeId, slowProduct.id, userId, offset, 1);
    }

    const res = await request(app).get("/api/analytics/clusters?timeframe=month").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.unclustered).toBeUndefined();

    const { clusters, scatterData } = res.body;

    const fastNames = scatterData.fastMoving.map((p: { productName: string }) => p.productName);
    const seasonalNames = scatterData.seasonal.map((p: { productName: string }) => p.productName);
    const slowNames = scatterData.slowMoving.map((p: { productName: string }) => p.productName);

    expect(fastNames).toContain("Fast Product");
    expect(seasonalNames).toContain("Seasonal Product");
    expect(slowNames).toContain("Slow Product");

    // Groups are non-overlapping and cover all 3 active products.
    const allNames = [...fastNames, ...seasonalNames, ...slowNames];
    expect(allNames.sort()).toEqual(["Fast Product", "Seasonal Product", "Slow Product"].sort());
    expect(clusters.fastMoving.count + clusters.seasonal.count + clusters.slowMoving.count).toBe(3);
  });

  it("recomputes clusters using only sales within the selected timeframe window", async () => {
    const { token, store, user } = await createTestUser();
    const p1 = await createProduct(token, { name: "P1" });
    const p2 = await createProduct(token, { name: "P2" });
    const p3 = await createProduct(token, { name: "P3" });
    const storeId = store._id.toString();
    const userId = user._id.toString();

    // Give p1 lots of sales 60 days ago -- outside the "month" (30-day) window
    // but inside the "3months" (90-day) window.
    for (let i = 0; i < 10; i++) {
      await seedSale(storeId, p1.id, userId, -60, 5);
    }
    // Baseline recent sales for all products so clustering has data within "month" too.
    await seedSale(storeId, p1.id, userId, -1, 1);
    await seedSale(storeId, p2.id, userId, -1, 1);
    await seedSale(storeId, p3.id, userId, -1, 1);

    const monthRes = await request(app)
      .get("/api/analytics/clusters?timeframe=month")
      .set(authHeader(token));
    const threeMonthRes = await request(app)
      .get("/api/analytics/clusters?timeframe=3months")
      .set(authHeader(token));

    const monthP1Revenue = [
      ...monthRes.body.scatterData.fastMoving,
      ...monthRes.body.scatterData.seasonal,
      ...monthRes.body.scatterData.slowMoving,
    ].find((p: { productName: string }) => p.productName === "P1").revenue;

    const threeMonthP1Revenue = [
      ...threeMonthRes.body.scatterData.fastMoving,
      ...threeMonthRes.body.scatterData.seasonal,
      ...threeMonthRes.body.scatterData.slowMoving,
    ].find((p: { productName: string }) => p.productName === "P1").revenue;

    expect(threeMonthP1Revenue).toBeGreaterThan(monthP1Revenue);
  });

  it("returns 400 for an invalid timeframe", async () => {
    const { token } = await createTestUser();
    const res = await request(app).get("/api/analytics/clusters?timeframe=bogus").set(authHeader(token));
    expect(res.status).toBe(400);
  });

  it("never mixes products from different stores in cluster assignments", async () => {
    const { token: tokenA, store: storeA, user: userA } = await createTestUser();
    const { token: tokenB } = await createTestUser();

    const a1 = await createProduct(tokenA, { name: "A1" });
    const a2 = await createProduct(tokenA, { name: "A2" });
    const a3 = await createProduct(tokenA, { name: "A3" });
    await createProduct(tokenB, { name: "B1" });
    await createProduct(tokenB, { name: "B2" });
    await createProduct(tokenB, { name: "B3" });

    const storeIdA = storeA._id.toString();
    const userIdA = userA._id.toString();
    for (const p of [a1, a2, a3]) {
      await seedSale(storeIdA, p.id, userIdA, -1, 5);
    }

    const resA = await request(app).get("/api/analytics/clusters?timeframe=month").set(authHeader(tokenA));
    const allNamesA = [
      ...resA.body.scatterData.fastMoving,
      ...resA.body.scatterData.seasonal,
      ...resA.body.scatterData.slowMoving,
    ].map((p: { productName: string }) => p.productName);

    expect(allNamesA.sort()).toEqual(["A1", "A2", "A3"].sort());
    expect(allNamesA).not.toContain("B1");
  });
});
