import rateLimit from "express-rate-limit";

/**
 * Rate limiter factory for the credential-sensitive auth endpoints
 * (POST /api/auth/login and POST /api/auth/signup) — blunts
 * credential-stuffing and spam-signup attempts. Not applied globally,
 * only mounted on those two routes. Each route gets its own limiter
 * instance (own counter store) so a burst against one endpoint doesn't
 * eat into the other's budget.
 */
export function createAuthRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 10, // 10 requests per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: "Too many requests. Please try again later." });
    },
  });
}
