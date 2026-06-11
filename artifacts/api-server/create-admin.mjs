import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const hash = await bcrypt.hash("ruknauto2025", 10);
try {
  await pool.query(
    `INSERT INTO users (username, password_hash, display_name, role, department, is_active)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (username) DO NOTHING`,
    ["admin", hash, "مدير النظام", "admin", "admin"]
  );
  console.log("✅ تم إنشاء حساب المدير: admin / ruknauto2025");
} catch (e) {
  console.error("❌", e.message);
}
await pool.end();
