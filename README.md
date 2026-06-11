# RuknAuto — نظام استخراج الفواتير بالذكاء الاصطناعي

استخراج تلقائي لبيانات فواتير قطع غيار السيارات من صور الفواتير باستخدام نماذج Vision AI.

---

## المتطلبات

- **Node.js** v20 أو أحدث — https://nodejs.org
- **pnpm** v9 — `npm install -g pnpm`
- **PostgreSQL** v15 — https://www.postgresql.org/download/
- **مفتاح OpenRouter** — https://openrouter.ai/keys

---

## التشغيل المحلي

### 1. استنساخ المشروع
```bash
git clone <repo-url>
cd ruknauto
```

### 2. تثبيت الحزم
```bash
pnpm install
```

### 3. إعداد متغيرات البيئة
```bash
cp .env.example .env
# افتح .env وأضف DATABASE_URL و OPENROUTER_API_KEY
```

### 4. إنشاء قاعدة البيانات
```bash
# تأكد أن PostgreSQL يعمل ثم:
createdb ruknauto

# أو إذا تحتاج مستخدماً:
psql -c "CREATE DATABASE ruknauto;"
```

### 5. رفع مخطط قاعدة البيانات
```bash
pnpm --filter @workspace/db run push
```

### 6. تشغيل التطبيق (نافذتان منفصلتان)

**النافذة الأولى — API Server (المنفذ 5000):**
```bash
PORT=5000 BASE_PATH=/api pnpm --filter @workspace/api-server run dev
```

**النافذة الثانية — الواجهة الأمامية (المنفذ 5173):**
```bash
pnpm --filter @workspace/rukn-auto run dev
```

افتح المتصفح على: http://localhost:5173

---

## هيكل المشروع

```
ruknauto/
├── artifacts/
│   ├── api-server/          # Express 5 — منطق الاستخراج والـ API
│   │   └── src/
│   │       ├── lib/
│   │       │   ├── invoice-extractor.ts   # الاتصال بـ OpenRouter Vision
│   │       │   └── parts-memory.ts        # مطابقة القطع الذكية
│   │       └── routes/
│   │           ├── invoices.ts            # CRUD الفواتير + استخراج
│   │           ├── parts.ts               # إدارة ذاكرة القطع
│   │           └── stats.ts               # إحصائيات لوحة التحكم
│   └── rukn-auto/           # React + Vite — الواجهة الأمامية
│       └── src/
│           ├── pages/
│           │   ├── dashboard.tsx          # لوحة التحكم
│           │   ├── extract.tsx            # صفحة الاستخراج
│           │   ├── invoices.tsx           # سجل الفواتير
│           │   └── parts.tsx              # ذاكرة القطع
│           └── components/
│               └── layout.tsx             # الشريط الجانبي والـ Layout
├── lib/
│   ├── db/                  # Drizzle ORM — المخطط والاتصال
│   ├── api-spec/            # OpenAPI spec (المصدر الحقيقي للـ API)
│   ├── api-client-react/    # React Query hooks (مولّدة تلقائياً)
│   └── api-zod/             # Zod schemas (مولّدة تلقائياً)
└── scripts/                 # أدوات مساعدة
```

---

## أوامر مفيدة

| الأمر | الوصف |
|-------|--------|
| `pnpm run typecheck` | فحص TypeScript لكل المشروع |
| `pnpm --filter @workspace/db run push` | رفع تغييرات المخطط لقاعدة البيانات |
| `pnpm --filter @workspace/api-spec run codegen` | إعادة توليد الـ hooks و Zod schemas من OpenAPI |
| `pnpm run build` | بناء كل المشروع للإنتاج |

---

## النماذج المدعومة

النموذج الافتراضي: **`google/gemini-2.5-flash-preview-05-20`**

مزايا هذا الاختيار:
- دعم ممتاز للغة العربية وقراءة الفواتير
- تكلفة منخفضة (~5× أرخص من GPT-4o)
- نافذة سياق 1M توكن
- دقة عالية في OCR

يمكن تغيير النموذج في: `artifacts/api-server/src/lib/invoice-extractor.ts`

---

## المتغيرات البيئية

| المتغير | الوصف | مطلوب |
|---------|--------|--------|
| `DATABASE_URL` | رابط اتصال PostgreSQL | ✅ |
| `OPENROUTER_API_KEY` | مفتاح OpenRouter API | ✅ |
| `SESSION_SECRET` | سر التشفير للجلسات | ✅ |
| `PORT` | منفذ الـ API (افتراضي: 5000) | اختياري |
