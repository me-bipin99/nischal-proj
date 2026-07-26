import { Request, Response } from "express";
import {
  AlertNotFoundError,
  ProductNotFoundError,
  getActiveAlerts,
  markRead,
  reorderAll,
  reorderByAlertId,
} from "../services/alertService";

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

export async function reorderAlertController(req: Request, res: Response): Promise<void> {
  try {
    const product = await reorderByAlertId(req.user!.storeId, paramId(req));
    res.status(200).json({
      id: product._id.toString(),
      name: product.name,
      stock: product.stock,
      reorderLevel: product.reorderLevel,
    });
  } catch (err) {
    if (err instanceof ProductNotFoundError || err instanceof AlertNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function reorderAllController(req: Request, res: Response): Promise<void> {
  const reorderedCount = await reorderAll(req.user!.storeId);
  res.status(200).json({ reorderedCount });
}
