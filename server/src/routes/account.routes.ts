import { Router } from "express";
import {
  getAccountController,
  updateAccountController,
  updateAccountSchema,
} from "../controllers/accountController";
import { validate } from "../middleware/validate";

export const accountRouter = Router();

accountRouter.get("/", getAccountController);
accountRouter.put("/", validate(updateAccountSchema), updateAccountController);
