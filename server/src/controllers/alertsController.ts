import { Request, Response } from "express";
import {
  AlertNotFoundError,
  ProductNotFoundError,
  getActiveAlerts,
  markRead,
  reorderAll,
} from "../services/alertService";
import { createOrderController } from "./ordersController";

function paramId(req: Request): string {
  const { id } = req.params;
  return Array.isArray(id) ? id[0] : id;
}

export async function listAlertsController(req: Request, res: Response): Promise<void> {
  const alerts = await getActiveAlerts(req.user!.storeId);
  res.status(200).json(alerts);
}

export async function markAlertReadController(req: Request, res: Response): Promise<void> {
  try {
    const alert = await markRead(req.user!.storeId, paramId(req));
    res.status(200).json(alert);
  } catch (err) {
    if (err instanceof AlertNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

// Delegate to order flow (creates PurchaseOrder + sends email)
export { createOrderController as reorderAlertController };

export async function reorderAllController(req: Request, res: Response): Promise<void> {
  const reorderedCount = await reorderAll(req.user!.storeId);
  res.status(200).json({ reorderedCount });
}
