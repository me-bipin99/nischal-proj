import { Request, Response } from "express";
import { z } from "zod";
import {
  createProduct,
  deleteProduct,
  DuplicateSkuError,
  getProduct,
  listProducts,
  NotFoundError,
  updateProduct,
} from "../services/productService";

export const createSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  category: z.string().min(1),
  stock: z.number().nonnegative(),
  unit: z.string().min(1),
  unitPrice: z.number().nonnegative(),
  costPrice: z.number().nonnegative(),
  reorderLevel: z.number().nonnegative(),
  image: z.string().optional(),
  supplier: z.string().optional(),
});

export const updateSchema = createSchema.partial();

function isCastError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: string }).name === "CastError";
}

function paramId(req: Request): string {
  const { id } = req.params;
  return Array.isArray(id) ? id[0] : id;
}

export async function listProductsController(req: Request, res: Response): Promise<void> {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const products = await listProducts(req.user!.storeId, { search, category });
  res.status(200).json(products);
}

export async function getProductController(req: Request, res: Response): Promise<void> {
  try {
    const product = await getProduct(req.user!.storeId, paramId(req));
    res.status(200).json(product);
  } catch (err) {
    if (err instanceof NotFoundError || isCastError(err)) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    throw err;
  }
}

export async function createProductController(req: Request, res: Response): Promise<void> {
  const body = res.locals.validated as z.infer<typeof createSchema>;

  try {
    const product = await createProduct(req.user!.storeId, body);
    res.status(201).json(product);
  } catch (err) {
    if (err instanceof DuplicateSkuError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function updateProductController(req: Request, res: Response): Promise<void> {
  const body = res.locals.validated as z.infer<typeof updateSchema>;

  try {
    const product = await updateProduct(req.user!.storeId, paramId(req), body);
    res.status(200).json(product);
  } catch (err) {
    if (err instanceof NotFoundError || isCastError(err)) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    if (err instanceof DuplicateSkuError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function deleteProductController(req: Request, res: Response): Promise<void> {
  try {
    await deleteProduct(req.user!.storeId, paramId(req));
    res.status(204).send();
  } catch (err) {
    if (err instanceof NotFoundError || isCastError(err)) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    throw err;
  }
}
