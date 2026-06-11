// Script to create system_settings table directly
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { Client } = require("../../lib/db/node_modules/pg");

const client = new Client({
  connectionString: "postgresql://postgres.pekcfkyeoeuhxtroebzb:1G8Wz1JTOblkr8Gd@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres",
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log("Connected to DB");

const res = await client.query(`
  CREATE TABLE IF NOT EXISTS system_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`);

console.log("✅ system_settings table ready:", res.command);
await client.end();
