import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { invoicesTable, partsTable, invoiceItemsTable, activityTable } from "@workspace/db";
import { sql, desc, eq, and, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

router.get("/stats", requireAuth, async (req, res): Promise<void> => {
  const isSuperAdmin = req.user?.role === "superadmin";
  const orgId = req.user?.orgId ?? null;

  // السوبر أدمن يرى إحصائيات المنصة كاملة (Global)
  // المدير/الموظف يرى إحصائيات مؤسسته فقط، وإذا لم يكن له مؤسسة لا يرى شيئاً
  const orgCondition = isSuperAdmin ? sql`1=1` : (orgId === null ? sql`1=0` : eq(invoicesTable.orgId, orgId));
  const partsOrgCondition = isSuperAdmin ? sql`1=1` : (orgId === null ? sql`1=0` : eq(partsTable.orgId, orgId));
  const activityOrgCondition = isSuperAdmin ? sql`1=1` : (orgId === null ? sql`1=0` : eq(activityTable.orgId, orgId));

  const [
    [invoiceCount],
    [partCount],
    [itemCount],
    [savedCount],
    recentActivity
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(invoicesTable).where(orgCondition),
    db.select({ count: sql<number>`count(*)::int` }).from(partsTable).where(partsOrgCondition),
    db.select({ count: sql<number>`count(*)::int` })
      .from(invoiceItemsTable)
      .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
      .where(orgCondition),
    db.select({ count: sql<number>`count(*)::int` })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.status, "saved"), orgCondition)),
    db.select().from(activityTable).where(activityOrgCondition).orderBy(desc(activityTable.createdAt)).limit(10)
  ]);

  const totalInvoices = invoiceCount?.count ?? 0;
  const savedInvoices = savedCount?.count ?? 0;
  const successRate = totalInvoices > 0 ? (savedInvoices / totalInvoices) * 100 : 0;

  res.json({
    totalInvoices,
    totalParts: partCount?.count ?? 0,
    totalItemsExtracted: itemCount?.count ?? 0,
    successRate: Math.round(successRate * 10) / 10,
    recentActivity,
  });
});

export default router;
