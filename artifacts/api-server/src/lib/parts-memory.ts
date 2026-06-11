import { db } from "@workspace/db";
import { partsTable } from "@workspace/db";
import { ilike, eq } from "drizzle-orm";
import { logger } from "./logger";

const TRUST_THRESHOLD = 0.85;

// أقصى boost سياقي = 15% (لا يكسر نتيجة نصية قوية)
const DEPT_BOOST_MAX = 0.15;

function normalizeArabic(text: string): string {
  if (!text) return "";
  let t = text.trim().toLowerCase();

  t = t.replace(/[.,\/#!$%\^\&\*;:{}=\-_`~()?\"'+-]/g, " ");

  t = t.replace(/[أإآ]/g, "ا");
  t = t.replace(/ة/g, "ه");
  t = t.replace(/ى/g, "ي");

  const words = t.split(/\s+/).map(w => {
    if (w.startsWith("ال") && w.length > 3) {
      return w.substring(2);
    }
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

function similarity(a: string, b: string): number {
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

/** يحسب نقاط boost للقطعة بناءً على تاريخ استخدامها في قسم المستخدم */
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
}

export async function lookupPartByDescription(description: string, userDept?: string): Promise<PartMatch | null> {
  const normDesc = normalizeArabic(description);
  if (!normDesc) return null;

  const allParts = await db.select().from(partsTable);

  // Try exact normalized match first
  for (const part of allParts) {
    if (normalizeArabic(part.description) === normDesc) {
      return {
        partNumber: part.partNumber,
        originalPartNumber: part.originalPartNumber,
        packFactor: part.packFactor ?? 1,
        confidence: 1.0,
        matchedDescription: part.description,
      };
    }
  }

  // Fuzzy search with department context boost
  let best: PartMatch | null = null;
  for (const part of allParts) {
    const baseScore = similarity(description, part.description);
    const boost = calcDeptBoost(part.deptUsage as Record<string, number>, userDept);
    const finalScore = Math.min(1.0, baseScore + boost);

    if (baseScore >= 0.55 && (!best || finalScore > best.confidence)) {
      best = {
        partNumber: part.partNumber,
        originalPartNumber: part.originalPartNumber,
        packFactor: part.packFactor ?? 1,
        confidence: finalScore,
        matchedDescription: part.description,
      };
    }
  }

  return best;
}

export async function lookupPartByOriginalPartNumber(originalPartNumber: string): Promise<PartMatch | null> {
  if (!originalPartNumber || originalPartNumber.trim().length < 2) return null;
  const rawPart = originalPartNumber.trim().toLowerCase();

  const allParts = await db.select().from(partsTable);
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
      };
    }
  }

  return null;
}

export async function enrichItemsWithMemory<T extends { partNumber?: string | null; description: string }>(
  items: T[],
  userDept?: string
): Promise<(T & {
  originalPartNumber?: string | null;
  packFactor?: number;
  memoryMatch: boolean;
  memoryConfidence: number | null;
  needsManualInput: boolean
})[]> {
  const results = [];
  for (const item of items) {
    const desc = item.description;
    const extPart = item.partNumber ? item.partNumber.trim() : null;

    let match: PartMatch | null = null;

    if (extPart) {
      match = await lookupPartByOriginalPartNumber(extPart);
    }

    if (!match && desc) {
      match = await lookupPartByDescription(desc, userDept);
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
          needsManualInput: match.confidence < TRUST_THRESHOLD,
        });
      } else {
        results.push({
          ...item,
          originalPartNumber: match.originalPartNumber || extPart,
          packFactor: match.packFactor,
          memoryMatch: true,
          memoryConfidence: Math.round(match.confidence * 100),
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
  userDept?: string
): Promise<void> {
  for (const item of items) {
    if (!item.partNumber || !item.description || item.description.length < 3) continue;
    const appr = item.partNumber.trim();
    const orig = item.originalPartNumber ? item.originalPartNumber.trim() : appr;
    const factor = item.packFactor ?? 1;

    try {
      const existing = await db
        .select()
        .from(partsTable)
        .where(ilike(partsTable.description, item.description))
        .limit(1);

      if (existing.length > 0) {
        const stored = existing[0];
        const currentDeptUsage = (stored.deptUsage as Record<string, number>) ?? {};
        if (userDept) {
          currentDeptUsage[userDept] = (currentDeptUsage[userDept] ?? 0) + 1;
        }

        await db
          .update(partsTable)
          .set({
            partNumber: appr,
            originalPartNumber: orig,
            packFactor: factor,
            usageCount: stored.usageCount + 1,
            deptUsage: currentDeptUsage,
          })
          .where(eq(partsTable.id, stored.id));

        logger.info(
          { description: item.description, approved: appr, dept: userDept },
          "Updated smart part mapping with dept context"
        );
      } else {
        const deptUsage: Record<string, number> = {};
        if (userDept) deptUsage[userDept] = 1;

        await db.insert(partsTable).values({
          description: item.description,
          partNumber: appr,
          originalPartNumber: orig,
          packFactor: factor,
          usageCount: 1,
          deptUsage,
        });
        logger.info(
          { description: item.description, approved: appr, dept: userDept },
          "Learned new smart part mapping"
        );
      }
    } catch (err) {
      logger.warn({ err, description: item.description }, "Failed to learn smart part mapping");
    }
  }
}
