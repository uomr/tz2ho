import { useListInvoices, getListInvoicesQueryKey, useDeleteInvoice } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Trash2, Eye, Play, CheckCircle2, AlertCircle, Loader2, Sparkles, Terminal, FileText, Pencil, XCircle, SkipForward } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Invoices() {
  const { data: invoices, isLoading } = useListInvoices({
    query: { queryKey: getListInvoicesQueryKey() }
  });
  const deleteInvoice = useDeleteInvoice();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Details Modal & Injection State
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isInjecting, setIsInjecting] = useState(false);
  const [injectLogs, setInjectLogs] = useState<string[]>([]);
  const [injectStatus, setInjectStatus] = useState<"idle" | "countdown" | "running" | "waiting_input" | "success" | "failed">("idle");
  const [countdown, setCountdown] = useState(5);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [rangeMode, setRangeMode] = useState<"all" | "from" | "range">("all");
  const [startRow, setStartRow] = useState<number | "">(1);
  const [rangeStart, setRangeStart] = useState<number | "">(1);
  const [rangeEnd, setRangeEnd] = useState<number | "">("");
  const [speedMode, setSpeedMode] = useState<"safe" | "fast">("safe");
  const [speedWarnings, setSpeedWarnings] = useState<number>(0);

  // Interactive Part Correction Modal State
  const [inputRequired, setInputRequired] = useState<{
    row: number;
    part: string;
    description: string;
  } | null>(null);
  const [correctedPart, setCorrectedPart] = useState("");

  // Pre-injection Review Modal State
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewItems, setReviewItems] = useState<any[]>([]);
  const [requireReview, setRequireReview] = useState(true);

  // Edit Invoice Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editInvoice, setEditInvoice] = useState<any | null>(null);
  const [editItems, setEditItems] = useState<any[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Scroll logs console to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [injectLogs]);

  // Countdown timer effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (injectStatus === "countdown" && countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (injectStatus === "countdown" && countdown === 0) {
      setInjectStatus("running");
    }
    return () => clearTimeout(timer);
  }, [injectStatus, countdown]);

  const handleDelete = (id: number) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (deleteConfirmId == null) return;
    deleteInvoice.mutate({ id: deleteConfirmId }, {
      onSuccess: () => {
        toast.success("تم حذف الفاتورة بنجاح");
        setDeleteConfirmId(null);
        queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
      },
      onError: () => { toast.error("حدث خطأ أثناء الحذف"); setDeleteConfirmId(null); },
    });
  };

  // ── فتح نافذة تعديل الفاتورة ──
  const handleOpenEdit = async (id: number) => {
    try {
      const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/api/invoices/${id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setEditInvoice(data);
      setEditItems(data.items?.map((it: any) => ({ ...it })) || []);
      setIsEditOpen(true);
    } catch {
      toast.error("فشل تحميل بيانات الفاتورة للتعديل");
    }
  };

  const handleSaveEdit = async () => {
    if (!editInvoice) return;
    setIsSavingEdit(true);
    try {
      const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/api/invoices/${editInvoice.id}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: editInvoice.invoiceNumber,
          supplier: editInvoice.supplier,
          date: editInvoice.date,
          items: editItems,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "فشل الحفظ");
      }
      toast.success("تم حفظ التعديلات بنجاح ✅");
      setIsEditOpen(false);
      queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
    } catch (err: any) {
      toast.error(err.message || "فشل حفظ التعديلات");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleOpenDetail = async (id: number) => {
    // Reset state
    setIsInjecting(false);
    setInjectLogs([]);
    setSpeedWarnings(0);
    setInjectStatus("idle");
    setCountdown(5);
    setStartRow(1);
    setRangeStart(1);
    setRangeMode("all");

    try {
      const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/api/invoices/${id}`);
      if (!res.ok) throw new Error("Failed to fetch invoice details");
      const data = await res.json();
      setSelectedInvoice(data);
      setRangeEnd(data.items?.length || "");
      setIsDetailOpen(true);
    } catch (err) {
      toast.error("فشل تحميل تفاصيل الفاتورة");
    }
  };

  const handleOpenReview = () => {
    if (!selectedInvoice) return;
    const initialItems = selectedInvoice.items.map((item: any) => {
      // Check if original unit from invoice is a carton unit
      const unitLower = (item.unit || "").toLowerCase().trim();
      const hasStrongCartonKeyword = unitLower.includes("كرتون") || 
                                     unitLower.includes("كراتين") || 
                                     unitLower.includes("ctn") || 
                                     unitLower.includes("carton") || 
                                     unitLower.includes("شد") || 
                                     unitLower.includes("شدود");
      
      const hasWeakPackKeyword = unitLower.includes("علب") ||
                                 unitLower.includes("علبة") ||
                                 unitLower.includes("علبه") ||
                                 unitLower.includes("عبوة") ||
                                 unitLower.includes("عبوه") ||
                                 unitLower.includes("بكت") ||
                                 unitLower.includes("pkt") ||
                                 unitLower.includes("pack") ||
                                 unitLower.includes("box");

      const hasPackFactor = !!(item.packFactor && item.packFactor > 1);

      const isCartonUnit = hasStrongCartonKeyword || 
                           (hasWeakPackKeyword && hasPackFactor) ||
                           hasPackFactor;

      const initialUnitMode = isCartonUnit ? 'cartons' : 'pieces';
      const factor = item.packFactor || 1;

      let initialQty = item.quantity;
      let initialCost = item.unitCost;

      return {
        ...item,
        unitMode: initialUnitMode,
        quantity: initialQty,
        unitCost: initialCost,
        packFactor: factor,
        originalQuantity: item.quantity, // Save the original extracted quantity
        originalUnit: item.unit || "",   // Save the original extracted unit
      };
    });
    setReviewItems(initialItems);
    setIsReviewOpen(true);
  };

  const updateReviewItem = (index: number, field: string, value: any) => {
    const next = [...reviewItems];
    const currentItem = next[index];

    if (field === 'packFactor') {
      const nextFactor = Number(value) || 1;
      const unitLower = (currentItem.originalUnit || "").toLowerCase().trim();
      const isCartonOriginal = unitLower.includes("كرتون") || 
                               unitLower.includes("كراتين") || 
                               unitLower.includes("ctn") || 
                               unitLower.includes("carton") || 
                               unitLower.includes("شد") || 
                               unitLower.includes("شدود") ||
                               unitLower.includes("علب") ||
                               unitLower.includes("علبة") ||
                               unitLower.includes("علبه") ||
                               unitLower.includes("عبوة") ||
                               unitLower.includes("عبوه") ||
                               unitLower.includes("بكت") ||
                               unitLower.includes("pkt") ||
                               unitLower.includes("pack") ||
                               unitLower.includes("box");

      if (currentItem.unitMode === 'cartons' && !isCartonOriginal) {
        // If we are in cartons mode, but the original invoice had pieces,
        // editing packFactor should adjust the carton quantity and carton cost
        // to keep total pieces and total price perfectly constant
        const newQty = Math.round((currentItem.originalQuantity / nextFactor) * 100) / 100;
        const newCost = Math.round(currentItem.unitCost * (nextFactor / (currentItem.packFactor || 1)) * 100) / 100;
        next[index] = {
          ...currentItem,
          packFactor: nextFactor,
          quantity: newQty > 0 ? newQty : 1,
          unitCost: newCost,
        };
      } else {
        // Otherwise, keep the carton count and carton price constant, and let the injected piece count/price scale
        next[index] = {
          ...currentItem,
          packFactor: nextFactor,
        };
      }
    } else if (field === 'unitMode') {
      const prevMode = currentItem.unitMode;
      const nextMode = value;
      const factor = currentItem.packFactor || 1;

      if (prevMode === 'pieces' && nextMode === 'cartons') {
        // pieces -> cartons: divide quantity by factor, multiply cost by factor
        const newQty = Math.round((currentItem.quantity / factor) * 100) / 100;
        const newCost = Math.round(currentItem.unitCost * factor * 100) / 100;
        next[index] = { 
          ...currentItem, 
          unitMode: nextMode, 
          quantity: newQty > 0 ? newQty : 1,
          unitCost: newCost,
        };
      } else if (prevMode === 'cartons' && nextMode === 'pieces') {
        // cartons -> pieces: multiply quantity by factor, divide cost by factor
        const newQty = Math.round(currentItem.quantity * factor);
        const newCost = Math.round((currentItem.unitCost / factor) * 10000) / 10000;
        next[index] = { 
          ...currentItem, 
          unitMode: nextMode, 
          quantity: newQty,
          unitCost: newCost,
        };
      } else {
        next[index] = { ...currentItem, [field]: value };
      }
    } else {
      next[index] = { ...currentItem, [field]: value };
    }
    
    setReviewItems(next);
  };

  const startFinalInjection = async () => {
    setIsReviewOpen(false);
    
    // 1. Save the modified review items to the database permanently
    if (selectedInvoice) {
      try {
        const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
        await fetch(`${baseUrl}/api/invoices/${selectedInvoice.id}/save`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            invoiceNumber: selectedInvoice.invoiceNumber,
            supplier: selectedInvoice.supplier,
            date: selectedInvoice.date,
            items: reviewItems
          })
        });
        
        // Invalidate queries to refresh the invoice list and details in the background
        queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
        
        // Also update the selectedInvoice state to immediately reflect the changes
        setSelectedInvoice({
          ...selectedInvoice,
          items: reviewItems
        });
      } catch (err) {
        console.error("Failed to save review items before injection:", err);
      }
    }

    // 2. Map items to final injection parameters for the Python RPA engine
    const finalItems = reviewItems.map((item: any) => {
      const isPack = item.unitMode === 'cartons';
      const factor = item.packFactor || 1;
      
      if (isPack) {
        // By Carton Mode:
        // Inject Pieces Quantity and Pieces Price (Carton Price / factor)
        // Since we scale it here, we set packFactor to 1 so the Python engine does not scale it again.
        return {
          partNumber: item.partNumber || "",
          description: item.description,
          quantity: item.quantity * factor,
          unitCost: Math.round((item.unitCost / factor) * 10000) / 10000,
          packFactor: 1,
        };
      } else {
        // Pieces Mode:
        // Inject Pieces Quantity and Pieces Price directly.
        return {
          partNumber: item.partNumber || "",
          description: item.description,
          quantity: item.quantity,
          unitCost: item.unitCost,
          packFactor: 1,
        };
      }
    });
    
    handleInject(finalItems);
  };

  const handleInject = async (itemsToInject?: any[]) => {
    if (!selectedInvoice || isInjecting) return;

    setIsInjecting(true);
    setInjectLogs(["[RPA] جاري بدء الاتصال بمحرك الحقن المكتبي..."]);
    setInjectStatus("countdown");
    setCountdown(5);

    try {
      const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
      let effectiveStart = 0;
      let effectiveEnd = 0;

      if (rangeMode === "from") {
        effectiveStart = parseInt(String(startRow), 10) || 1;
        effectiveEnd = 0;
      } else if (rangeMode === "range") {
        effectiveStart = parseInt(String(rangeStart), 10) || 1;
        effectiveEnd = parseInt(String(rangeEnd), 10) || 0;
      }

      const response = await fetch(`${baseUrl}/api/invoices/${selectedInvoice.id}/inject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ items: itemsToInject, startRow: effectiveStart, endRow: effectiveEnd, speedMode })
      });

      if (!response.ok) {
        throw new Error("فشل بدء عملية الحقن المكتبي");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("لا يمكن قراءة دفق البيانات");
      }

      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            
            if (parsed.type === "log") {
              const msg = parsed.message;
              setInjectLogs(prev => [...prev, msg]);
              
              if (msg.includes("PROGRESS: ") && msg.includes("success")) {
                toast.success(`تم حقن بند بنجاح ✓`);
              }
              if (msg.includes("SEARCH:")) {
                toast.warning("تنبيه: نافذة البحث مفتوحة في NewPoint ERP! يرجى اختيار الصنف يدويًا.");
              }
              if (msg.includes("[RESUME]")) {
                toast.info(msg.replace("[RPA] INFO -", "").trim(), { duration: 6000 });
              }
              if (msg.includes("[RESTART]")) {
                toast.info("🔄 تم اختيار البدء من الصف الأول", { duration: 4000 });
              }
            } else if (parsed.type === "input_required") {
              // ── نافذة Windows الأصلية ستظهر تلقائياً فوق كل شيء ──
              setInjectStatus("waiting_input");
              setInputRequired({
                row: parsed.row,
                part: parsed.part || "",
                description: parsed.description || "",
              });
              setCorrectedPart(parsed.part || "");
              setInjectLogs(prev => [
                ...prev,
                `[RPA] ⚠️ الصف ${parsed.row + 1}: "${parsed.part}" غير موجود — نافذة تصحيح ظهرت على شاشتك`,
              ]);
              toast.warning(`ظهرت نافذة تصحيح رقم القطعة على شاشتك 🪟`, {
                duration: 15000,
              });
            } else if (parsed.type === "part_corrected") {
              // ── تم تصحيح الرقم من النافذة الأصلية ──
              setInputRequired(null);
              setInjectStatus("running");
              setInjectLogs(prev => [
                ...prev,
                `[RPA] ✅ الصف ${parsed.row + 1}: تم قبول الرقم المصحح "${parsed.corrected}" — استئناف الحقن...`,
              ]);
            } else if (parsed.type === "part_skipped") {
              // ── تخطي القطعة من النافذة الأصلية ──
              setInputRequired(null);
              setInjectStatus("running");
              setInjectLogs(prev => [
                ...prev,
                `[RPA] ⏭ الصف ${parsed.row + 1}: تم تخطي "${parsed.description || parsed.part}"`,
              ]);
              toast.info(`تم تخطي "${parsed.description || parsed.part}"`);
            } else if (parsed.type === "erp_error") {
              // ── خطأ ERP (مثل تكرار رقم الصنف) ──
              setInjectLogs(prev => [
                ...prev,
                `[ERP ⛔] الصف ${parsed.row + 1}: خطأ — "${parsed.popup_title || 'غير معروف'}" — الرقم: ${parsed.part}`,
              ]);
              toast.error(`خطأ ERP: ${parsed.popup_title || 'نافذة خطأ ظهرت على شاشتك'}`, {
                duration: 12000,
              });
              setInjectStatus("waiting_input");
            } else if (parsed.type === "speed_warning") {
              // ── تحذير سرعة: خطأ محتمل بسبب وضع السرعة ──
              setSpeedWarnings(prev => prev + 1);
              const warnMsg = `⚡ تحذير سرعة — صف ${parsed.row + 1} | رقم: ${parsed.part} | ${parsed.message}`;
              setInjectLogs(prev => [...prev, warnMsg]);
              toast.warning(
                `⚡ خطأ بسبب وضع السرعة — صف ${parsed.row + 1}: تم تجاوزه`,
                { duration: 8000 }
              );
            } else if (parsed.type === "error") {
              setInjectLogs(prev => [...prev, `[خطأ] ${parsed.message}`]);
            } else if (parsed.type === "complete") {
              setInjectLogs(prev => [...prev, `[RPA] اكتمل: ${parsed.message} 🎉`]);
              setInjectStatus("success");
              setInputRequired(null);
              toast.success("تم حقن الفاتورة بنجاح في NewPoint ERP! 🎉");
            } else if (parsed.type === "failed") {
              setInjectLogs(prev => [...prev, `[RPA] فشل: ${parsed.message} ❌`]);
              setInjectStatus("failed");
              setInputRequired(null);
              toast.error("فشل حقن الفاتورة تلقائيًا");
            }

          } catch (e) {
            // Ignore non-JSON lines if any
          }
        }
      }
    } catch (err: any) {
      setInjectLogs(prev => [...prev, `[خطأ] فشل الاتصال بخادم الحقن: ${err.message}`]);
      setInjectStatus("failed");
      toast.error("حدث خطأ أثناء تشغيل محرك RPA");
    } finally {
      setIsInjecting(false);
    }
  };

  const handleAbort = async () => {
    if (!selectedInvoice) return;
    try {
      const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/invoices/${selectedInvoice.id}/abort`, {
        method: "POST"
      });
      if (response.ok) {
        toast.success("تم إرسال أمر إيقاف عملية الحقن 🛑");
        setInjectLogs(prev => [...prev, "[RPA] 🛑 تم طلب إيقاف عملية الحقن من قبل المستخدم!"]);
        setInjectStatus("failed");
        setIsInjecting(false);
      } else {
        toast.error("فشل إرسال أمر الإيقاف");
      }
    } catch (err: any) {
      toast.error("حدث خطأ أثناء محاولة إيقاف العملية");
    }
  };

  // ── إرسال الرقم المصحح إلى محرك RPA المتجمد ──
  const sendCorrectedPart = async (partNumber: string | "skip") => {
    if (!selectedInvoice) return;
    setInputRequired(null);
    setInjectStatus("running");

    const logMsg = partNumber === "skip"
      ? "[RPA] ⏭ تم تخطي هذه القطعة بناءً على طلب المستخدم"
      : `[RPA] ✅ تم إرسال الرقم المصحح "${partNumber}" — استئناف الحقن...`;
    setInjectLogs(prev => [...prev, logMsg]);

    try {
      const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
      await fetch(`${baseUrl}/api/invoices/${selectedInvoice.id}/inject/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partNumber }),
      });
    } catch (err: any) {
      toast.error(`فشل إرسال الرقم المصحح: ${err.message}`);
    }
  };

  const handleStartInjectionFlow = () => {
    if (!selectedInvoice) return;
    if (requireReview) {
      handleOpenReview();
    } else {
      // Direct inject with default mapped items
      const itemsToInject = selectedInvoice.items.map((item: any) => ({
        partNumber: item.partNumber || "",
        description: item.description,
        quantity: item.quantity,
        unitCost: item.unitCost,
        packFactor: item.packFactor || 1,
      }));
      handleInject(itemsToInject);
    }
  };

  const filteredInvoices = invoices?.filter(inv => 
    inv.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) || 
    inv.supplier?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">سجل الفواتير</h2>
        <p className="text-muted-foreground text-sm mt-1">عرض وإدارة الفواتير المحفوظة وحقنها ببرنامج NewPoint ERP.</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث برقم الفاتورة أو المورد..."
            className="pr-10 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {filteredInvoices && (
          <span className="text-xs text-muted-foreground shrink-0">
            {filteredInvoices.length} فاتورة
          </span>
        )}
      </div>

      <Card className="bg-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="p-3 font-medium text-right">رقم الفاتورة</th>
                  <th className="p-3 font-medium text-right">المورد</th>
                  <th className="p-3 font-medium text-right">التاريخ</th>
                  <th className="p-3 font-medium text-center w-20">البنود</th>
                  <th className="p-3 font-medium text-right">الإجمالي</th>
                  <th className="p-3 font-medium text-right">الحالة</th>
                  <th className="p-3 font-medium text-center w-28">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <tr key={i}>
                      {Array(7).fill(0).map((_, j) => (
                        <td key={j} className="p-4"><Skeleton className="h-5 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : filteredInvoices?.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">لا توجد فواتير</td>
                  </tr>
                ) : filteredInvoices?.map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted/50 transition-colors">
                    <td className="p-3 font-medium font-mono text-sm">{inv.invoiceNumber || '—'}</td>
                    <td className="p-3">{inv.supplier || '—'}</td>
                    <td className="p-3 text-muted-foreground text-xs">{inv.date || '—'}</td>
                    <td className="p-3 text-center tabular-nums">{inv.itemCount || 0}</td>
                    <td className="p-3 tabular-nums">{inv.totalAmount ? `${inv.totalAmount.toLocaleString('ar-SA', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} ر.س` : '—'}</td>
                    <td className="p-3">
                      <InvoiceStatusBadge status={inv.status} />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => handleOpenDetail(inv.id)}
                          title="عرض التفاصيل"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                          onClick={() => handleOpenEdit(inv.id)}
                          title="تعديل الفاتورة"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleDelete(inv.id)}
                          disabled={deleteInvoice.isPending}
                          title="حذف الفاتورة"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent
          className="max-w-5xl bg-card border-border rounded-xl text-right"
          dir="rtl"
          style={{ maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
        >
          {/* ── رأس النافذة ── */}
          <DialogHeader className="shrink-0 border-b border-border pb-3">
            <DialogTitle className="flex items-center gap-2 text-sm font-bold text-foreground">
              <FileText className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">{selectedInvoice?.supplier || "غير محدد"}</span>
              {selectedInvoice && (
                <span className="flex items-center gap-4 mr-auto text-xs font-normal text-muted-foreground shrink-0">
                  <span>رقم: <span className="text-foreground font-mono font-semibold">{selectedInvoice.invoiceNumber || "—"}</span></span>
                  <span>التاريخ: <span className="text-foreground font-semibold">{selectedInvoice.date || "—"}</span></span>
                  <span className="text-primary font-bold">{selectedInvoice.totalAmount?.toLocaleString("en-US")} ر.س</span>
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedInvoice && (
            <div className="flex flex-col gap-3 overflow-hidden flex-1">

              {/* ── جدول الأصناف ── */}
              <div className="border border-border rounded-lg overflow-hidden flex-1 overflow-y-auto min-h-0">
                <table className="w-full text-xs text-right">
                  <thead className="bg-muted sticky top-0 border-b border-border z-10">
                    <tr>
                      <th className="p-2 font-medium text-center w-8 text-muted-foreground">#</th>
                      <th className="p-2 font-medium">رقم القطعة</th>
                      <th className="p-2 font-medium">الوصف</th>
                      <th className="p-2 font-medium text-center w-24">الكمية</th>
                      <th className="p-2 font-medium text-center w-28">سعر الوحدة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selectedInvoice.items?.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-muted/30 transition-colors">
                        <td className="p-2 text-center text-muted-foreground font-mono" style={{ direction: "ltr" }}>{idx + 1}</td>
                        <td className="p-2 font-mono font-semibold text-emerald-400">{item.partNumber || "—"}</td>
                        <td className="p-2">{item.description}</td>
                        <td className="p-2 text-center font-semibold" style={{ direction: "ltr" }}>
                          {item.quantity} {item.unit || ""}
                        </td>
                        <td className="p-2 text-center font-semibold" style={{ direction: "ltr" }}>
                          {Number(item.unitCost).toLocaleString("en-US")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── شريط التحكم بالحقن ── */}
              <div className="shrink-0 border border-border rounded-lg bg-muted/20 p-3 space-y-2.5">

                {/* الصف الأول: المراجعة + النطاق + السرعة */}
                <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">

                  {/* تأكيد المراجعة */}
                  <label className="flex items-center gap-2 cursor-pointer select-none px-3 py-1.5 rounded-md border border-border bg-card hover:bg-muted/60 transition-colors shrink-0">
                    <input
                      type="checkbox"
                      checked={requireReview}
                      onChange={(e) => setRequireReview(e.target.checked)}
                      className="h-3.5 w-3.5 accent-blue-500 cursor-pointer"
                    />
                    <span className="text-xs font-medium text-foreground whitespace-nowrap">مراجعة قبل الحقن</span>
                  </label>

                  {/* نطاق الحقن */}
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card" dir="ltr">
                    <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap" style={{ direction: "rtl" }}>النطاق:</span>
                    <label className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-[11px] transition-colors whitespace-nowrap ${rangeMode === "all" ? "bg-blue-500/15 text-blue-400 font-semibold" : "text-muted-foreground hover:text-foreground"}`}>
                      <input type="radio" name="range-mode" checked={rangeMode === "all"} onChange={() => setRangeMode("all")} className="accent-blue-500 w-3 h-3" />
                      <span style={{ direction: "rtl" }}>الكل ({selectedInvoice?.items?.length || 0})</span>
                    </label>
                    <label className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-[11px] transition-colors whitespace-nowrap ${rangeMode === "from" ? "bg-blue-500/15 text-blue-400 font-semibold" : "text-muted-foreground hover:text-foreground"}`}>
                      <input type="radio" name="range-mode" checked={rangeMode === "from"} onChange={() => setRangeMode("from")} className="accent-blue-500 w-3 h-3" />
                      <span style={{ direction: "rtl" }}>من صف</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={startRow}
                        onChange={(e) => {
                          const maxVal = selectedInvoice?.items?.length ?? 1;
                          const raw = e.target.value.replace(/[^0-9]/g, "");
                          if (raw === "") { setStartRow(""); if (rangeMode === "all") setRangeMode("from"); return; }
                          const val = Math.min(maxVal, Math.max(1, parseInt(raw, 10)));
                          setStartRow(val);
                          if (rangeMode === "all") setRangeMode("from");
                        }}
                        onBlur={() => { if (startRow === "" || startRow === 0) setStartRow(1); }}
                        onFocus={() => { if (rangeMode === "all") setRangeMode("from"); }}
                        className="h-7 w-12 text-center font-mono text-xs bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                        style={{ direction: "ltr" }}
                      />
                    </label>
                    <span className="text-border/50 text-xs">|</span>
                    <label className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-[11px] transition-colors whitespace-nowrap ${rangeMode === "range" ? "bg-blue-500/15 text-blue-400 font-semibold" : "text-muted-foreground hover:text-foreground"}`}>
                      <input type="radio" name="range-mode" checked={rangeMode === "range"} onChange={() => setRangeMode("range")} className="accent-blue-500 w-3 h-3" />
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={rangeStart}
                        onChange={(e) => {
                          const maxVal = selectedInvoice?.items?.length ?? 1;
                          const raw = e.target.value.replace(/[^0-9]/g, "");
                          if (raw === "") { setRangeStart(""); setRangeMode("range"); return; }
                          const val = Math.min(maxVal, Math.max(1, parseInt(raw, 10)));
                          setRangeStart(val);
                          if (typeof rangeEnd === "number" && rangeEnd < val) setRangeEnd(val);
                          setRangeMode("range");
                        }}
                        onBlur={() => { if (rangeStart === "" || rangeStart === 0) setRangeStart(1); }}
                        onFocus={() => setRangeMode("range")}
                        className="h-7 w-12 text-center font-mono text-xs bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                        style={{ direction: "ltr" }}
                      />
                      <span className="text-muted-foreground text-xs">→</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={rangeEnd}
                        onChange={(e) => {
                          const maxVal = selectedInvoice?.items?.length ?? 1;
                          const raw = e.target.value.replace(/[^0-9]/g, "");
                          if (raw === "") { setRangeEnd(""); setRangeMode("range"); return; }
                          const minVal = typeof rangeStart === "number" ? rangeStart : 1;
                          const val = Math.min(maxVal, Math.max(minVal, parseInt(raw, 10)));
                          setRangeEnd(val);
                          setRangeMode("range");
                        }}
                        onBlur={() => { if (rangeEnd === "" || rangeEnd === 0) setRangeEnd(selectedInvoice?.items?.length ?? 1); }}
                        onFocus={() => setRangeMode("range")}
                        placeholder={String(selectedInvoice?.items?.length ?? "")}
                        className="h-7 w-12 text-center font-mono text-xs bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                        style={{ direction: "ltr" }}
                      />
                    </label>
                  </div>

                  {/* سرعة الحقن */}
                  <div className="flex items-center gap-1 px-2 py-1.5 rounded-md border border-border bg-card">
                    <span className="text-[11px] font-medium text-muted-foreground ml-1">السرعة:</span>
                    <button type="button" onClick={() => setSpeedMode("safe")}
                      className={`px-3 py-1 rounded text-[11px] font-semibold border transition-all ${speedMode === "safe" ? "bg-green-500/15 border-green-500/30 text-green-400" : "border-transparent text-muted-foreground hover:bg-muted"}`}>
                      آمن
                    </button>
                    <button type="button" onClick={() => setSpeedMode("fast")}
                      className={`px-3 py-1 rounded text-[11px] font-semibold border transition-all ${speedMode === "fast" ? "bg-amber-500/15 border-amber-500/30 text-amber-400" : "border-transparent text-muted-foreground hover:bg-muted"}`}>
                      سريع
                    </button>
                  </div>
                </div>

                {/* تحذير وضع السرعة */}
                {speedMode === "fast" && (
                  <div className="px-3 py-1.5 rounded-md bg-amber-500/8 border border-amber-500/20 text-[11px] text-amber-400/90">
                    تحذير: الوضع السريع قد يتجاوز صنفاً على الأجهزة البطيئة.
                  </div>
                )}

                {/* زر الحقن */}
                <Button
                  className={`w-full h-9 gap-2 font-semibold text-sm ${speedMode === "fast" ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"} text-white`}
                  onClick={handleStartInjectionFlow}
                  disabled={isInjecting}
                >
                  {isInjecting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> جاري الحقن...</>
                  ) : (
                    <><Play className="w-4 h-4" /> حقن في NewPoint (RPA){speedMode === "fast" ? " — سريع" : ""}</>
                  )}
                </Button>
              </div>

              {/* ── لوحة RPA ── */}
              {(isInjecting || injectLogs.length > 0) ? (
                <div className="shrink-0 rounded-lg border border-border overflow-hidden bg-[#0d1117]">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-muted/10">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Terminal className="w-3.5 h-3.5" />
                      <span>وحدة تحكم RPA</span>
                      {speedMode === "fast" && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25 text-[10px] font-semibold">سريع</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {speedWarnings > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 text-[10px] font-semibold">{speedWarnings} تحذير</span>
                      )}
                      {injectStatus === "countdown" && <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-semibold animate-pulse">التركيز في {countdown}s</span>}
                      {injectStatus === "running" && <span className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-semibold animate-pulse">جاري...</span>}
                      {injectStatus === "waiting_input" && <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-semibold animate-pulse">انتظار المدخل</span>}
                      {injectStatus === "success" && <span className="px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-green-400 text-[10px] font-semibold">اكتمل</span>}
                      {isInjecting && (
                        <Button variant="destructive" size="sm"
                          className="h-6 px-2.5 text-[10px] font-semibold bg-red-900/50 border border-red-700/60 text-red-300 hover:bg-red-800/60"
                          onClick={handleAbort}>
                          ايقاف
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="overflow-y-auto p-3 max-h-[130px] font-mono text-[11px] text-green-400 space-y-1" dir="ltr">
                    {injectStatus === "countdown" && (
                      <div className="text-amber-400 text-center py-2 space-y-1 animate-pulse">
                        <p className="font-semibold text-xs">انقر داخل NewPoint الآن!</p>
                        <p className="text-3xl font-black" style={{ fontVariantNumeric: "tabular-nums" }}>{countdown}</p>
                      </div>
                    )}
                    {injectLogs.map((log, idx) => (
                      <div key={idx} className="leading-relaxed border-l-2 border-green-500/20 pl-2">{log}</div>
                    ))}
                    <div ref={logEndRef} />
                  </div>
                  {isInjecting && (
                    <div className="px-3 py-1.5 border-t border-border/40 text-[10px] text-muted-foreground/60" dir="rtl">
                      لإيقاف فوري: حرّك الماوس إلى الزاوية العليا اليسرى من الشاشة.
                    </div>
                  )}
                </div>
              ) : (
                <div className="shrink-0 h-9 rounded-lg border border-dashed border-border/50 flex items-center justify-center gap-2 text-muted-foreground/50">
                  <Terminal className="w-3.5 h-3.5" />
                  <span className="text-[11px]">مخرجات الـ RPA ستظهر هنا</span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── نافذة المراجعة قبل الحقن ── */}
      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent
          className="max-w-4xl bg-card border-border rounded-xl text-right"
          dir="rtl"
          style={{ maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
        >
          <DialogHeader className="shrink-0 border-b border-border pb-3">
            <DialogTitle className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
              مراجعة وتأكيد بنود الحقن — NewPoint ERP
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-1">
            <div className="py-3 space-y-3">
              <div className="px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-300/90 leading-relaxed">
                راجع رقم القطعة والكمية التي سيكتبها الروبوت في NewPoint. تأكد من نوع الكمية (حبة أو كرتون) للتحويل الصحيح.
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs text-right">
                  <thead className="bg-muted sticky top-0 border-b border-border z-10">
                    <tr>
                      <th className="p-2.5 font-medium text-right">الوصف</th>
                      <th className="p-2.5 font-medium text-right w-40">كود الحقن</th>
                      <th className="p-2.5 font-medium text-center w-28">الوحدة</th>
                      <th className="p-2.5 font-medium text-center w-24">الكمية</th>
                      <th className="p-2.5 font-medium text-center w-24">حبات/كرتون</th>
                      <th className="p-2.5 font-medium text-center w-28">إجمالي الحبات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {reviewItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-muted/20 transition-colors">
                        <td className="p-2 font-medium max-w-[160px] truncate text-xs">{item.description}</td>
                        <td className="p-2">
                          <Input
                            value={item.partNumber || ""}
                            onChange={(e) => updateReviewItem(idx, 'partNumber', e.target.value)}
                            className="h-7 font-mono text-purple-300 text-xs text-center"
                            placeholder="كود ERP"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={item.unitMode}
                            onChange={(e) => updateReviewItem(idx, 'unitMode', e.target.value)}
                            className="bg-card border border-border h-7 px-2 rounded-md text-xs w-full focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                          >
                            <option value="pieces">حبة</option>
                            <option value="cartons">كرتون</option>
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            value={item.quantity || 0}
                            onChange={(e) => updateReviewItem(idx, 'quantity', Number(e.target.value))}
                            className="h-7 w-full text-center font-semibold text-xs bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                            min={1}
                            style={{ direction: "ltr", fontVariantNumeric: "tabular-nums" }}
                          />
                        </td>
                        <td className="p-2">
                          {item.unitMode === 'cartons' ? (
                            <input
                              type="number"
                              value={item.packFactor || 1}
                              onChange={(e) => updateReviewItem(idx, 'packFactor', Number(e.target.value))}
                              className="h-7 w-full text-center font-semibold text-xs bg-muted border border-purple-500/40 text-purple-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400"
                              min={1}
                              style={{ direction: "ltr", fontVariantNumeric: "tabular-nums" }}
                            />
                          ) : (
                            <span className="block text-center text-muted-foreground/50">—</span>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          {item.unitMode === 'cartons' ? (
                            <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/25 text-purple-300 text-[11px] font-bold inline-block min-w-[60px]" style={{ direction: "ltr" }}>
                              {item.quantity * item.packFactor}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/25 text-blue-300 text-[11px] font-bold inline-block min-w-[60px]" style={{ direction: "ltr" }}>
                              {item.quantity}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="shrink-0 flex justify-end gap-2 pt-3 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setIsReviewOpen(false)}>
              إلغاء
            </Button>
            <Button
              size="sm"
              onClick={startFinalInjection}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              <Play className="w-3.5 h-3.5" />
              تأكيد وبدء الحقن
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── نافذة تصحيح رقم القطعة ── */}
      <Dialog open={!!inputRequired} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-[420px] p-0 bg-card border border-amber-500/30 rounded-2xl text-right shadow-2xl overflow-hidden"
          dir="rtl"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          {/* ── رأس النافذة ── */}
          <div className="flex items-center gap-3 px-5 pt-5 pb-4 bg-amber-500/6 border-b border-amber-500/15">
            <div className="w-10 h-10 rounded-xl bg-amber-500/12 border border-amber-500/20 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-500 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">رقم القطعة غير موجود في ERP</p>
              <p className="text-[11px] text-amber-600/70 dark:text-amber-400/70 mt-0.5 font-medium">
                الصف {(inputRequired?.row ?? 0) + 1} — الروبوت متوقف وينتظر قرارك
              </p>
            </div>
            <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0 animate-pulse" />
          </div>

          <div className="px-5 py-4 space-y-4">

            {/* ── معلومات القطعة ── */}
            <div className="rounded-xl border border-border bg-muted/30 overflow-hidden">
              <div className="flex items-start gap-3 px-4 py-3 border-b border-border/50">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pt-0.5 shrink-0 w-20 text-left">الوصف</span>
                <span className="text-sm font-medium text-foreground leading-snug text-right flex-1">
                  {inputRequired?.description || "—"}
                </span>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0 w-20 text-left">الرقم المرفوض</span>
                <div className="flex-1 flex justify-end">
                  <span
                    className="inline-flex items-center font-mono font-bold text-red-500 dark:text-red-400 bg-red-500/8 border border-red-500/20 px-3 py-1 rounded-lg text-sm tracking-widest"
                    style={{ direction: "ltr" }}
                  >
                    {inputRequired?.part || "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* ── حقل الإدخال ── */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                أدخل الرقم الصحيح
              </label>
              <Input
                value={correctedPart}
                onChange={(e) => setCorrectedPart(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && correctedPart.trim()) {
                    sendCorrectedPart(correctedPart.trim());
                    setCorrectedPart("");
                  }
                }}
                placeholder="الرقم المعتمد في نظامك..."
                className="font-mono font-semibold border-amber-500/30 focus-visible:ring-amber-500/40 h-11 text-sm tracking-wide bg-background"
                dir="ltr"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                اضغط Enter للتأكيد السريع
              </p>
            </div>

            {/* ── أزرار الإجراء ── */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                className="gap-2 h-10 bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-sm"
                disabled={!correctedPart.trim()}
                onClick={() => { sendCorrectedPart(correctedPart.trim()); setCorrectedPart(""); }}
              >
                <CheckCircle2 className="w-4 h-4" />
                تأكيد وإكمال
              </Button>
              <Button
                variant="outline"
                className="gap-2 h-10 text-sm font-medium border-border hover:bg-muted"
                onClick={() => { sendCorrectedPart("skip"); setCorrectedPart(""); }}
              >
                <SkipForward className="w-4 h-4" />
                تخطي هذه القطعة
              </Button>
            </div>

            {/* ── فاصل ── */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[11px] text-muted-foreground/60 font-medium px-1">أو إذا أردت إلغاء كل شيء</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* ── زر الإيقاف الكامل ── */}
            <Button
              variant="outline"
              className="w-full gap-2 h-10 border-red-500/30 text-red-500 dark:text-red-400 hover:bg-red-500/8 hover:border-red-500/50 font-semibold text-sm"
              onClick={async () => {
                setCorrectedPart("");
                setInputRequired(null);
                await handleAbort();
              }}
            >
              <XCircle className="w-4 h-4" />
              إيقاف الحقن نهائياً وإلغاء العملية
            </Button>

          </div>

          {/* ── شريط الحالة السفلي ── */}
          <div className="flex items-center gap-2 px-5 py-2.5 bg-muted/40 border-t border-border/60">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
            <span className="text-[11px] text-muted-foreground font-medium">
              الروبوت متوقف — لا يكتب في NewPoint حتى تختار أحد الخيارات أعلاه
            </span>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── نافذة تعديل الفاتورة ── */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent
          className="max-w-5xl bg-card border-border rounded-xl text-right"
          dir="rtl"
          style={{ maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
        >
          <DialogHeader className="shrink-0 border-b border-border pb-3">
            <DialogTitle className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Pencil className="w-4 h-4 text-blue-400 shrink-0" />
              تعديل الفاتورة
              {editInvoice && (
                <span className="mr-auto text-xs font-normal text-muted-foreground font-mono">
                  {editInvoice.invoiceNumber || "—"}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {editInvoice && (
            <>
              {/* حقول رأس الفاتورة — ثابتة */}
              <div className="shrink-0 grid grid-cols-3 gap-3 py-3 border-b border-border/50">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-muted-foreground">رقم الفاتورة</label>
                  <Input
                    value={editInvoice.invoiceNumber || ""}
                    onChange={(e) => setEditInvoice({ ...editInvoice, invoiceNumber: e.target.value })}
                    className="h-8 text-sm"
                    placeholder="رقم الفاتورة"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-muted-foreground">المورد</label>
                  <Input
                    value={editInvoice.supplier || ""}
                    onChange={(e) => setEditInvoice({ ...editInvoice, supplier: e.target.value })}
                    className="h-8 text-sm"
                    placeholder="اسم المورد"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-muted-foreground">التاريخ</label>
                  <Input
                    value={editInvoice.date || ""}
                    onChange={(e) => setEditInvoice({ ...editInvoice, date: e.target.value })}
                    className="h-8 text-sm"
                    placeholder="YYYY-MM-DD"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* جدول البنود — قابل للتمرير */}
              <div className="flex-1 overflow-y-auto min-h-0">
                <table className="w-full text-xs text-right">
                  <thead className="bg-muted sticky top-0 border-b border-border z-10">
                    <tr>
                      <th className="p-2.5 font-medium text-center w-10 text-muted-foreground">#</th>
                      <th className="p-2.5 font-medium w-36">رقم القطعة</th>
                      <th className="p-2.5 font-medium">الوصف</th>
                      <th className="p-2.5 font-medium text-center w-22">الكمية</th>
                      <th className="p-2.5 font-medium text-center w-28">سعر الوحدة</th>
                      <th className="p-2.5 font-medium text-center w-24">الإجمالي</th>
                      <th className="p-2.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {editItems.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-muted/20 transition-colors">
                        <td className="p-2 text-center text-muted-foreground font-mono" style={{ direction: "ltr" }}>{idx + 1}</td>
                        <td className="p-2">
                          <Input
                            value={item.partNumber || ""}
                            onChange={(e) => {
                              const next = [...editItems];
                              next[idx] = { ...next[idx], partNumber: e.target.value };
                              setEditItems(next);
                            }}
                            className="h-7 font-mono text-purple-300 text-xs"
                            placeholder="رقم القطعة"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            value={item.description || ""}
                            onChange={(e) => {
                              const next = [...editItems];
                              next[idx] = { ...next[idx], description: e.target.value };
                              setEditItems(next);
                            }}
                            className="h-7 text-xs"
                            placeholder="الوصف"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            value={item.quantity ?? 0}
                            onChange={(e) => {
                              const next = [...editItems];
                              next[idx] = { ...next[idx], quantity: Number(e.target.value) };
                              setEditItems(next);
                            }}
                            className="h-7 w-full text-center text-xs font-semibold bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                            min={0}
                            style={{ direction: "ltr", fontVariantNumeric: "tabular-nums" }}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            value={item.unitCost ?? 0}
                            onChange={(e) => {
                              const next = [...editItems];
                              next[idx] = { ...next[idx], unitCost: Number(e.target.value) };
                              setEditItems(next);
                            }}
                            className="h-7 w-full text-center text-xs font-semibold bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                            min={0}
                            step="0.01"
                            style={{ direction: "ltr", fontVariantNumeric: "tabular-nums" }}
                          />
                        </td>
                        <td className="p-2 text-center font-semibold text-primary text-xs" style={{ direction: "ltr" }}>
                          {((item.quantity || 0) * (item.unitCost || 0)).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </td>
                        <td className="p-2 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive/50 hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setEditItems(editItems.filter((_: any, i: number) => i !== idx))}
                            title="حذف البند"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/20 border-t border-border sticky bottom-0">
                    <tr>
                      <td colSpan={5} className="p-2.5 text-xs font-semibold text-muted-foreground">الإجمالي</td>
                      <td className="p-2.5 text-center font-bold text-primary text-sm" style={{ direction: "ltr" }}>
                        {editItems.reduce((s: number, it: any) => s + (it.quantity || 0) * (it.unitCost || 0), 0).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* أزرار الحفظ — ثابتة */}
              <div className="shrink-0 flex justify-end gap-2 pt-3 border-t border-border">
                <Button variant="outline" size="sm" onClick={() => setIsEditOpen(false)}>
                  إلغاء
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit}
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                >
                  {isSavingEdit ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> جاري الحفظ...</>
                  ) : (
                    <><CheckCircle2 className="w-3.5 h-3.5" /> حفظ التعديلات</>
                  )}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── تأكيد حذف الفاتورة ── */}
      <AlertDialog open={deleteConfirmId != null} onOpenChange={open => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent className="max-w-sm rounded-2xl border-border bg-card" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <Trash2 className="w-4 h-4 text-red-400" />
              حذف الفاتورة
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              هل تريد حذف هذه الفاتورة نهائياً؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 flex-row-reverse">
            <AlertDialogCancel className="flex-1 rounded-xl">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white"
              onClick={confirmDelete}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "قيد المراجعة", cls: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" },
    saved: { label: "محفوظة", cls: "bg-green-500/10 text-green-400 border border-green-500/20" },
    injected: { label: "تم الحقن", cls: "bg-blue-500/10 text-blue-400 border border-blue-500/20" },
  };
  const badge = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground border border-border" };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${badge.cls}`}>
      {badge.label}
    </span>
  );
}