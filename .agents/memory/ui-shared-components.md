---
name: UI Shared Components — RuknAuto
description: Shared design system components created 2026-06-12; rules for color usage across all pages.
---

# مكونات التصميم المشتركة

## المكونات المنشأة
- `src/components/shared/RoleBadge.tsx` — شارة الدور (admin/employee/superadmin)
- `src/components/shared/StatusBadge.tsx` — شارة حالة الفاتورة (pending/saved/injected)
- `src/components/shared/EmptyState.tsx` — حالة الفراغ الموحّدة

## قاعدة الألوان المزدوجة
**Why:** ألوان مثل `text-yellow-400` و`text-purple-300` غير مقروءة على الخلفية الفاتحة.
**How to apply:** استخدم دائماً `text-*-600 dark:text-*-400` للألوان الدلالية المتغيرة.

مثال صحيح:
- `text-emerald-600 dark:text-emerald-400`
- `text-red-600 dark:text-red-400`
- `text-violet-600 dark:text-violet-300`
- `text-amber-600 dark:text-amber-400`

مثال خاطئ (بنية قديمة — لا تستخدم):
- `text-green-400` — خافت في الوضع الصباحي
- `text-purple-300` — خافت في الوضع الصباحي
- `text-yellow-400` — خافت في الوضع الصباحي

## ملاحظة ROLE object في layout.tsx
ROLE object يستخدم hex ألوان hardcoded — هذا مقبول لأن الشريط الجانبي يحتوي على خلفية داكنة دائماً (sidebar CSS variable). لا تغيّر هذه الأيقونات.

## حالات الفراغ
استخدم نمط موحّد في كل الجداول:
```tsx
<div className="flex flex-col items-center gap-2 opacity-60">
  <Icon className="w-8 h-8 opacity-40" />
  <p className="text-sm">...</p>
  <p className="text-xs">...</p>
</div>
```
