import { Types } from "mongoose";
import { Product } from "../models/Product";
import { Sale } from "../models/Sale";
import { getActiveAlerts } from "./alertService";
import { predictSales } from "./forecastService";

export interface DashboardSummary {
  todaysSales: number;
  todaysSalesGrowth: number;
  totalRevenue: number;
  totalRevenueGrowth: number;
  totalProducts: number;
  categoriesCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  predictionSummary: {
    projectedDemand7Days: number;
    projectedRevenue7Days: number;
    topTrendingCategory: string;
    stockoutRiskItem: string;
  };
}

function startOfUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function growthPct(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

async function sumSalesBetween(storeId: Types.ObjectId, start: Date, end: Date): Promise<number> {
  const rows = await Sale.aggregate<{ total: number }>([
    { $match: { storeId, date: { $gte: start, $lt: end } } },
    { $group: { _id: null, total: { $sum: "$totalAmount" } } },
  ]);
  return rows[0]?.total ?? 0;
}

export async function getSummary(storeId: string): Promise<DashboardSummary> {
  const storeObjectId = new Types.ObjectId(storeId);

  const today = startOfUTCDay(new Date());
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);

  const [todaysSales, yesterdaysSales] = await Promise.all([
    sumSalesBetween(storeObjectId, today, tomorrow),
    sumSalesBetween(storeObjectId, yesterday, today),
  ]);

  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const prevMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));

  const [totalRevenueRows, currentMonthRevenue, prevMonthRevenue, products, activeAlerts] =
    await Promise.all([
      Sale.aggregate<{ total: number }>([
        { $match: { storeId: storeObjectId } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      sumSalesBetween(storeObjectId, monthStart, tomorrow),
      sumSalesBetween(storeObjectId, prevMonthStart, monthStart),
      Product.find({ storeId: storeObjectId }),
      getActiveAlerts(storeId),
    ]);

  const totalRevenue = totalRevenueRows[0]?.total ?? 0;
  const totalProducts = products.length;
  const categoriesCount = new Set(products.map((p) => p.category)).size;
  const lowStockCount = products.filter((p) => p.stock > 0 && p.stock <= p.reorderLevel).length;
  const outOfStockCount = products.filter((p) => p.stock === 0).length;

  const forecast = await predictSales(storeId, "7days");
  const projectedRevenue7Days = "insufficientData" in forecast ? 0 : forecast.total;

  const recentWindowStart = addDays(today, -30);
  const categoryRevenue = await Sale.aggregate<{ _id: string; total: number }>([
    { $match: { storeId: storeObjectId, date: { $gte: recentWindowStart } } },
    {
      $lookup: {
        from: "products",
        localField: "productId",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
    { $group: { _id: "$product.category", total: { $sum: "$totalAmount" } } },
    { $sort: { total: -1 } },
    { $limit: 1 },
  ]);
  const topTrendingCategory = categoryRevenue[0]?._id ?? "";

  const recentSales = await Sale.find({ storeId: storeObjectId, date: { $gte: recentWindowStart } });
  const recentQty = recentSales.reduce((sum, s) => sum + s.quantity, 0);
  const recentRevenue = recentSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const unitsPerRevenue = recentRevenue === 0 ? 0 : recentQty / recentRevenue;
  const projectedDemand7Days = Math.round(unitsPerRevenue * projectedRevenue7Days);

  const stockoutRiskItem = activeAlerts[0]?.productName ?? "";

  return {
    todaysSales: Math.round(todaysSales * 100) / 100,
    todaysSalesGrowth: growthPct(todaysSales, yesterdaysSales),
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalRevenueGrowth: growthPct(currentMonthRevenue, prevMonthRevenue),
    totalProducts,
    categoriesCount,
    lowStockCount,
    outOfStockCount,
    predictionSummary: {
      projectedDemand7Days,
      projectedRevenue7Days: Math.round(projectedRevenue7Days * 100) / 100,
      topTrendingCategory,
      stockoutRiskItem,
    },
  };
}
