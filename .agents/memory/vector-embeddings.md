---
name: Vector Embeddings for Parts Memory
description: How pgvector + hybrid search is wired into the parts memory system
---

# Vector Embeddings — Parts Memory

## What was done
- pgvector extension enabled in PostgreSQL
- `embedding vector(768)` column added to `parts` table via raw SQL (ALTER TABLE)
- HNSW index created: `CREATE INDEX parts_embedding_idx ON parts USING hnsw (embedding vector_cosine_ops)`
- `lib/db/src/schema/parts.ts` uses a `customType` (not pgvector/drizzle-orm) because pgvector's drizzle export is not bundled by esbuild

## Architecture
- `embedding-service.ts` — calls OpenRouter `/v1/embeddings` with `google/gemini-2.0-flash-lite`, dim=768
- `parts-memory.ts` — Hybrid Search: exact → vector cosine → fuzzy (Jaccard+Bigram) fallback
- `VECTOR_MIN = 0.60`, `VECTOR_TRUST = 0.82`, `TRUST_THRESHOLD = 0.85`
- `learnFromSavedInvoice` auto-generates embedding on every new part saved
- `rebuildMissingEmbeddings()` batch rebuilds parts without embeddings (batch size 20)
- Admin endpoint: `POST /api/admin/rebuild-embeddings` (requireAdmin)

## Why customType not pgvector/drizzle-orm
pgvector package does not export `./drizzle-orm` in its package.json exports map — esbuild fails to resolve it. Use `customType` from drizzle-orm/pg-core with `vector(768)` dataType string and JSON stringify/parse for toDriver/fromDriver.

## Embedding stored as raw SQL
When inserting/updating embeddings use: `sql\`${JSON.stringify(embedding)}::vector\`` cast — drizzle's customType toDriver does not get called on update/insert in all cases.
