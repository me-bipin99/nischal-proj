import express, { Express } from "express";
import cors from "cors";
import { env } from "./config/env";
import { isDBConnected } from "./config/db";
import { authRouter } from "./routes/auth.routes";
import { settingsRouter } from "./routes/settings.routes";
import { accountRouter } from "./routes/account.routes";
import { productsRouter } from "./routes/products.routes";
import { salesRouter } from "./routes/sales.routes";
import { alertsRouter } from "./routes/alerts.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { analyticsRouter } from "./routes/analytics.routes";
import { auth } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";

export function createApp(): Express {
  const app = express();

  app.use(express.json());
  app.use(cors({ origin: env.corsOrigin }));

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      db: isDBConnected() ? "connected" : "disconnected",
    });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/settings", auth, settingsRouter);
  app.use("/api/account", auth, accountRouter);
  app.use("/api/products", auth, productsRouter);
  app.use("/api/sales", auth, salesRouter);
  app.use("/api/alerts", auth, alertsRouter);
  app.use("/api/dashboard", auth, dashboardRouter);
  app.use("/api/analytics", auth, analyticsRouter);

  // Catch-all JSON 404 for unmatched API routes — mounted after all real
  // routers, before the error handler.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(errorHandler);

  return app;
}
