/**
 * ExtractionContext.tsx — سياق عالمي لعملية الاستخراج
 * يحتفظ بحالة الاستخراج عبر جميع الصفحات ويدعم الإلغاء الحقيقي
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { getAuthHeader } from "@/contexts/AuthContext";

// ── أنواع البيانات ─────────────────────────────────────────────

export interface PageImage {
  file: File;
  preview: string;
}

export type ExtractionStatus = "idle" | "extracting" | "done" | "error" | "cancelled";

export interface ExtractionProgress {
  status: ExtractionStatus;
  /** الصفحة الحالية (1 أو 2) */
  currentPage: number;
  /** عدد الصفحات الكلي */
  totalPages: number;
  /** وقت بدء الاستخراج */
  startedAt: number | null;
  /** رسالة الخطأ في حال الفشل */
  errorMessage?: string;
}

interface ExtractionContextValue {
  // ── حالة الصور ──
  pages: PageImage[];
  setPages: React.Dispatch<React.SetStateAction<PageImage[]>>;

  // ── حالة الاستخراج ──
  progress: ExtractionProgress;
  extractedData: any | null;
  setExtractedData: React.Dispatch<React.SetStateAction<any | null>>;

  // ── إجراءات ──
  startExtraction: () => Promise<void>;
  cancelExtraction: () => void;
  resetAll: () => void;
  dismissCompletion: () => void;
}

const DEFAULT_PROGRESS: ExtractionProgress = {
  status: "idle",
  currentPage: 0,
  totalPages: 0,
  startedAt: null,
};

const ExtractionContext = createContext<ExtractionContextValue>({
  pages: [],
  setPages: () => {},
  progress: DEFAULT_PROGRESS,
  extractedData: null,
  setExtractedData: () => {},
  startExtraction: async () => {},
  cancelExtraction: () => {},
  resetAll: () => {},
  dismissCompletion: () => {},
});

// ── مساعد: قراءة ملف كـ Data URL ──────────────────────────────

const readAsDataURL = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// ── مساعد: استخراج صفحة واحدة عبر fetch مباشر مع AbortSignal ──

async function extractOnePage(
  preview: string,
  file: File,
  signal: AbortSignal
): Promise<any> {
  const base64 = preview.split(",")[1];
  const mimeMatch = preview.match(/^data:(image\/[a-z+]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : file.type || "image/jpeg";

  const token = localStorage.getItem("ruknauto_token");
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

  const res = await fetch(`${BASE}/api/invoices/extract`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(token),
    },
    body: JSON.stringify({ imageBase64: base64, mimeType }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// ── مساعد: حذف فاتورة معلقة بالـ ID ────────────────────────────

async function deletePendingInvoice(invoiceId: number): Promise<void> {
  try {
    const token = localStorage.getItem("ruknauto_token");
    const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
    await fetch(`${BASE}/api/invoices/${invoiceId}`, {
      method: "DELETE",
      headers: { ...getAuthHeader(token) },
    });
  } catch {
    // non-fatal — best effort cleanup
  }
}

// ── مساعد: تنظيف جميع الفواتير المعلقة للمستخدم الحالي ──────

async function cleanupAllPending(): Promise<void> {
  try {
    const token = localStorage.getItem("ruknauto_token");
    const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
    await fetch(`${BASE}/api/invoices/cleanup-pending`, {
      method: "DELETE",
      headers: { ...getAuthHeader(token) },
    });
  } catch {
    // non-fatal — best effort cleanup
  }
}

// ══════════════════════════════════════════════════════════════════
// Provider
// ══════════════════════════════════════════════════════════════════

export function ExtractionProvider({ children }: { children: ReactNode }) {
  const [pages, setPages] = useState<PageImage[]>([]);
  const [progress, setProgress] = useState<ExtractionProgress>(DEFAULT_PROGRESS);
  const [extractedData, setExtractedData] = useState<any | null>(null);

  // مرجع AbortController + IDs الفواتير المعلقة للتنظيف عند الإلغاء
  const abortRef = useRef<AbortController | null>(null);
  const pendingInvoiceIdsRef = useRef<number[]>([]);

  // ── بدء الاستخراج ───────────────────────────────────────────

  const startExtraction = useCallback(async () => {
    if (pages.length === 0) return;

    // إلغاء أي عملية سابقة
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    pendingInvoiceIdsRef.current = [];

    const totalPages = pages.length;
    setProgress({
      status: "extracting",
      currentPage: 1,
      totalPages,
      startedAt: Date.now(),
    });
    setExtractedData(null);

    try {
      if (totalPages === 1) {
        // ── استخراج صفحة واحدة ──
        const data = await extractOnePage(pages[0].preview, pages[0].file, controller.signal);
        if (data?.invoiceId) pendingInvoiceIdsRef.current.push(data.invoiceId);

        if (controller.signal.aborted) return;
        setExtractedData(data);
        setProgress((p) => ({ ...p, status: "done", currentPage: 1 }));
        toast.success("تم استخراج البيانات بنجاح ✓");
      } else {
        // ── استخراج صفحتين + دمج ──
        toast.info("جاري استخراج الصفحة الأولى…");
        const page1 = await extractOnePage(pages[0].preview, pages[0].file, controller.signal);
        if (page1?.invoiceId) pendingInvoiceIdsRef.current.push(page1.invoiceId);
        if (controller.signal.aborted) return;

        setProgress((p) => ({ ...p, currentPage: 2 }));
        toast.info("جاري استخراج الصفحة الثانية…");
        const page2 = await extractOnePage(pages[1].preview, pages[1].file, controller.signal);
        if (page2?.invoiceId) pendingInvoiceIdsRef.current.push(page2.invoiceId);
        if (controller.signal.aborted) return;

        // حذف سجل الصفحة الثانية — نحتفظ بسجل الصفحة الأولى فقط
        if (page2?.invoiceId) {
          await deletePendingInvoice(page2.invoiceId);
          pendingInvoiceIdsRef.current = pendingInvoiceIdsRef.current.filter(
            (id) => id !== page2.invoiceId
          );
        }

        // دمج البنود
        const merged = {
          ...page1,
          items: [...(page1.items || []), ...(page2.items || [])],
        };

        setExtractedData(merged);
        setProgress((p) => ({ ...p, status: "done", currentPage: 2 }));
        toast.success(
          `تم دمج ${merged.items.length} بند من صفحتين في فاتورة واحدة ✓`
        );
      }
    } catch (err: any) {
      if (err.name === "AbortError" || controller.signal.aborted) {
        // المستخدم ألغى — لا نعرض خطأ
        return;
      }
      const msg = err?.message || "فشل الاستخراج — تحقق من الاتصال أو أعد المحاولة";
      setProgress((p) => ({ ...p, status: "error", errorMessage: msg }));
      toast.error(msg);
    }
  }, [pages]);

  // ── إلغاء الاستخراج ──────────────────────────────────────────

  const cancelExtraction = useCallback(() => {
    // 1) قطع الطلب HTTP
    abortRef.current?.abort();
    abortRef.current = null;

    // 2) حذف أي فواتير معلقة أُنشئت في DB (بالـ ID المعروف)
    for (const id of pendingInvoiceIdsRef.current) {
      deletePendingInvoice(id);
    }
    pendingInvoiceIdsRef.current = [];

    // 3) تنظيف شامل: حذف كل الفواتير المعلقة للمستخدم الحالي
    //    (يلتقط الحالات التي لم نحصل فيها على invoiceId بسبب abort)
    cleanupAllPending();

    // 4) إعادة الحالة
    setProgress({ ...DEFAULT_PROGRESS, status: "cancelled" });
    setExtractedData(null);
    toast.info("تم إلغاء عملية الاستخراج");

    // إعادة الحالة إلى idle بعد لحظة
    setTimeout(() => {
      setProgress(DEFAULT_PROGRESS);
    }, 2000);
  }, []);

  // ── إعادة تعيين كامل ─────────────────────────────────────────

  const resetAll = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    pendingInvoiceIdsRef.current = [];
    setPages([]);
    setExtractedData(null);
    setProgress(DEFAULT_PROGRESS);
  }, []);

  // ── إخفاء بانر الاكتمال ──────────────────────────────────────

  const dismissCompletion = useCallback(() => {
    if (progress.status === "done" || progress.status === "error") {
      setProgress(DEFAULT_PROGRESS);
    }
  }, [progress.status]);

  return (
    <ExtractionContext.Provider
      value={{
        pages,
        setPages,
        progress,
        extractedData,
        setExtractedData,
        startExtraction,
        cancelExtraction,
        resetAll,
        dismissCompletion,
      }}
    >
      {children}
    </ExtractionContext.Provider>
  );
}

export function useExtraction() {
  return useContext(ExtractionContext);
}
