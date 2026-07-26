import { Types } from "mongoose";
import { Sale } from "../models/Sale";

const WEIGHTS = [0.05, 0.07, 0.09, 0.11, 0.13, 0.15, 0.18, 0.22];

export type ForecastRange = "7days" | "14days" | "30days";

export interface ForecastResult {
  labels: string[];
  actualSales: (number | null)[];
  predictedSales: number[];
  total: number;
  trendPct: number;
}

export interface InsufficientDataResult {
  insufficientData: true;
}

function startOfUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Daily Sale.totalAmount sums for the last nPeriods days (oldest first), zero-filled. */
export async function getRecentPeriodTotals(
  storeId: string,
  nPeriods = 8
): Promise<{ date: Date; total: number }[]> {
  const today = startOfUTCDay(new Date());
  const windowStart = addDays(today, -(nPeriods - 1));

  const rows = await Sale.aggregate<{ _id: string; total: number }>([
    { $match: { storeId: new Types.ObjectId(storeId), date: { $gte: windowStart } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
        total: { $sum: "$totalAmount" },
      },
    },
  ]);

  const totalsByDay = new Map(rows.map((r) => [r._id, r.total]));
  const result: { date: Date; total: number }[] = [];
  for (let i = 0; i < nPeriods; i++) {
    const date = addDays(windowStart, i);
    const key = date.toISOString().slice(0, 10);
    result.push({ date, total: totalsByDay.get(key) ?? 0 });
  }
  return result;
}

async function countDistinctSaleDays(storeId: string): Promise<number> {
  const rows = await Sale.aggregate<{ _id: string }>([
    { $match: { storeId: new Types.ObjectId(storeId) } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } } } },
  ]);
  return rows.length;
}

function rangeDays(range: ForecastRange): number {
  if (range === "7days") return 7;
  if (range === "14days") return 14;
  return 30;
}

function formatLabel(range: ForecastRange, index: number, date: Date): string {
  if (range === "7days") {
    return date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  }
  return `Day ${index + 1}`;
}

export async function predictSales(
  storeId: string,
  range: ForecastRange
): Promise<ForecastResult | InsufficientDataResult> {
  const distinctDays = await countDistinctSaleDays(storeId);
  if (distinctDays < 2) {
    return { insufficientData: true };
  }

  const days = rangeDays(range);
  const window8 = await getRecentPeriodTotals(storeId, 8);
  const predictedPeriod = window8.reduce((sum, day, i) => sum + day.total * WEIGHTS[i], 0);

  const firstHalfAvg = average(window8.slice(0, 4).map((d) => d.total));
  const secondHalfAvg = average(window8.slice(4).map((d) => d.total));
  const rawTrend = firstHalfAvg === 0 ? 0 : (secondHalfAvg - firstHalfAvg) / firstHalfAvg;
  const growthFactor = clamp(rawTrend / 10, -0.05, 0.05);

  const pastWindow = await getRecentPeriodTotals(storeId, days);
  const today = startOfUTCDay(new Date());

  const labels: string[] = [];
  const actualSales: (number | null)[] = [];
  const predictedSales: number[] = [];

  for (let i = 0; i < days; i++) {
    const date = pastWindow[i].date;
    labels.push(formatLabel(range, i, date));
    actualSales.push(date.getTime() >= today.getTime() ? null : Math.round(pastWindow[i].total * 100) / 100);
    const predicted = predictedPeriod * Math.pow(1 + growthFactor, i);
    predictedSales.push(Math.round(predicted * 100) / 100);
  }

  const total = Math.round(predictedSales.reduce((a, b) => a + b, 0) * 100) / 100;
  const actualPastTotal = pastWindow.reduce((sum, d) => sum + d.total, 0);
  const trendPct =
    actualPastTotal === 0 ? 0 : Math.round(((total - actualPastTotal) / actualPastTotal) * 1000) / 10;

  return { labels, actualSales, predictedSales, total, trendPct };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
