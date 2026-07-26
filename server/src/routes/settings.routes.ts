import { Router } from "express";
import {
  getSettingsController,
  updateSettingsController,
  updateSettingsSchema,
} from "../controllers/settingsController";
import { validate } from "../middleware/validate";

export const settingsRouter = Router();

settingsRouter.get("/", getSettingsController);
settingsRouter.put("/", validate(updateSettingsSchema), updateSettingsController);
