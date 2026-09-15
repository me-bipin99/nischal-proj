import { Request, Response } from "express";
import { createOrder, confirmOrder, OrderError } from "../services/orderService";
import { env } from "../config/env";

/** POST /api/alerts/:id/reorder */
export async function createOrderController(req: Request, res: Response): Promise<void> {
  const alertId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  try {
    const result = await createOrder(req.user!.storeId, alertId);
    res.status(202).json({
      message: `Reorder placed for ${result.productName}. Awaiting supplier confirmation.`,
      orderId: result.orderId,
      status: "processing",
    });
  } catch (err) {
    if (err instanceof OrderError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

/**
 * GET /api/orders/:token/confirm?eta=<value>
 *
 * Public — supplier clicks an ETA link from the email.
 * Confirms the order, restocks the product, then returns a self-contained
 * HTML page that stays on this tab (no redirect).
 * The admin's alerts tab picks up the status change via its 15-second poll.
 */
export async function confirmOrderController(req: Request, res: Response): Promise<void> {
  const { token } = req.params;
  const confirmToken = Array.isArray(token) ? token[0] : token;

  const rawEta = req.query.eta;
  const restockEta = typeof rawEta === "string" && rawEta.trim()
    ? rawEta.trim()
    : "Not specified";

  try {
    const result = await confirmOrder(confirmToken, restockEta);

    const etaBadge = result.restockEta && result.restockEta !== "Not specified"
      ? `<div class="eta-badge">📅 &nbsp;Restock ETA: <strong>${result.restockEta}</strong></div>`
      : "";

    res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmed — ShopSense</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.10);
      padding: 48px 40px;
      max-width: 480px;
      width: 100%;
      text-align: center;
    }
    .icon-wrap {
      width: 88px; height: 88px;
      background: #dcfce7;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 24px;
      font-size: 2.8rem;
    }
    h2 { font-size: 1.6rem; font-weight: 700; color: #14532d; margin-bottom: 8px; }
    .subtitle { color: #4b7a5a; font-size: 0.95rem; margin-bottom: 24px; }
    .details {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 12px;
      padding: 18px 20px;
      margin-bottom: 20px;
      text-align: left;
    }
    .details table { width: 100%; border-collapse: collapse; }
    .details td { padding: 6px 0; font-size: 0.9rem; color: #374151; }
    .details td:first-child { color: #6b7280; width: 140px; }
    .details strong { color: #111827; }
    .eta-badge {
      display: inline-block;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1d4ed8;
      border-radius: 999px;
      padding: 8px 20px;
      font-size: 0.875rem;
      font-weight: 600;
      margin-bottom: 20px;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #dcfce7;
      color: #15803d;
      border-radius: 999px;
      padding: 10px 22px;
      font-weight: 700;
      font-size: 0.95rem;
      margin-bottom: 20px;
    }
    .dot {
      width: 10px; height: 10px;
      background: #22c55e;
      border-radius: 50%;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%,100% { opacity: 1; transform: scale(1); }
      50%      { opacity: 0.5; transform: scale(1.4); }
    }
    .footer-note {
      font-size: 0.78rem;
      color: #9ca3af;
      margin-top: 4px;
      line-height: 1.5;
    }
    .brand {
      margin-top: 28px;
      font-size: 0.78rem;
      color: #d1d5db;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-wrap">✅</div>
    <h2>Order Confirmed!</h2>
    <p class="subtitle">Thank you — the restock has been recorded in ShopSense.</p>

    <div class="details">
      <table>
        <tr><td>Product</td><td><strong>${result.productName}</strong></td></tr>
        <tr><td>Units Dispatched</td><td><strong>${result.quantity} units</strong></td></tr>
        <tr><td>New Stock Level</td><td><strong>${result.newStock} units</strong></td></tr>
      </table>
    </div>

    ${etaBadge}

    <div class="status-pill">
      <span class="dot"></span>
      Inventory Updated in ShopSense
    </div>

    <p class="footer-note">
      The store's inventory has been automatically updated.<br>
      You can close this tab.
    </p>

    <div class="brand">ShopSense · Automated Inventory</div>
  </div>
</body>
</html>`);

  } catch (err) {
    if (err instanceof OrderError) {
      res.status(400).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invalid Link — ShopSense</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
    }
    .card {
      background: #fff; border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.10);
      padding: 48px 40px; max-width: 420px;
      width: 100%; text-align: center;
    }
    .icon-wrap {
      width: 80px; height: 80px; background: #ffedd5;
      border-radius: 50%; display: flex;
      align-items: center; justify-content: center;
      margin: 0 auto 20px; font-size: 2.4rem;
    }
    h2 { font-size: 1.4rem; font-weight: 700; color: #9a3412; margin-bottom: 8px; }
    p  { color: #78350f; font-size: 0.92rem; line-height: 1.6; }
    .note { margin-top: 16px; font-size: 0.8rem; color: #9ca3af; }
    .brand { margin-top: 28px; font-size: 0.75rem; color: #d1d5db; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-wrap">⚠️</div>
    <h2>Link Invalid or Already Used</h2>
    <p>${(err as Error).message}</p>
    <p class="note">Each confirmation link can only be used once. You can close this tab.</p>
    <div class="brand">ShopSense · Automated Inventory</div>
  </div>
</body>
</html>`);
      return;
    }
    throw err;
  }
}
