import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Store } from "../models/Store";
import { User } from "../models/User";
import type { IUserDocument } from "../types/models";
import { env } from "../config/env";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export class EmailInUseError extends Error {
  constructor(message = "Email already in use") {
    super(message);
    this.name = "EmailInUseError";
  }
}

export interface TokenPayload {
  userId: string;
  storeId: string;
  role: string;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function issueToken(user: Pick<IUserDocument, "_id" | "storeId" | "role">): string {
  const payload: TokenPayload = {
    userId: user._id.toString(),
    storeId: user.storeId.toString(),
    role: user.role,
  };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

export async function signup(
  fullName: string,
  email: string,
  password: string,
  storeName: string
): Promise<{ store: InstanceType<typeof Store>; user: InstanceType<typeof User> }> {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new EmailInUseError();
  }

  const store = await Store.create({ name: storeName });
  const passwordHash = await hashPassword(password);

  try {
    const user = await User.create({
      storeId: store._id,
      fullName,
      email,
      passwordHash,
      role: "Admin",
    });
    return { store, user };
  } catch (err) {
    await Store.deleteOne({ _id: store._id });
    if (isDuplicateKeyError(err)) {
      throw new EmailInUseError();
    }
    throw err;
  }
}

export async function login(email: string, password: string): Promise<InstanceType<typeof User>> {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    throw new AuthError("Invalid email or password");
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new AuthError("Invalid email or password");
  }
  return user;
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}
