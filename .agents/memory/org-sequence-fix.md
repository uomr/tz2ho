---
name: Org Sequence Fix
description: How to fix PostgreSQL serial sequence after a manual INSERT with explicit id
---

## Problem
When seeding the default org with `INSERT INTO organizations (id, ...) VALUES (1, ...)`, PostgreSQL's serial sequence stays at 1. The next auto-generated insert will try id=1 again and fail with a unique constraint violation.

**Why:** `serial` columns use a sequence object. Manual inserts with explicit ids don't advance the sequence.

## Fix
```sql
SELECT setval('organizations_id_seq', (SELECT MAX(id) FROM organizations));
```

Run this after any manual insert with an explicit id. The same pattern applies to any table with a serial PK: `setval('<table>_id_seq', (SELECT MAX(id) FROM <table>))`.

## Prevention
When seeding, prefer `ON CONFLICT DO NOTHING` combined with a follow-up `setval` call, or use `nextval` to get the next safe id before inserting.
