import request from "supertest";
import { createApp } from "../src/app";
import { createTestUser } from "./helpers/auth";

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
      stock: 20,
      unit: "pcs",
      unitPrice: 10,
      costPrice: 5,
      reorderLevel: 10,
      ...overrides,
    });
  return res.body;
}

describe("Alerts API", () => {
  it("marks a product at stock 0 as critical with an Out of Stock message", async () => {
    const { token } = await createTestUser();
    const product = await createProduct(token, { stock: 20, reorderLevel: 10 });

    await request(app).put(`/api/products/${product.id}`).set(authHeader(token)).send({ stock: 0 });

    const res = await request(app).get("/api/alerts").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ productId: product.id, severity: "critical" });
    expect(res.body[0].message).toMatch(/out of stock/i);
  });

  it("marks stock between 30% and 100% of reorderLevel as warning, and clears the alert above reorderLevel", async () => {
    const { token } = await createTestUser();
    // reorderLevel 10 -> 30% = 3, so stock=5 is between 3 (exclusive-ish) and 10 -> warning
    const product = await createProduct(token, { stock: 20, reorderLevel: 10 });

    await request(app).put(`/api/products/${product.id}`).set(authHeader(token)).send({ stock: 5 });
    const warningRes = await request(app).get("/api/alerts").set(authHeader(token));
    expect(warningRes.body).toHaveLength(1);
    expect(warningRes.body[0].severity).toBe("warning");

    await request(app).put(`/api/products/${product.id}`).set(authHeader(token)).send({ stock: 15 });
    const clearedRes = await request(app).get("/api/alerts").set(authHeader(token));
    expect(clearedRes.body).toHaveLength(0);
  });

  it("marks stock at or below 30% of reorderLevel as critical", async () => {
    const { token } = await createTestUser();
    const product = await createProduct(token, { stock: 20, reorderLevel: 10 });

    await request(app).put(`/api/products/${product.id}`).set(authHeader(token)).send({ stock: 3 });
    const res = await request(app).get("/api/alerts").set(authHeader(token));
    expect(res.body).toHaveLength(1);
    expect(res.body[0].severity).toBe("critical");
  });

  it("POST /api/alerts/:id/reorder creates a purchase order and marks the alert as processing", async () => {
    const { token } = await createTestUser();
    const product = await createProduct(token, { stock: 20, reorderLevel: 10 });
    await request(app).put(`/api/products/${product.id}`).set(authHeader(token)).send({ stock: 0 });

    const alertsRes = await request(app).get("/api/alerts").set(authHeader(token));
    const alertId = alertsRes.body[0].id;

    // The reorder endpoint creates a PurchaseOrder + emails the supplier (202 Accepted).
    const reorderRes = await request(app).post(`/api/alerts/${alertId}/reorder`).set(authHeader(token));
    expect(reorderRes.status).toBe(202);
    expect(reorderRes.body).toHaveProperty("orderId");
    expect(reorderRes.body).toHaveProperty("status", "processing");
    expect(reorderRes.body.message).toMatch(/reorder placed/i);

    // Alert should now be in "processing" state (awaiting supplier confirmation)
    const afterRes = await request(app).get("/api/alerts").set(authHeader(token));
    expect(afterRes.body).toHaveLength(1);
    expect(afterRes.body[0].status).toBe("processing");
  });

  it("POST /api/alerts/reorder-all clears every active alert for the store", async () => {
    const { token } = await createTestUser();
    const p1 = await createProduct(token, { stock: 20, reorderLevel: 10 });
    const p2 = await createProduct(token, { stock: 20, reorderLevel: 10 });

    await request(app).put(`/api/products/${p1.id}`).set(authHeader(token)).send({ stock: 0 });
    await request(app).put(`/api/products/${p2.id}`).set(authHeader(token)).send({ stock: 2 });

    const beforeRes = await request(app).get("/api/alerts").set(authHeader(token));
    expect(beforeRes.body).toHaveLength(2);

    const reorderAllRes = await request(app).post("/api/alerts/reorder-all").set(authHeader(token));
    expect(reorderAllRes.status).toBe(200);
    expect(reorderAllRes.body.reorderedCount).toBe(2);

    const afterRes = await request(app).get("/api/alerts").set(authHeader(token));
    expect(afterRes.body).toHaveLength(0);
  });

  it("never shows alerts from one store in another store's GET /api/alerts response", async () => {
    const { token: tokenA } = await createTestUser();
    const { token: tokenB } = await createTestUser();

    const productA = await createProduct(tokenA, { stock: 20, reorderLevel: 10 });
    await request(app).put(`/api/products/${productA.id}`).set(authHeader(tokenA)).send({ stock: 0 });

    const resA = await request(app).get("/api/alerts").set(authHeader(tokenA));
    expect(resA.body).toHaveLength(1);

    const resB = await request(app).get("/api/alerts").set(authHeader(tokenB));
    expect(resB.body).toHaveLength(0);
  });
});
