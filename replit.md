# RuknAuto

نظام استخراج الفواتير الذكي للقطع الأوتوماتيكية العربية — SaaS متعدد المستأجرين مع ذكاء اصطناعي.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 3001)
- `pnpm --filter @workspace/rukn-auto run dev` — run the frontend (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `OPENROUTER_API_KEY` — AI extraction (OpenRouter)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + pino logger
- DB: PostgreSQL + Drizzle ORM + pgvector (HNSW index, 768-dim embeddings)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- AI: OpenRouter → Qwen VL for invoice extraction
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + Tailwind + shadcn/ui + Recharts + Wouter

## Where things live

| Path | Purpose |
|------|---------|
| `lib/db/src/schema/` | Drizzle schema source of truth |
| `lib/db/src/schema/organizations.ts` | Multi-tenancy: organizations/tenants table |
| `artifacts/api-server/src/routes/` | Express route handlers |
| `artifacts/api-server/src/middlewares/auth.ts` | JWT auth + `AuthPayload` interface |
| `artifacts/api-server/uploads/` | Invoice image storage (local FS, S3-ready interface) |
| `artifacts/rukn-auto/src/pages/` | React page components |
| `artifacts/rukn-auto/src/contexts/AuthContext.tsx` | Auth state + `AuthUser` interface |

## Architecture decisions

- **Multi-tenancy**: Application-level tenant filtering (`WHERE org_id = req.user.orgId`) — not DB-level RLS. Every new invoice, user, and part created via API is tagged with the requesting user's `orgId`.
- **Roles**: `employee` | `admin` | `superadmin` — superadmin is platform-level, has `orgId = null`, accesses all orgs via `/super-admin` panel.
- **Auth**: JWT (30-day expiry) carries `{ userId, username, role, department, displayName, canEditParts, orgId, orgName, orgPlan }`.
- **Vector search**: pgvector HNSW index on `parts.embedding vector(768)` — hybrid search: exact → vector → fuzzy.
- **Storage**: `storage-service.ts` abstraction layer — currently Local FS, S3/R2-ready interface.
- **Validation in api-server routes**: Use manual validation or import from `@workspace/api-zod` — **do NOT import `zod` or `zod/v4` directly** in api-server routes as these packages aren't in its dependencies and esbuild will fail.

## Product

| Feature | Status |
|---------|--------|
| AI Invoice Extraction (Arabic OCR) | ✅ Live |
| Parts Memory + Hybrid Vector Search | ✅ Live |
| Supplier Analytics + Anomaly Detection | ✅ Live |
| Export (Excel single/bulk + PDF print) | ✅ Live |
| Object Storage (Local FS → S3-ready) | ✅ Live |
| Multi-tenancy SaaS (orgs + registration + super admin) | ✅ Live |

## Plans

| Plan | Invoices/Month | Notes |
|------|---------------|-------|
| trial | 50 | Default on registration |
| free | 50 | — |
| pro | 1000 | — |
| enterprise | Unlimited | — |

## DB Migration Notes

After `db push`, if org_id sequence conflicts (manual insert):
```sql
SELECT setval('organizations_id_seq', (SELECT MAX(id) FROM organizations));
```

To seed default org for existing single-tenant data:
```sql
INSERT INTO organizations (id, name, slug, plan, status, max_invoices_per_month)
VALUES (1, 'المنظمة الافتراضية', 'default', 'pro', 'active', 1000)
ON CONFLICT (id) DO NOTHING;
UPDATE users SET org_id = 1 WHERE org_id IS NULL;
UPDATE invoices SET org_id = 1 WHERE org_id IS NULL;
UPDATE parts SET org_id = 1 WHERE org_id IS NULL;
SELECT setval('organizations_id_seq', (SELECT MAX(id) FROM organizations));
```

## User preferences

- Arabic RTL UI throughout
- Dark theme default
- High quality "$30k engineering team" code standard

## Gotchas

- **zod in api-server**: Do NOT import `zod` or `zod/v4` directly in api-server routes — use manual validation or `@workspace/api-zod`. esbuild will fail if zod is not in dependencies.
- **pgvector**: Use `customType` from `drizzle-orm/pg-core` (not `pgvector/drizzle-orm`) for the vector column type.
- **organizations_id_seq**: After any manual `INSERT INTO organizations` with explicit id, run `setval` to fix the sequence.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
