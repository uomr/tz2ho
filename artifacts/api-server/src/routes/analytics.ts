/**
 * analytics.ts — تحليلات الموردين + كشف شذوذ الأسعار
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { invoicesTable, invoiceItemsTable } from "@workspace/db";
import { sql, eq, desc, and, isNotNull, ne, gt } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

// ── GET /api/analytics/overview ─────────────────────────────
// إجماليات سريعة: إنفاق شهري، نسبة تطابق الذاكرة، أعلى مورد
router.get("/analytics/overview", requireAuth, async (req, res): Promise<void> => {
  const isSuperAdmin = req.user?.role === "superadmin";
  const orgId = req.user?.orgId;
  const orgCond = isSuperAdmin ? sql`1=1` : sql`i.org_id = ${orgId}`;
  const iiOrgCond = isSuperAdmin ? sql`1=1` : sql`ii.org_id = ${orgId}`;

  const [monthlySpend, memoryStats, topSupplier, anomalyCount] = await Promise.all([

    // الإنفاق الشهري — آخر 6 أشهر
    db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', i.created_at), 'YYYY-MM') AS month,
        ROUND(SUM(ii.unit_cost * ii.quantity)::numeric, 2)     AS spend,
        COUNT(DISTINCT i.id)::int                               AS invoices
      FROM invoices i
      JOIN invoice_items ii ON ii.invoice_id = i.id
      WHERE i.status = 'saved' AND ${orgCond}
        AND i.created_at >= NOW() - INTERVAL '6 months'
      GROUP BY 1
      ORDER BY 1 ASC
    `),

    // نسبة تطابق الذاكرة الذكية
    db.execute(sql`
      SELECT
        COUNT(*)::int                                                      AS total,
        SUM(CASE WHEN ii.memory_match THEN 1 ELSE 0 END)::int               AS matched,
        ROUND(AVG(CASE WHEN ii.memory_match THEN ii.memory_confidence END)::numeric, 1) AS avg_confidence
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      WHERE ${orgCond}
    `),

    // أعلى مورد إنفاقاً
    db.execute(sql`
      SELECT
        i.supplier,
        COUNT(DISTINCT i.id)::int                              AS invoices,
        ROUND(SUM(ii.unit_cost * ii.quantity)::numeric, 2)    AS total_spend
      FROM invoices i
      JOIN invoice_items ii ON ii.invoice_id = i.id
      WHERE i.status = 'saved' AND i.supplier IS NOT NULL AND ${orgCond}
      GROUP BY i.supplier
      ORDER BY total_spend DESC
      LIMIT 1
    `),

    // عدد البنود الشاذة (سعر أعلى بـ 25% عن المتوسط التاريخي لنفس رقم القطعة)
    db.execute(sql`
      WITH part_avg AS (
        SELECT
          part_number,
          AVG(unit_cost)   AS avg_cost,
          STDDEV(unit_cost) AS std_cost,
          COUNT(*)          AS sample_size
        FROM invoice_items
        WHERE part_number IS NOT NULL
          AND unit_cost > 0
          AND ${iiOrgCond}
        GROUP BY part_number
        HAVING COUNT(*) >= 2
      )
      SELECT COUNT(ii.id)::int AS anomaly_count
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      JOIN part_avg pa ON pa.part_number = ii.part_number
      WHERE i.status = 'saved' AND ${orgCond}
        AND ii.unit_cost > 0
        AND ABS(ii.unit_cost - pa.avg_cost) > 0.25 * pa.avg_cost
        AND i.created_at >= NOW() - INTERVAL '30 days'
    `),
  ]);

  res.json({
    monthlySpend: monthlySpend.rows,
    memoryStats: memoryStats.rows[0] ?? { total: 0, matched: 0, avg_confidence: null },
    topSupplier: topSupplier.rows[0] ?? null,
    anomalyCount: (anomalyCount.rows[0] as any)?.anomaly_count ?? 0,
  });
});

// ── GET /api/analytics/suppliers ────────────────────────────
// تفاصيل كل مورد: إنفاق، عدد فواتير، متوسط دقة الاستخراج
router.get("/analytics/suppliers", requireAuth, async (req, res): Promise<void> => {
  const isSuperAdmin = req.user?.role === "superadmin";
  const orgId = req.user?.orgId;
  const orgCond = isSuperAdmin ? sql`1=1` : sql`i.org_id = ${orgId}`;

  const result = await db.execute(sql`
    SELECT
      i.supplier,
      COUNT(DISTINCT i.id)::int                              AS invoice_count,
      SUM(ii.quantity)::int                                  AS total_items,
      ROUND(SUM(ii.unit_cost * ii.quantity)::numeric, 2)    AS total_spend,
      ROUND(AVG(ii.unit_cost * ii.quantity)::numeric, 2)    AS avg_invoice_value,
      ROUND(
        100.0 * SUM(CASE WHEN ii.memory_match THEN 1 ELSE 0 END) / NULLIF(COUNT(ii.id), 0)
      ::numeric, 1)                                          AS memory_hit_rate,
      MAX(i.created_at)                                      AS last_invoice_at
    FROM invoices i
    JOIN invoice_items ii ON ii.invoice_id = i.id
    WHERE i.status = 'saved' AND i.supplier IS NOT NULL AND ${orgCond}
    GROUP BY i.supplier
    ORDER BY total_spend DESC
    LIMIT 20
  `);

  res.json(result.rows);
});

// ── GET /api/analytics/anomalies ────────────────────────────
// بنود بسعر شاذ مقارنةً بمتوسطها التاريخي
router.get("/analytics/anomalies", requireAuth, async (req, res): Promise<void> => {
  const isSuperAdmin = req.user?.role === "superadmin";
  const orgId = req.user?.orgId;
  const orgCond = isSuperAdmin ? sql`1=1` : sql`i.org_id = ${orgId}`;
  const iiOrgCond = isSuperAdmin ? sql`1=1` : sql`ii.org_id = ${orgId}`;

  const result = await db.execute(sql`
    WITH part_avg AS (
      SELECT
        part_number,
        ROUND(AVG(unit_cost)::numeric, 4)    AS avg_cost,
        ROUND(MIN(unit_cost)::numeric, 4)    AS min_cost,
        ROUND(MAX(unit_cost)::numeric, 4)    AS max_cost,
        COUNT(*)::int                         AS sample_size
      FROM invoice_items ii
      WHERE part_number IS NOT NULL AND unit_cost > 0 AND ${iiOrgCond}
      GROUP BY part_number
      HAVING COUNT(*) >= 2
    )
    SELECT
      ii.id                                                           AS item_id,
      ii.description,
      ii.part_number,
      ii.unit_cost,
      ii.quantity,
      pa.avg_cost,
      pa.min_cost,
      pa.max_cost,
      pa.sample_size,
      ROUND(((ii.unit_cost - pa.avg_cost) / NULLIF(pa.avg_cost, 0) * 100)::numeric, 1) AS deviation_pct,
      i.id                                                            AS invoice_id,
      i.supplier,
      i.date,
      i.created_at
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    JOIN part_avg pa ON pa.part_number = ii.part_number
    WHERE i.status = 'saved' AND ${orgCond}
      AND ii.unit_cost > 0
      AND ABS(ii.unit_cost - pa.avg_cost) > 0.20 * pa.avg_cost
    ORDER BY ABS(ii.unit_cost - pa.avg_cost) / NULLIF(pa.avg_cost, 0) DESC
    LIMIT 50
  `);

  res.json(result.rows);
});

// ── GET /api/analytics/price-history ────────────────────────
// تاريخ أسعار قطعة معينة عبر الزمن
router.get("/analytics/price-history", requireAuth, async (req, res): Promise<void> => {
  const isSuperAdmin = req.user?.role === "superadmin";
  const orgId = req.user?.orgId;
  const orgCond = isSuperAdmin ? sql`1=1` : sql`i.org_id = ${orgId}`;
  
  const partNumber = String(req.query.partNumber ?? "").trim();
  if (!partNumber) {
    res.status(400).json({ error: "partNumber مطلوب" });
    return;
  }

  const result = await db.execute(sql`
    SELECT
      ii.unit_cost,
      ii.quantity,
      i.supplier,
      i.date,
      i.created_at
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    WHERE ii.part_number = ${partNumber}
      AND i.status = 'saved'
      AND ii.unit_cost > 0
      AND ${orgCond}
    ORDER BY i.created_at ASC
    LIMIT 100
  `);

  res.json(result.rows);
});

// ── GET /api/analytics/spending-trend ───────────────────────
// إنفاق يومي آخر 30 يوماً لرسم خط زمني دقيق
router.get("/analytics/spending-trend", requireAuth, async (req, res): Promise<void> => {
  const isSuperAdmin = req.user?.role === "superadmin";
  const orgId = req.user?.orgId;
  const orgCond = isSuperAdmin ? sql`1=1` : sql`i.org_id = ${orgId}`;

  const result = await db.execute(sql`
    SELECT
      DATE(i.created_at)                                     AS day,
      COUNT(DISTINCT i.id)::int                              AS invoices,
      ROUND(SUM(ii.unit_cost * ii.quantity)::numeric, 2)    AS spend
    FROM invoices i
    JOIN invoice_items ii ON ii.invoice_id = i.id
    WHERE i.status = 'saved' AND ${orgCond}
      AND i.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(i.created_at)
    ORDER BY day ASC
  `);

  res.json(result.rows);
});

export default router;
