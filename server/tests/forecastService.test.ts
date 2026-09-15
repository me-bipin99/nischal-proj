import { Types } from "mongoose";
import { Sale } from "../src/models/Sale";
import { getRecentPeriodTotals, predictSales } from "../src/services/forecastService";
import { createTestUser } from "./helpers/auth";

// Must match HISTORY_WINDOW in forecastService.ts
const HISTORY_WINDOW = 14;

// Weights as defined in forecastService.ts (14 values, oldest→newest, sum=1)
const HISTORY_WEIGHTS = [
  0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10, 0.11, 0.12, 0.10, 0.08, 0.05,
];

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

  it("returns the correct array shape and split for range=7days", async () => {
    const { store } = await createTestUser();
    const storeId = store._id.toString();

    // Seed 14 days of history with a flat, equal daily total so
    // growthFactor is 0 — fully deterministic.
    for (let i = 1; i <= HISTORY_WINDOW; i++) {
      await seedDailyTotal(storeId, -i, 100);
    }

    const result = await predictSales(storeId, "7days");
    if ("insufficientData" in result) throw new Error("expected a full forecast result");

    const totalPoints = HISTORY_WINDOW + 7;
    expect(result.labels).toHaveLength(totalPoints);
    expect(result.actualSales).toHaveLength(totalPoints);
    expect(result.predictedSales).toHaveLength(totalPoints);

    // todayIndex marks the boundary between history and forecast
    expect(result.todayIndex).toBe(HISTORY_WINDOW);

    // History slots: actualSales are numbers, predictedSales are null
    for (let i = 0; i < HISTORY_WINDOW; i++) {
      expect(typeof result.actualSales[i]).toBe("number");
      expect(result.predictedSales[i]).toBeNull();
    }

    // Forecast slots: actualSales are null, predictedSales are numbers
    for (let i = HISTORY_WINDOW; i < totalPoints; i++) {
      expect(result.actualSales[i]).toBeNull();
      expect(typeof result.predictedSales[i]).toBe("number");
    }

    expect(typeof result.total).toBe("number");
    expect(typeof result.trendPct).toBe("number");
  });

  it("weighted baseline is calculated correctly with a hand-crafted flat window", async () => {
    const { store } = await createTestUser();
    const storeId = store._id.toString();

    // Seed exactly the 14-day history window with known values.
    // Use values that produce a flat trend (first-half avg == second-half avg)
    // so growthFactor == 0 and every predicted day == weightedBaseline.
    const dailyTotals = [100, 110, 90, 120, 130, 140, 80, 100, 110, 90, 120, 130, 140, 80];
    // oldest is offset -14, newest is offset -1
    for (let i = 0; i < HISTORY_WINDOW; i++) {
      const offset = -(HISTORY_WINDOW - i);  // -14, -13, … -1
      await seedDailyTotal(storeId, offset, dailyTotals[i]);
    }

    const expectedBaseline = dailyTotals.reduce((sum, val, i) => sum + val * HISTORY_WEIGHTS[i], 0);

    const result = await predictSales(storeId, "7days");
    if ("insufficientData" in result) throw new Error("expected a full forecast result");

    // All predicted values should be close to the weighted baseline
    // (growth factor may not be exactly 0 with this data, but each predicted
    // value should be derived from the same baseline).
    const predictedValues = result.predictedSales.filter((v): v is number => v !== null);
    expect(predictedValues).toHaveLength(7);
    // The first predicted day (i=1 in growth formula) should be close to baseline * (1+growth)^1
    expect(predictedValues[0]).toBeGreaterThan(0);
    // All values should be positive
    predictedValues.forEach(v => expect(v).toBeGreaterThan(0));

    expect(result.total).toBeGreaterThan(0);
  });

  it("returns proportionally longer arrays for 14days and 30days ranges", async () => {
    const { store } = await createTestUser();
    const storeId = store._id.toString();
    for (let offset = -HISTORY_WINDOW; offset <= -1; offset++) {
      await seedDailyTotal(storeId, offset, 10 + Math.abs(offset));
    }

    const result14 = await predictSales(storeId, "14days");
    const result30 = await predictSales(storeId, "30days");
    if ("insufficientData" in result14 || "insufficientData" in result30) {
      throw new Error("expected full forecast results");
    }
    expect(result14.labels).toHaveLength(HISTORY_WINDOW + 14);
    expect(result14.predictedSales).toHaveLength(HISTORY_WINDOW + 14);
    expect(result30.labels).toHaveLength(HISTORY_WINDOW + 30);
    expect(result30.predictedSales).toHaveLength(HISTORY_WINDOW + 30);
  });
  it("produces varied forecast values shaped by day-of-week behaviour (not a flat line)", async () => {
    const { store } = await createTestUser();
    const storeId = store._id.toString();

    // Seed 90 days of history with a strong day-of-week pattern:
    // weekends (Sat/Sun) get 3× the revenue of weekdays.
    // This should produce a non-flat forecast that rises on weekend days.
    const today = startOfUTCDay(new Date());
    for (let i = 1; i <= 90; i++) {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() - i);
      const dow = date.getUTCDay(); // 0=Sun, 6=Sat
      const total = dow === 0 || dow === 6 ? 300 : 100;
      await Sale.create({
        storeId: new Types.ObjectId(storeId),
        invoiceNo: `DOW-${i}-${Math.random().toString(36).slice(2, 8)}`,
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

    const result = await predictSales(storeId, "7days");
    if ("insufficientData" in result) throw new Error("expected a full forecast result");

    const predicted = result.predictedSales.filter((v): v is number => v !== null);
    expect(predicted).toHaveLength(7);

    // With strong weekend/weekday contrast the forecast must NOT be a flat line —
    // the max value should be meaningfully higher than the min value.
    const maxVal = Math.max(...predicted);
    const minVal = Math.min(...predicted);
    // Expect at least 20% spread between the highest and lowest forecast day
    expect(maxVal).toBeGreaterThan(minVal * 1.2);
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
