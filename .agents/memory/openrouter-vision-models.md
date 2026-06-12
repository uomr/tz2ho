---
name: OpenRouter Vision Models for Arabic OCR
description: Verified 6 models on OpenRouter for Arabic invoice OCR — confirmed IDs, real pricing, and selection rationale as of 2026-06-12
---

# Verified Models for Arabic Invoice OCR (2026-06-12)

## Confirmed AVAILABLE_MODELS (lib/db/src/schema/settings.ts)

| Model ID | Price In /1K | Price Out /1K | Context | JSON |
|---|---|---|---|---|
| qwen/qwen3.5-flash-02-23 | $0.000065 | $0.000260 | 1M | No |
| qwen/qwen3-vl-8b-instruct | $0.000080 | $0.000500 | 256K | No |
| qwen/qwen3-vl-32b-instruct | $0.000104 | $0.000416 | 262K | No |
| qwen/qwen3-vl-30b-a3b-instruct | $0.000130 | $0.000520 | 262K | No |
| google/gemini-3.1-flash-lite | $0.000250 | $0.001500 | 1M | Yes |
| google/gemini-3.5-flash | $0.001500 | $0.009000 | 1M | Yes |

## FALLBACK_MODEL
`google/gemini-3.1-flash-lite` — kept as fallback (JSON native, stable, Google)

## DEFAULT_MODEL_ID
`qwen/qwen3-vl-32b-instruct` — best Arabic OCR quality at reasonable cost

## Removed (outdated/wrong IDs — not in OpenRouter catalog)
- `google/gemini-2.0-flash-lite` — NOT FOUND (removed from OpenRouter)
- `google/gemini-2.5-flash-preview-05-20` — NOT FOUND (preview expired)

## Pricing corrections from original code
- `google/gemini-3.1-flash-lite`: was $0.0001/1K in code, actual $0.00025 (2.5x higher)
- `qwen/qwen3-vl-32b-instruct`: was $0.0004/1K in code, actual $0.000104 (4x cheaper)

**Why:** Prices verified directly from OpenRouter /api/v1/models endpoint. Always re-verify before updating.
