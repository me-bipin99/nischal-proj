import dotenv from "dotenv";

dotenv.config({ quiet: true });

const REQUIRED_VARS = ["MONGODB_URI", "JWT_SECRET", "PORT"] as const;

function assertRequiredEnvVars(): void {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key] || process.env[key]?.trim() === "");
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Copy server/.env.example to server/.env and fill in real values.`
    );
  }
}

assertRequiredEnvVars();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT),
  mongodbUri: process.env.MONGODB_URI as string,
  jwtSecret: process.env.JWT_SECRET as string,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5500",

  // Base URLs
  serverUrl:   process.env.SERVER_URL   ?? "http://localhost:4000",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5500",

  // SMTP
  smtpHost: process.env.SMTP_HOST ?? "smtp.ethereal.email",
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "ShopSense Inventory <noreply@shopsense.dev>",
};
