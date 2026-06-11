import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const partsTable = pgTable("parts", {
  id: serial("id").primaryKey(),
  description: text("description").notNull(),
  partNumber: text("part_number").notNull(),
  originalPartNumber: text("original_part_number"),
  packFactor: integer("pack_factor").default(1),
  unitLabel: text("unit_label").default("قطعة"),
  usageCount: integer("usage_count").notNull().default(0),
  // عدد الاستخدام لكل قسم: { honda_kia: 5, nissan: 2, ... }
  deptUsage: jsonb("dept_usage").$type<Record<string, number>>().default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPartSchema = createInsertSchema(partsTable).omit({ id: true, createdAt: true });

export type Part = typeof partsTable.$inferSelect;
export type InsertPart = z.infer<typeof insertPartSchema>;
