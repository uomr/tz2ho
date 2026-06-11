---
name: Storage Architecture
description: كيف يعمل Object Storage في RuknAuto — Local FS الآن, S3 لاحقاً
---

# Storage Architecture

## القرار
استخدام طبقة تجريد `storage-service.ts` بدلاً من ربط الكود مباشرة بـ Local FS أو S3.

## التطبيق الحالي
- المحرك: Local FileSystem
- مجلد التخزين: `artifacts/api-server/uploads/`
- الـ URL المُعاد: `/api/uploads/<filename>` (مع requireAuth)
- الـ filenames: `{timestamp}-{12-byte-hex}.{ext}`

## للتبديل إلى S3/R2 مستقبلاً
أضف `S3StorageAdapter` في `storage-service.ts` وفعّله عبر:
```
STORAGE_ADAPTER=s3
S3_ENDPOINT=https://...
S3_BUCKET=ruknauto
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
```

**Why:** تخزين base64 في DB يُبطئ الاستعلامات ويُضخّم حجم DB بشكل كبير مع كثرة الفواتير.

**How to apply:** أي صورة جديدة تمر عبر `storageService.uploadBase64()` — لا تخزين base64 مباشرة في DB.
