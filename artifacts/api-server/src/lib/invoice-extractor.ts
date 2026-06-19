import sharp from "sharp";
import { logger } from "./logger";
import { getActiveModel, recordUsage } from "../routes/admin-settings.js";
import { AVAILABLE_MODELS } from "@workspace/db";

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

// Prompt optimised for Arabic RTL auto-parts invoices.
// Explicitly names each column in the order they appear right-to-left,
// and gives concrete examples so the model does not swap columns.
const EXTRACTION_PROMPT = `You are an Arabic invoice OCR expert. Extract ALL line-item rows from this invoice image and output ONLY valid JSON — no markdown, no explanation, no preamble.

Output schema:
{
  "invoice_number": string,
  "supplier": string,
  "date": string,
  "items": [
    {
      "part_number": string,
      "description": string,
      "quantity": number,
      "unit": string,
      "unit_cost": number
    }
  ]
}

Field definitions:
- "part_number": The SKU / part code (رقم الصنف / رمز القطعة). This is an alphanumeric code that often contains hyphens, e.g. "92600-3HD7A-PROMISE" or "30210-3S4X0". Copy it EXACTLY as printed.
- "description": The item name/description (اسم الصنف). Copy exactly in Arabic or English.
- "quantity": How many units were purchased (الكمية / العدد). This is the COUNT column — a plain integer (e.g. 1, 2, 5). It is NEVER the part code and NEVER the price.
- "unit": Unit of measure (الوحدة), e.g. حبة / pcs / كرتون. Empty string if absent.
- "unit_cost": The price per single unit (السعر / سعر الوحدة). A decimal number.

IMPORTANT — Arabic invoices read RIGHT-TO-LEFT. Typical column order from RIGHT to LEFT is:
  رقم الصنف (part_number) | اسم الصنف (description) | الوحدة (unit) | الكمية (quantity) | السعر (unit_cost) | ...totals...

Rules:
- Map each table column to the correct field by reading its HEADER, not its position.
- Use Western digits (0-9) for all numbers.
- Do NOT skip any row — include every line item.
- Ignore stamps, signatures, QR codes, and totals/summary rows.
- date format: YYYY-MM-DD. Empty string if not found.
- If part_number column is absent, set part_number to "".`;

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

/** Returns true if the model supports response_format: json_object */
function modelSupportsJson(modelId: string): boolean {
  const meta = AVAILABLE_MODELS.find((m) => m.id === modelId);
  return meta?.supportsJson ?? false;
}

export async function extractInvoiceFromImage(
  imageBase64: string,
  mimeType: string,
  model?: string
): Promise<ExtractedInvoiceData> {
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

  // Only send response_format if the model explicitly supports it.
  // Sending it to Qwen models causes a 400 error and wastes a round-trip.
  const useJsonFormat = modelSupportsJson(activeModel);

  logger.info(
    { model: activeModel, imageKb: Math.round(imageBase64.length * 0.75 / 1024), useJsonFormat },
    "Calling OpenRouter Vision API"
  );

  const requestBody: Record<string, unknown> = {
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
  };

  if (useJsonFormat) {
    requestBody.response_format = { type: "json_object" };
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ruknauto.app",
      "X-Title": "RuknAuto Invoice Extractor",
    },
    body: JSON.stringify(requestBody),
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
    // Unexpected response_format rejection — fall back to raw mode
    if (response.status === 400 && text.includes("response_format")) {
      logger.warn({ model: activeModel }, "Unexpected response_format rejection, retrying without it");
      return _doExtractRaw(imageBase64, mimeType, activeModel, apiKey);
    }
    throw new Error(`فشل الاتصال بـ OpenRouter (${response.status}): ${text.slice(0, 300)}`);
  }

  const result = (await response.json()) as {
    choices?: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  if (!result.choices?.length) throw new Error("استجابة فارغة من OpenRouter");

  const tokIn = result.usage?.prompt_tokens ?? 0;
  const tokOut = result.usage?.completion_tokens ?? 0;
  recordUsage(tokIn, tokOut).catch(e => logger.warn({ e }, "recordUsage failed (non-critical)"));

  return parseModelResponse(result.choices[0].message.content);
}

// Raw mode: no response_format constraint (used for models that don't support it)
async function _doExtractRaw(
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
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  if (!result.choices?.length) throw new Error("استجابة فارغة من OpenRouter");

  const tokIn = result.usage?.prompt_tokens ?? 0;
  const tokOut = result.usage?.completion_tokens ?? 0;
  recordUsage(tokIn, tokOut).catch(e => logger.warn({ e }, "recordUsage failed (non-critical)"));

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
