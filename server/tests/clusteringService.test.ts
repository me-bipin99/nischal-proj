import {
  getClusterSummary,
  kMeans,
  labelClusters,
  normalize,
  type Point,
  type ProductFeature,
} from "../src/services/clusteringService";

describe("clusteringService.normalize", () => {
  it("returns an empty array for empty input", () => {
    expect(normalize([])).toEqual([]);
  });

  it("scales a range of values to [0, 100]", () => {
    expect(normalize([1, 2, 3])).toEqual([0, 50, 100]);
  });

  it("maps a constant array to all zeros (range == 0)", () => {
    expect(normalize([5, 5, 5])).toEqual([0, 0, 0]);
    expect(normalize([7])).toEqual([0]);
  });

  it("handles negative values correctly", () => {
    expect(normalize([-10, 0, 10])).toEqual([0, 50, 100]);
  });
});

describe("clusteringService.kMeans", () => {
  it("groups two well-separated clusters of points together, seeded deterministically", () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 100, y: 100 },
      { x: 101, y: 101 },
    ];

    const { assignments, centroids } = kMeans(points, 2, 42);

    expect(assignments).toHaveLength(4);
    expect(centroids).toHaveLength(2);
    // The two near-origin points must share a cluster, the two far points
    // must share the other cluster, and the two clusters must differ.
    expect(assignments[0]).toBe(assignments[1]);
    expect(assignments[2]).toBe(assignments[3]);
    expect(assignments[0]).not.toBe(assignments[2]);
  });

  it("is deterministic for a fixed seed (same input -> same output)", () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 50, y: 50 },
      { x: 55, y: 55 },
      { x: 200, y: 0 },
    ];

    const run1 = kMeans(points, 3, 42);
    const run2 = kMeans(points, 3, 42);
    expect(run1.assignments).toEqual(run2.assignments);
    expect(run1.centroids).toEqual(run2.centroids);
  });

  it("caps the number of centroids at the number of points", () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    const { centroids, assignments } = kMeans(points, 5, 42);
    expect(centroids).toHaveLength(2);
    expect(assignments).toHaveLength(2);
  });
});

describe("clusteringService.labelClusters", () => {
  it("labels the highest-x centroid Fast-Moving, lowest-y remainder Seasonal, rest Slow-Moving", () => {
    const centroids: Point[] = [
      { x: 10, y: 5 }, // highest x -> Fast-Moving
      { x: 1, y: 1 },
      { x: 5, y: 0 }, // lowest y among remaining -> Seasonal
    ];
    expect(labelClusters(centroids)).toEqual(["Fast-Moving", "Slow-Moving", "Seasonal"]);
  });

  it("handles exactly two centroids (no Slow-Moving remainder)", () => {
    const centroids: Point[] = [
      { x: 5, y: 5 },
      { x: 1, y: 1 },
    ];
    expect(labelClusters(centroids)).toEqual(["Fast-Moving", "Seasonal"]);
  });

  it("handles a single centroid", () => {
    const centroids: Point[] = [{ x: 5, y: 5 }];
    expect(labelClusters(centroids)).toEqual(["Fast-Moving"]);
  });
});

describe("clusteringService.getClusterSummary", () => {
  function feature(overrides: Partial<ProductFeature>): ProductFeature {
    return {
      productId: "id",
      productName: "name",
      sku: "sku",
      stock: 0,
      revenue: 0,
      velocity: 0,
      consistency: 0,
      ...overrides,
    };
  }

  it("returns zeros for an empty cluster", () => {
    expect(getClusterSummary([], 1000, 365)).toEqual({
      count: 0,
      avgTurnoverDays: 0,
      totalRevenueShare: "0%",
    });
  });

  it("computes avgTurnoverDays and totalRevenueShare from known velocity/revenue inputs", () => {
    const features = [feature({ velocity: 2, revenue: 100 }), feature({ velocity: 1, revenue: 50 })];
    // periodsPerYear = 365 (1-day periods, "month" timeframe)
    // velocityPerYear: 730, 365 -> turnoverDays: 365/730=0.5, 365/365=1 -> avg = 0.75 -> rounds to 0.8
    // clusterRevenue = 150; totalRevenue = 300 -> share = 50%
    const summary = getClusterSummary(features, 300, 365);
    expect(summary.count).toBe(2);
    expect(summary.avgTurnoverDays).toBeCloseTo(0.8, 5);
    expect(summary.totalRevenueShare).toBe("50%");
  });

  it("caps turnover days at 365 for a zero-velocity product", () => {
    const features = [feature({ velocity: 0, revenue: 0 })];
    const summary = getClusterSummary(features, 100, 365);
    expect(summary.avgTurnoverDays).toBe(365);
  });

  it("returns 0% revenue share when totalRevenue is 0", () => {
    const features = [feature({ velocity: 1, revenue: 0 })];
    const summary = getClusterSummary(features, 0, 365);
    expect(summary.totalRevenueShare).toBe("0%");
  });
});
