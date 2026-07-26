import { NextFunction, Request, Response } from "express";
import { ZodType } from "zod";

/**
 * Reusable validation middleware factory. Parses `req[source]` against the
 * given zod schema. On success, stashes the parsed (validated/coerced) data
 * on `res.locals.validated` and calls next() — controllers read from there
 * instead of `req.body`/`req.query` directly. (Express 5's `req.query` is a
 * getter-only property with no setter, so it can't be reassigned in place;
 * using `res.locals` keeps `body` and `query` sources consistent.)
 * On failure, responds 400 with `{ error: <first zod issue message> }` —
 * matching the exact response shape every controller previously produced
 * inline via `schema.safeParse(...)`.
 */
export function validate(schema: ZodType, source: "body" | "query" = "body") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }
    res.locals.validated = parsed.data;
    next();
  };
}
