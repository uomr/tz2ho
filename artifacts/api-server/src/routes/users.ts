/**
 * users.ts Route — إدارة المستخدمين (للمدير فقط)
 */
import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAdmin, requireSuperAdmin } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// ── GET /api/users ───────────────────────────────────────────
// المدير يرى مستخدمي مؤسسته فقط — السوبر أدمن يرى الكل
router.get("/users", requireAdmin, async (req, res): Promise<void> => {
  const isSuperAdmin = req.user?.role === "superadmin";

  const users = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      role: usersTable.role,
      department: usersTable.department,
      isActive: usersTable.isActive,
      canEditParts: usersTable.canEditParts,
      orgId: usersTable.orgId,
      createdAt: usersTable.createdAt,
      lastLogin: usersTable.lastLogin,
    })
    .from(usersTable)
    .where(
      isSuperAdmin
        ? undefined
        : eq(usersTable.orgId, req.user!.orgId!)
    )
    .orderBy(usersTable.createdAt);

  res.json(users);
});

// ── POST /api/users ──────────────────────────────────────────
// Admin can create employee/admin only — superadmin role requires requireSuperAdmin
router.post("/users", requireAdmin, async (req, res): Promise<void> => {
  const { username, password, displayName, role, department, canEditParts } = req.body;

  if (!username || !password || !displayName) {
    res.status(400).json({ error: "اسم المستخدم وكلمة السر والاسم مطلوبة" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "كلمة السر يجب أن تكون 6 أحرف على الأقل" });
    return;
  }

  // منع المدير العادي من إنشاء حساب سوبر أدمن
  const requestedRole = role || "employee";
  if (requestedRole === "superadmin" && req.user?.role !== "superadmin") {
    res.status(403).json({ error: "إنشاء حساب مدير المنصة يتطلب صلاحية مدير المنصة" });
    return;
  }

  // المدير لا يستطيع إنشاء مستخدمين خارج مؤسسته
  if (req.user?.role !== "superadmin" && !req.user?.orgId) {
    res.status(403).json({ error: "حساب المدير غير مرتبط بمؤسسة" });
    return;
  }

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, username.trim().toLowerCase()))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "اسم المستخدم موجود مسبقاً" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [user] = await db
    .insert(usersTable)
    .values({
      username: username.trim().toLowerCase(),
      passwordHash,
      displayName: displayName.trim(),
      role: requestedRole,
      department: department?.trim() || "",
      isActive: true,
      canEditParts: canEditParts === true,
      // السوبر أدمن يضع orgId=null، المدير العادي يربط بمؤسسته
      orgId: req.user?.role === "superadmin" ? (req.body.orgId ?? null) : req.user!.orgId,
    })
    .returning({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      role: usersTable.role,
      department: usersTable.department,
      isActive: usersTable.isActive,
      canEditParts: usersTable.canEditParts,
      orgId: usersTable.orgId,
    });

  logger.info({ userId: user.id, username: user.username, canEditParts: user.canEditParts }, "New user created");
  res.status(201).json(user);
});

// ── PATCH /api/users/:id ─────────────────────────────────────
router.patch("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "رقم المستخدم غير صحيح" });
    return;
  }

  // جلب المستخدم المراد تعديله للتحقق من صلاحياته
  const [targetUser] = await db
    .select({ id: usersTable.id, role: usersTable.role, orgId: usersTable.orgId })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!targetUser) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }

  const isSuperAdmin = req.user?.role === "superadmin";

  // المدير العادي لا يستطيع تعديل سوبر أدمن أو مستخدمين من مؤسسة أخرى
  if (!isSuperAdmin) {
    if (targetUser.role === "superadmin") {
      res.status(403).json({ error: "لا يمكن تعديل حساب مدير المنصة" });
      return;
    }
    if (targetUser.orgId !== req.user?.orgId) {
      res.status(403).json({ error: "لا يمكن تعديل مستخدم من مؤسسة أخرى" });
      return;
    }
  }

  // لا يمكن لأي مستخدم تعطيل نفسه — يُقفل نفسه خارج النظام
  if (userId === req.user?.userId && typeof req.body.isActive === "boolean" && !req.body.isActive) {
    res.status(400).json({ error: "لا يمكنك تعطيل حسابك الخاص" });
    return;
  }

  const { displayName, role, department, isActive, password, canEditParts } = req.body;
  const updates: Record<string, unknown> = {};

  if (displayName)                        updates.displayName = displayName.trim();
  if (typeof department === "string")     updates.department = department.trim();
  if (typeof isActive === "boolean")      updates.isActive = isActive;
  if (typeof canEditParts === "boolean")  updates.canEditParts = canEditParts;

  // التحقق من الترقية إلى سوبر أدمن — ممنوع على المدير العادي
  if (role) {
    if (role === "superadmin" && !isSuperAdmin) {
      res.status(403).json({ error: "الترقية إلى مدير المنصة تتطلب صلاحية مدير المنصة" });
      return;
    }
    updates.role = role;
  }

  if (password) {
    if (password.length < 6) {
      res.status(400).json({ error: "كلمة السر يجب أن تكون 6 أحرف على الأقل" });
      return;
    }
    updates.passwordHash = await bcrypt.hash(password, 10);
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "لا توجد بيانات للتحديث" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set(updates as any)
    .where(eq(usersTable.id, userId))
    .returning({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      role: usersTable.role,
      department: usersTable.department,
      isActive: usersTable.isActive,
      canEditParts: usersTable.canEditParts,
      orgId: usersTable.orgId,
    });

  if (!updated) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }

  res.json(updated);
});

// ── DELETE /api/users/:id ────────────────────────────────────
router.delete("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "رقم المستخدم غير صحيح" });
    return;
  }

  if (req.user?.userId === userId) {
    res.status(400).json({ error: "لا يمكنك حذف حسابك الخاص" });
    return;
  }

  // جلب المستخدم المراد حذفه
  const [targetUser] = await db
    .select({ id: usersTable.id, role: usersTable.role, orgId: usersTable.orgId })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!targetUser) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }

  const isSuperAdmin = req.user?.role === "superadmin";

  // لا أحد يستطيع حذف سوبر أدمن — حتى السوبر أدمن نفسه (لا يحذف نفسه — محمي أعلاه)
  if (targetUser.role === "superadmin" && !isSuperAdmin) {
    res.status(403).json({ error: "لا يمكن حذف حساب مدير المنصة" });
    return;
  }

  // المدير العادي لا يستطيع حذف مستخدمين من مؤسسة أخرى
  if (!isSuperAdmin && targetUser.orgId !== req.user?.orgId) {
    res.status(403).json({ error: "لا يمكن حذف مستخدم من مؤسسة أخرى" });
    return;
  }

  // المدير لا يستطيع حذف مدير آخر في نفس المؤسسة (اختياري — حماية إضافية)
  if (!isSuperAdmin && targetUser.role === "admin") {
    res.status(403).json({ error: "لا يمكن للمدير حذف مدير آخر — تواصل مع مدير المنصة" });
    return;
  }

  await db.delete(usersTable).where(eq(usersTable.id, userId));
  logger.info({ deletedUserId: userId, deletedBy: req.user?.userId }, "User deleted");
  res.sendStatus(204);
});

export default router;
