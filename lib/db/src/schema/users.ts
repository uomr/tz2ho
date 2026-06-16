import { pgTable, serial, text, boolean, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// الأقسام المتاحة في المؤسسة — قابل للتوسع
export const DEPARTMENTS = ["admin", "honda_kia", "nissan", "american", "general"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("employee"),    // "admin" | "employee"
  department: text("department").notNull().default("general"), // DEPARTMENTS
  isActive: boolean("is_active").notNull().default(true),
  canEditParts: boolean("can_edit_parts").notNull().default(false),
  orgId: integer("org_id"),   // FK to organizations.id — null للـ superadmin
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLogin: timestamp("last_login"),
}, (t) => [
  index("users_org_id_idx").on(t.orgId),
  index("users_role_idx").on(t.role),
]);

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, lastLogin: true });

export type User = typeof usersTable.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
