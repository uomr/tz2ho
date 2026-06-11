import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * إعدادات النظام — key/value بسيط للمدير
 * مثال: active_model, monthly_tokens_in, monthly_tokens_out, usage_month
 */
export const systemSettingsTable = pgTable("system_settings", {
  key:       text("key").primaryKey(),
  value:     text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SystemSetting = typeof systemSettingsTable.$inferSelect;

// ── النماذج المتاحة (مرتبة من الأوفر للأقوى) ─────────────────
export interface ModelOption {
  id: string;          // OpenRouter model ID
  label: string;       // اسم مختصر
  badge: string;       // وصف سريع
  speed: number;       // 1-5
  quality: number;     // 1-5
  costPer1kIn: number; // $ لكل ألف token دخل
  costPer1kOut: number;
  supportsJson: boolean;
  fallbackModel?: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: "google/gemini-2.0-flash-lite",
    label: "Gemini 2.0 Flash Lite",
    badge: "الأسرع والأرخص",
    speed: 5, quality: 3,
    costPer1kIn: 0.000075, costPer1kOut: 0.0003,
    supportsJson: true,
  },
  {
    id: "google/gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    badge: "سريع وموفّر",
    speed: 5, quality: 3,
    costPer1kIn: 0.0001, costPer1kOut: 0.0004,
    supportsJson: true,
  },
  {
    id: "google/gemini-2.5-flash-preview-05-20",
    label: "Gemini 2.5 Flash",
    badge: "توازن مثالي",
    speed: 4, quality: 4,
    costPer1kIn: 0.00015, costPer1kOut: 0.0006,
    supportsJson: true,
  },
  {
    id: "qwen/qwen3-vl-32b-instruct",
    label: "Qwen 3 VL 32B",
    badge: "أفضل دقة عربي",
    speed: 2, quality: 5,
    costPer1kIn: 0.0004, costPer1kOut: 0.0012,
    supportsJson: false,
    fallbackModel: "google/gemini-3.1-flash-lite",
  },
  {
    id: "google/gemini-2.5-pro-preview",
    label: "Gemini 2.5 Pro",
    badge: "الأقوى",
    speed: 2, quality: 5,
    costPer1kIn: 0.00125, costPer1kOut: 0.01,
    supportsJson: true,
  },
];

export const DEFAULT_MODEL_ID = "qwen/qwen3-vl-32b-instruct";
