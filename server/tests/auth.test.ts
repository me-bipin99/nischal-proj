import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../src/app";
import { User } from "../src/models/User";
import { env } from "../src/config/env";
import type { TokenPayload } from "../src/services/authService";

const app = createApp();

describe("POST /api/auth/signup", () => {
  it("creates a Store and a User and returns a valid JWT", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      fullName: "Alice Admin",
      email: "alice@example.com",
      password: "password123",
      storeName: "Alice's Store",
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({
      fullName: "Alice Admin",
      email: "alice@example.com",
      role: "Admin",
    });
    expect(res.body.user.storeId).toEqual(expect.any(String));

    const decoded = jwt.verify(res.body.token, env.jwtSecret) as TokenPayload;
    expect(decoded).toMatchObject({
      userId: res.body.user.id,
      storeId: res.body.user.storeId,
      role: "Admin",
    });

    const users = await User.find({ email: "alice@example.com" });
    expect(users).toHaveLength(1);
  });

  it("returns 409 and creates no duplicate User when signing up twice with the same email", async () => {
    const payload = {
      fullName: "Bob Builder",
      email: "bob@example.com",
      password: "password123",
      storeName: "Bob's Store",
    };

    const first = await request(app).post("/api/auth/signup").send(payload);
    expect(first.status).toBe(201);

    const second = await request(app).post("/api/auth/signup").send(payload);
    expect(second.status).toBe(409);

    const users = await User.find({ email: "bob@example.com" });
    expect(users).toHaveLength(1);
  });

  it("returns 400 for an invalid signup body", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      fullName: "",
      email: "not-an-email",
      password: "short",
      storeName: "",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await request(app).post("/api/auth/signup").send({
      fullName: "Carol Case",
      email: "carol@example.com",
      password: "correct-password",
      storeName: "Carol's Store",
    });
  });

  it("returns a JWT for correct credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "carol@example.com", password: "correct-password" });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));

    const decoded = jwt.verify(res.body.token, env.jwtSecret) as TokenPayload;
    expect(decoded).toEqual(
      expect.objectContaining({
        userId: expect.any(String),
        storeId: expect.any(String),
        role: "Admin",
      })
    );
  });

  it("returns a generic 401 for a wrong password, identical to the unknown-email case", async () => {
    const wrongPasswordRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "carol@example.com", password: "wrong-password" });
    expect(wrongPasswordRes.status).toBe(401);

    const unknownEmailRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "unknown@example.com", password: "whatever123" });
    expect(unknownEmailRes.status).toBe(401);

    // Same generic message for both failure modes -- doesn't leak which one was wrong.
    expect(wrongPasswordRes.body.error).toBe(unknownEmailRes.body.error);
  });
});

describe("protected routes", () => {
  it("returns 401 without an Authorization header", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(401);
  });

  it("returns 401 with an invalid token", async () => {
    const res = await request(app).get("/api/products").set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });
});
