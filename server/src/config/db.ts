import mongoose from "mongoose";
import { env } from "./env";

export async function connectDB(): Promise<typeof mongoose> {
  return mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 10000 });
}

export function isDBConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
