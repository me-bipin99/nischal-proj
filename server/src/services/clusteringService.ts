import { Types } from "mongoose";
import { Product } from "../models/Product";
import { Sale } from "../models/Sale";

export type Timeframe = "month" | "3months" | "year";

export interface Point {
  x: number;
  y: number;
}

export interface ProductFeature {
  productId: string;
  productName: string;
  sku: string;
  stock: number;
  revenue: number;
  velocity: number; // mean sale quantity per period (raw, not normalized)
  consistency: number; // 1 - stddev/mean (raw, not normalized)
}

export interface ScatterPoint {
  x: number;
  y: number;
  productName: string;
  sku: string;
  stock: number;
  revenue: number;
}

export interface ClusterGroup {
  count: number;
  avgTurnoverDays: number;
  totalRevenueShare: string;
}

export interface ClusterResponse {
  clusters: {
    fastMoving: ClusterGroup;
    seasonal: ClusterGroup;
    slowMoving: ClusterGroup;
  };
  scatterData: {
    fastMoving: ScatterPoint[];
    seasonal: ScatterPoint[];
    slowMoving: ScatterPoint[];
  };
}

export interface UnclusteredResponse {
  unclustered: true;
  products: {
    productId: string;
    productName: string;
    sku: string;
    stock: number;
    revenue: number;
  }[];
}

export interface KMeansResult {
  assignments: number[];
  centroids: Point[];
}

type ClusterKey = "fastMoving" | "seasonal" | "slowMoving";

const KMEANS_SEED = 42;
const MAX_TURNOVER_DAYS = 365;

const TIMEFRAME_CONFIG: Record<Timeframe, { windowDays: number; periodDays: number }> = {
  month: { windowDays: 30, periodDays: 1 },
  "3months": { windowDays: 90, periodDays: 7 },
  year: { windowDays: 365, periodDays: 7 },
};

function startOfUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * For each active product in the store, bucket its sales quantity over the
 * timeframe window into equal-length periods (day for "month", week for
 * "3months"/"year"), zero-filling periods with no sales, then compute:
 *   velocity    = mean(quantity per period)
 *   consistency = 1 - (stddev(quantity per period) / mean(quantity per period))
 * Edge case: mean = 0 -> velocity = 0, consistency = 0.
 */
export async function computeProductFeatures(
  storeId: string,
  timeframe: Timeframe
): Promise<ProductFeature[]> {
  const storeObjectId = new Types.ObjectId(storeId);
  const { windowDays, periodDays } = TIMEFRAME_CONFIG[timeframe];
  const windowStart = startOfUTCDay(addDays(new Date(), -windowDays));

  const products = await Product.find({ storeId: storeObjectId, isActive: true });
  if (products.length === 0) return [];

  const productIds = products.map((p) => p._id);
  const sales = await Sale.find({
    storeId: storeObjectId,
    productId: { $in: productIds },
    date: { $gte: windowStart },
  }).lean();

  const periodsInWindow = Math.max(1, Math.ceil(windowDays / periodDays));
  const periodMs = periodDays * 24 * 60 * 60 * 1000;

  const byProduct = new Map<string, { qty: number[]; revenue: number }>();
  for (const p of products) {
    byProduct.set(p._id.toString(), { qty: new Array(periodsInWindow).fill(0), revenue: 0 });
  }

  for (const sale of sales) {
    const key = sale.productId.toString();
    const bucket = byProduct.get(key);
    if (!bucket) continue;
    const offset = new Date(sale.date).getTime() - windowStart.getTime();
    let periodIdx = Math.floor(offset / periodMs);
    if (periodIdx < 0) periodIdx = 0;
    if (periodIdx >= periodsInWindow) periodIdx = periodsInWindow - 1;
    bucket.qty[periodIdx] += sale.quantity;
    bucket.revenue += sale.totalAmount;
  }

  return products.map((p) => {
    const bucket = byProduct.get(p._id.toString())!;
    const mean = average(bucket.qty);
    const sd = stddev(bucket.qty, mean);
    const velocity = mean;
    const consistency = mean === 0 ? 0 : 1 - sd / mean;
    return {
      productId: p._id.toString(),
      productName: p.name,
      sku: p.sku,
      stock: p.stock,
      revenue: Math.round(bucket.revenue * 100) / 100,
      velocity,
      consistency,
    };
  });
}

/** Min-max scale an array of values to [0, 100]. Constant input -> all zeros. */
export function normalize(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return values.map(() => 0);
  return values.map((v) => ((v - min) / range) * 100);
}

function squaredDist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Deterministic PRNG (mulberry32) so kMeans is seeded/reproducible. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Small, self-contained K-Means for 2D points: k-means++ initialization,
 * then iterate assign/update until assignments stabilize or a max
 * iteration cap is hit. Seeded for deterministic output.
 */
export function kMeans(points: Point[], k: number, seed: number): KMeansResult {
  const n = points.length;
  const rng = mulberry32(seed);
  const numCentroids = Math.min(k, n);

  const centroids: Point[] = [];
  const firstIdx = Math.floor(rng() * n);
  centroids.push({ ...points[firstIdx] });

  while (centroids.length < numCentroids) {
    const distances = points.map((p) => Math.min(...centroids.map((c) => squaredDist(p, c))));
    const sum = distances.reduce((a, b) => a + b, 0);
    if (sum === 0) {
      const idx = Math.floor(rng() * n);
      centroids.push({ ...points[idx] });
      continue;
    }
    let r = rng() * sum;
    let chosen = distances.length - 1;
    for (let i = 0; i < distances.length; i++) {
      r -= distances[i];
      if (r <= 0) {
        chosen = i;
        break;
      }
    }
    centroids.push({ ...points[chosen] });
  }

  let assignments = new Array(n).fill(-1);
  const maxIterations = 100;

  for (let iter = 0; iter < maxIterations; iter++) {
    const newAssignments = points.map((p) => {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = squaredDist(p, centroids[c]);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      return best;
    });

    let changed = false;
    for (let i = 0; i < n; i++) {
      if (newAssignments[i] !== assignments[i]) {
        changed = true;
        break;
      }
    }
    assignments = newAssignments;
    if (!changed && iter > 0) break;

    const sums = centroids.map(() => ({ x: 0, y: 0, count: 0 }));
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      sums[c].x += points[i].x;
      sums[c].y += points[i].y;
      sums[c].count += 1;
    }
    for (let c = 0; c < centroids.length; c++) {
      if (sums[c].count > 0) {
        centroids[c] = { x: sums[c].x / sums[c].count, y: sums[c].y / sums[c].count };
      } else {
        // Empty cluster: reseed its centroid at the point farthest from its
        // current nearest centroid, so it can pick up points next iteration.
        let farthestIdx = 0;
        let farthestDist = -1;
        for (let i = 0; i < n; i++) {
          const d = Math.min(...centroids.map((cc) => squaredDist(points[i], cc)));
          if (d > farthestDist) {
            farthestDist = d;
            farthestIdx = i;
          }
        }
        centroids[c] = { ...points[farthestIdx] };
      }
    }
  }

  return { assignments, centroids };
}

/**
 * Labels centroids by position: highest velocity (x) -> Fast-Moving,
 * lowest consistency (y) among the rest -> Seasonal, remaining -> Slow-Moving.
 */
export function labelClusters(centroids: Point[]): string[] {
  const labels = new Array(centroids.length).fill("Slow-Moving");
  const indices = centroids.map((_, i) => i);

  let fastIdx = indices[0];
  for (const i of indices) {
    if (centroids[i].x > centroids[fastIdx].x) fastIdx = i;
  }
  labels[fastIdx] = "Fast-Moving";

  const remaining = indices.filter((i) => i !== fastIdx);
  if (remaining.length > 0) {
    let seasonalIdx = remaining[0];
    for (const i of remaining) {
      if (centroids[i].y < centroids[seasonalIdx].y) seasonalIdx = i;
    }
    labels[seasonalIdx] = "Seasonal";
    for (const i of remaining) {
      if (i !== seasonalIdx) labels[i] = "Slow-Moving";
    }
  }

  return labels;
}

const LABEL_TO_KEY: Record<string, ClusterKey> = {
  "Fast-Moving": "fastMoving",
  Seasonal: "seasonal",
  "Slow-Moving": "slowMoving",
};

/**
 * Derives the { count, avgTurnoverDays, totalRevenueShare } summary for one
 * cluster from its already-labeled member features. Operates on in-memory
 * data (produced once by clusterProducts) rather than re-querying Mongo by
 * storeId/timeframe a second time per cluster -- functionally equivalent to
 * a storeId/timeframe-keyed summary, cheaper since it reuses the single
 * computeProductFeatures() pass already done for the request.
 */
export function getClusterSummary(
  clusterFeatures: ProductFeature[],
  totalRevenue: number,
  periodsPerYear: number
): ClusterGroup {
  const count = clusterFeatures.length;
  if (count === 0) {
    return { count: 0, avgTurnoverDays: 0, totalRevenueShare: "0%" };
  }

  const turnoverDaysList = clusterFeatures.map((f) => {
    const velocityPerYear = f.velocity * periodsPerYear;
    if (velocityPerYear <= 0) return MAX_TURNOVER_DAYS;
    return Math.min(365 / velocityPerYear, MAX_TURNOVER_DAYS);
  });
  const avgTurnoverDays = Math.round(average(turnoverDaysList) * 10) / 10;

  const clusterRevenue = clusterFeatures.reduce((sum, f) => sum + f.revenue, 0);
  const share = totalRevenue === 0 ? 0 : (clusterRevenue / totalRevenue) * 100;

  return { count, avgTurnoverDays, totalRevenueShare: `${Math.round(share)}%` };
}

function toScatterPoint(feature: ProductFeature, point: Point): ScatterPoint {
  return {
    x: Math.round(point.x * 100) / 100,
    y: Math.round(point.y * 100) / 100,
    productName: feature.productName,
    sku: feature.sku,
    stock: feature.stock,
    revenue: feature.revenue,
  };
}

/**
 * Orchestrates the full clustering pipeline for a store + timeframe. Returns
 * { unclustered: true, products } when fewer than 3 active products exist,
 * otherwise runs K-Means (k=3) and returns the clusters + scatterData shape.
 */
export async function clusterProducts(
  storeId: string,
  timeframe: Timeframe
): Promise<ClusterResponse | UnclusteredResponse> {
  const features = await computeProductFeatures(storeId, timeframe);

  if (features.length < 3) {
    return {
      unclustered: true,
      products: features.map((f) => ({
        productId: f.productId,
        productName: f.productName,
        sku: f.sku,
        stock: f.stock,
        revenue: f.revenue,
      })),
    };
  }

  const xValues = normalize(features.map((f) => f.velocity));
  const yValues = normalize(features.map((f) => f.consistency));
  const points: Point[] = features.map((_, i) => ({ x: xValues[i], y: yValues[i] }));

  const { assignments, centroids } = kMeans(points, 3, KMEANS_SEED);
  const labels = labelClusters(centroids);

  const grouped: Record<ClusterKey, { feature: ProductFeature; point: Point }[]> = {
    fastMoving: [],
    seasonal: [],
    slowMoving: [],
  };

  features.forEach((feature, i) => {
    const label = labels[assignments[i]];
    const key = LABEL_TO_KEY[label];
    grouped[key].push({ feature, point: points[i] });
  });

  const totalRevenue = features.reduce((sum, f) => sum + f.revenue, 0);
  const periodsPerYear = 365 / TIMEFRAME_CONFIG[timeframe].periodDays;

  const clusters = {
    fastMoving: getClusterSummary(
      grouped.fastMoving.map((g) => g.feature),
      totalRevenue,
      periodsPerYear
    ),
    seasonal: getClusterSummary(
      grouped.seasonal.map((g) => g.feature),
      totalRevenue,
      periodsPerYear
    ),
    slowMoving: getClusterSummary(
      grouped.slowMoving.map((g) => g.feature),
      totalRevenue,
      periodsPerYear
    ),
  };

  const scatterData = {
    fastMoving: grouped.fastMoving.map((g) => toScatterPoint(g.feature, g.point)),
    seasonal: grouped.seasonal.map((g) => toScatterPoint(g.feature, g.point)),
    slowMoving: grouped.slowMoving.map((g) => toScatterPoint(g.feature, g.point)),
  };

  return { clusters, scatterData };
}
