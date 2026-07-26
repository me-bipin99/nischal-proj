import { Router } from "express";
import {
  createProductController,
  createSchema,
  deleteProductController,
  getProductController,
  listProductsController,
  updateProductController,
  updateSchema,
} from "../controllers/productsController";
import { validate } from "../middleware/validate";

export const productsRouter = Router();

productsRouter.get("/", listProductsController);
productsRouter.get("/:id", getProductController);
productsRouter.post("/", validate(createSchema), createProductController);
productsRouter.put("/:id", validate(updateSchema), updateProductController);
productsRouter.delete("/:id", deleteProductController);
