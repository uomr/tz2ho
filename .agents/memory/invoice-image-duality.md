---
name: Invoice Image Duality
description: الفواتير القديمة تستخدم imageBase64، الجديدة تستخدم imageUrl — كلاهما مدعوم
---

# Invoice Image Duality

## السياق
تمت إضافة `image_url text` إلى جدول `invoices` بجانب `image_base64`.

- **فواتير جديدة** (بعد Phase 4): `imageBase64 = null`, `imageUrl = /api/uploads/<file>`
- **فواتير قديمة** (قبل Phase 4): `imageBase64 = <data>`, `imageUrl = null`

## GET /invoices/:id
يُعيد:
- `imageUrl` إن وُجد (للفواتير الجديدة والمُرحَّلة)
- `imageBase64` كـ fallback فقط إذا كان `imageUrl` فارغاً

## ترحيل الفواتير القديمة
`POST /api/admin/storage/migrate` — SSE stream يُرحّل base64 → ملفات
`POST /api/admin/storage/cleanup` — يحذف base64 من الفواتير المُرحَّلة

**Why:** backward compatibility مع الفواتير المحفوظة مسبقاً بدون كسر أي شيء.

**How to apply:** Frontend يتحقق من `invoice.imageUrl` أولاً، وإن لم يوجد يستخدم `invoice.imageBase64`.
