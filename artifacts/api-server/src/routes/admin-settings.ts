/**
 * admin-settings.ts Route — إدارة إعدادات النظام (مدير فقط)
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { systemSettingsTable, AVAILABLE_MODELS, DEFAULT_MODEL_ID } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// ── مساعد: قراءة إعداد واحد ────────────────────────────────
async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, key))
    .limit(1);
  return row?.value ?? null;
}

// ── مساعد: تحديث / إدراج إعداد ────────────────────────────
async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(systemSettingsTable)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

// ── GET /api/admin/settings ─────────────────────────────────
router.get("/admin/settings", requireAdmin, async (_req, res): Promise<void> => {
  const [modelRow, tokensIn, tokensOut, extractions, usageMonth, costLimit] =
    await Promise.all([
      getSetting("active_model"),
      getSetting("monthly_tokens_in"),
      getSetting("monthly_tokens_out"),
      getSetting("monthly_extractions"),
      getSetting("usage_month"),
      getSetting("cost_limit_usd"),
    ]);

  // إعادة ضبط إذا تغيّر الشهر
  const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const storedMonth = usageMonth ?? currentMonth;

  let tokIn = parseInt(tokensIn ?? "0");
  let tokOut = parseInt(tokensOut ?? "0");
  let extr = parseInt(extractions ?? "0");

  if (storedMonth !== currentMonth) {
    await Promise.all([
      setSetting("monthly_tokens_in", "0"),
      setSetting("monthly_tokens_out", "0"),
      setSetting("monthly_extractions", "0"),
      setSetting("usage_month", currentMonth),
    ]);
    tokIn = tokOut = extr = 0;
  }

  const activeModel = modelRow ?? DEFAULT_MODEL_ID;
  const modelMeta = AVAILABLE_MODELS.find(m => m.id === activeModel);
  const estimatedCost =
    (tokIn / 1000) * (modelMeta?.costPer1kIn ?? 0) +
    (tokOut / 1000) * (modelMeta?.costPer1kOut ?? 0);

  res.json({
    activeModel,
    models: AVAILABLE_MODELS,
    usage: {
      month: currentMonth,
      tokensIn: tokIn,
      tokensOut: tokOut,
      extractions: extr,
      estimatedCostUsd: Math.round(estimatedCost * 10000) / 10000,
    },
    costLimitUsd: parseFloat(costLimit ?? "0"),
  });
});

// ── PATCH /api/admin/settings ───────────────────────────────
router.patch("/admin/settings", requireAdmin, async (req, res): Promise<void> => {
  const { activeModel, costLimitUsd } = req.body;

  if (activeModel) {
    const valid = AVAILABLE_MODELS.find(m => m.id === activeModel);
    if (!valid) {
      res.status(400).json({ error: "نموذج غير مدعوم" });
      return;
    }
    await setSetting("active_model", activeModel);
    logger.info({ activeModel }, "Admin changed active AI model");
  }

  if (typeof costLimitUsd === "number") {
    await setSetting("cost_limit_usd", String(costLimitUsd));
  }

  res.json({ ok: true });
});

// ── هذه الدالة يستخدمها invoice-extractor لتسجيل الاستهلاك ─
export async function getActiveModel(): Promise<string> {
  return (await getSetting("active_model")) ?? DEFAULT_MODEL_ID;
}

export async function recordUsage(tokensIn: number, tokensOut: number): Promise<void> {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const storedMonth = await getSetting("usage_month");

  if (storedMonth !== currentMonth) {
    await Promise.all([
      setSetting("monthly_tokens_in", String(tokensIn)),
      setSetting("monthly_tokens_out", String(tokensOut)),
      setSetting("monthly_extractions", "1"),
      setSetting("usage_month", currentMonth),
    ]);
    return;
  }

  const [curIn, curOut, curEx] = await Promise.all([
    getSetting("monthly_tokens_in"),
    getSetting("monthly_tokens_out"),
    getSetting("monthly_extractions"),
  ]);

  await Promise.all([
    setSetting("monthly_tokens_in",   String((parseInt(curIn  ?? "0")) + tokensIn)),
    setSetting("monthly_tokens_out",  String((parseInt(curOut ?? "0")) + tokensOut)),
    setSetting("monthly_extractions", String((parseInt(curEx  ?? "0")) + 1)),
  ]);
}

export default router;
