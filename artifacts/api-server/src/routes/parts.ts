import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { partsTable } from "@workspace/db";
import { eq, sql, isNull } from "drizzle-orm";
import { CreatePartBody, DeletePartParams } from "@workspace/api-zod";
import { requireAuth, requirePartsAccess } from "../middlewares/auth.js";

const router: IRouter = Router();

// القراءة — السوبر أدمن يرى الكل، والبقية يرون قطع مؤسستهم فقط
router.get("/parts", requireAuth, async (req, res): Promise<void> => {
  const isSuperAdmin = req.user?.role === "superadmin";
  const orgId = req.user?.orgId ?? null;
  const targetOrgId = req.query.orgId ? parseInt(req.query.orgId as string, 10) : undefined;

  let whereClause = undefined;
  if (!isSuperAdmin) {
    whereClause = orgId === null ? sql`1=0` : eq(partsTable.orgId, orgId);
  } else if (targetOrgId) {
    whereClause = eq(partsTable.orgId, targetOrgId);
  }

  const parts = await db
    .select()
    .from(partsTable)
    .where(whereClause)
    .orderBy(partsTable.usageCount);

  res.json(parts);
});

// الإضافة — مدير أو موظف بصلاحية
router.post("/parts", requirePartsAccess, async (req, res): Promise<void> => {
  const parsed = CreatePartBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const isSuperAdmin = req.user?.role === "superadmin";
  const orgId = isSuperAdmin ? (req.body.orgId ?? null) : req.user?.orgId ?? null;

  const [part] = await db
    .insert(partsTable)
    .values({
      description: parsed.data.description,
      partNumber: parsed.data.partNumber,
      originalPartNumber: parsed.data.originalPartNumber || null,
      packFactor: parsed.data.packFactor ?? 1,
      usageCount: 0,
      orgId,
    })
    .returning();

  res.status(201).json(part);
});

// الحذف — مدير أو موظف بصلاحية
router.delete("/parts/:id", requirePartsAccess, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeletePartParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const isSuperAdmin = req.user?.role === "superadmin";
  const orgId = req.user?.orgId ?? null;

  // Verify ownership
  const [targetPart] = await db.select({ orgId: partsTable.orgId }).from(partsTable).where(eq(partsTable.id, params.data.id));
  if (!targetPart) {
    res.status(404).json({ error: "القطعة غير موجودة" });
    return;
  }

  if (!isSuperAdmin && (orgId === null || targetPart.orgId !== orgId)) {
    res.status(403).json({ error: "لا تملك صلاحية لحذف هذه القطعة" });
    return;
  }

  await db.delete(partsTable).where(eq(partsTable.id, params.data.id));
  res.sendStatus(204);
});

// التعديل — مدير أو موظف بصلاحية
router.put("/parts/:id", requirePartsAccess, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const partId = parseInt(rawId, 10);
  if (isNaN(partId)) {
    res.status(400).json({ error: "رقم صنف غير صحيح" });
    return;
  }

  const { partNumber, originalPartNumber, packFactor, description } = req.body;
  if (!partNumber || !description) {
    res.status(400).json({ error: "يجب تحديد رقم الصنف والوصف المعتمد" });
    return;
  }

  const isSuperAdmin = req.user?.role === "superadmin";
  const orgId = req.user?.orgId ?? null;

  // Verify ownership
  const [targetPart] = await db.select({ orgId: partsTable.orgId }).from(partsTable).where(eq(partsTable.id, partId));
  if (!targetPart) {
    res.status(404).json({ error: "القطعة غير موجودة" });
    return;
  }

  if (!isSuperAdmin && (orgId === null || targetPart.orgId !== orgId)) {
    res.status(403).json({ error: "لا تملك صلاحية لتعديل هذه القطعة" });
    return;
  }

  const [part] = await db
    .update(partsTable)
    .set({
      partNumber: partNumber.trim(),
      originalPartNumber: originalPartNumber ? originalPartNumber.trim() : null,
      packFactor: packFactor ? parseInt(packFactor, 10) : 1,
      description: description.trim(),
    })
    .where(eq(partsTable.id, partId))
    .returning();

  res.json(part);
});

export default router;
