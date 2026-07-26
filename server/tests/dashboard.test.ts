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

/** Seeds one Sale document per day-offset (negative = past days) directly in Mongo. */
async function seedSalesForDays(
  storeId: string,
  productId: string,
  userId: string,
  dayOffsets: number[]
) {
  const today = startOfUTCDay(new Date());
  let invoiceCounter = 0;
  for (const offset of dayOffsets) {
    invoiceCounter += 1;
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() + offset);
    await Sale.create({
      storeId: new Types.ObjectId(storeId),
      invoiceNo: `SEED-${offset}-${invoiceCounter}-${Math.random().toString(36).slice(2, 6)}`,
      date,
      time: date,
      customerName: "",
      productId: new Types.ObjectId(productId),
      quantity: 2,
      unitPrice: 10,
      totalAmount: 20,
      paymentMethod: "Cash",
      status: "Completed",
      recordedBy: new Types.ObjectId(userId),
    });
  }
}

describe("GET /api/dashboard/prediction", () => {
  it("returns insufficientData:true with fewer than 2 periods of sales data", async () => {
    const { token, store, user } = await createTestUser();
    const product = await createProduct(token);
    await seedSalesForDays(store._id.toString(), product.id, user._id.toString(), [0]);

    const res = await request(app).get("/api/dashboard/prediction?range=7days").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ insufficientData: true });
  });

  it("returns 7 labels/predictedSales for range=7days with null actualSales for today, given 2+ weeks of history", async () => {
    const { token, store, user } = await createTestUser();
    const product = await createProduct(token);
    const offsets = Array.from({ length: 14 }, (_, i) => -(i + 1)); // -1..-14
    await seedSalesForDays(store._id.toString(), product.id, user._id.toString(), offsets);

    const res = await request(app).get("/api/dashboard/prediction?range=7days").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.labels).toHaveLength(7);
    expect(res.body.predictedSales).toHaveLength(7);
    expect(res.body.actualSales).toHaveLength(7);
    expect(res.body.actualSales[6]).toBeNull(); // today: unobserved
    for (let i = 0; i < 6; i++) {
      expect(res.body.actualSales[i]).not.toBeNull();
      expect(typeof res.body.actualSales[i]).toBe("number");
    }
    expect(typeof res.body.total).toBe("number");
    expect(typeof res.body.trendPct).toBe("number");
  });

  it("returns proportionally longer arrays for range=14days and range=30days", async () => {
    const { token, store, user } = await createTestUser();
    const product = await createProduct(token);
    const offsets = Array.from({ length: 40 }, (_, i) => -(i + 1));
    await seedSalesForDays(store._id.toString(), product.id, user._id.toString(), offsets);

    const res14 = await request(app).get("/api/dashboard/prediction?range=14days").set(authHeader(token));
    expect(res14.body.labels).toHaveLength(14);
    expect(res14.body.predictedSales).toHaveLength(14);

    const res30 = await request(app).get("/api/dashboard/prediction?range=30days").set(authHeader(token));
    expect(res30.body.labels).toHaveLength(30);
    expect(res30.body.predictedSales).toHaveLength(30);
  });

  it("scopes prediction data to the authenticated user's store only", async () => {
    const { token: tokenA, store: storeA, user: userA } = await createTestUser();
    const { token: tokenB } = await createTestUser();
    const productA = await createProduct(tokenA);
    const offsets = Array.from({ length: 14 }, (_, i) => -(i + 1));
    await seedSalesForDays(storeA._id.toString(), productA.id, userA._id.toString(), offsets);

    const resB = await request(app).get("/api/dashboard/prediction?range=7days").set(authHeader(tokenB));
    expect(resB.body).toEqual({ insufficientData: true });
  });
});

describe("GET /api/dashboard/summary", () => {
  it("updates numbers correctly after adding a new product and recording a sale", async () => {
    const { token } = await createTestUser();

    const zeroRes = await request(app).get("/api/dashboard/summary").set(authHeader(token));
    expect(zeroRes.body.totalProducts).toBe(0);
    expect(zeroRes.body.totalRevenue).toBe(0);

    const product = await createProduct(token, { stock: 100, unitPrice: 25 });

    const afterProductRes = await request(app).get("/api/dashboard/summary").set(authHeader(token));
    expect(afterProductRes.body.totalProducts).toBe(1);

    const saleRes = await request(app)
      .post("/api/sales")
      .set(authHeader(token))
      .send({ productId: product.id, quantity: 2, paymentMethod: "Cash" });
    expect(saleRes.status).toBe(201);

    const afterSaleRes = await request(app).get("/api/dashboard/summary").set(authHeader(token));
    expect(afterSaleRes.body.totalRevenue).toBe(50);
    expect(afterSaleRes.body.todaysSales).toBe(50);
  });

  it("scopes summary numbers to the authenticated user's store only", async () => {
    const { token: tokenA } = await createTestUser();
    const { token: tokenB } = await createTestUser();

    const productA = await createProduct(tokenA, { unitPrice: 25 });
    await request(app)
      .post("/api/sales")
      .set(authHeader(tokenA))
      .send({ productId: productA.id, quantity: 4, paymentMethod: "Cash" });

    const resB = await request(app).get("/api/dashboard/summary").set(authHeader(tokenB));
    expect(resB.body.totalProducts).toBe(0);
    expect(resB.body.totalRevenue).toBe(0);
  });
});
