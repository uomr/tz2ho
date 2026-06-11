/**
 * storage-service.ts — طبقة تجريد التخزين
 *
 * الآن: Local Filesystem (artifacts/api-server/uploads/)
 * مستقبلاً: S3/R2 عبر env vars بدون تغيير الكود
 *
 *   STORAGE_ADAPTER=s3
 *   S3_ENDPOINT=https://...
 *   S3_BUCKET=ruknauto
 *   S3_ACCESS_KEY=...
 *   S3_SECRET_KEY=...
 *   S3_PUBLIC_BASE=https://cdn.example.com  (اختياري)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

// مجلد التخزين المحلي
const __dir = typeof __dirname !== "undefined"
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

// ── حل المجلد أياً كانت نقطة البداية (src/ أو dist/) ──
const API_DIR = path.resolve(__dir, "../../");
const UPLOAD_DIR = path.join(API_DIR, "uploads");

// تأكد من وجود المجلد
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── Interface ──────────────────────────────────────────────
export interface StorageStats {
  adapter: "local" | "s3";
  fileCount: number;
  totalBytes: number;
  uploadDir?: string;
}

export interface UploadResult {
  filename: string;
  url: string;         // الـ URL النسبي المخزّن في DB
  bytes: number;
}

// ── Local Adapter ──────────────────────────────────────────
class LocalStorageAdapter {
  readonly type = "local" as const;

  /** رفع ملف — يعيد الـ URL النسبي */
  async upload(buffer: Buffer, ext: string): Promise<UploadResult> {
    const hash = crypto.randomBytes(12).toString("hex");
    const filename = `${Date.now()}-${hash}.${ext}`;
    const fullPath = path.join(UPLOAD_DIR, filename);
    await fs.promises.writeFile(fullPath, buffer);
    return { filename, url: `/api/uploads/${filename}`, bytes: buffer.length };
  }

  /** قراءة ملف كـ Buffer */
  async getBuffer(filename: string): Promise<Buffer | null> {
    const fullPath = path.join(UPLOAD_DIR, filename);
    try { return await fs.promises.readFile(fullPath); } catch { return null; }
  }

  /** حذف ملف */
  async delete(filename: string): Promise<void> {
    const fullPath = path.join(UPLOAD_DIR, filename);
    try { await fs.promises.unlink(fullPath); } catch { /* لا يهم إذا غير موجود */ }
  }

  /** إحصائيات */
  async stats(): Promise<StorageStats> {
    let fileCount = 0;
    let totalBytes = 0;
    try {
      const files = await fs.promises.readdir(UPLOAD_DIR);
      for (const f of files) {
        const stat = await fs.promises.stat(path.join(UPLOAD_DIR, f));
        if (stat.isFile()) { fileCount++; totalBytes += stat.size; }
      }
    } catch { /* مجلد فارغ */ }
    return { adapter: "local", fileCount, totalBytes, uploadDir: UPLOAD_DIR };
  }

  /** مسار مادي من اسم الملف */
  physicalPath(filename: string): string {
    return path.join(UPLOAD_DIR, filename);
  }
}

// ── Factory ─────────────────────────────────────────────────
// يمكن لاحقاً إضافة S3Adapter هنا وتفعيله عبر env
const adapter = new LocalStorageAdapter();

export const storageService = {
  /** رفع صورة من base64 */
  async uploadBase64(base64: string, mimeType = "image/jpeg"): Promise<UploadResult> {
    const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
    const buffer = Buffer.from(base64, "base64");
    return adapter.upload(buffer, ext);
  },

  /** رفع من Buffer مباشرة */
  async uploadBuffer(buffer: Buffer, ext = "jpg"): Promise<UploadResult> {
    return adapter.upload(buffer, ext);
  },

  /** حذف بـ filename (من URL: /api/uploads/<filename>) */
  async deleteByUrl(url: string): Promise<void> {
    const filename = url.split("/").pop() ?? "";
    if (filename) await adapter.delete(filename);
  },

  /** تقديم ملف للـ HTTP response — يعيد Buffer أو null */
  async getBuffer(filename: string): Promise<Buffer | null> {
    return adapter.getBuffer(filename);
  },

  /** المسار المادي للملف (للـ res.sendFile) */
  physicalPath(filename: string): string {
    return adapter.physicalPath(filename);
  },

  /** إحصائيات التخزين */
  async stats(): Promise<StorageStats> {
    return adapter.stats();
  },
};
