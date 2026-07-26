import request from "supertest";
import { createApp } from "../src/app";
import { createTestUser } from "./helpers/auth";
import { Product } from "../src/models/Product";
import { Sale } from "../src/models/Sale";

const app = createApp();

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function isoWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `Week ${weekNo}`;
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
      reorderLevel: 5,
      ...overrides,
    });
  return res.body;
}

describe("Sales API", () => {
  it("records a sale with sufficient stock, returns a populated sale, and reduces product stock", async () => {
    const { token } = await createTestUser();
    const product = await createProduct(token, { stock: 20 });

    const res = await request(app)
      .post("/api/sales")
      .set(authHeader(token))
      .send({ productId: product.id, quantity: 3, paymentMethod: "Cash" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      productId: product.id,
      productName: "Widget",
      quantity: 3,
      unitPrice: 10,
      totalAmount: 30,
      paymentMethod: "Cash",
      status: "Completed",
    });
    expect(res.body.invoiceNo).toEqual(expect.any(String));

    const dbProduct = await Product.findById(product.id);
    expect(dbProduct?.stock).toBe(17);
  });

  it("returns 400 and creates no Sale when quantity exceeds stock, leaving stock unchanged", async () => {
    const { token } = await createTestUser();
    const product = await createProduct(token, { stock: 5 });

    const res = await request(app)
      .post("/api/sales")
      .set(authHeader(token))
      .send({ productId: product.id, quantity: 10, paymentMethod: "Cash" });

    expect(res.status).toBe(400);

    const dbProduct = await Product.findById(product.id);
    expect(dbProduct?.stock).toBe(5);

    const sales = await Sale.find({ productId: product.id });
    expect(sales).toHaveLength(0);
  });

  it("paginates sales correctly with totalCount and totalPages", async () => {
    const { token } = await createTestUser();
    const product = await createProduct(token, { stock: 1000 });

    for (let i = 0; i < 15; i++) {
      const res = await request(app)
        .post("/api/sales")
        .set(authHeader(token))
        .send({ productId: product.id, quantity: 1, paymentMethod: "Cash" });
      expect(res.status).toBe(201);
    }

    const page1 = await request(app).get("/api/sales?page=1&pageSize=10").set(authHeader(token));
    expect(page1.status).toBe(200);
    expect(page1.body.sales).toHaveLength(10);
    expect(page1.body.totalCount).toBe(15);
    expect(page1.body.totalPages).toBe(2);

    const page2 = await request(app).get("/api/sales?page=2&pageSize=10").set(authHeader(token));
    expect(page2.status).toBe(200);
    expect(page2.body.sales).toHaveLength(5);
  });

  it("gives two sales in the same store sequential, unique invoiceNo values", async () => {
    const { token } = await createTestUser();
    const product = await createProduct(token, { stock: 20 });

    const first = await request(app)
      .post("/api/sales")
      .set(authHeader(token))
      .send({ productId: product.id, quantity: 1, paymentMethod: "Cash" });
    const second = await request(app)
      .post("/api/sales")
      .set(authHeader(token))
      .send({ productId: product.id, quantity: 1, paymentMethod: "Cash" });

    expect(first.body.invoiceNo).not.toBe(second.body.invoiceNo);
    const firstNum = Number(first.body.invoiceNo.split("-").pop());
    const secondNum = Number(second.body.invoiceNo.split("-").pop());
    expect(secondNum).toBe(firstNum + 1);
  });

  it("returns a week label matching the ISO week number of the sale date", async () => {
    const { token } = await createTestUser();
    const product = await createProduct(token, { stock: 20 });

    const res = await request(app)
      .post("/api/sales")
      .set(authHeader(token))
      .send({ productId: product.id, quantity: 1, paymentMethod: "Cash" });

    expect(res.status).toBe(201);
    const expectedWeek = isoWeekLabel(new Date(res.body.date));
    expect(res.body.week).toBe(expectedWeek);
  });
});
