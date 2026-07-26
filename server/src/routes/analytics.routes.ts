import { Router } from "express";
import { clustersQuerySchema, getClustersController } from "../controllers/analyticsController";
import { validate } from "../middleware/validate";

export const analyticsRouter = Router();

analyticsRouter.get("/clusters", validate(clustersQuerySchema, "query"), getClustersController);
