/**
 * super-admin.ts — لوحة تحكم المنصة (superadmin فقط)
 *
 * GET  /api/super-admin/orgs          — جميع المنظمات مع إحصاءاتها
 * PATCH /api/super-admin/orgs/:id     — تغيير الحالة / الخطة
 * GET  /api/super-admin/stats         — إحصاءات المنصة الكلية
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { organizationsTable, usersTable, invoicesTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

// Middleware: superadmin فقط
function requireSuperAdmin(req: any, res: any, next: any): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== "superadmin") {
      res.status(403).json({ error: "صلاحية مدير المنصة مطلوبة" });
      return;
    }
    next();
  });
}

// ── GET /api/super-admin/stats ───────────────────────────────
router.get("/super-admin/stats", requireSuperAdmin, async (_req, res): Promise<void> => {
  const [orgsCount, usersCount, invoicesCount, monthInvoices] = await Promise.all([
    db.execute(sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='active')::int AS active, COUNT(*) FILTER (WHERE status='trial')::int AS trial FROM organizations`),
    db.execute(sql`SELECT COUNT(*)::int AS total FROM users WHERE role != 'superadmin'`),
    db.execute(sql`SELECT COUNT(*)::int AS total FROM invoices WHERE status = 'saved'`),
    db.execute(sql`SELECT COUNT(*)::int AS this_month FROM invoices WHERE status = 'saved' AND created_at >= DATE_TRUNC('month', NOW())`),
  ]);

  res.json({
    orgs:        orgsCount.rows[0],
    users:       usersCount.rows[0],
    invoices:    invoicesCount.rows[0],
    monthUsage:  monthInvoices.rows[0],
  });
});

// ── GET /api/super-admin/orgs ────────────────────────────────
router.get("/super-admin/orgs", requireSuperAdmin, async (_req, res): Promise<void> => {
  const result = await db.execute(sql`
    SELECT
      o.id,
      o.name,
      o.slug,
      o.plan,
      o.status,
      o.contact_email,
      o.max_invoices_per_month,
      o.created_at,
      o.suspended_at,
      COUNT(DISTINCT u.id) FILTER (WHERE u.is_active)::int         AS active_users,
      COUNT(DISTINCT u.id)::int                                     AS total_users,
      COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'saved')::int  AS total_invoices,
      COUNT(DISTINCT i.id) FILTER (
        WHERE i.status = 'saved'
          AND i.created_at >= DATE_TRUNC('month', NOW())
      )::int                                                         AS invoices_this_month,
      ROUND(MAX(
        CASE WHEN i.status = 'saved' AND i.created_at >= DATE_TRUNC('month', NOW())
          THEN 1 ELSE 0 END
      )::numeric * 100.0 / NULLIF(o.max_invoices_per_month, 0), 1)  AS plan_usage_pct,
      MAX(i.created_at)                                              AS last_activity
    FROM organizations o
    LEFT JOIN users u ON u.org_id = o.id
    LEFT JOIN invoices i ON i.org_id = o.id
    GROUP BY o.id
    ORDER BY o.created_at DESC
  `);

  res.json(result.rows);
});

// ── POST /api/super-admin/orgs ──────────────────────────────
router.post("/super-admin/orgs", requireSuperAdmin, async (req, res): Promise<void> => {
  const { name, slug, contactEmail, plan } = req.body;
  if (!name || !slug) {
    res.status(400).json({ error: "اسم المؤسسة والـ slug مطلوبة" });
    return;
  }

  const selectedPlan = plan || "trial";
  const limits: Record<string, number> = { free: 50, pro: 1000, enterprise: 999999, trial: 100 };
  
  try {
    const [org] = await db
      .insert(organizationsTable)
      .values({
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        contactEmail: contactEmail?.trim() || null,
        plan: selectedPlan,
        status: "active",
        maxInvoicesPerMonth: limits[selectedPlan] || 50,
      })
      .returning();
      
    res.status(201).json(org);
  } catch (err: any) {
    if (err.code === "23505") { // Unique violation
      res.status(409).json({ error: "اسم المؤسسة أو المعرّف (slug) موجود مسبقاً" });
    } else {
      res.status(500).json({ error: "فشل إنشاء المؤسسة" });
    }
  }
});

// ── PATCH /api/super-admin/orgs/:id ─────────────────────────
router.patch("/super-admin/orgs/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const { status, plan, maxInvoicesPerMonth, name, slug, contactEmail } = req.body;
  const updates: Record<string, any> = {};

  if (name !== undefined) {
    if (name.trim() === "") { res.status(400).json({ error: "اسم المؤسسة مطلوب" }); return; }
    updates.name = name.trim();
  }
  if (slug !== undefined) {
    if (slug.trim() === "") { res.status(400).json({ error: "المعرّف (slug) مطلوب" }); return; }
    updates.slug = slug.trim().toLowerCase();
  }
  if (contactEmail !== undefined) {
    updates.contactEmail = contactEmail ? contactEmail.trim() : null;
  }
  if (status) {
    if (!["active", "suspended", "trial"].includes(status)) {
      res.status(400).json({ error: "حالة غير صالحة" }); return;
    }
    updates.status = status;
    updates.suspendedAt = status === "suspended" ? sql`now()` : null;
  }
  if (plan) {
    if (!["free", "pro", "enterprise"].includes(plan)) {
      res.status(400).json({ error: "خطة غير صالحة" }); return;
    }
    updates.plan = plan;
    // تحديث الحد تلقائياً
    const limits: Record<string, number> = { free: 50, pro: 1000, enterprise: 999999 };
    updates.maxInvoicesPerMonth = limits[plan];
  }
  if (maxInvoicesPerMonth) updates.maxInvoicesPerMonth = Number(maxInvoicesPerMonth);

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "لا يوجد شيء للتحديث" }); return;
  }

  try {
    const [updated] = await db
      .update(organizationsTable)
      .set(updates)
      .where(eq(organizationsTable.id, id))
      .returning();

    if (!updated) { res.status(404).json({ error: "المنظمة غير موجودة" }); return; }
    res.json(updated);
  } catch (err: any) {
    if (err.code === "23505") { // Unique violation
      res.status(409).json({ error: "اسم المؤسسة أو المعرّف (slug) موجود مسبقاً" });
    } else {
      res.status(500).json({ error: "فشل تحديث المؤسسة" });
    }
  }
});

export default router;
