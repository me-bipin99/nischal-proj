import { Request, Response } from "express";
import { z } from "zod";
import {
  InsufficientStockError,
  ProductNotFoundError,
  listSales,
  recordSale,
} from "../services/salesService";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid productId");

export const recordSaleSchema = z.object({
  productId: objectIdSchema,
  quantity: z.number().int().positive(),
  customerName: z.string().optional(),
  paymentMethod: z.string().min(1),
});

export async function listSalesController(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.max(1, Number(req.query.pageSize) || 10);
  const result = await listSales(req.user!.storeId, page, pageSize);
  res.status(200).json(result);
}

export async function recordSaleController(req: Request, res: Response): Promise<void> {
  const body = res.locals.validated as z.infer<typeof recordSaleSchema>;

  try {
    const sale = await recordSale(req.user!.storeId, req.user!.userId, body);
    res.status(201).json(sale);
  } catch (err) {
    if (err instanceof ProductNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof InsufficientStockError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}
