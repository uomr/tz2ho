/**
 * register.ts — تسجيل شركة جديدة (onboarding عام — بدون Auth)
 *
 * POST /api/auth/register
 * يُنشئ منظمة جديدة + حساب مدير أول في عملية ذرّية واحدة
 */
import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, organizationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { signToken } from "../middlewares/auth.js";

const router: IRouter = Router();

function validateRegister(body: any): string | null {
  const { orgName, orgSlug, displayName, username, password } = body;
  if (!orgName || String(orgName).trim().length < 2)  return "اسم الشركة مطلوب (حرفان على الأقل)";
  if (!orgSlug || String(orgSlug).length < 3)          return "معرّف الشركة يجب أن يكون 3 أحرف على الأقل";
  if (!/^[a-z0-9-]+$/.test(String(orgSlug)))           return "المعرّف: أحرف إنجليزية صغيرة وأرقام وشرطة فقط";
  if (String(orgSlug).length > 32)                     return "المعرّف: 32 حرفاً كحد أقصى";
  if (!displayName || String(displayName).trim().length < 2) return "الاسم الكامل مطلوب";
  if (!username || String(username).length < 3)         return "اسم المستخدم: 3 أحرف على الأقل";
  if (!/^[a-z0-9_]+$/.test(String(username)))           return "اسم المستخدم: أحرف إنجليزية صغيرة وأرقام وشرطة سفلية فقط";
  if (!password || String(password).length < 8)         return "كلمة المرور: 8 أحرف على الأقل";
  return null;
}

// ── POST /api/auth/register ──────────────────────────────────
router.post("/auth/register", async (req, res): Promise<void> => {
  const validationError = validateRegister(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const { orgName, orgSlug, contactEmail, displayName, username, password } = req.body as {
    orgName: string; orgSlug: string; contactEmail?: string;
    displayName: string; username: string; password: string;
  };

  // التحقق من تفرّد الـ slug
  const existingOrg = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.slug, orgSlug))
    .limit(1);

  if (existingOrg.length > 0) {
    res.status(409).json({ error: "هذا المعرّف محجوز مسبقاً — جرّب معرّفاً آخر" });
    return;
  }

  // التحقق من تفرّد اسم المستخدم
  const existingUser = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, username.toLowerCase()))
    .limit(1);

  if (existingUser.length > 0) {
    res.status(409).json({ error: "اسم المستخدم محجوز مسبقاً — اختر اسماً آخر" });
    return;
  }

  // ── إنشاء المنظمة ──
  const [org] = await db
    .insert(organizationsTable)
    .values({
      name:                orgName,
      slug:                orgSlug,
      plan:                "trial",
      status:              "trial",
      maxInvoicesPerMonth: 50,
      contactEmail:        contactEmail || null,
    })
    .returning();

  // ── إنشاء المدير الأول ──
  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(usersTable)
    .values({
      username:     username.toLowerCase(),
      passwordHash,
      displayName,
      role:         "admin",
      department:   "admin",
      isActive:     true,
      canEditParts: true,
      orgId:        org.id,
    })
    .returning();

  // ── إصدار JWT مباشرة (دخول تلقائي بعد التسجيل) ──
  const token = signToken({
    userId:       user.id,
    username:     user.username,
    role:         user.role,
    department:   user.department,
    displayName:  user.displayName,
    canEditParts: true,
    orgId:        org.id,
    orgName:      org.name,
    orgPlan:      org.plan,
  });

  // تحديث lastLogin
  await db.update(usersTable).set({ lastLogin: sql`now()` }).where(eq(usersTable.id, user.id));

  res.status(201).json({
    message: "تم تسجيل شركتك بنجاح! مرحباً بك في RuknAuto 🎉",
    token,
    user: {
      id:          user.id,
      username:    user.username,
      displayName: user.displayName,
      role:        user.role,
      department:  user.department,
      canEditParts: true,
      orgId:       org.id,
      orgName:     org.name,
      orgPlan:     org.plan,
    },
    org: {
      id:     org.id,
      name:   org.name,
      slug:   org.slug,
      plan:   org.plan,
      status: org.status,
    },
  });
});

export default router;
