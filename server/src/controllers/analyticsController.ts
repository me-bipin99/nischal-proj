import { Request, Response } from "express";
import { z } from "zod";
import { clusterProducts, type Timeframe } from "../services/clusteringService";

export const clustersQuerySchema = z.object({
  timeframe: z
    .enum(["month", "3months", "year"], {
      message: "Invalid timeframe. Must be one of: month, 3months, year",
    })
    .default("month"),
});

export async function getClustersController(req: Request, res: Response): Promise<void> {
  const { timeframe } = res.locals.validated as z.infer<typeof clustersQuerySchema>;
  const result = await clusterProducts(req.user!.storeId, timeframe as Timeframe);
  res.status(200).json(result);
}
