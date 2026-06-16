import { Router, type IRouter } from "express";
import { spawn, execSync } from "child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// مجلد api-server — يعمل سواء شغّلنا من dist/ أو src/
const __apiDir = typeof __dirname !== "undefined"
  ? path.resolve(__dirname, "..")
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
import { db } from "@workspace/db";
import { invoicesTable, invoiceItemsTable, activityTable } from "@workspace/db";
import { eq, desc, sql, inArray, ne, and } from "drizzle-orm";
import {
  ExtractInvoiceBody,
  SaveInvoiceBody,
  GetInvoiceParams,
  DeleteInvoiceParams,
  SaveInvoiceParams,
} from "@workspace/api-zod";
import { extractInvoiceFromImage } from "../lib/invoice-extractor";
import { enrichItemsWithMemory, learnFromSavedInvoice } from "../lib/parts-memory";
import { storageService } from "../lib/storage-service.js";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

// Store active Python RPA processes by invoice ID (includes stdin pipe for interactive correction)
const activeProcesses = new Map<number, { proc: any; stdin: any }>();

router.get("/invoices", requireAuth, async (req, res): Promise<void> => {
  const isSuperAdmin = req.user?.role === "superadmin";
  const orgId = req.user?.orgId ?? null;

  const invoices = await db
    .select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      supplier: invoicesTable.supplier,
      date: invoicesTable.date,
      status: invoicesTable.status,
      totalAmount: invoicesTable.totalAmount,
      itemCount: invoicesTable.itemCount,
      createdAt: invoicesTable.createdAt,
    })
    .from(invoicesTable)
    .where(
      and(
        isSuperAdmin ? undefined : (orgId === null ? sql`1=0` : eq(invoicesTable.orgId, orgId)),
        ne(invoicesTable.status, "pending")
      )
    )
    .orderBy(desc(invoicesTable.createdAt));

  if (invoices.length === 0) {
    res.json([]);
    return;
  }

  const invoiceIds = invoices.map((inv) => inv.id);

  // Batch fetch all items for the returned invoices in a single query
  const allItems = await db
    .select()
    .from(invoiceItemsTable)
    .where(inArray(invoiceItemsTable.invoiceId, invoiceIds));

  // Group items by invoiceId in memory
  const itemsByInvoiceId = allItems.reduce((acc, item) => {
    if (!acc[item.invoiceId]) {
      acc[item.invoiceId] = [];
    }
    acc[item.invoiceId].push(item);
    return acc;
  }, {} as Record<number, typeof allItems>);

  const result = invoices.map((inv) => ({
    ...inv,
    items: itemsByInvoiceId[inv.id] || [],
  }));

  res.json(result);
});

router.post("/invoices/extract", requireAuth, async (req, res): Promise<void> => {
  const parsed = ExtractInvoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { imageBase64, mimeType, model } = parsed.data;

  let extractedData;
  try {
    extractedData = await extractInvoiceFromImage(imageBase64, mimeType, model ?? undefined);
  } catch (err) {
    req.log.error({ err }, "Invoice extraction failed");
    console.log("BASE64 ERROR:", Buffer.from(String((err as Error).message)).toString('base64'));
    res.status(500).json({ error: String((err as Error).message) });
    return;
  }

  // Enrich with parts memory
  const enrichedItems = await enrichItemsWithMemory(extractedData.items, req.user!.orgId!);

  // Create pending invoice record
  const totalAmount = enrichedItems.reduce((sum, item) => sum + (item.total ?? 0), 0);

  // ── رفع الصورة إلى Object Storage بدلاً من تخزين base64 في DB ──
  let imageUrl: string | null = null;
  let legacyBase64: string | null = null;
  try {
    const uploaded = await storageService.uploadBase64(imageBase64, mimeType ?? "image/jpeg");
    imageUrl = uploaded.url;
  } catch (uploadErr) {
    // في حال فشل التخزين: نحتفظ بـ base64 كـ fallback
    req.log.warn({ uploadErr }, "Storage upload failed — falling back to base64");
    legacyBase64 = imageBase64;
  }

  const [invoice] = await db
    .insert(invoicesTable)
    .values({
      invoiceNumber: extractedData.invoiceNumber || null,
      supplier:      extractedData.supplier || null,
      date:          extractedData.date || null,
      status:        "pending",
      imageBase64:   legacyBase64,
      imageUrl,
      totalAmount,
      itemCount:     enrichedItems.length,
      createdBy:     req.user?.userId ?? null,
      department:    req.user?.department ?? null,
      orgId:         req.user?.orgId ?? null,
    })
    .returning();

  // Insert items
  if (enrichedItems.length > 0) {
    await db.insert(invoiceItemsTable).values(
      enrichedItems.map((item) => ({
        invoiceId: invoice.id,
        partNumber: item.partNumber || null,
        originalPartNumber: item.originalPartNumber || null,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit || null,
        unitCost: item.unitCost,
        total: item.total,
        packFactor: item.packFactor ?? 1,
        memoryMatch: item.memoryMatch,
        memoryConfidence: item.memoryConfidence,
        needsManualInput: item.needsManualInput,
      }))
    );
  }

  // Log activity
  await db.insert(activityTable).values({
    type: "extract",
    description: `تم استخراج فاتورة "${extractedData.supplier || "غير محدد"}" — ${enrichedItems.length} بند`,
  });

  const items = await db
    .select()
    .from(invoiceItemsTable)
    .where(eq(invoiceItemsTable.invoiceId, invoice.id));

  res.json({
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    supplier: invoice.supplier,
    date: invoice.date,
    items,
  });
});

router.get("/invoices/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetInvoiceParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const isSuperAdmin = req.user?.role === "superadmin";
  const orgId = req.user?.orgId ?? null;

  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(
        isSuperAdmin
          ? eq(invoicesTable.id, params.data.id)
          : and(eq(invoicesTable.id, params.data.id), orgId === null ? sql`1=0` : eq(invoicesTable.orgId, orgId))
    );

  if (!invoice) {
    res.status(404).json({ error: "الفاتورة غير موجودة" });
    return;
  }

  const items = await db
    .select()
    .from(invoiceItemsTable)
    .where(eq(invoiceItemsTable.invoiceId, invoice.id));

  // إعادة الصورة: imageUrl إن وُجد، وإلا imageBase64 كـ fallback
  const { imageBase64: _b64, ...invoiceWithoutB64 } = invoice;
  res.json({
    ...invoiceWithoutB64,
    imageBase64: invoice.imageUrl ? undefined : invoice.imageBase64,
    items,
  });
});

// ── تنظيف جميع الفواتير المعلقة للمستخدم الحالي ──
// يُستدعى عند إلغاء الاستخراج لضمان عدم بقاء فواتير شبحية
// ⚠️ يجب أن يكون قبل DELETE /invoices/:id حتى لا يطابق Express "cleanup-pending" كـ :id
router.delete("/invoices/cleanup-pending", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) {
    // إذا لم يكن هناك مستخدم، نحذف كل المعلقة (fallback)
    const deleted = await db.delete(invoicesTable)
      .where(eq(invoicesTable.status, "pending"))
      .returning({ id: invoicesTable.id });
    res.json({ deleted: deleted.length });
    return;
  }

  const deleted = await db.delete(invoicesTable)
    .where(
      and(
        eq(invoicesTable.status, "pending"),
        eq(invoicesTable.createdBy, userId)
      )
    )
    .returning({ id: invoicesTable.id });

  res.json({ deleted: deleted.length });
});

router.delete("/invoices/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteInvoiceParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const isSuperAdmin = req.user?.role === "superadmin";
  const orgId = req.user?.orgId ?? null;

  await db.delete(invoicesTable).where(
    isSuperAdmin
      ? eq(invoicesTable.id, params.data.id)
      : and(eq(invoicesTable.id, params.data.id), orgId === null ? sql`1=0` : eq(invoicesTable.orgId, orgId))
  );
  res.sendStatus(204);
});

router.post("/invoices/:id/save", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = SaveInvoiceParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = SaveInvoiceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { invoiceNumber, supplier, date, items } = body.data;

  // Check for duplicate invoice number (among already-saved invoices, excluding current one)
  if (invoiceNumber && invoiceNumber.trim()) {
    const [duplicate] = await db
      .select({ id: invoicesTable.id, supplier: invoicesTable.supplier, itemCount: invoicesTable.itemCount })
      .from(invoicesTable)
      .where(
        sql`${invoicesTable.invoiceNumber} = ${invoiceNumber.trim()}
            AND ${invoicesTable.id} != ${params.data.id}
            AND ${invoicesTable.status} != 'pending'`
      )
      .limit(1);

    if (duplicate) {
      res.status(409).json({
        error: `رقم الفاتورة «${invoiceNumber}» موجود مسبقاً (${duplicate.supplier || "مورد غير محدد"} — ${duplicate.itemCount || 0} بند)`,
        duplicateId: duplicate.id,
      });
      return;
    }
  }

  // Update invoice + replace items — في عملية ذرّية واحدة
  const invoice = await db.transaction(async (tx) => {
    const [inv] = await tx
      .update(invoicesTable)
      .set({
        invoiceNumber: invoiceNumber || null,
        supplier: supplier || null,
        date: date || null,
        status: "saved",
        totalAmount: items.reduce((s: any, i: any) => s + (i.total ?? 0), 0),
        itemCount: items.length,
      })
      .where(eq(invoicesTable.id, params.data.id))
      .returning();

    if (!inv) return null;

    await tx.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, inv.id));

    if (items.length > 0) {
      await tx.insert(invoiceItemsTable).values(
        items.map((item: any) => ({
          invoiceId: inv.id,
          partNumber: item.partNumber ?? null,
          originalPartNumber: item.originalPartNumber ?? null,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit ?? null,
          unitCost: item.unitCost,
          total: item.total ?? item.quantity * item.unitCost,
          packFactor: item.packFactor ?? 1,
          memoryMatch: item.memoryMatch ?? false,
          memoryConfidence: item.memoryConfidence ?? null,
          needsManualInput: item.needsManualInput ?? false,
        }))
      );
    }

    return inv;
  });

  if (!invoice) {
    res.status(404).json({ error: "الفاتورة غير موجودة" });
    return;
  }

  // Learn from confirmed data
  await learnFromSavedInvoice(
    items.map((i: any) => ({ 
      partNumber: i.partNumber ?? null, 
      originalPartNumber: i.originalPartNumber ?? null,
      description: i.description,
      packFactor: i.packFactor ?? 1
    })),
    req.user!.orgId!
  );

  // Log activity
  await db.insert(activityTable).values({
    type: "save",
    description: `تم حفظ فاتورة "${supplier || invoice.supplier || "غير محدد"}" — ${items.length} بند`,
  });

  const savedItems = await db
    .select()
    .from(invoiceItemsTable)
    .where(eq(invoiceItemsTable.invoiceId, invoice.id));

  res.json({ ...invoice, items: savedItems });
});

router.post("/invoices/:id/inject", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const invoiceId = parseInt(rawId, 10);
  if (isNaN(invoiceId)) {
    res.status(400).json({ error: "رقم فاتورة غير صحيح" });
    return;
  }

  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.id, invoiceId));

  if (!invoice) {
    res.status(404).json({ error: "الفاتورة غير موجودة" });
    return;
  }

  const items = await db
    .select()
    .from(invoiceItemsTable)
    .where(eq(invoiceItemsTable.invoiceId, invoiceId));

  const { items: customItems, startRow, endRow, speedMode } = req.body;

  console.log("=== API INJECT REQUEST ===");
  req.log.info({ invoiceId, customItems, startRow, endRow, speedMode }, "Inject request received");

  const itemsToInject = (customItems && Array.isArray(customItems) && customItems.length > 0)
    ? customItems
    : items;

  if (itemsToInject.length === 0) {
    res.status(400).json({ error: "الفاتورة فارغة ولا تحتوي على أي بنود لحقنها" });
    return;
  }

  // Stream logs to frontend in real time using Chunked Transfer Encoding
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Transfer-Encoding", "chunked");

  const rpaItems = itemsToInject.map((item: any) => ({
    part_number: (item.partNumber ?? item.part_number ?? "").toString().trim(),
    description: item.description || "",
    quantity: Number(item.quantity ?? 0),
    unit_cost: Number(item.unitCost ?? item.unit_cost ?? 0),
    unit: item.unit || "",
    pieces_per_unit: Number(item.packFactor ?? item.pieces_per_unit ?? 1),
    // ── علامات الثقة: القطع الموثوقة من الذاكرة لا تحتاج تأكيداً بشرياً ──
    // needsManualInput=false AND memoryMatch=true  →  _part_trusted=true  (تخطي النافذة)
    // needsManualInput=true  OR  memoryMatch=false →  _part_trusted=false (تفتح النافذة)
    _part_trusted: item.memoryMatch === true && item.needsManualInput === false,
    _manual_review: item.needsManualInput === true,
  }));

  req.log.info({ rpaItemCount: rpaItems.length }, "rpaItems mapped for injection");

  const jsonStr = JSON.stringify(rpaItems);
  
  // Kill any existing active process for this invoice
  if (activeProcesses.has(invoiceId)) {
    try {
      activeProcesses.get(invoiceId)!.proc.kill("SIGKILL");
    } catch (e) {}
    activeProcesses.delete(invoiceId);
  }

  // Spawn Python RPA CLI Process
  const startRowParsed = typeof startRow === "number" ? startRow : parseInt(String(startRow), 10);
  const endRowParsed = typeof endRow === "number" ? endRow : parseInt(String(endRow), 10);
  const startParam = !isNaN(startRowParsed) && startRowParsed >= 0 ? String(startRowParsed) : "0";
  const endParam = !isNaN(endRowParsed) && endRowParsed >= 0 ? String(endRowParsed) : "0";
  const speedParam = speedMode === "fast" ? "fast" : "safe";
  const pythonProcess = spawn("python", ["inject_cli.py", jsonStr, String(invoiceId), startParam, endParam, speedParam], {
    // Keep stdin open so we can send corrected part numbers interactively
    stdio: ["pipe", "pipe", "pipe"],
    cwd: __apiDir,
  });
  activeProcesses.set(invoiceId, { proc: pythonProcess, stdin: pythonProcess.stdin });

  pythonProcess.stdout.on("data", (data) => {
    const chunk = data.toString();
    const lines = chunk.split("\n").filter((l: string) => l.trim().length > 0);
    for (const line of lines) {
      // ── تحقق إذا كان السطر حدث JSON منظّم من Python ──
      // (مثل input_required) — مررّه مباشرةً بدون تغليف
      try {
        const parsed = JSON.parse(line);
        if (parsed.type && typeof parsed.type === "string") {
           // ── حفظ التصحيح في قاعدة البيانات عند تصحيح رقم الصنف ──
           if (parsed.type === "part_corrected" && parsed.corrected && parsed.description) {
             const oldPart = parsed.part || parsed.original || null;

             // 1) حفظ في ذاكرة القطع (partsTable) مع الرقم الأصلي للربط المستقبلي
             learnFromSavedInvoice([{
               partNumber: parsed.corrected,
               originalPartNumber: oldPart,
               description: parsed.description,
             }], req.user!.orgId!).catch((err) => {
               req.log.error({ err, corrected: parsed.corrected }, "Failed to persist part correction");
             });

             // 2) تحديث بيانات الفاتورة نفسها (invoiceItemsTable) حتى لا يعود الخطأ
             const rowIdx = typeof parsed.row === "number" ? parsed.row : -1;
             (async () => {
               try {
                 // ابحث عن البند بالوصف داخل هذه الفاتورة وحدّث رقمه
                 const matchingItems = await db
                   .select()
                   .from(invoiceItemsTable)
                   .where(eq(invoiceItemsTable.invoiceId, invoiceId));

                 // طابق بالوصف (أدق) أو بترتيب الصف
                 let targetItem = matchingItems.find(
                   (it) => it.description === parsed.description
                 );
                 if (!targetItem && rowIdx >= 0 && rowIdx < matchingItems.length) {
                   targetItem = matchingItems[rowIdx];
                 }

                 if (targetItem) {
                   await db
                     .update(invoiceItemsTable)
                     .set({
                       partNumber: parsed.corrected,
                       originalPartNumber: oldPart || targetItem.originalPartNumber,
                     })
                     .where(eq(invoiceItemsTable.id, targetItem.id));
                   req.log.info(
                     { itemId: targetItem.id, oldPart, newPart: parsed.corrected },
                     "Updated invoice item with corrected part number"
                   );
                 }
               } catch (dbErr) {
                 req.log.error({ dbErr }, "Failed to update invoice item after part correction");
               }
             })();

             req.log.info(
               { row: parsed.row, corrected: parsed.corrected, description: parsed.description },
               "Part correction saved to memory"
             );
           }
          res.write(line + "\n");
          continue;
        }
      } catch {
        // ليس JSON — عامله كـ log عادي
      }
      res.write(JSON.stringify({ type: "log", message: line }) + "\n");
    }
  });

  pythonProcess.stderr.on("data", (data) => {
    const chunk = data.toString();
    res.write(JSON.stringify({ type: "error", message: chunk }) + "\n");
  });

  pythonProcess.on("close", async (code) => {
    activeProcesses.delete(invoiceId);
    if (code === 0) {
      // Log activity in database
      await db.insert(activityTable).values({
        type: "inject",
        description: `تم حقن فاتورة المورد "${invoice.supplier || "غير محدد"}" بنجاح في NewPoint ERP`,
      });
      
      // Update invoice status to saved/injected
      await db.update(invoicesTable)
        .set({ status: "saved" })
        .where(eq(invoicesTable.id, invoiceId));

      res.write(JSON.stringify({ type: "complete", code, message: "تم الحقن بنجاح" }) + "\n");
    } else {
      res.write(JSON.stringify({ type: "failed", code, message: "فشلت عملية الحقن" }) + "\n");
    }
    res.end();
  });
});

// ── NEW: إرسال الرقم المصحح إلى محرك RPA المنتظر ──
router.post("/invoices/:id/inject/respond", requireAuth, (req, res): void => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const invoiceId = parseInt(rawId, 10);
  if (isNaN(invoiceId)) {
    res.status(400).json({ error: "رقم فاتورة غير صحيح" });
    return;
  }

  const entry = activeProcesses.get(invoiceId);
  if (!entry) {
    res.status(404).json({ error: "لا توجد عملية حقن نشطة لهذه الفاتورة" });
    return;
  }

  const { partNumber } = req.body as { partNumber?: string };
  const response = partNumber && partNumber.trim() ? partNumber.trim() : "skip";

  try {
    // كتابة الرقم المصحح في stdin — Python يقرأه ويتابع
    entry.stdin.write(response + "\n");
    req.log.info({ invoiceId, response }, "Sent corrected part number to Python RPA");
    res.json({ ok: true, sent: response });
  } catch (err: any) {
    res.status(500).json({ error: `فشل إرسال الرقم: ${err.message}` });
  }
});

router.post("/invoices/:id/abort", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const invoiceId = parseInt(rawId, 10);
  if (isNaN(invoiceId)) {
    res.status(400).json({ error: "رقم فاتورة غير صحيح" });
    return;
  }

  const entry = activeProcesses.get(invoiceId);
  if (!entry) {
    res.status(404).json({ error: "لا توجد عملية حقن جارية لهذه الفاتورة" });
    return;
  }

  try {
    // taskkill /F /T — يقتل شجرة العمليات كاملة (Python + Tkinter dialogs + stop_watcher)
    const pid = entry.proc.pid;
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { timeout: 5000 });
    } catch {
      // fallback: Node's built-in kill
      try { entry.proc.kill("SIGKILL"); } catch {}
    }
    activeProcesses.delete(invoiceId);
    
    res.json({ success: true, message: "تم إيقاف عملية الحقن بنجاح" });
  } catch (err: any) {
    res.status(500).json({ error: `فشل إيقاف عملية الحقن: ${err.message}` });
  }
});

export default router;
