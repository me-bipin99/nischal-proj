import request from "supertest";
import { createApp } from "../src/app";
import { createTestUser } from "./helpers/auth";

const app = createApp();

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("Settings API", () => {
  it("reflects an updated storeName in a subsequent GET /api/settings", async () => {
    const { token } = await createTestUser();

    const putRes = await request(app)
      .put("/api/settings")
      .set(authHeader(token))
      .send({ storeName: "Renamed Store" });
    expect(putRes.status).toBe(200);
    expect(putRes.body.storeName).toBe("Renamed Store");

    const getRes = await request(app).get("/api/settings").set(authHeader(token));
    expect(getRes.status).toBe(200);
    expect(getRes.body.storeName).toBe("Renamed Store");
  });

  it("persists lowStockThreshold, taxRate, receiptFooter, and notifications updates", async () => {
    const { token } = await createTestUser();

    const putRes = await request(app)
      .put("/api/settings")
      .set(authHeader(token))
      .send({
        lowStockThreshold: 25,
        taxRate: 12.5,
        receiptFooter: "Thanks for shopping!",
        notifications: { emailAlerts: false, lowStockAlerts: false },
      });
    expect(putRes.status).toBe(200);

    const getRes = await request(app).get("/api/settings").set(authHeader(token));
    expect(getRes.body).toMatchObject({
      lowStockThreshold: 25,
      taxRate: 12.5,
      receiptFooter: "Thanks for shopping!",
      notifications: expect.objectContaining({ emailAlerts: false, lowStockAlerts: false }),
    });
  });

  it("rejects a negative lowStockThreshold with 400", async () => {
    const { token } = await createTestUser();
    const res = await request(app)
      .put("/api/settings")
      .set(authHeader(token))
      .send({ lowStockThreshold: -5 });
    expect(res.status).toBe(400);
  });

  it("never lets one store's settings update affect another store's settings", async () => {
    const { token: tokenA } = await createTestUser({ storeName: "Store A" });
    const { token: tokenB } = await createTestUser({ storeName: "Store B" });

    await request(app).put("/api/settings").set(authHeader(tokenA)).send({ storeName: "Renamed A" });

    const getA = await request(app).get("/api/settings").set(authHeader(tokenA));
    const getB = await request(app).get("/api/settings").set(authHeader(tokenB));

    expect(getA.body.storeName).toBe("Renamed A");
    expect(getB.body.storeName).toBe("Store B");
  });
});
