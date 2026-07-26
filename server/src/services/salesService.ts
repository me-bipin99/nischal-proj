import { Types } from "mongoose";
import { Sale } from "../models/Sale";
import { Product } from "../models/Product";
import type { ISaleDocument } from "../types/models";
import { checkProduct } from "./alertService";

export class ProductNotFoundError extends Error {
  constructor(message = "Product not found") {
    super(message);
    this.name = "ProductNotFoundError";
  }
}

export class InsufficientStockError extends Error {
  constructor(message = "Insufficient stock") {
    super(message);
    this.name = "InsufficientStockError";
  }
}

export interface RecordSaleInput {
  productId: string;
  quantity: number;
  customerName?: string;
  paymentMethod: string;
}

export interface SaleResponse {
  id: string;
  invoiceNo: string;
  date: Date;
  time: Date;
  week: string;
  customerName: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  paymentMethod: string;
  status: string;
}

export interface PaginatedSales {
  sales: SaleResponse[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `Week ${weekNo}`;
}

function toResponse(
  sale: ISaleDocument & { productId: { _id: Types.ObjectId; name: string } }
): SaleResponse {
  return {
    id: sale._id.toString(),
    invoiceNo: sale.invoiceNo,
    date: sale.date,
    time: sale.time,
    week: isoWeek(sale.date),
    customerName: sale.customerName,
    productId: sale.productId._id.toString(),
    productName: sale.productId.name,
    quantity: sale.quantity,
    unitPrice: sale.unitPrice,
    totalAmount: sale.totalAmount,
    paymentMethod: sale.paymentMethod,
    status: sale.status,
  };
}

export async function recordSale(
  storeId: string,
  userId: string,
  input: RecordSaleInput
): Promise<SaleResponse> {
  const storeObjectId = new Types.ObjectId(storeId);
  const product = await Product.findOne({ _id: input.productId, storeId: storeObjectId });
  if (!product) throw new ProductNotFoundError();
  if (product.stock < input.quantity) throw new InsufficientStockError();

  const now = new Date();
  const existingCount = await Sale.countDocuments({ storeId: storeObjectId });
  const invoiceNo = `INV-${now.getUTCFullYear()}-${String(existingCount + 1).padStart(4, "0")}`;
  const unitPrice = product.unitPrice;
  const totalAmount = unitPrice * input.quantity;

  const sale = await Sale.create({
    storeId: storeObjectId,
    invoiceNo,
    date: now,
    time: now,
    customerName: input.customerName ?? "",
    productId: product._id,
    quantity: input.quantity,
    unitPrice,
    totalAmount,
    paymentMethod: input.paymentMethod,
    status: "Completed",
    recordedBy: new Types.ObjectId(userId),
  });

  product.stock -= input.quantity;
  await product.save();

  await checkProduct(storeId, product._id.toString());

  const populated = await Sale.findById(sale._id).populate<{
    productId: { _id: Types.ObjectId; name: string };
  }>("productId", "name");
  return toResponse(populated as unknown as ISaleDocument & { productId: { _id: Types.ObjectId; name: string } });
}

export async function listSales(
  storeId: string,
  page: number,
  pageSize: number
): Promise<PaginatedSales> {
  const storeObjectId = new Types.ObjectId(storeId);
  const [sales, totalCount] = await Promise.all([
    Sale.find({ storeId: storeObjectId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .populate<{ productId: { _id: Types.ObjectId; name: string } }>("productId", "name"),
    Sale.countDocuments({ storeId: storeObjectId }),
  ]);

  return {
    sales: sales.map((sale) =>
      toResponse(sale as unknown as ISaleDocument & { productId: { _id: Types.ObjectId; name: string } })
    ),
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}
