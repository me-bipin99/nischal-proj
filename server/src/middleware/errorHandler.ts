import { NextFunction, Request, Response } from "express";

/**
 * Final Express error-handling middleware (4-arg signature — must be
 * mounted last, after every router and the 404 handler).
 *
 * Maps known error types to HTTP status codes generically by matching
 * `err.name` (every service-layer error class across the app sets a
 * distinct `name` in its constructor, e.g. `NotFoundError`,
 * `DuplicateSkuError`, `AuthError`) so this file doesn't need to import
 * every error class individually and stays in sync automatically as long
 * as new service errors keep following the same `name` convention.
 *
 * The response body is always `{ error: string }`. For the 500 fallback,
 * the message is always the generic "Internal server error" — real error
 * details (including stack traces) are logged server-side via
 * console.error but never sent to the client. For mapped 4xx cases, the
 * underlying error's message is passed through, matching prior
 * controller behavior (e.g. "Product not found", "Email already in use").
 */

const NOT_FOUND_ERROR_NAMES = new Set([
  "NotFoundError",
  "ProductNotFoundError",
  "AlertNotFoundError",
  "UserNotFoundError",
  "StoreNotFoundError",
]);

const CONFLICT_ERROR_NAMES = new Set(["DuplicateSkuError", "EmailInUseError"]);

const AUTH_ERROR_NAMES = new Set(["AuthError", "IncorrectPasswordError"]);

const BAD_REQUEST_ERROR_NAMES = new Set([
  "ValidationError",
  "InsufficientStockError",
  "ZodError",
]);

function errorName(err: unknown): string | undefined {
  return typeof err === "object" && err !== null ? (err as { name?: string }).name : undefined;
}

function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return fallback;
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  console.error(err);

  const name = errorName(err);

  if (name && NOT_FOUND_ERROR_NAMES.has(name)) {
    res.status(404).json({ error: errorMessage(err, "Not found") });
    return;
  }

  if ((name && CONFLICT_ERROR_NAMES.has(name)) || isDuplicateKeyError(err)) {
    res.status(409).json({ error: errorMessage(err, "Conflict") });
    return;
  }

  if (name && AUTH_ERROR_NAMES.has(name)) {
    res.status(401).json({ error: errorMessage(err, "Unauthorized") });
    return;
  }

  if (name && (BAD_REQUEST_ERROR_NAMES.has(name) || name === "CastError")) {
    res.status(400).json({ error: errorMessage(err, "Invalid request") });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
}
