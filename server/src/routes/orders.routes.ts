import { Router } from "express";
import { confirmOrderController } from "../controllers/ordersController";

export const ordersRouter = Router();

/**
 * GET /api/orders/:token/confirm
 *
 * Public endpoint — no JWT auth.  The supplier clicks this link directly from
 * their email.  The one-time token acts as the credential.
 */
ordersRouter.get("/:token/confirm", confirmOrderController);
