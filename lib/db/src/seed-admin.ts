/**
 * seed-admin.ts — ينشئ حساب المدير الأول إذا لم يكن موجوداً
 * الاستخدام: node --env-file=.env --loader ts-node/esm seed-admin.ts
 *
 * أو بعد البناء: node --env-file=.env dist/seed-admin.mjs
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import bcrypt from "bcryptjs";
import * as schema from "./src/schema/index.js";
import { eq } from "drizzle-orm";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL غير موجود في .env");
  process.exit(1);
}

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ruknauto2025";
const ADMIN_NAME     = process.env.ADMIN_NAME     || "مدير النظام";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  console.log("🔑 جاري إنشاء حساب المدير...");

  // إنشاء الجدول إذا لم يكن موجوداً (Drizzle push يجب أن يفعل هذا لكن كاحتياط)
  const existing = await db
    .select({ id: schema.usersTable.id })
    .from(schema.usersTable)
    .where(eq(schema.usersTable.username, ADMIN_USERNAME))
    .limit(1);

  if (existing.length > 0) {
    console.log(`✅ حساب المدير "${ADMIN_USERNAME}" موجود مسبقاً — لم يتم التغيير.`);
    await pool.end();
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  await db.insert(schema.usersTable).values({
    username: ADMIN_USERNAME,
    passwordHash,
    displayName: ADMIN_NAME,
    role: "admin",
    department: "admin",
    isActive: true,
  });

  console.log("✅ تم إنشاء حساب المدير بنجاح:");
  console.log(`   اسم المستخدم: ${ADMIN_USERNAME}`);
  console.log(`   كلمة السر:    ${ADMIN_PASSWORD}`);
  console.log("⚠️  غيّر كلمة السر فور الدخول الأول!");

  await pool.end();
}

main().catch(err => {
  console.error("❌ خطأ:", err);
  process.exit(1);
});
