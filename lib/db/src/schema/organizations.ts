import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const PLANS = ["free", "pro", "enterprise"] as const;
export const ORG_STATUSES = ["active", "suspended", "trial"] as const;
export type Plan = (typeof PLANS)[number];
export type OrgStatus = (typeof ORG_STATUSES)[number];

// حدود الخطط (فواتير/شهر)
export const PLAN_LIMITS: Record<Plan, number> = {
  free:       50,
  pro:        1000,
  enterprise: 999999,
};

export const organizationsTable = pgTable("organizations", {
  id:                   serial("id").primaryKey(),
  name:                 text("name").notNull(),
  slug:                 text("slug").notNull().unique(),   // للـ URL ومعرّف الشركة
  plan:                 text("plan").notNull().default("trial"),
  status:               text("status").notNull().default("trial"),
  maxInvoicesPerMonth:  integer("max_invoices_per_month").default(50),
  contactEmail:         text("contact_email"),
  createdAt:            timestamp("created_at").defaultNow().notNull(),
  suspendedAt:          timestamp("suspended_at"),
});

export const insertOrganizationSchema = createInsertSchema(organizationsTable).omit({ id: true, createdAt: true });
export type Organization = typeof organizationsTable.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
