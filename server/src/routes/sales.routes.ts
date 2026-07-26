import { Router } from "express";
import {
  listSalesController,
  recordSaleController,
  recordSaleSchema,
} from "../controllers/salesController";
import { validate } from "../middleware/validate";

export const salesRouter = Router();

salesRouter.get("/", listSalesController);
salesRouter.post("/", validate(recordSaleSchema), recordSaleController);
