import { pgTable, serial, text, integer, timestamp, jsonb, customType, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

const vector = customType<{ data: number[]; driverData: string }>({
  dataType(config: any) {
    return `vector(${config?.dimensions ?? 768})`;
  },
  toDriver(value: number[]): string {
    return JSON.stringify(value);
  },
  fromDriver(value: string): number[] {
    if (Array.isArray(value)) return value as number[];
    try { return JSON.parse(value); } catch { return []; }
  },
});

export const partsTable = pgTable("parts", {
  id: serial("id").primaryKey(),
  description: text("description").notNull(),
  partNumber: text("part_number").notNull(),
  originalPartNumber: text("original_part_number"),
  packFactor: integer("pack_factor").default(1),
  unitLabel: text("unit_label").default("قطعة"),
  usageCount: integer("usage_count").notNull().default(0),
  deptUsage: jsonb("dept_usage").$type<Record<string, number>>().default({}).notNull(),
  embedding: vector("embedding", { dimensions: 768 } as any),
  orgId: integer("org_id"),           // FK to organizations.id
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPartSchema = createInsertSchema(partsTable).omit({ id: true, createdAt: true, embedding: true });

export type Part = typeof partsTable.$inferSelect;
export type InsertPart = z.infer<typeof insertPartSchema>;
