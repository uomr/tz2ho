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

// ── النماذج المتاحة ─────────────────────────────────────────────
// الأسعار محدّثة من OpenRouter API بتاريخ 2026-06-12
// جميع الأسعار بالدولار لكل 1,000 توكن
// ─────────────────────────────────────────────────────────────────
export interface ModelOption {
  id: string;           // OpenRouter model ID
  label: string;        // اسم مختصر
  badge: string;        // وصف سريع (عربي)
  description: string;  // وصف تقني للمدير
  provider: "qwen" | "google" | "meta"; // مزوّد النموذج
  speed: number;        // 1–5
  quality: number;      // 1–5 (دقة الاستخراج العربي)
  costPer1kIn: number;  // $ لكل 1,000 توكن دخل
  costPer1kOut: number; // $ لكل 1,000 توكن خرج
  supportsJson: boolean; // يدعم response_format JSON
  contextK: number;     // حجم السياق بالألف
}

export const AVAILABLE_MODELS: ModelOption[] = [
  // ── Tier 1: اقتصادي (Qwen VL — الأفضل للعربي) ───────────────
  {
    id: "qwen/qwen3.5-flash-02-23",
    label: "Qwen3.5 Flash",
    badge: "الأسرع والأرخص",
    description: "نموذج رؤية-لغة مدمج من Alibaba — بنية هجينة سريعة، عربي ممتاز، مناسب للاستخدام الكثيف",
    provider: "qwen",
    speed: 5, quality: 3,
    costPer1kIn: 0.000065, costPer1kOut: 0.000260,
    supportsJson: false,
    contextK: 1000,
  },
  {
    id: "qwen/qwen3-vl-8b-instruct",
    label: "Qwen3 VL 8B",
    badge: "خفيف ودقيق",
    description: "نموذج رؤية-لغة مخصص 8B من Qwen — فهم عالي للمستندات العربية والجداول",
    provider: "qwen",
    speed: 5, quality: 4,
    costPer1kIn: 0.000080, costPer1kOut: 0.000500,
    supportsJson: false,
    contextK: 256,
  },
  // ── Tier 2: متوازن (أفضل دقة للعربي) ───────────────────────
  {
    id: "qwen/qwen3-vl-32b-instruct",
    label: "Qwen3 VL 32B",
    badge: "الأفضل للعربي",
    description: "نموذج رؤية-لغة كبير 32B من Qwen — أعلى دقة لاستخراج الفواتير العربية والمختلطة",
    provider: "qwen",
    speed: 3, quality: 5,
    costPer1kIn: 0.000104, costPer1kOut: 0.000416,
    supportsJson: false,
    contextK: 262,
  },
  {
    id: "qwen/qwen3-vl-30b-a3b-instruct",
    label: "Qwen3 VL 30B MoE",
    badge: "توازن مثالي",
    description: "نموذج رؤية-لغة MoE 30B من Qwen — كفاءة عالية بتقنية Mixture-of-Experts، دقة قوية",
    provider: "qwen",
    speed: 4, quality: 4,
    costPer1kIn: 0.000130, costPer1kOut: 0.000520,
    supportsJson: false,
    contextK: 262,
  },
  // ── Tier 3: Google (JSON مدمج، سياق 1M) ─────────────────────
  {
    id: "google/gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    badge: "Google — سريع وموثوق",
    description: "نموذج Google متعدد الوسائط عالي الكفاءة — يدعم JSON مباشرة، سياق 1M توكن",
    provider: "google",
    speed: 5, quality: 3,
    costPer1kIn: 0.000250, costPer1kOut: 0.001500,
    supportsJson: true,
    contextK: 1048,
  },
  {
    id: "google/gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    badge: "Google — قريب من Pro",
    description: "أفضل نموذج Flash من Google — جودة شبه Pro في سرعة Flash، مثالي للدقة القصوى",
    provider: "google",
    speed: 4, quality: 5,
    costPer1kIn: 0.001500, costPer1kOut: 0.009000,
    supportsJson: true,
    contextK: 1048,
  },
];

// النموذج الافتراضي — أفضل دقة للعربي مع سعر معقول
export const DEFAULT_MODEL_ID = "qwen/qwen3-vl-32b-instruct";
