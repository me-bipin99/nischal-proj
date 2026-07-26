import { Router } from "express";
import {
  listAlertsController,
  markAlertReadController,
  reorderAllController,
  reorderAlertController,
} from "../controllers/alertsController";

export const alertsRouter = Router();

alertsRouter.get("/", listAlertsController);
alertsRouter.patch("/:id/read", markAlertReadController);
alertsRouter.post("/:id/reorder", reorderAlertController);
alertsRouter.post("/reorder-all", reorderAllController);
