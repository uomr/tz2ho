import { logger } from "./logger";

const EMBEDDING_MODEL = "google/gemini-2.0-flash-lite";
const EMBEDDING_DIM = 768;

function normalizeArabicForEmbedding(text: string): string {
  if (!text) return "";
  let t = text.trim();
  t = t.replace(/[أإآ]/g, "ا");
  t = t.replace(/ة/g, "ه");
  t = t.replace(/ى/g, "ي");
  t = t.replace(/[.,\/#!$%\^\&\*;:{}=\-_`~()?\"'+-]/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    logger.warn("OPENROUTER_API_KEY not set — skipping embedding generation");
    return null;
  }

  const normalizedText = normalizeArabicForEmbedding(text);
  if (!normalizedText) return null;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ruknauto.app",
        "X-Title": "RuknAuto Parts Memory",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: normalizedText,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.warn({ status: response.status, text: text.slice(0, 200) }, "Embedding API error — skipping");
      return null;
    }

    const result = (await response.json()) as {
      data?: Array<{ embedding: number[] }>;
    };

    const embedding = result.data?.[0]?.embedding;
    if (!embedding || !Array.isArray(embedding)) {
      logger.warn("Invalid embedding response shape");
      return null;
    }

    return embedding;
  } catch (err) {
    logger.warn({ err }, "Embedding generation failed — falling back to fuzzy only");
    return null;
  }
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<(number[] | null)[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return texts.map(() => null);

  const normalized = texts.map(normalizeArabicForEmbedding);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ruknauto.app",
        "X-Title": "RuknAuto Parts Memory",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: normalized,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, "Batch embedding API error");
      return texts.map(() => null);
    }

    const result = (await response.json()) as {
      data?: Array<{ embedding: number[]; index: number }>;
    };

    if (!result.data) return texts.map(() => null);

    const embeddings: (number[] | null)[] = texts.map(() => null);
    for (const item of result.data) {
      if (typeof item.index === "number" && Array.isArray(item.embedding)) {
        embeddings[item.index] = item.embedding;
      }
    }
    return embeddings;
  } catch (err) {
    logger.warn({ err }, "Batch embedding generation failed");
    return texts.map(() => null);
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export { EMBEDDING_DIM };
