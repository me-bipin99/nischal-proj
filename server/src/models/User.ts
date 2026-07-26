import { Schema, model } from "mongoose";
import type { IUserDocument } from "../types/models";

const userSchema = new Schema<IUserDocument>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true },
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, default: "Staff" },
    phone: { type: String, default: "" },
    avatar: { type: String, default: "" },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const sanitized = ret as Record<string, unknown>;
        delete sanitized.passwordHash;
        delete sanitized.__v;
        return sanitized;
      },
    },
  }
);

export const User = model<IUserDocument>("User", userSchema);
