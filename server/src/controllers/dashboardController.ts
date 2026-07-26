import { Request, Response } from "express";
import { z } from "zod";
import { getSummary } from "../services/dashboardService";
import { predictSales, type ForecastRange } from "../services/forecastService";

export const predictionQuerySchema = z.object({
  range: z
    .enum(["7days", "14days", "30days"], {
      message: "Invalid range. Must be one of: 7days, 14days, 30days",
    })
    .default("7days"),
});

export async function getSummaryController(req: Request, res: Response): Promise<void> {
  const summary = await getSummary(req.user!.storeId);
  res.status(200).json(summary);
}

export async function getPredictionController(req: Request, res: Response): Promise<void> {
  const { range } = res.locals.validated as z.infer<typeof predictionQuerySchema>;
  const forecast = await predictSales(req.user!.storeId, range as ForecastRange);
  res.status(200).json(forecast);
}
