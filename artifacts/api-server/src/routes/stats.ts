import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { invoicesTable, partsTable, invoiceItemsTable, activityTable } from "@workspace/db";
import { sql, desc, eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/stats", async (_req, res): Promise<void> => {
  const [
    [invoiceCount],
    [partCount],
    [itemCount],
    [savedCount],
    recentActivity
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(invoicesTable),
    db.select({ count: sql<number>`count(*)::int` }).from(partsTable),
    db.select({ count: sql<number>`count(*)::int` }).from(invoiceItemsTable),
    db.select({ count: sql<number>`count(*)::int` }).from(invoicesTable).where(eq(invoicesTable.status, "saved")),
    db.select().from(activityTable).orderBy(desc(activityTable.createdAt)).limit(10)
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
