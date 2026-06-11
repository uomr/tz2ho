/**
 * auth.ts Route — تسجيل الدخول، تسجيل الخروج، بيانات المستخدم الحالي
 */
import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { signToken, requireAuth } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// ── POST /api/auth/setup — إنشاء حساب المدير الأول (مرة واحدة فقط) ──
router.post("/auth/setup", async (req, res): Promise<void> => {
  const { setupToken, username, password, displayName } = req.body;

  // التحقق من رمز الإعداد (SESSION_SECRET مؤقتاً)
  const expectedToken = process.env.SESSION_SECRET || "";
  if (!setupToken || setupToken !== expectedToken) {
    res.status(403).json({ error: "رمز الإعداد غير صحيح" });
    return;
  }

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin")).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "حساب المدير موجود مسبقاً — استخدم تسجيل الدخول العادي" });
    return;
  }

  const passwordHash = await bcrypt.hash(password || "ruknauto2025", 10);
  const [user] = await db.insert(usersTable).values({
    username: (username || "admin").toLowerCase(),
    passwordHash,
    displayName: displayName || "مدير النظام",
    role: "admin",
    department: "admin",
    isActive: true,
  }).returning({ id: usersTable.id, username: usersTable.username });

  logger.info({ userId: user.id }, "Admin account created via setup endpoint");
  res.status(201).json({ message: "✅ تم إنشاء حساب المدير بنجاح", username: user.username });
});

// ── POST /api/auth/login ─────────────────────────────────────
router.post("/auth/login", async (req, res): Promise<void> => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "اسم المستخدم وكلمة السر مطلوبان" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username.trim().toLowerCase()))
    .limit(1);

  if (!user || !user.isActive) {
    res.status(401).json({ error: "اسم المستخدم أو كلمة السر غير صحيحة" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "اسم المستخدم أو كلمة السر غير صحيحة" });
    return;
  }

  // تحديث وقت آخر دخول
  await db
    .update(usersTable)
    .set({ lastLogin: sql`now()` })
    .where(eq(usersTable.id, user.id));

  const token = signToken({
    userId: user.id,
    username: user.username,
    role: user.role,
    department: user.department,
    displayName: user.displayName,
    canEditParts: user.role === "admin" ? true : (user.canEditParts ?? false),
  });

  logger.info({ userId: user.id, username: user.username }, "User logged in");

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      department: user.department,
      canEditParts: user.role === "admin" ? true : (user.canEditParts ?? false),
    },
  });
});

// ── GET /api/auth/me ─────────────────────────────────────────
router.get("/auth/me", requireAuth, (req, res): void => {
  res.json({ user: req.user });
});

// ── PATCH /api/auth/change-password ─────────────────────────
router.patch("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    res.status(400).json({ error: "كلمة السر الحالية والجديدة مطلوبتان" });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: "كلمة السر الجديدة يجب أن تكون 6 أحرف على الأقل" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!user) { res.status(404).json({ error: "المستخدم غير موجود" }); return; }

  const valid = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "كلمة السر الحالية غير صحيحة" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, user.id));

  logger.info({ userId: user.id }, "User changed their password");
  res.json({ message: "تم تغيير كلمة السر بنجاح" });
});

// ── POST /api/auth/logout ────────────────────────────────────
router.post("/auth/logout", (_req, res): void => {
  // JWT stateless — الـ logout يتم من طرف العميل بحذف التوكن
  res.json({ message: "تم تسجيل الخروج" });
});

export default router;
