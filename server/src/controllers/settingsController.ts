import { Request, Response } from "express";
import { z } from "zod";
import { Store } from "../models/Store";
import { getSettings, updateSettings, ValidationError } from "../services/settingsService";
import type { IStoreDocument } from "../types/models";

const notificationsSchema = z
  .object({
    emailAlerts: z.boolean(),
    lowStockAlerts: z.boolean(),
    dailySalesSummary: z.boolean(),
    weeklyForecastReport: z.boolean(),
  })
  .partial();

export const updateSettingsSchema = z.object({
  storeName: z.string().min(1).optional(),
  currency: z.string().optional(),
  timezone: z.string().optional(),
  lowStockThreshold: z.number().optional(),
  taxRate: z.number().optional(),
  receiptFooter: z.string().optional(),
  notifications: notificationsSchema.optional(),
});

function toSettingsResponse(store: InstanceType<typeof Store>) {
  return {
    storeName: store.name,
    currency: store.currency,
    timezone: store.timezone,
    lowStockThreshold: store.lowStockThreshold,
    taxRate: store.taxRate,
    receiptFooter: store.receiptFooter,
    notifications: store.notifications as IStoreDocument["notifications"],
  };
}

export async function getSettingsController(req: Request, res: Response): Promise<void> {
  const storeId = req.user!.storeId;
  const store = await getSettings(storeId);
  res.status(200).json(toSettingsResponse(store));
}

export async function updateSettingsController(req: Request, res: Response): Promise<void> {
  const body = res.locals.validated as z.infer<typeof updateSettingsSchema>;

  const storeId = req.user!.storeId;
  try {
    const store = await updateSettings(storeId, body);
    res.status(200).json(toSettingsResponse(store));
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}
