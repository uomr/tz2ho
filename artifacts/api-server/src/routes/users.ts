/**
 * users.ts Route — إدارة المستخدمين (للمدير فقط)
 */
import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// ── GET /api/users ───────────────────────────────────────────
router.get("/users", requireAdmin, async (_req, res): Promise<void> => {
  const users = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      role: usersTable.role,
      department: usersTable.department,
      isActive: usersTable.isActive,
      canEditParts: usersTable.canEditParts,
      createdAt: usersTable.createdAt,
      lastLogin: usersTable.lastLogin,
    })
    .from(usersTable)
    .orderBy(usersTable.createdAt);

  res.json(users);
});

// ── POST /api/users ──────────────────────────────────────────
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
      role: role || "employee",
      department: department?.trim() || "",
      isActive: true,
      canEditParts: canEditParts === true,
    })
    .returning({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      role: usersTable.role,
      department: usersTable.department,
      isActive: usersTable.isActive,
      canEditParts: usersTable.canEditParts,
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

  const { displayName, role, department, isActive, password, canEditParts } = req.body;
  const updates: Record<string, unknown> = {};

  if (displayName)                        updates.displayName = displayName.trim();
  if (role)                               updates.role = role;
  if (typeof department === "string")     updates.department = department.trim();
  if (typeof isActive === "boolean")      updates.isActive = isActive;
  if (typeof canEditParts === "boolean")  updates.canEditParts = canEditParts;
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

  await db.delete(usersTable).where(eq(usersTable.id, userId));
  res.sendStatus(204);
});

export default router;
