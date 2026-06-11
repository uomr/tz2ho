/**
 * export.ts — تصدير الفواتير إلى Excel
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { invoicesTable, invoiceItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

// ── GET /api/invoices/:id/export/excel ──────────────────────
// تصدير فاتورة واحدة إلى Excel
router.get("/invoices/:id/export/excel", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const invoice = await db.query.invoicesTable.findFirst({
    where: eq(invoicesTable.id, id),
    with: { items: true },
  });

  if (!invoice) { res.status(404).json({ error: "الفاتورة غير موجودة" }); return; }

  const wb = XLSX.utils.book_new();

  // ── ورقة تفاصيل الفاتورة ──
  const infoData = [
    ["رقم الفاتورة", invoice.invoiceNumber ?? "—"],
    ["المورد",       invoice.supplier   ?? "—"],
    ["التاريخ",      invoice.date       ?? "—"],
    ["الحالة",       invoice.status     ?? "—"],
    ["تاريخ الاستخراج", invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString("ar-SA") : "—"],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
  wsInfo["!cols"] = [{ wch: 22 }, { wch: 36 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, "معلومات الفاتورة");

  // ── ورقة البنود ──
  const headers = ["#", "رقم القطعة", "الوصف", "الكمية", "الوحدة", "سعر الوحدة", "الإجمالي", "عامل الكرتون"];
  const rows = (invoice.items ?? []).map((item, i) => [
    i + 1,
    item.partNumber  ?? "",
    item.description ?? "",
    item.quantity    ?? 0,
    item.unit        ?? "",
    item.unitCost    ?? 0,
    ((item.quantity ?? 0) * (item.unitCost ?? 0)),
    item.packFactor  ?? 1,
  ]);

  // إجمالي
  const total = rows.reduce((s, r) => s + Number(r[6]), 0);
  rows.push(["", "", "الإجمالي", "", "", "", total, ""]);

  const wsItems = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  wsItems["!cols"] = [
    { wch: 4 }, { wch: 18 }, { wch: 40 }, { wch: 10 },
    { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsItems, "بنود الفاتورة");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `فاتورة-${invoice.invoiceNumber ?? id}.xlsx`;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(buf);
});

// ── GET /api/invoices/export/excel/all ──────────────────────
// تصدير جميع الفواتير المحفوظة في ملف Excel واحد (تقرير شامل)
router.get("/invoices/export/excel/all", requireAuth, async (_req, res): Promise<void> => {
  const invoices = await db.query.invoicesTable.findMany({
    where: eq(invoicesTable.status, "saved"),
    with: { items: true },
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  const wb = XLSX.utils.book_new();

  // ── ورقة ملخص الفواتير ──
  const summaryHeaders = ["رقم الفاتورة", "المورد", "التاريخ", "عدد البنود", "الإجمالي (ر.س)", "تاريخ الإضافة"];
  const summaryRows = invoices.map(inv => [
    inv.invoiceNumber ?? "—",
    inv.supplier ?? "—",
    inv.date ?? "—",
    inv.items?.length ?? 0,
    inv.items?.reduce((s, it) => s + (it.quantity ?? 0) * (it.unitCost ?? 0), 0).toFixed(2) ?? 0,
    inv.createdAt ? new Date(inv.createdAt).toLocaleDateString("ar-SA") : "—",
  ]);
  const grandTotal = summaryRows.reduce((s, r) => s + Number(r[4]), 0);
  summaryRows.push(["", "الإجمالي الكلي", "", "", grandTotal.toFixed(2), ""]);

  const wsSummary = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
  wsSummary["!cols"] = [{ wch: 18 }, { wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "ملخص الفواتير");

  // ── ورقة جميع البنود (مفيدة للتحليل في Excel) ──
  const itemHeaders = ["رقم الفاتورة", "المورد", "التاريخ", "رقم القطعة", "الوصف", "الكمية", "الوحدة", "سعر الوحدة", "الإجمالي"];
  const itemRows: any[][] = [];
  for (const inv of invoices) {
    for (const item of inv.items ?? []) {
      itemRows.push([
        inv.invoiceNumber ?? "",
        inv.supplier ?? "",
        inv.date ?? "",
        item.partNumber ?? "",
        item.description ?? "",
        item.quantity ?? 0,
        item.unit ?? "",
        item.unitCost ?? 0,
        ((item.quantity ?? 0) * (item.unitCost ?? 0)),
      ]);
    }
  }
  const wsAll = XLSX.utils.aoa_to_sheet([itemHeaders, ...itemRows]);
  wsAll["!cols"] = [
    { wch: 18 }, { wch: 24 }, { wch: 12 }, { wch: 18 },
    { wch: 36 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAll, "جميع البنود");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `تقرير-الفواتير-${new Date().toISOString().slice(0, 10)}.xlsx`;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(buf);
});

export default router;
