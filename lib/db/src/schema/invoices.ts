import { pgTable, serial, text, real, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number"),
  supplier: text("supplier"),
  date: text("date"),
  status: text("status").notNull().default("pending"),
  imageBase64: text("image_base64"),
  totalAmount: real("total_amount"),
  itemCount: integer("item_count"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by"),   // FK to users.id — من أدخل الفاتورة
  department: text("department"),     // قسم المستخدم وقت الإدخال
});

export const invoiceItemsTable = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoicesTable.id, { onDelete: "cascade" }),
  partNumber: text("part_number"),
  originalPartNumber: text("original_part_number"),
  description: text("description").notNull().default(""),
  quantity: real("quantity").notNull().default(0),
  unit: text("unit"),
  unitCost: real("unit_cost").notNull().default(0),
  total: real("total").notNull().default(0),
  packFactor: integer("pack_factor").default(1),
  memoryMatch: boolean("memory_match").notNull().default(false),
  memoryConfidence: real("memory_confidence"),
  needsManualInput: boolean("needs_manual_input").notNull().default(false),
});

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({ id: true, createdAt: true });
export const insertInvoiceItemSchema = createInsertSchema(invoiceItemsTable).omit({ id: true });

export type Invoice = typeof invoicesTable.$inferSelect;
export type InvoiceItem = typeof invoiceItemsTable.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;
