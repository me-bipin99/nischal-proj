import { Router } from "express";
import {
  getPredictionController,
  getSummaryController,
  predictionQuerySchema,
} from "../controllers/dashboardController";
import { validate } from "../middleware/validate";

export const dashboardRouter = Router();

dashboardRouter.get("/summary", getSummaryController);
dashboardRouter.get("/prediction", validate(predictionQuerySchema, "query"), getPredictionController);
