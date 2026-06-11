/**
 * storage-admin.ts
 *
 * GET  /api/uploads/:filename          — تقديم الملفات (مع Auth)
 * GET  /api/admin/storage/stats        — إحصائيات التخزين + تقدم الترحيل
 * POST /api/admin/storage/migrate      — ترحيل base64 → ملفات (SSE stream)
 * POST /api/admin/storage/cleanup      — حذف base64 المُرحَّل من DB
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { invoicesTable } from "@workspace/db";
import { eq, isNotNull, isNull, sql, and } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";
import { storageService } from "../lib/storage-service.js";
import path from "node:path";

const router: IRouter = Router();

// ── GET /api/uploads/:filename — تقديم ملفات التخزين ──────────
router.get("/uploads/:filename", requireAuth, async (req, res): Promise<void> => {
  const filename = req.params.filename as string;

  // فحص أمني: منع path traversal
  if (filename.includes("..") || filename.includes("/")) {
    res.status(400).json({ error: "اسم ملف غير صالح" });
    return;
  }

  const physicalPath = storageService.physicalPath(filename);
  const ext = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png",  ".webp": "image/webp",
  };
  const mime = mimeMap[ext] ?? "application/octet-stream";

  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");

  res.sendFile(physicalPath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "الملف غير موجود" });
  });
});

// ── GET /api/admin/storage/stats ──────────────────────────────
router.get("/admin/storage/stats", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const [storageStats, migrationStats] = await Promise.all([
    storageService.stats(),
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE image_base64 IS NOT NULL AND image_url IS NULL)::int  AS pending_migration,
        COUNT(*) FILTER (WHERE image_url IS NOT NULL)::int                            AS migrated,
        COUNT(*) FILTER (WHERE image_base64 IS NOT NULL)::int                         AS has_base64,
        COUNT(*)::int                                                                  AS total
      FROM invoices
    `),
  ]);

  const stats = migrationStats.rows[0] as any;
  res.json({
    storage: storageStats,
    migration: {
      total:            stats.total,
      migrated:         stats.migrated,
      pendingMigration: stats.pending_migration,
      hasBase64:        stats.has_base64,
    },
  });
});

// ── POST /api/admin/storage/migrate — SSE ─────────────────────
// يُرحّل فواتير base64 → ملفات واحدة تلو الأخرى، ويبثّ التقدم
router.post("/admin/storage/migrate", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const emit = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    // جلب الفواتير التي لديها base64 فقط (بدون imageUrl بعد)
    const invoices = await db
      .select({ id: invoicesTable.id, imageBase64: invoicesTable.imageBase64 })
      .from(invoicesTable)
      .where(
        and(
          isNotNull(invoicesTable.imageBase64),
          isNull(invoicesTable.imageUrl as any),
        )
      );

    const total = invoices.length;
    emit({ type: "start", total });

    if (total === 0) {
      emit({ type: "complete", total: 0, migrated: 0, failed: 0, message: "لا يوجد شيء للترحيل" });
      res.end();
      return;
    }

    let migrated = 0;
    let failed = 0;

    for (const inv of invoices) {
      try {
        const b64 = inv.imageBase64!;
        const result = await storageService.uploadBase64(b64, "image/jpeg");

        await db
          .update(invoicesTable)
          .set({ imageUrl: result.url } as any)
          .where(eq(invoicesTable.id, inv.id));

        migrated++;
        emit({
          type: "progress",
          id: inv.id,
          migrated,
          failed,
          total,
          bytes: result.bytes,
          pct: Math.round((migrated + failed) / total * 100),
        });
      } catch (err) {
        failed++;
        emit({ type: "error", id: inv.id, error: String(err) });
      }
    }

    emit({ type: "complete", total, migrated, failed, message: `تم ترحيل ${migrated} من ${total} فاتورة` });
  } catch (err) {
    emit({ type: "fatal", error: String(err) });
  } finally {
    res.end();
  }
});

// ── POST /api/admin/storage/cleanup ───────────────────────────
// حذف base64 من DB بعد التأكد من اكتمال الترحيل (توفير مساحة)
router.post("/admin/storage/cleanup", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const result = await db
    .update(invoicesTable)
    .set({ imageBase64: null })
    .where(isNotNull(invoicesTable.imageUrl as any));

  // Drizzle rowCount
  res.json({ message: "تم حذف base64 من الفواتير المُرحَّلة", cleaned: (result as any).rowCount ?? 0 });
});

export default router;
