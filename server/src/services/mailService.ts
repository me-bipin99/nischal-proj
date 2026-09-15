/**
 * mailService.ts
 *
 * Uses Nodemailer with Ethereal (https://ethereal.email) for local/demo email.
 * All SMTP config comes from environment variables (SMTP_HOST, SMTP_PORT,
 * SMTP_USER, SMTP_PASS, SMTP_FROM).
 */

import nodemailer, { Transporter } from "nodemailer";
import { env } from "../config/env";

let transporter: Transporter | null = null;

async function getTransporter(): Promise<Transporter> {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: false,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });

  console.log(`\n📧  SMTP ready — ${env.smtpHost}:${env.smtpPort} (${env.smtpUser})`);
  if (env.smtpHost.includes("ethereal")) {
    console.log(`    Inbox: https://ethereal.email/messages\n`);
  }

  return transporter;
}

export interface EtaLink {
  label: string;
  url: string;
}

export interface ReorderEmailPayload {
  productName: string;
  sku: string;
  quantity: number;
  storeName: string;
  etaLinks: EtaLink[];          // pre-built per-ETA confirm URLs
}

export async function sendReorderConfirmationEmail(
  payload: ReorderEmailPayload
): Promise<void> {
  const t = await getTransporter();
  const { productName, sku, quantity, storeName, etaLinks } = payload;

  // Build ETA quick-select buttons HTML
  const etaButtonColors: Record<string, string> = {
    "Delivered":                     "#16a34a",
    "Will be delivered by tomorrow": "#2563eb",
    "Within 3 Days":                 "#7c3aed",
    "Within 1 Week":                 "#d97706",
  };

  const etaButtonsHtml = etaLinks.map(({ label, url }) => {
    const color = etaButtonColors[label] ?? "#475569";
    return `<a href="${url}"
               style="display:inline-block; margin:6px 6px 6px 0; padding:11px 20px;
                      background:${color}; color:#fff; text-decoration:none;
                      border-radius:8px; font-size:14px; font-weight:600;
                      font-family:Arial,sans-serif;">${label}</a>`;
  }).join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body  { font-family: Arial, sans-serif; background:#f8fafc; margin:0; padding:0; }
        .wrap { max-width:580px; margin:36px auto; background:#fff;
                border-radius:12px; overflow:hidden;
                box-shadow:0 4px 20px rgba(0,0,0,0.08); }
        .hdr  { background:#1e40af; padding:28px 32px; }
        .hdr h1 { color:#fff; margin:0; font-size:21px; }
        .hdr p  { color:#bfdbfe; margin:5px 0 0; font-size:13px; }
        .bdy  { padding:30px 32px; }
        .bdy p { color:#475569; font-size:15px; line-height:1.65; margin:0 0 14px; }
        .det  { background:#f1f5f9; border-radius:8px; padding:16px 20px; margin:18px 0; }
        .det table { width:100%; border-collapse:collapse; }
        .det td { padding:5px 0; font-size:14px; color:#334155; }
        .det td:first-child { color:#64748b; width:150px; }
        .det strong { color:#0f172a; }
        .sec-title { font-size:15px; font-weight:700; color:#0f172a; margin:22px 0 8px; }
        .eta-wrap   { background:#f8fafc; border:1px solid #e2e8f0;
                      border-radius:10px; padding:18px 20px; margin:4px 0 20px; }
        .eta-note   { font-size:12px; color:#94a3b8; margin-top:14px; }
        .custom-row { display:flex; align-items:center; gap:10px; margin-top:10px;
                      flex-wrap:wrap; }
        .custom-row input { padding:10px 12px; border:1px solid #cbd5e1;
                            border-radius:8px; font-size:14px; color:#334155; }
        .custom-btn { display:inline-block; padding:10px 18px;
                      background:#0f172a; color:#fff; text-decoration:none;
                      border-radius:8px; font-size:14px; font-weight:600; }
        .ftr  { padding:18px 32px; background:#f8fafc;
                border-top:1px solid #e2e8f0;
                font-size:12px; color:#94a3b8; text-align:center; }
      </style>
    </head>
    <body>
      <div class="wrap">
        <div class="hdr">
          <h1>🛒 Purchase Order — Supplier Action Required</h1>
          <p>ShopSense · Automated Inventory Management</p>
        </div>

        <div class="bdy">
          <p>Hello Supplier,</p>
          <p>
            <strong>${storeName}</strong> has submitted a reorder request for a
            low-stock item. Please review the details and confirm the order
            by selecting your estimated restock delivery time below.
          </p>

          <div class="det">
            <table>
              <tr><td>Product</td><td><strong>${productName}</strong></td></tr>
              <tr><td>SKU</td><td><strong>${sku}</strong></td></tr>
              <tr><td>Quantity</td><td><strong>${quantity} units</strong></td></tr>
              <tr><td>Store</td><td><strong>${storeName}</strong></td></tr>
            </table>
          </div>

          <div class="sec-title">⏱ Select Your Response &amp; Confirm Order</div>
          <p style="color:#64748b; font-size:13px; margin-bottom:10px;">
            Choose the option that best describes when the stock will be delivered.
            Click a button — your selection is recorded instantly.
          </p>

          <div class="eta-wrap">
            <div style="margin-bottom:6px; font-size:13px; color:#0f172a; font-weight:700;">
              📦 Available Response Options:
            </div>
            ${etaButtonsHtml}
          </div>

          <div class="eta-note" style="margin-top:10px; color:#64748b; font-size:13px;">
            Each button above confirms the order and records your selected ETA in ShopSense.
            Only click once — each link is single-use.
          </div>

          <p style="font-size:12px; color:#94a3b8; margin-top:16px;">
            Each confirmation link is single-use. If you did not expect this order,
            please ignore this email. ShopSense will follow up if unconfirmed.
          </p>
        </div>

        <div class="ftr">
          ShopSense · Automated Inventory System · Demo notification via Ethereal Mail
        </div>
      </div>
    </body>
    </html>
  `;

  // Send to the internal company Ethereal inbox so it is actually visible
  const recipientEmail = env.smtpUser;

  const info = await t.sendMail({
    from: env.smtpFrom,
    to: recipientEmail,
    subject: `[ShopSense] Action Required: Reorder ${productName} (${quantity} units) — Select ETA`,
    html,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  console.log("\n📬  Reorder email sent!");
  console.log(`    Product : ${productName} (${quantity} units)`);
  console.log(`    Preview : ${previewUrl}\n`);
}
