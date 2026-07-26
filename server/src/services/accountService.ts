import { Store } from "../models/Store";
import { User } from "../models/User";
import { hashPassword, verifyPassword } from "./authService";

export class UserNotFoundError extends Error {
  constructor(message = "User not found") {
    super(message);
    this.name = "UserNotFoundError";
  }
}

export class IncorrectPasswordError extends Error {
  constructor(message = "Current password is incorrect") {
    super(message);
    this.name = "IncorrectPasswordError";
  }
}

export interface UpdateAccountInput {
  fullName?: string;
  phone?: string;
  avatar?: string;
  currentPassword?: string;
  newPassword?: string;
}

export interface AccountResult {
  user: InstanceType<typeof User>;
  storeName: string;
}

export async function getAccount(storeId: string, userId: string): Promise<AccountResult> {
  const user = await User.findOne({ _id: userId, storeId });
  if (!user) {
    throw new UserNotFoundError();
  }
  const store = await Store.findById(storeId);
  return { user, storeName: store?.name ?? "" };
}

export async function updateAccount(
  storeId: string,
  userId: string,
  data: UpdateAccountInput
): Promise<AccountResult> {
  const user = await User.findOne({ _id: userId, storeId });
  if (!user) {
    throw new UserNotFoundError();
  }

  if (data.fullName !== undefined) {
    user.fullName = data.fullName;
  }
  if (data.phone !== undefined) {
    user.phone = data.phone;
  }
  if (data.avatar !== undefined) {
    user.avatar = data.avatar;
  }

  if (data.newPassword !== undefined) {
    const valid = data.currentPassword
      ? await verifyPassword(data.currentPassword, user.passwordHash)
      : false;
    if (!valid) {
      throw new IncorrectPasswordError();
    }
    user.passwordHash = await hashPassword(data.newPassword);
  }

  await user.save();
  const store = await Store.findById(storeId);
  return { user, storeName: store?.name ?? "" };
}
