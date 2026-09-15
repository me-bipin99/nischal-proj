import { Types } from "mongoose";
import { Sale } from "../models/Sale";

/**
 * Forecast strategy:
 *
 * Instead of projecting a flat weighted-average line, we model two real
 * behavioural signals from the store's transaction history:
 *
 *  1. Recency-weighted baseline (WMA over the last HISTORY_WINDOW days).
 *     More recent days contribute more to the baseline than older ones.
 *
 *  2. Day-of-week seasonality (DoW index).
 *     We compute the average sales for each weekday (Mon–Sun) across all
 *     available history, then express each day as a ratio relative to the
 *     overall daily mean.  A Tuesday that historically sells 1.4× the average
 *     will have a DoW multiplier of 1.4.  This shapes the forecast curve so
 *     it rises and falls with the same weekly rhythm the store actually shows.
 *
 *  3. Short-term momentum (trend slope).
 *     Comparing the first-half vs second-half of the history window gives a
 *     % growth signal.  We apply a small compounding factor per forecast day,
 *     capped at ±5 % to prevent runaway extrapolation.
 *
 *  Each forecast day = baseline × DoW_multiplier(day) × (1 + trend)^i
 *
 *  The combined result produces a curve that looks like the store's real
 *  weekly rhythm, not a flat or purely exponential line.
 */

// Weighted moving-average weights — 14 values, oldest→newest, sum = 1.0.
// Higher weights on recent days; the last 4 days carry ~55 % of the signal.
const HISTORY_WEIGHTS = [
  0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10, 0.11, 0.12, 0.10, 0.08, 0.05,
];
const HISTORY_WINDOW = HISTORY_WEIGHTS.length; // 14

// How many days of full transaction history to use for computing day-of-week
// seasonality factors. 90 days covers ~13 weekly cycles — enough to be stable.
const DOW_HISTORY_DAYS = 90;

export type ForecastRange = "7days" | "14days" | "30days";

export interface ForecastResult {
  /** Calendar date labels ("Sep 9", "Sep 10", …) for every point on the chart. */
  labels: string[];
  /**
   * Actual daily sales for the history window (past HISTORY_WINDOW days).
   * Null in forecast slots so the line stops at today.
   */
  actualSales: (number | null)[];
  /**
   * Predicted daily sales starting from today, projected N days forward.
   * Null in history slots so the forecast line starts at today.
   */
  predictedSales: (number | null)[];
  /** Index in the labels array that is "today" — the history/forecast split point. */
  todayIndex: number;
  /** Sum of all predicted values (the forecast total). */
  total: number;
  /** % change between forecast total and the equivalent recent past period. */
  trendPct: number;
}

export interface InsufficientDataResult {
  insufficientData: true;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function startOfUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** "Sep 9", "Oct 1", etc. — always in UTC so labels match stored sale dates. */
function calendarLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// ── Data fetching ─────────────────────────────────────────────────────────────

/** Daily Sale.totalAmount sums for a window [start, start+nDays), zero-filled. */
async function getDailyTotals(
  storeId: string,
  windowStart: Date,
  nDays: number
): Promise<{ date: Date; total: number }[]> {
  const windowEnd = addDays(windowStart, nDays);
  const rows = await Sale.aggregate<{ _id: string; total: number }>([
    {
      $match: {
        storeId: new Types.ObjectId(storeId),
        date: { $gte: windowStart, $lt: windowEnd },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
        total: { $sum: "$totalAmount" },
      },
    },
  ]);
  const byDay = new Map(rows.map((r) => [r._id, r.total]));
  return Array.from({ length: nDays }, (_, i) => {
    const date = addDays(windowStart, i);
    return { date, total: byDay.get(date.toISOString().slice(0, 10)) ?? 0 };
  });
}

async function countDistinctSaleDays(storeId: string): Promise<number> {
  const rows = await Sale.aggregate<{ _id: string }>([
    { $match: { storeId: new Types.ObjectId(storeId) } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } } } },
  ]);
  return rows.length;
}

/**
 * Builds a day-of-week seasonality index from up to DOW_HISTORY_DAYS of data.
 *
 * Returns an array of 7 multipliers indexed by JS getUTCDay() (0=Sun…6=Sat).
 * Each multiplier is that weekday's average revenue / overall daily average.
 * Falls back to 1.0 for any day with no history (treats it as average).
 */
async function getDowMultipliers(storeId: string, today: Date): Promise<number[]> {
  const dowStart = addDays(today, -DOW_HISTORY_DAYS);
  const data = await getDailyTotals(storeId, dowStart, DOW_HISTORY_DAYS);

  // Bucket daily totals by weekday
  const buckets: number[][] = [[], [], [], [], [], [], []]; // 0=Sun … 6=Sat
  for (const { date, total } of data) {
    buckets[date.getUTCDay()].push(total);
  }

  const dayAvgs = buckets.map((vals) =>
    vals.length === 0 ? 0 : vals.reduce((a, b) => a + b, 0) / vals.length
  );

  // Overall mean across all days that had at least one entry
  const populated = dayAvgs.filter((v) => v > 0);
  const overallMean = populated.length === 0 ? 1 : populated.reduce((a, b) => a + b, 0) / populated.length;

  // Return ratio; cap between 0.3 and 3.0 to prevent outliers from distorting the forecast
  return dayAvgs.map((avg) => (avg === 0 || overallMean === 0 ? 1 : clamp(avg / overallMean, 0.3, 3.0)));
}

// ── Exported helpers (kept for dashboardService compatibility) ────────────────

export async function getRecentPeriodTotals(
  storeId: string,
  nPeriods = 8
): Promise<{ date: Date; total: number }[]> {
  const today = startOfUTCDay(new Date());
  const windowStart = addDays(today, -(nPeriods - 1));
  return getDailyTotals(storeId, windowStart, nPeriods);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function rangeDays(range: ForecastRange): number {
  if (range === "7days") return 7;
  if (range === "14days") return 14;
  return 30;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ── Main forecast function ────────────────────────────────────────────────────

/**
 * Returns a chart-ready ForecastResult shaped as:
 *
 *   labels:          [history day labels…, today label, …forecast day labels]
 *   actualSales:     [real values for history days…, null for today+future]
 *   predictedSales:  [null for history days…, predicted values from today+]
 *   todayIndex:      index of "today" in the arrays (= HISTORY_WINDOW)
 *
 * The history window is always HISTORY_WINDOW (14) days so the chart always
 * shows recent context regardless of the chosen forecast range.
 * Total array length = HISTORY_WINDOW + rangeDays(range).
 *
 * Prediction model (per forecast day i, 0-indexed from today):
 *   value_i = wma_baseline × dow_multiplier[weekday(today + i)] × (1 + daily_trend)^(i+1)
 */
export async function predictSales(
  storeId: string,
  range: ForecastRange
): Promise<ForecastResult | InsufficientDataResult> {
  const distinctDays = await countDistinctSaleDays(storeId);
  if (distinctDays < 2) {
    return { insufficientData: true };
  }

  const forecastDays = rangeDays(range);
  const today = startOfUTCDay(new Date());

  // ── 1. Fetch 14-day history (ending yesterday) ─────────────────────────────
  const historyStart = addDays(today, -HISTORY_WINDOW);
  const historyData = await getDailyTotals(storeId, historyStart, HISTORY_WINDOW);
  const historyTotals = historyData.map((d) => d.total);

  // ── 2. Recency-weighted baseline ──────────────────────────────────────────
  const wmaBaseline = historyTotals.reduce((sum, val, i) => sum + val * HISTORY_WEIGHTS[i], 0);

  // ── 3. Short-term momentum (trend) ────────────────────────────────────────
  // Compare recent 7 days vs prior 7 days of the 14-day window
  const firstHalfAvg = average(historyTotals.slice(0, 7));
  const secondHalfAvg = average(historyTotals.slice(7));
  const rawTrend = firstHalfAvg === 0 ? 0 : (secondHalfAvg - firstHalfAvg) / firstHalfAvg;
  // Daily compounding growth, capped at ±5 % to prevent runaway extrapolation
  const dailyGrowth = clamp(rawTrend / HISTORY_WINDOW, -0.05, 0.05);

  // ── 4. Day-of-week seasonality multipliers ────────────────────────────────
  const dowMultipliers = await getDowMultipliers(storeId, today);

  // ── 5. Build combined label / data arrays ─────────────────────────────────
  const labels: string[] = [];
  const actualSales: (number | null)[] = [];
  const predictedSales: (number | null)[] = [];

  // History slots (past HISTORY_WINDOW days, ending yesterday)
  for (let i = 0; i < HISTORY_WINDOW; i++) {
    labels.push(calendarLabel(historyData[i].date));
    actualSales.push(Math.round(historyData[i].total * 100) / 100);
    predictedSales.push(null); // no forecast line in the history zone
  }

  // Forecast slots (today through today + forecastDays - 1)
  for (let i = 0; i < forecastDays; i++) {
    const forecastDate = addDays(today, i);
    labels.push(calendarLabel(forecastDate));
    actualSales.push(null); // no actual data for future dates

    // Core prediction:
    //   wma_baseline           → recency-weighted revenue estimate per day
    //   × dow_multiplier       → shaped by this day-of-week's historical behaviour
    //   × trend compound       → directional momentum from the last 2 weeks
    const dow = forecastDate.getUTCDay();
    const dowFactor = dowMultipliers[dow];
    const trendFactor = Math.pow(1 + dailyGrowth, i + 1);
    const predicted = wmaBaseline * dowFactor * trendFactor;
    predictedSales.push(Math.round(predicted * 100) / 100);
  }

  // ── 6. Summary stats ──────────────────────────────────────────────────────
  const forecastValues = predictedSales.filter((v): v is number => v !== null);
  const total = Math.round(forecastValues.reduce((a, b) => a + b, 0) * 100) / 100;

  // Compare forecast total against the equivalent-length recent past
  const pastPeriodTotal = historyTotals
    .slice(Math.max(0, HISTORY_WINDOW - forecastDays))
    .reduce((a, b) => a + b, 0);
  const trendPct =
    pastPeriodTotal === 0
      ? 0
      : Math.round(((total - pastPeriodTotal) / pastPeriodTotal) * 1000) / 10;

  return {
    labels,
    actualSales,
    predictedSales,
    todayIndex: HISTORY_WINDOW,
    total,
    trendPct,
  };
}
