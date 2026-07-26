import { Types } from "mongoose";
import { Sale } from "../src/models/Sale";
import { getRecentPeriodTotals, predictSales } from "../src/services/forecastService";
import { createTestUser } from "./helpers/auth";

function startOfUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function seedDailyTotal(storeId: string, dayOffset: number, total: number) {
  if (total === 0) return; // zero-fill is implicit; no Sale document needed
  const today = startOfUTCDay(new Date());
  const date = new Date(today);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  await Sale.create({
    storeId: new Types.ObjectId(storeId),
    invoiceNo: `SEED-${dayOffset}-${Math.random().toString(36).slice(2, 8)}`,
    date,
    time: date,
    customerName: "",
    productId: new Types.ObjectId(),
    quantity: 1,
    unitPrice: total,
    totalAmount: total,
    paymentMethod: "Cash",
    status: "Completed",
    recordedBy: new Types.ObjectId(),
  });
}

describe("forecastService.predictSales", () => {
  it("returns insufficientData:true when fewer than 2 distinct sale days exist", async () => {
    const { store } = await createTestUser();
    const storeId = store._id.toString();

    const zeroResult = await predictSales(storeId, "7days");
    expect(zeroResult).toEqual({ insufficientData: true });

    await seedDailyTotal(storeId, -1, 50);
    const oneDayResult = await predictSales(storeId, "7days");
    expect(oneDayResult).toEqual({ insufficientData: true });
  });

  it("computes the weighted-average forecast exactly for a hand-crafted 8-day window", async () => {
    const { store } = await createTestUser();
    const storeId = store._id.toString();

    // Day totals oldest (-7) to newest (0=today), chosen so first-half avg ==
    // second-half avg (flat trend, growthFactor == 0), for a fully
    // deterministic expected output.
    const totals: Record<number, number> = {
      "-7": 100,
      "-6": 110,
      "-5": 90,
      "-4": 120,
      "-3": 130,
      "-2": 140,
      "-1": 150,
      "0": 0, // today: no sales recorded yet
    };
    for (const [offset, total] of Object.entries(totals)) {
      await seedDailyTotal(storeId, Number(offset), total);
    }

    // Sanity-check the raw daily totals used to hand-derive the expectation below.
    const window8 = await getRecentPeriodTotals(storeId, 8);
    expect(window8.map((d) => d.total)).toEqual([100, 110, 90, 120, 130, 140, 150, 0]);

    const result = await predictSales(storeId, "7days");
    if ("insufficientData" in result) throw new Error("expected a full forecast result");

    // predictedPeriod = 100*.05 + 110*.07 + 90*.09 + 120*.11 + 130*.13 + 140*.15 + 150*.18 + 0*.22 = 98.9
    // firstHalfAvg = avg(100,110,90,120) = 105; secondHalfAvg = avg(130,140,150,0) = 105 -> flat trend -> growthFactor = 0
    // so every day of the 7-day horizon predicts exactly 98.9
    expect(result.predictedSales).toEqual([98.9, 98.9, 98.9, 98.9, 98.9, 98.9, 98.9]);
    expect(result.total).toBeCloseTo(692.3, 5);

    // pastWindow (7 days, oldest to newest) = [-6..0] = [110,90,120,130,140,150,0(today)]
    expect(result.actualSales).toEqual([110, 90, 120, 130, 140, 150, null]);

    // trendPct = round(((692.3 - 740) / 740) * 1000) / 10 = -6.4
    expect(result.trendPct).toBeCloseTo(-6.4, 5);

    expect(result.labels).toHaveLength(7);
  });

  it("returns proportionally longer arrays for 14days and 30days ranges", async () => {
    const { store } = await createTestUser();
    const storeId = store._id.toString();
    for (let offset = -20; offset <= -1; offset++) {
      await seedDailyTotal(storeId, offset, 10 + offset * -1);
    }

    const result14 = await predictSales(storeId, "14days");
    const result30 = await predictSales(storeId, "30days");
    if ("insufficientData" in result14 || "insufficientData" in result30) {
      throw new Error("expected full forecast results");
    }
    expect(result14.labels).toHaveLength(14);
    expect(result14.predictedSales).toHaveLength(14);
    expect(result30.labels).toHaveLength(30);
    expect(result30.predictedSales).toHaveLength(30);
  });
});

describe("forecastService.getRecentPeriodTotals", () => {
  it("zero-fills days with no sales", async () => {
    const { store } = await createTestUser();
    const storeId = store._id.toString();
    await seedDailyTotal(storeId, -1, 25);

    const totals = await getRecentPeriodTotals(storeId, 3);
    expect(totals).toHaveLength(3);
    expect(totals.map((t) => t.total)).toEqual([0, 25, 0]);
  });
});
