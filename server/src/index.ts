import { env } from "./config/env";
import { connectDB } from "./config/db";
import { createApp } from "./app";
import { sweepAllProducts } from "./services/alertService";

async function main(): Promise<void> {
  try {
    await connectDB();
    console.log("MongoDB connected");
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  await sweepAllProducts();

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`Server listening on port ${env.port}`);
  });
}

main();
