import { Store } from "../models/Store";
import type { IStoreDocument } from "../types/models";

export class StoreNotFoundError extends Error {
  constructor(message = "Store not found") {
    super(message);
    this.name = "StoreNotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export interface UpdateSettingsInput {
  storeName?: string;
  currency?: string;
  timezone?: string;
  lowStockThreshold?: number;
  taxRate?: number;
  receiptFooter?: string;
  notifications?: Partial<IStoreDocument["notifications"]>;
}

export async function getSettings(storeId: string): Promise<InstanceType<typeof Store>> {
  const store = await Store.findById(storeId);
  if (!store) {
    throw new StoreNotFoundError();
  }
  return store;
}

export async function updateSettings(
  storeId: string,
  data: UpdateSettingsInput
): Promise<InstanceType<typeof Store>> {
  const store = await Store.findById(storeId);
  if (!store) {
    throw new StoreNotFoundError();
  }

  if (data.lowStockThreshold !== undefined) {
    if (typeof data.lowStockThreshold !== "number" || data.lowStockThreshold < 0) {
      throw new ValidationError("lowStockThreshold must be a non-negative number");
    }
    store.lowStockThreshold = data.lowStockThreshold;
  }

  if (data.taxRate !== undefined) {
    if (typeof data.taxRate !== "number" || data.taxRate < 0) {
      throw new ValidationError("taxRate must be a non-negative number");
    }
    store.taxRate = data.taxRate;
  }

  if (data.storeName !== undefined) {
    store.name = data.storeName;
  }
  if (data.currency !== undefined) {
    store.currency = data.currency;
  }
  if (data.timezone !== undefined) {
    store.timezone = data.timezone;
  }
  if (data.receiptFooter !== undefined) {
    store.receiptFooter = data.receiptFooter;
  }
  if (data.notifications !== undefined) {
    store.notifications = { ...store.notifications, ...data.notifications };
  }

  await store.save();
  return store;
}
