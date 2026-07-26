import { Types } from "mongoose";
import { Product } from "../models/Product";
import type { IProductDocument } from "../types/models";
import { checkProduct } from "./alertService";

export class NotFoundError extends Error {
  constructor(message = "Product not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class DuplicateSkuError extends Error {
  constructor(message = "SKU already exists") {
    super(message);
    this.name = "DuplicateSkuError";
  }
}

export type ProductStatus = "Out of Stock" | "Low Stock" | "In Stock";

export interface ProductResponse {
  id: string;
  name: string;
  sku: string;
  category: string;
  stock: number;
  unit: string;
  unitPrice: number;
  costPrice: number;
  status: ProductStatus;
  reorderLevel: number;
  image: string;
  supplier: string;
  salesTrend: null;
}

export interface ProductInput {
  name?: string;
  sku?: string;
  category?: string;
  stock?: number;
  unit?: string;
  unitPrice?: number;
  costPrice?: number;
  reorderLevel?: number;
  image?: string;
  supplier?: string;
}

function computeStatus(stock: number, reorderLevel: number): ProductStatus {
  if (stock === 0) return "Out of Stock";
  if (stock <= reorderLevel) return "Low Stock";
  return "In Stock";
}

function toResponse(product: IProductDocument): ProductResponse {
  return {
    id: product._id.toString(),
    name: product.name,
    sku: product.sku,
    category: product.category,
    stock: product.stock,
    unit: product.unit,
    unitPrice: product.unitPrice,
    costPrice: product.costPrice,
    status: computeStatus(product.stock, product.reorderLevel),
    reorderLevel: product.reorderLevel,
    image: product.image,
    supplier: product.supplier,
    salesTrend: null,
  };
}

export async function listProducts(
  storeId: string,
  filters: { search?: string; category?: string }
): Promise<ProductResponse[]> {
  const query: Record<string, unknown> = { storeId: new Types.ObjectId(storeId) };
  if (filters.search) {
    query.name = { $regex: filters.search, $options: "i" };
  }
  if (filters.category) {
    query.category = filters.category;
  }
  const products = await Product.find(query);
  return products.map(toResponse);
}

export async function getProduct(storeId: string, id: string): Promise<ProductResponse> {
  const product = await Product.findOne({ _id: id, storeId: new Types.ObjectId(storeId) });
  if (!product) throw new NotFoundError();
  return toResponse(product);
}

export async function createProduct(storeId: string, data: ProductInput): Promise<ProductResponse> {
  try {
    const product = await Product.create({ ...data, storeId: new Types.ObjectId(storeId) });
    await checkProduct(storeId, product._id.toString());
    return toResponse(product);
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new DuplicateSkuError();
    throw err;
  }
}

export async function updateProduct(
  storeId: string,
  id: string,
  data: ProductInput
): Promise<ProductResponse> {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: id, storeId: new Types.ObjectId(storeId) },
      { $set: data },
      { returnDocument: "after", runValidators: true }
    );
    if (!product) throw new NotFoundError();
    await checkProduct(storeId, product._id.toString());
    return toResponse(product);
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    if (isDuplicateKeyError(err)) throw new DuplicateSkuError();
    throw err;
  }
}

export async function deleteProduct(storeId: string, id: string): Promise<void> {
  const result = await Product.findOneAndDelete({ _id: id, storeId: new Types.ObjectId(storeId) });
  if (!result) throw new NotFoundError();
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}
