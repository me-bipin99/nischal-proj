import { Request, Response } from "express";
import { z } from "zod";
import {
  AccountResult,
  getAccount,
  IncorrectPasswordError,
  updateAccount,
} from "../services/accountService";

export const updateAccountSchema = z.object({
  fullName: z.string().min(1).optional(),
  phone: z.string().optional(),
  avatar: z.string().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

function toAccountResponse({ user, storeName }: AccountResult) {
  return {
    id: user._id.toString(),
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    phone: user.phone,
    avatar: user.avatar,
    storeName,
    joinedDate: user.createdAt,
  };
}

export async function getAccountController(req: Request, res: Response): Promise<void> {
  const { storeId, userId } = req.user!;
  const result = await getAccount(storeId, userId);
  res.status(200).json(toAccountResponse(result));
}

export async function updateAccountController(req: Request, res: Response): Promise<void> {
  const body = res.locals.validated as z.infer<typeof updateAccountSchema>;

  const { storeId, userId } = req.user!;
  try {
    const result = await updateAccount(storeId, userId, body);
    res.status(200).json(toAccountResponse(result));
  } catch (err) {
    if (err instanceof IncorrectPasswordError) {
      res.status(401).json({ error: err.message });
      return;
    }
    throw err;
  }
}
