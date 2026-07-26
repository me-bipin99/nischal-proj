import request from "supertest";
import { createApp } from "../src/app";
import { createTestUser } from "./helpers/auth";

const app = createApp();

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("Account API", () => {
  it("GET /api/account returns the current user's account info", async () => {
    const { token, user, store } = await createTestUser();
    const res = await request(app).get("/api/account").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: user._id.toString(),
      fullName: user.fullName,
      email: user.email,
      storeName: store.name,
    });
  });

  it("persists fullName/phone/avatar updates via PUT /api/account", async () => {
    const { token } = await createTestUser();

    const putRes = await request(app).put("/api/account").set(authHeader(token)).send({
      fullName: "Updated Name",
      phone: "555-1234",
      avatar: "https://example.com/avatar.png",
    });
    expect(putRes.status).toBe(200);
    expect(putRes.body).toMatchObject({
      fullName: "Updated Name",
      phone: "555-1234",
      avatar: "https://example.com/avatar.png",
    });

    const getRes = await request(app).get("/api/account").set(authHeader(token));
    expect(getRes.body).toMatchObject({
      fullName: "Updated Name",
      phone: "555-1234",
      avatar: "https://example.com/avatar.png",
    });
  });

  it("changes password with correct currentPassword; old password fails login, new one succeeds", async () => {
    const email = "pwtest@example.com";
    const { token } = await createTestUser({ email, password: "old-password1" });

    const changeRes = await request(app).put("/api/account").set(authHeader(token)).send({
      currentPassword: "old-password1",
      newPassword: "new-password1",
    });
    expect(changeRes.status).toBe(200);

    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "old-password1" });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "new-password1" });
    expect(newLogin.status).toBe(200);
  });

  it("returns 401 and leaves the password unchanged when currentPassword is incorrect", async () => {
    const email = "pwtest2@example.com";
    const { token } = await createTestUser({ email, password: "old-password1" });

    const changeRes = await request(app).put("/api/account").set(authHeader(token)).send({
      currentPassword: "totally-wrong",
      newPassword: "new-password1",
    });
    expect(changeRes.status).toBe(401);

    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "old-password1" });
    expect(oldLogin.status).toBe(200);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "new-password1" });
    expect(newLogin.status).toBe(401);
  });

  it("never lets one user's account update affect another user's account", async () => {
    const { token: tokenA } = await createTestUser({ fullName: "User A" });
    const { token: tokenB } = await createTestUser({ fullName: "User B" });

    await request(app).put("/api/account").set(authHeader(tokenA)).send({ fullName: "Renamed A" });

    const getA = await request(app).get("/api/account").set(authHeader(tokenA));
    const getB = await request(app).get("/api/account").set(authHeader(tokenB));

    expect(getA.body.fullName).toBe("Renamed A");
    expect(getB.body.fullName).toBe("User B");
  });
});
