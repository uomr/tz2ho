---
name: Multi-tenancy Design
description: How RuknAuto implements SaaS multi-tenancy across organizations
---

## Design Choice: Application-level tenant filtering

Every DB query in protected routes uses `WHERE org_id = req.user.orgId`. This is NOT PostgreSQL Row Level Security — it's enforced in Express route handlers.

**Why:** Simpler to implement, easier to debug, sufficient for this scale. RLS would require DB role management and is harder to test.

**How to apply:**
- All new routes that read/write tenant data must include `eq(table.orgId, req.user!.orgId)` or equivalent SQL `WHERE org_id = $N`
- Analytics routes using raw SQL must add `AND org_id = $N` to their queries
- `superadmin` role has `orgId = null` in JWT — they bypass org filters (can see all data via super-admin routes)

## Roles
- `employee` — org-scoped, limited write
- `admin` — org-scoped admin, full write within org
- `superadmin` — platform-level, `orgId = null`, accesses `/api/super-admin/*` endpoints

## JWT payload (as of Phase 5)
`{ userId, username, role, department, displayName, canEditParts, orgId, orgName, orgPlan }`

## Registration flow
`POST /api/auth/register` (public) → creates org + admin user atomically → returns JWT (auto-login)

## Plan limits
| Plan | invoices/month |
|------|---------------|
| trial | 50 |
| free | 50 |
| pro | 1000 |
| enterprise | 999999 |
