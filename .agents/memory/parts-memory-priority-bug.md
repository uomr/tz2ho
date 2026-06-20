---
name: Parts Memory — org priority bug
description: Root cause of corrections not being remembered; fix for org_id priority in lookup and learning.
---

## The Bug

`lookupPartByDescription` and `lookupPartByOriginalPartNumber` fetched records with
`WHERE org_id = ? OR org_id IS NULL` but with NO ORDER BY — so PostgreSQL could return
the old global (null org_id) record first, overriding the user's saved correction.

`learnFromSavedInvoice` searched only `WHERE org_id = ?`, so it never found old global
records → inserted a DUPLICATE new record → old wrong global record still returned first.

## The Fix (applied 2026-06-20)

1. **lookupPartByDescription** and **lookupPartByOriginalPartNumber**: Added
   `ORDER BY CASE WHEN org_id = ? THEN 0 ELSE 1 END` so org-specific records always win.

2. **learnFromSavedInvoice**: Changed orgFilter to include `OR org_id IS NULL` so old
   global records are found and UPDATED (not duplicated). Also added ORDER BY org priority
   so the org-specific record is preferred if both exist.

3. **Bonus**: When updating a null-orgId record, set `orgId = currentOrg` to "claim" it
   as org-specific so future lookups always prioritize it.

**Why:** System was migrated from single-tenant (all parts have null org_id) to
multi-tenant (users have org_id). Old data had null org_id. New corrections were saved
with correct org_id but old wrong data kept winning the lookup race.
