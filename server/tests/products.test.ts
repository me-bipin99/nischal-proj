import request from "supertest";
import { createApp } from "../src/app";
import { createTestUser } from "./helpers/auth";

const app = createApp();

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

const baseProduct = {
  name: "Espresso Beans",
  sku: "ESP-001",
  category: "Beverages",
  stock: 50,
  unit: "bag",
  unitPrice: 12.5,
  costPrice: 6,
  reorderLevel: 10,
};

describe("Products API", () => {
  it("creates a product and returns it with a computed status", async () => {
    const { token } = await createTestUser();
    const res = await request(app).post("/api/products").set(authHeader(token)).send(baseProduct);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "Espresso Beans",
      sku: "ESP-001",
      status: "In Stock",
    });
  });

  it("GET /api/products returns only the authenticated user's store's products with correct status", async () => {
    const { token } = await createTestUser();
    const { token: otherToken } = await createTestUser();

    await request(app).post("/api/products").set(authHeader(token)).send(baseProduct);
    await request(app)
      .post("/api/products")
      .set(authHeader(token))
      .send({ ...baseProduct, sku: "ESP-002", name: "Out of Stock Item", stock: 0 });
    await request(app)
      .post("/api/products")
      .set(authHeader(token))
      .send({ ...baseProduct, sku: "ESP-003", name: "Low Stock Item", stock: 5, reorderLevel: 10 });

    await request(app)
      .post("/api/products")
      .set(authHeader(otherToken))
      .send({ ...baseProduct, sku: "OTHER-001", name: "Other Store Product" });

    const res = await request(app).get("/api/products").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    const byName = Object.fromEntries(res.body.map((p: { name: string; status: string }) => [p.name, p.status]));
    expect(byName["Espresso Beans"]).toBe("In Stock");
    expect(byName["Out of Stock Item"]).toBe("Out of Stock");
    expect(byName["Low Stock Item"]).toBe("Low Stock");
    expect(res.body.some((p: { name: string }) => p.name === "Other Store Product")).toBe(false);
  });

  it("?search= filters case-insensitively by partial match", async () => {
    const { token } = await createTestUser();
    await request(app).post("/api/products").set(authHeader(token)).send(baseProduct);
    await request(app)
      .post("/api/products")
      .set(authHeader(token))
      .send({ ...baseProduct, sku: "TEA-001", name: "Green Tea" });

    const res = await request(app).get("/api/products?search=espresso").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Espresso Beans");
  });

  it("?category= filters to that category only", async () => {
    const { token } = await createTestUser();
    await request(app).post("/api/products").set(authHeader(token)).send(baseProduct);
    await request(app)
      .post("/api/products")
      .set(authHeader(token))
      .send({ ...baseProduct, sku: "SNK-001", name: "Chips", category: "Snacks" });

    const res = await request(app).get("/api/products?category=Beverages").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].category).toBe("Beverages");
  });

  it("returns 409 when creating a duplicate SKU for the same store, but allows it for a different store", async () => {
    const { token } = await createTestUser();
    const { token: otherToken } = await createTestUser();

    const first = await request(app).post("/api/products").set(authHeader(token)).send(baseProduct);
    expect(first.status).toBe(201);

    const dup = await request(app).post("/api/products").set(authHeader(token)).send(baseProduct);
    expect(dup.status).toBe(409);

    const otherStore = await request(app).post("/api/products").set(authHeader(otherToken)).send(baseProduct);
    expect(otherStore.status).toBe(201);
  });

  it("deletes a product and returns 404 on a subsequent GET", async () => {
    const { token } = await createTestUser();
    const created = await request(app).post("/api/products").set(authHeader(token)).send(baseProduct);
    const id = created.body.id;

    const del = await request(app).delete(`/api/products/${id}`).set(authHeader(token));
    expect(del.status).toBe(204);

    const getRes = await request(app).get(`/api/products/${id}`).set(authHeader(token));
    expect(getRes.status).toBe(404);
  });

  it("returns 400 with a clear message for negative stock", async () => {
    const { token } = await createTestUser();
    const res = await request(app)
      .post("/api/products")
      .set(authHeader(token))
      .send({ ...baseProduct, stock: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
    expect(res.body.error.length).toBeGreaterThan(0);
  });

  it("returns 400 with a clear message for missing name", async () => {
    const { token } = await createTestUser();
    const { name, ...withoutName } = baseProduct;
    const res = await request(app).post("/api/products").set(authHeader(token)).send(withoutName);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
    expect(res.body.error.length).toBeGreaterThan(0);
  });
});
