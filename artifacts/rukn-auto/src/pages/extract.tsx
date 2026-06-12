import { useState, useRef } from "react";
import { useExtractInvoice, useSaveInvoice, useDeleteInvoice, getListInvoicesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UploadCloud, CheckCircle2, Save, Loader2, FileText, ScanLine, Trash2, Plus, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

interface PageImage {
  file: File;
  preview: string;
}

export default function Extract() {
  const [pages, setPages] = useState<PageImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const page2InputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [isExtracting, setIsExtracting] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  const extractInvoice = useExtractInvoice();
  const saveInvoice = useSaveInvoice();
  const deleteInvoice = useDeleteInvoice();

  const [extractedData, setExtractedData] = useState<any | null>(null);

  // ─── helpers ──────────────────────────────────────────────────────────────

  const readAsDataURL = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const processFile = async (selected: File, slot: 0 | 1) => {
    if (!selected.type.startsWith("image/")) {
      toast.error("الرجاء رفع ملف صورة صالح");
      return;
    }
    const preview = await readAsDataURL(selected);
    setPages((prev) => {
      const next = [...prev];
      next[slot] = { file: selected, preview };
      return next;
    });
    // reset extracted data when images change
    setExtractedData(null);
  };

  const removePage = (slot: number) => {
    setPages((prev) => {
      const next = [...prev];
      next.splice(slot, 1);
      return next;
    });
    setExtractedData(null);
  };

  // ─── extract ──────────────────────────────────────────────────────────────

  const extractOne = (preview: string, file: File): Promise<any> =>
    new Promise((resolve, reject) => {
      const base64 = preview.split(",")[1];
      const mimeMatch = preview.match(/^data:(image\/[a-z+]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : file.type || "image/jpeg";
      extractInvoice.mutate(
        { data: { imageBase64: base64, mimeType } },
        {
          onSuccess: resolve,
          onError: reject,
        }
      );
    });

  const handleExtract = async () => {
    if (pages.length === 0) return;
    setIsExtracting(true);

    try {
      if (pages.length === 1) {
        // single page
        const data = await extractOne(pages[0].preview, pages[0].file);
        setExtractedData(data);
        toast.success("تم استخراج البيانات بنجاح ✓");
      } else {
        // two pages — extract both then MERGE into one record (delete page2 invoice)
        toast.info("جاري استخراج الصفحة الأولى…");
        const page1 = await extractOne(pages[0].preview, pages[0].file);

        toast.info("جاري استخراج الصفحة الثانية…");
        const page2 = await extractOne(pages[1].preview, pages[1].file);

        // Delete page2 invoice record — we only keep page1's record
        if (page2?.invoiceId) {
          try {
            await new Promise<void>((res, rej) =>
              deleteInvoice.mutate(
                { id: page2.invoiceId },
                { onSuccess: () => res(), onError: rej }
              )
            );
          } catch {
            // non-fatal — page2 record cleanup failed, proceed anyway
          }
        }

        // merge: metadata from page 1, items from BOTH in order
        const merged = {
          ...page1,
          items: [...(page1.items || []), ...(page2.items || [])],
        };
        setExtractedData(merged);
        toast.success(`تم دمج ${merged.items.length} بند من صفحتين في فاتورة واحدة ✓`);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error;
      toast.error(msg || "فشل الاستخراج — تحقق من الاتصال أو أعد المحاولة");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleDiscard = () => {
    if (!extractedData?.invoiceId) {
      setExtractedData(null);
      setPages([]);
      return;
    }
    deleteInvoice.mutate(
      { id: extractedData.invoiceId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
          setExtractedData(null);
          setPages([]);
          toast.info("تم تجاهل الفاتورة وحذفها");
        },
        onError: () => {
          setExtractedData(null);
          setPages([]);
          toast.info("تم تجاهل الفاتورة");
        },
      }
    );
  };

  const handleSave = (forceOverride = false) => {
    if (!extractedData) return;
    setDuplicateWarning(null);

    saveInvoice.mutate(
      {
        id: extractedData.invoiceId,
        data: {
          invoiceNumber: extractedData.invoiceNumber || "",
          supplier: extractedData.supplier || "",
          date: extractedData.date || "",
          items: extractedData.items || [],
        },
      },
      {
        onSuccess: () => {
          toast.success("تم حفظ الفاتورة بنجاح");
          queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
          setLocation("/invoices");
        },
        onError: (err: any) => {
          // 409 = duplicate invoice number
          const status = err?.response?.status ?? err?.status;
          const msg = err?.response?.data?.error ?? err?.data?.error ?? "";
          if (status === 409) {
            setDuplicateWarning(msg);
          } else {
            toast.error("حدث خطأ أثناء الحفظ");
          }
        },
      }
    );
  };

  const updateItem = (index: number, field: string, value: any) => {
    if (!extractedData) return;
    const newItems = [...extractedData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === "partNumber" || field === "description") {
      newItems[index].needsManualInput = false;
    }
    setExtractedData({ ...extractedData, items: newItems });
  };

  // ─── render ───────────────────────────────────────────────────────────────

  const canExtract = pages.length > 0 && !isExtracting && !extractedData;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">استخراج فاتورة</h2>
        <p className="text-muted-foreground text-sm mt-1">
          ارفع صورة الفاتورة — يمكنك إضافة صفحة ثانية إذا كانت الفاتورة تمتد على صفحتين.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Image Upload Panel ────────────────────────────── */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="bg-card">
            <CardContent className="p-4 space-y-4">

              {/* Slot 1 */}
              {pages[0] ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">
                      📄 الصفحة الأولى
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                      onClick={() => removePage(0)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="rounded-lg overflow-hidden border border-border">
                    <img src={pages[0].preview} alt="صفحة 1" className="w-full h-auto" />
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-border rounded-lg p-10 text-center hover:bg-muted/50 transition-colors cursor-pointer"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) processFile(f, 0);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadCloud className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium mb-1">الصفحة الأولى</p>
                  <p className="text-xs text-muted-foreground">اسحب أو انقر للاختيار</p>
                  <input
                    type="file"
                    className="hidden"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) processFile(f, 0);
                      e.target.value = "";
                    }}
                  />
                </div>
              )}

              {/* Slot 2 — only show if slot 1 is filled */}
              {pages[0] && (
                <>
                  {pages[1] ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground">
                          📄 الصفحة الثانية
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                          onClick={() => removePage(1)}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <div className="rounded-lg overflow-hidden border border-border">
                        <img src={pages[1].preview} alt="صفحة 2" className="w-full h-auto" />
                      </div>
                    </div>
                  ) : (
                    <div
                      className="border-2 border-dashed border-purple-500/30 rounded-lg p-6 text-center hover:bg-purple-500/5 transition-colors cursor-pointer"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const f = e.dataTransfer.files?.[0];
                        if (f) processFile(f, 1);
                      }}
                      onClick={() => page2InputRef.current?.click()}
                    >
                      <ImagePlus className="w-7 h-7 text-purple-400/60 mx-auto mb-2" />
                      <p className="text-xs text-purple-400/80 font-medium">
                        إضافة صفحة ثانية (اختياري)
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        إذا كانت الفاتورة في صفحتين
                      </p>
                      <input
                        type="file"
                        className="hidden"
                        ref={page2InputRef}
                        accept="image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) processFile(f, 1);
                          e.target.value = "";
                        }}
                      />
                    </div>
                  )}
                </>
              )}

              {/* Extract / Cancel All buttons */}
              {pages.length > 0 && (
                <div className="space-y-3 pt-1">
                  {canExtract && (
                    <Button className="w-full gap-2" size="lg" onClick={handleExtract}>
                      <ScanLine className="w-4 h-4" />
                      {pages.length === 2
                        ? "استخراج الفاتورة (صفحتان)"
                        : "استخراج البيانات"}
                    </Button>
                  )}

                  {isExtracting && (
                    <Button className="w-full" size="lg" disabled>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      جاري الاستخراج…
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 text-muted-foreground hover:text-red-400 hover:border-red-500/40 transition-colors"
                    onClick={() => { setPages([]); setExtractedData(null); }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    مسح الكل وبدء من جديد
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right: Extracted Data ────────────────────────────────── */}
        <div className="lg:col-span-2">
          <Card className="bg-card min-h-[500px]">
            <CardContent className="p-6">
              {isExtracting ? (
                <div className="space-y-6 animate-pulse">
                  <div className="h-8 bg-muted rounded w-1/3 mb-8" />
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex gap-4">
                        <div className="h-10 bg-muted rounded w-1/4" />
                        <div className="h-10 bg-muted rounded w-1/2" />
                        <div className="h-10 bg-muted rounded w-1/4" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : extractedData ? (
                <div className="space-y-6">
                  {/* multi-page notice */}
                  {pages.length === 2 && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300">
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      تم دمج بنود صفحتين في فاتورة واحدة — {extractedData.items?.length} بند إجمالاً
                    </div>
                  )}

                  {/* Invoice header fields */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">رقم الفاتورة</label>
                      <Input
                        value={extractedData.invoiceNumber || ""}
                        onChange={(e) =>
                          setExtractedData({ ...extractedData, invoiceNumber: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">المورد</label>
                      <Input
                        value={extractedData.supplier || ""}
                        onChange={(e) =>
                          setExtractedData({ ...extractedData, supplier: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">التاريخ</label>
                      <Input
                        value={extractedData.date || ""}
                        onChange={(e) =>
                          setExtractedData({ ...extractedData, date: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  {/* Items table */}
                  <div className="border border-border rounded-md overflow-hidden">
                    <table className="w-full text-sm text-right" dir="rtl">
                      <thead className="bg-muted">
                        <tr>
                          <th className="p-3 font-medium text-right">رقم القطعة المعتمد</th>
                          <th className="p-3 font-medium text-right">الوصف</th>
                          <th className="p-3 font-medium text-center w-20">الكمية</th>
                          <th className="p-3 font-medium text-center w-24">حبة/كرتون</th>
                          <th className="p-3 font-medium text-center w-28">سعر الكرتون</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {extractedData.items?.map((item: any, idx: number) => (
                          <tr
                            key={idx}
                            className={item.needsManualInput ? "bg-amber-500/10 dark:bg-amber-900/20" : ""}
                          >
                            <td className="p-2 w-44">
                              <Input
                                value={item.partNumber || ""}
                                onChange={(e) => updateItem(idx, "partNumber", e.target.value)}
                                className={`h-8 font-mono ${
                                  item.needsManualInput
                                    ? "border-yellow-500/50 focus-visible:ring-yellow-500"
                                    : ""
                                }`}
                              />
                            </td>
                            <td className="p-2">
                              <div className="flex flex-col gap-0.5">
                                <Input
                                  value={item.description || ""}
                                  onChange={(e) => updateItem(idx, "description", e.target.value)}
                                  className={`h-8 ${
                                    item.memoryMatch
                                      ? "border-violet-500/50 text-violet-700 dark:text-violet-200 bg-violet-500/10"
                                      : ""
                                  }`}
                                />
                                {item.memoryMatch && (
                                  <div className="flex items-center gap-1 text-violet-600 dark:text-violet-400 px-1">
                                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                                    <span className="text-[9px] font-semibold">
                                      {item.memoryConfidence}% مطابقة من الذاكرة
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="p-2 w-20">
                              <Input
                                type="number"
                                value={item.quantity || 0}
                                onChange={(e) =>
                                  updateItem(idx, "quantity", Number(e.target.value))
                                }
                                className="h-8"
                              />
                            </td>
                            <td className="p-2 w-24">
                              <div className="flex flex-col gap-1">
                                <Input
                                  type="number"
                                  value={item.packFactor || 1}
                                  onChange={(e) =>
                                    updateItem(idx, "packFactor", Number(e.target.value))
                                  }
                                  className={`h-8 ${
                                    item.packFactor > 1
                                      ? "border-violet-500/50 text-violet-700 dark:text-violet-200"
                                      : ""
                                  }`}
                                  min={1}
                                />
                                {item.packFactor > 1 && (
                                  <span className="text-[9px] text-violet-600 dark:text-violet-300 font-bold text-center block leading-none">
                                    ⚡ {item.quantity * item.packFactor} حبة
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-2 w-24">
                              <Input
                                type="number"
                                value={item.unitCost || 0}
                                onChange={(e) =>
                                  updateItem(idx, "unitCost", Number(e.target.value))
                                }
                                className="h-8"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-6 space-y-3">
                    {/* Duplicate invoice number warning */}
                    {duplicateWarning && (
                      <div className="flex flex-col gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-sm">
                        <div className="flex items-start gap-2 text-red-600 dark:text-red-300">
                          <span className="text-lg leading-none mt-0.5">⚠️</span>
                          <div>
                            <p className="font-bold mb-1">تكرار رقم فاتورة!</p>
                            <p className="text-xs text-red-600/80 dark:text-red-400/90 leading-relaxed">{duplicateWarning}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 border-red-500/40 text-red-600 dark:text-red-300 hover:bg-red-500/10"
                            onClick={() => setDuplicateWarning(null)}
                          >
                            إلغاء — لن أحفظ
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                            onClick={() => {
                              // force save by renaming invoice number with suffix
                              setExtractedData((prev: any) => ({
                                ...prev,
                                invoiceNumber: prev.invoiceNumber
                                  ? `${prev.invoiceNumber}-2`
                                  : prev.invoiceNumber,
                              }));
                              setDuplicateWarning(null);
                              toast.info("تم إضافة لاحقة -2 لرقم الفاتورة، احفظ مجدداً للتأكيد");
                            }}
                          >
                            تعديل الرقم وإعادة المحاولة
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between items-center">
                      <Button
                        variant="ghost"
                        onClick={handleDiscard}
                        disabled={deleteInvoice.isPending || saveInvoice.isPending}
                        className="gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        {deleteInvoice.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                        تجاهل وابدأ من جديد
                      </Button>
                      <Button
                        onClick={() => handleSave()}
                        disabled={saveInvoice.isPending || deleteInvoice.isPending}
                        className="gap-2"
                      >
                        {saveInvoice.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        حفظ واعتماد الفاتورة
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-24">
                  <FileText className="w-16 h-16 opacity-20 mb-4" />
                  <p>البيانات المستخرجة ستظهر هنا</p>
                  <p className="text-xs mt-1 opacity-60">
                    ارفع صورة الفاتورة من اليسار ثم انقر استخراج
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}