import { Router } from "express";
import {
  loginController,
  loginSchema,
  signupController,
  signupSchema,
} from "../controllers/authController";
import { validate } from "../middleware/validate";
import { createAuthRateLimiter } from "../middleware/rateLimiter";

export const authRouter = Router();

authRouter.post("/signup", createAuthRateLimiter(), validate(signupSchema), signupController);
authRouter.post("/login", createAuthRateLimiter(), validate(loginSchema), loginController);
