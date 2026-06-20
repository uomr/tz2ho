import { db } from "@workspace/db";
import { partsTable } from "@workspace/db";
import { ilike, eq, sql, isNotNull, and, or, isNull, SQL } from "drizzle-orm";
import { logger } from "./logger";
import { generateEmbedding, generateEmbeddingsBatch, cosineSimilarity } from "./embedding-service";

const TRUST_THRESHOLD = 0.85;
const DEPT_BOOST_MAX = 0.15;

// ── نمرة Embedding التي يُعدّ فوقها المطابقة موثوقة ──
const VECTOR_TRUST = 0.82;
// ── نمرة Embedding الدنيا لاعتبار نتيجة مقبولة ──
const VECTOR_MIN = 0.60;

function normalizeArabic(text: string): string {
  if (!text) return "";
  let t = text.trim().toLowerCase();
  t = t.replace(/[.,\/#!$%\^\&\*;:{}=\-_`~()?\"'+-]/g, " ");
  t = t.replace(/[أإآ]/g, "ا");
  t = t.replace(/ة/g, "ه");
  t = t.replace(/ى/g, "ي");
  const words = t.split(/\s+/).map(w => {
    if (w.startsWith("ال") && w.length > 3) return w.substring(2);
    return w;
  }).filter(Boolean);
  return words.join(" ");
}

function extractViscosity(text: string): string | null {
  const match = text.toLowerCase().match(/\b\d+w\d+\b/);
  if (match) return match[0];
  const matchSlash = text.match(/\b\d+\/\d+\b/);
  if (matchSlash) return matchSlash[0].replace("/", "w");
  return null;
}

function fuzzyScore(a: string, b: string): number {
  if (!a || !b) return 0;
  const normA = normalizeArabic(a);
  const normB = normalizeArabic(b);
  const viscA = extractViscosity(a);
  const viscB = extractViscosity(b);
  if (viscA || viscB) {
    if (viscA !== viscB) return 0;
  }
  const wordsA = normA.split(" ").filter(Boolean);
  const wordsB = normB.split(" ").filter(Boolean);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  const jaccard = union > 0 ? intersection / union : 0;
  const bigrams = (s: string) => {
    const result: string[] = [];
    for (let i = 0; i < s.length - 1; i++) result.push(s.slice(i, i + 2));
    return result;
  };
  const bA = bigrams(normA);
  const bB = new Set(bigrams(normB));
  const bigramOverlap = bA.length > 0 ? bA.filter(bg => bB.has(bg)).length / bA.length : 0;
  return 0.4 * jaccard + 0.6 * bigramOverlap;
}

function calcDeptBoost(deptUsage: Record<string, number> | null | undefined, userDept: string | undefined): number {
  if (!userDept || !deptUsage || typeof deptUsage !== "object") return 0;
  const deptCount = deptUsage[userDept] ?? 0;
  const totalCount = Object.values(deptUsage).reduce((a, b) => a + b, 0);
  if (totalCount === 0 || deptCount === 0) return 0;
  return (deptCount / totalCount) * DEPT_BOOST_MAX;
}

export interface PartMatch {
  partNumber: string;
  originalPartNumber?: string | null;
  packFactor: number;
  confidence: number;
  matchedDescription: string;
  matchMethod: "exact" | "vector" | "fuzzy" | "partNumber";
}

/**
 * Hybrid Search:
 * 1. تطابق تام (نص)
 * 2. Vector similarity (cosine) — إذا توفّر embedding للوصف
 * 3. Fuzzy fallback (Jaccard + Bigram) — للأوصاف بدون embedding
 * النتيجة الأعلى تفوز، مع دعم إضافي للقسم.
 */
export async function lookupPartByDescription(description: string, orgId: number, userDept?: string): Promise<PartMatch | null> {
  const normDesc = normalizeArabic(description);
  if (!normDesc) return null;

  // نجلب السجلات ونرتّبها: سجلات المنظمة الخاصة أولاً، ثم العامة
  // هذا يضمن أن التصحيحات الخاصة بالمنظمة تتغلب على البيانات العامة القديمة
  const allParts = await db
    .select()
    .from(partsTable)
    .where(or(eq(partsTable.orgId, orgId), isNull(partsTable.orgId)))
    .orderBy(sql`CASE WHEN ${partsTable.orgId} = ${orgId} THEN 0 ELSE 1 END`);

  // 1. تطابق تام — مع الأولوية لسجلات المنظمة (مرتّبة مسبقاً)
  for (const part of allParts) {
    if (normalizeArabic(part.description) === normDesc) {
      return {
        partNumber: part.partNumber,
        originalPartNumber: part.originalPartNumber,
        packFactor: part.packFactor ?? 1,
        confidence: 1.0,
        matchedDescription: part.description,
        matchMethod: "exact",
      };
    }
  }

  // 2. Vector Search (Hybrid) — توليد embedding للوصف الجديد
  const queryEmbedding = await generateEmbedding(description);

  let vectorBest: PartMatch | null = null;
  let fuzzyBest: PartMatch | null = null;

  for (const part of allParts) {
    let boost = calcDeptBoost(part.deptUsage as Record<string, number>, userDept);
    // Add a boost for private memory to prioritize it over master catalog
    if (part.orgId === orgId) {
      boost += 0.05;
    }

    // Vector score
    if (queryEmbedding && Array.isArray(part.embedding) && part.embedding.length > 0) {
      const vecScore = cosineSimilarity(queryEmbedding, part.embedding as number[]);
      const finalVec = Math.min(1.0, vecScore + boost);
      if (vecScore >= VECTOR_MIN && (!vectorBest || finalVec > vectorBest.confidence)) {
        vectorBest = {
          partNumber: part.partNumber,
          originalPartNumber: part.originalPartNumber,
          packFactor: part.packFactor ?? 1,
          confidence: finalVec,
          matchedDescription: part.description,
          matchMethod: "vector",
        };
      }
    }

    // Fuzzy score
    const fuzz = fuzzyScore(description, part.description);
    const finalFuzz = Math.min(1.0, fuzz + boost);
    if (fuzz >= 0.55 && (!fuzzyBest || finalFuzz > fuzzyBest.confidence)) {
      fuzzyBest = {
        partNumber: part.partNumber,
        originalPartNumber: part.originalPartNumber,
        packFactor: part.packFactor ?? 1,
        confidence: finalFuzz,
        matchedDescription: part.description,
        matchMethod: "fuzzy",
      };
    }
  }

  // اختر الأعلى نقطة بين vector و fuzzy
  const candidates = [vectorBest, fuzzyBest].filter(Boolean) as PartMatch[];
  if (candidates.length === 0) return null;

  const best = candidates.reduce((a, b) => (a.confidence >= b.confidence ? a : b));

  logger.info(
    {
      description: description.slice(0, 40),
      method: best.matchMethod,
      confidence: Math.round(best.confidence * 100),
      partNumber: best.partNumber,
    },
    "Parts memory match"
  );

  return best;
}

export async function lookupPartByOriginalPartNumber(originalPartNumber: string, orgId: number): Promise<PartMatch | null> {
  if (!originalPartNumber || originalPartNumber.trim().length < 2) return null;
  const rawPart = originalPartNumber.trim().toLowerCase();

  // سجلات المنظمة أولاً، ثم العامة — لضمان أولوية التصحيحات الخاصة
  const allParts = await db
    .select()
    .from(partsTable)
    .where(or(eq(partsTable.orgId, orgId), isNull(partsTable.orgId)))
    .orderBy(sql`CASE WHEN ${partsTable.orgId} = ${orgId} THEN 0 ELSE 1 END`);

  for (const part of allParts) {
    const storedOrig = (part.originalPartNumber ?? "").trim().toLowerCase();
    const storedAppr = part.partNumber.trim().toLowerCase();
    if (storedOrig === rawPart || storedAppr === rawPart) {
      return {
        partNumber: part.partNumber,
        originalPartNumber: part.originalPartNumber,
        packFactor: part.packFactor ?? 1,
        confidence: 1.0,
        matchedDescription: part.description,
        matchMethod: "partNumber",
      };
    }
  }
  return null;
}

export async function enrichItemsWithMemory<T extends { partNumber?: string | null; description: string }>(
  items: T[],
  orgId: number,
  userDept?: string
): Promise<(T & {
  originalPartNumber?: string | null;
  packFactor?: number;
  memoryMatch: boolean;
  memoryConfidence: number | null;
  memoryMatchMethod?: string;
  needsManualInput: boolean;
})[]> {
  const results = [];
  for (const item of items) {
    const desc = item.description;
    const extPart = item.partNumber ? item.partNumber.trim() : null;

    let match: PartMatch | null = null;

    if (extPart) {
      match = await lookupPartByOriginalPartNumber(extPart, orgId);
    }

    if (!match && desc) {
      match = await lookupPartByDescription(desc, orgId, userDept);
    }

    if (match) {
      const isDifferent = extPart && extPart.toLowerCase() !== match.partNumber.toLowerCase();
      if (!extPart || (isDifferent && match.confidence >= 0.75)) {
        results.push({
          ...item,
          partNumber: match.partNumber,
          originalPartNumber: match.originalPartNumber || extPart,
          packFactor: match.packFactor,
          memoryMatch: true,
          memoryConfidence: Math.round(match.confidence * 100),
          memoryMatchMethod: match.matchMethod,
          needsManualInput: match.confidence < TRUST_THRESHOLD,
        });
      } else {
        results.push({
          ...item,
          originalPartNumber: match.originalPartNumber || extPart,
          packFactor: match.packFactor,
          memoryMatch: true,
          memoryConfidence: Math.round(match.confidence * 100),
          memoryMatchMethod: match.matchMethod,
          needsManualInput: isDifferent ? true : (match.confidence < TRUST_THRESHOLD),
        });
      }
    } else {
      results.push({
        ...item,
        originalPartNumber: extPart,
        packFactor: 1,
        memoryMatch: false,
        memoryConfidence: null,
        memoryMatchMethod: undefined,
        needsManualInput: !extPart,
      });
    }
  }
  return results;
}

export async function learnFromSavedInvoice(
  items: Array<{
    partNumber?: string | null;
    originalPartNumber?: string | null;
    description: string;
    packFactor?: number;
  }>,
  orgId: number,
  userDept?: string
): Promise<void> {
  for (const item of items) {
    if (!item.partNumber || !item.description || item.description.length < 3) continue;
    const appr = item.partNumber.trim();
    const orig = item.originalPartNumber ? item.originalPartNumber.trim() : appr;
    const factor = item.packFactor ?? 1;

    try {
      // نبحث أولاً عن سجل خاص بالمنظمة، ثم عن سجل عام (null org_id) للبيانات القديمة.
      // هذا يمنع إنشاء سجلات مكررة ويضمن تحديث البيانات القديمة بالتصحيح الصحيح.
      const orgFilter: SQL =
        orgId === null
          ? isNull(partsTable.orgId)
          : or(eq(partsTable.orgId, orgId), isNull(partsTable.orgId))!;

      const existing = await db
        .select()
        .from(partsTable)
        .where(and(ilike(partsTable.description, item.description), orgFilter))
        .orderBy(
          // الأولوية: سجل المنظمة أولاً، السجل العام ثانياً
          sql`CASE WHEN ${partsTable.orgId} IS NOT DISTINCT FROM ${orgId} THEN 0 ELSE 1 END`
        )
        .limit(1);

      // توليد embedding للوصف الجديد
      const embedding = await generateEmbedding(item.description);

      if (existing.length > 0) {
        const stored = existing[0];
        const currentDeptUsage = (stored.deptUsage as Record<string, number>) ?? {};
        if (userDept) {
          currentDeptUsage[userDept] = (currentDeptUsage[userDept] ?? 0) + 1;
        }

        const updateData: Record<string, unknown> = {
          partNumber: appr,
          originalPartNumber: orig,
          packFactor: factor,
          usageCount: stored.usageCount + 1,
          deptUsage: currentDeptUsage,
        };

        // إذا كان السجل القديم بدون orgId (بيانات قديمة)، نعيّن له orgId الحالي
        // حتى يُعامَل كسجل خاص بالمنظمة في عمليات البحث القادمة
        if (stored.orgId === null && orgId !== null) {
          updateData.orgId = orgId;
        }

        // تحديث embedding فقط إذا لم يكن موجوداً أو تولّد جديد
        if (embedding && (!stored.embedding || (stored.embedding as number[]).length === 0)) {
          updateData.embedding = sql`${JSON.stringify(embedding)}::vector`;
        }

        await db
          .update(partsTable)
          .set(updateData as any)
          .where(eq(partsTable.id, stored.id));

        logger.info(
          { description: item.description, approved: appr, orgId, wasGlobal: stored.orgId === null, dept: userDept, hasEmbedding: !!embedding },
          "Updated smart part mapping"
        );
      } else {
        const insertData: Record<string, unknown> = {
          description: item.description,
          partNumber: appr,
          originalPartNumber: orig,
          packFactor: factor,
          usageCount: 1,
          deptUsage: userDept ? { [userDept]: 1 } : {},
          orgId,
        };

        if (embedding) {
          insertData.embedding = sql`${JSON.stringify(embedding)}::vector`;
        }

        await db.insert(partsTable).values(insertData as any);
        logger.info(
          { description: item.description, approved: appr, dept: userDept, hasEmbedding: !!embedding },
          "Learned new smart part mapping"
        );
      }
    } catch (err) {
      logger.warn({ err, description: item.description }, "Failed to learn smart part mapping");
    }
  }
}

/**
 * يُعيد بناء embeddings لجميع القطع التي ليس لها embedding بعد
 * يُستدعى من admin API
 */
export async function rebuildMissingEmbeddings(): Promise<{ total: number; built: number; failed: number }> {
  const partsWithoutEmbedding = await db
    .select({ id: partsTable.id, description: partsTable.description })
    .from(partsTable)
    .where(sql`${partsTable.embedding} IS NULL`);

  if (partsWithoutEmbedding.length === 0) {
    return { total: 0, built: 0, failed: 0 };
  }

  logger.info({ count: partsWithoutEmbedding.length }, "Rebuilding embeddings for parts without vectors");

  // معالجة على دفعات لتفادي timeout
  const BATCH = 20;
  let built = 0;
  let failed = 0;

  for (let i = 0; i < partsWithoutEmbedding.length; i += BATCH) {
    const batch = partsWithoutEmbedding.slice(i, i + BATCH);
    const descriptions = batch.map(p => p.description);
    const embeddings = await generateEmbeddingsBatch(descriptions);

    for (let j = 0; j < batch.length; j++) {
      const part = batch[j];
      const embedding = embeddings[j];
      if (!embedding) { failed++; continue; }
      try {
        await db
          .update(partsTable)
          .set({ embedding: sql`${JSON.stringify(embedding)}::vector` } as any)
          .where(eq(partsTable.id, part.id));
        built++;
      } catch (err) {
        logger.warn({ err, partId: part.id }, "Failed to store embedding");
        failed++;
      }
    }
  }

  logger.info({ total: partsWithoutEmbedding.length, built, failed }, "Embedding rebuild complete");
  return { total: partsWithoutEmbedding.length, built, failed };
}
