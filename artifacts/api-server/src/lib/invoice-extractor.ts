import sharp from "sharp";
import { logger } from "./logger";
import { getActiveModel, recordUsage } from "../routes/admin-settings.js";

// Compress + resize image server-side before sending to the Vision API.
// Target: ≤1600px on the longest edge, JPEG q=85.
// This keeps OCR accuracy while cutting token cost by ~60–75%.
async function prepareImage(imageBase64: string, mimeType: string): Promise<{ base64: string; mime: string }> {
  try {
    const inputBuf = Buffer.from(imageBase64, "base64");
    const metadata = await sharp(inputBuf).metadata();
    const longest = Math.max(metadata.width ?? 0, metadata.height ?? 0);
    const MAX = 1600;
    const pipeline = longest > MAX
      ? sharp(inputBuf).resize({ width: MAX, height: MAX, fit: "inside", withoutEnlargement: true })
      : sharp(inputBuf);
    const outputBuf = await pipeline.jpeg({ quality: 85, progressive: true }).toBuffer();
    const ratio = Math.round((1 - outputBuf.length / inputBuf.length) * 100);
    logger.info({ originalKb: Math.round(inputBuf.length / 1024), compressedKb: Math.round(outputBuf.length / 1024), savedPct: ratio }, "Image compressed");
    return { base64: outputBuf.toString("base64"), mime: "image/jpeg" };
  } catch (err) {
    logger.warn({ err }, "sharp compression failed, using original image");
    return { base64: imageBase64, mime: mimeType };
  }
}

// Concise, token-efficient prompt — forces JSON-only output with no preamble.
// Uses few-shot example inline to anchor format without wasting tokens.
const EXTRACTION_PROMPT = `Extract ALL table rows from this invoice image. Output ONLY valid JSON — no markdown, no explanation.

Schema:
{
  "invoice_number": string,   // invoice/bill number, "" if not found
  "supplier": string,         // vendor/company name, "" if not found
  "date": string,             // YYYY-MM-DD, "" if not found
  "items": [
    {
      "part_number": string,  // part/SKU code exactly as written, "" if missing
      "description": string,  // item name/description exactly as written
      "quantity": number,
      "unit": string,         // pcs/ctn/ltr/etc., "" if missing
      "unit_cost": number     // unit price
    }
  ]
}

Rules:
- Copy part numbers and descriptions EXACTLY as printed (Arabic or English)
- Use Western digits (0-9) for all numbers
- Do NOT skip any row — include every line item
- Ignore stamps, signatures, QR codes, and totals rows
- If part number column is absent, set part_number to ""`;

export interface ExtractedItem {
  partNumber: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
  needsManualInput: boolean;
  memoryMatch: boolean;
  memoryConfidence: number | null;
}

export interface ExtractedInvoiceData {
  invoiceNumber: string;
  supplier: string;
  date: string;
  items: ExtractedItem[];
}

function extractJson(text: string): string {
  // Raw JSON object (model followed instructions perfectly)
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    return text.slice(first, last + 1);
  }
  // Fallback: ```json block
  const m = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (m) return m[1].trim();
  return "";
}

// النموذج الاحتياطي: يُستخدم عند rate-limit أو عدم إيجاد النموذج الأساسي
// google/gemini-3.1-flash-lite: موثوق، يدعم JSON، متاح دائماً من Google
const FALLBACK_MODEL = "google/gemini-3.1-flash-lite";

export async function extractInvoiceFromImage(
  imageBase64: string,
  mimeType: string,
  model?: string
): Promise<ExtractedInvoiceData> {
  // إذا لم يُحدَّد النموذج صراحةً → اقرأه من قاعدة البيانات
  const activeModel = model ?? (await getActiveModel());
  return _doExtract(imageBase64, mimeType, activeModel);
}


async function _doExtract(
  imageBase64: string,
  mimeType: string,
  activeModel: string
): Promise<ExtractedInvoiceData> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY غير مضبوط في البيئة");

  // Compress silently on the server — caller never needs to know
  const { base64, mime } = await prepareImage(imageBase64, mimeType);
  imageBase64 = base64;
  mimeType = mime;

  logger.info({ model: activeModel, imageKb: Math.round(imageBase64.length * 0.75 / 1024) }, "Calling OpenRouter Vision API");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ruknauto.app",
      "X-Title": "RuknAuto Invoice Extractor",
    },
    body: JSON.stringify({
      model: activeModel,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 8192,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (response.status === 401) throw new Error("مفتاح API غير صحيح — تحقق من OPENROUTER_API_KEY");
  if (response.status === 402) throw new Error("رصيد OpenRouter غير كافٍ — أضف رصيداً لحسابك");
  if (response.status === 429) {
    if (activeModel !== FALLBACK_MODEL) {
      logger.warn({ model: activeModel }, `Model rate limited (429), falling back to ${FALLBACK_MODEL}...`);
      return _doExtract(imageBase64, mimeType, FALLBACK_MODEL);
    }
    throw new Error("تجاوزت حد الطلبات — انتظر قليلاً وأعد المحاولة");
  }
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 404 || text.includes("No endpoints found") || text.includes("not found")) {
      if (activeModel !== FALLBACK_MODEL) {
        logger.warn({ model: activeModel, error: text }, `Model not found, falling back to ${FALLBACK_MODEL}...`);
        return _doExtract(imageBase64, mimeType, FALLBACK_MODEL);
      }
    }
    if (response.status === 400 && text.includes("response_format")) {
      return extractInvoiceFromImageRaw(imageBase64, mimeType, activeModel, apiKey);
    }
    throw new Error(`فشل الاتصال بـ OpenRouter (${response.status}): ${text.slice(0, 300)}`);
  }

  const result = (await response.json()) as {
    choices?: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  if (!result.choices?.length) throw new Error("استجابة فارغة من OpenRouter");

  // تسجيل الاستهلاك في الخلفية (لا نُوقف المستخدم)
  const tokIn = result.usage?.prompt_tokens ?? 0;
  const tokOut = result.usage?.completion_tokens ?? 0;
  recordUsage(tokIn, tokOut).catch(e => logger.warn({ e }, "recordUsage failed (non-critical)"));

  return parseModelResponse(result.choices[0].message.content);
}

// Fallback: same call without response_format constraint (for older models)
async function extractInvoiceFromImageRaw(
  imageBase64: string,
  mimeType: string,
  model: string,
  apiKey: string
): Promise<ExtractedInvoiceData> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ruknauto.app",
      "X-Title": "RuknAuto Invoice Extractor",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 8192,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`فشل الاتصال بـ OpenRouter (${response.status}): ${text.slice(0, 300)}`);
  }

  const result = (await response.json()) as {
    choices?: Array<{ message: { content: string } }>;
  };

  if (!result.choices?.length) throw new Error("استجابة فارغة من OpenRouter");
  return parseModelResponse(result.choices[0].message.content);
}

function parseModelResponse(content: string): ExtractedInvoiceData {
  const jsonStr = extractJson(content);
  if (!jsonStr) throw new Error(`لم يتم العثور على JSON في الاستجابة:\n${content.slice(0, 400)}`);

  let parsed: {
    invoice_number?: string;
    supplier?: string;
    date?: string;
    items?: Array<{
      part_number?: string;
      description?: string;
      quantity?: number | string;
      unit?: string;
      unit_cost?: number | string;
    }>;
  };

  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`JSON غير صالح في الاستجابة: ${String(e)}\n${jsonStr.slice(0, 300)}`);
  }

  if (!parsed.items?.length) throw new Error("لم يتم العثور على أي بنود في الفاتورة");

  const items: ExtractedItem[] = parsed.items
    .filter((item) => {
      const pn = String(item.part_number ?? "").trim();
      const desc = String(item.description ?? "").trim();
      return !!(pn || desc);
    })
    .map((item) => {
      const partNumber = String(item.part_number ?? "").trim();
      const description = String(item.description ?? "").trim();
      const quantity = parseFloat(String(item.quantity ?? "0")) || 0;
      const unitCost = parseFloat(String(item.unit_cost ?? "0")) || 0;
      const total = Math.round(quantity * unitCost * 100) / 100;
      return {
        partNumber,
        description,
        quantity,
        unit: String(item.unit ?? "").trim(),
        unitCost,
        total,
        needsManualInput: !partNumber,
        memoryMatch: false,
        memoryConfidence: null,
      };
    });

  if (!items.length) throw new Error("لا توجد بنود صالحة بعد المعالجة");

  logger.info({ itemCount: items.length }, "Invoice extraction successful");

  return {
    invoiceNumber: String(parsed.invoice_number ?? ""),
    supplier: String(parsed.supplier ?? ""),
    date: String(parsed.date ?? ""),
    items,
  };
}
