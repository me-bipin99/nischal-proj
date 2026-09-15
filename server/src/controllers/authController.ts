import { Request, Response } from "express";
import { z } from "zod";
import { AuthError, EmailInUseError, issueToken, login, signup } from "../services/authService";
import type { IUserDocument } from "../types/models";

export const signupSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  storeName: z.string().min(1),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function toUserResponse(user: IUserDocument) {
  return {
    id: user._id.toString(),
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    storeId: user.storeId.toString(),
    avatar: user.avatar ?? "",
    phone: user.phone ?? "",
  };
}

export async function signupController(req: Request, res: Response): Promise<void> {
  const { fullName, email, password, storeName } = res.locals.validated as z.infer<
    typeof signupSchema
  >;

  try {
    const { user } = await signup(fullName, email, password, storeName);
    const token = issueToken(user);
    res.status(201).json({ token, user: toUserResponse(user) });
  } catch (err) {
    if (err instanceof EmailInUseError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function loginController(req: Request, res: Response): Promise<void> {
  const { email, password } = res.locals.validated as z.infer<typeof loginSchema>;

  try {
    const user = await login(email, password);
    const token = issueToken(user);
    res.status(200).json({ token, user: toUserResponse(user) });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: err.message });
      return;
    }
    throw err;
  }
}
