import { useListParts, getListPartsQueryKey, useCreatePart, useDeletePart } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Trash2, Database, Edit, ChevronRight, ChevronLeft, ArrowUpDown, TrendingUp } from "lucide-react";
import { useState, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ITEMS_PER_PAGE = 25;

type SortKey = "usageCount" | "partNumber" | "description";
type SortDir = "asc" | "desc";

export default function Parts() {
  const { data: parts, isLoading } = useListParts({
    query: { queryKey: getListPartsQueryKey() }
  });
  
  const createPart = useCreatePart();
  const deletePart = useDeletePart();
  const queryClient = useQueryClient();
  
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("usageCount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [newPartNumber, setNewPartNumber] = useState("");
  const [newOriginalPartNumber, setNewOriginalPartNumber] = useState("");
  const [newPackFactor, setNewPackFactor] = useState(1);
  const [newDescription, setNewDescription] = useState("");

  const [editingPart, setEditingPart] = useState<any | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editPartNumber, setEditPartNumber] = useState("");
  const [editOriginalPartNumber, setEditOriginalPartNumber] = useState("");
  const [editPackFactor, setEditPackFactor] = useState(1);
  const [editDescription, setEditDescription] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const handleAddPart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartNumber || !newDescription) return;
    createPart.mutate({
      data: {
        partNumber: newPartNumber,
        originalPartNumber: newOriginalPartNumber || null,
        packFactor: newPackFactor || 1,
        description: newDescription
      }
    }, {
      onSuccess: () => {
        toast.success("تمت إضافة القطعة بنجاح");
        setNewPartNumber("");
        setNewOriginalPartNumber("");
        setNewPackFactor(1);
        setNewDescription("");
        queryClient.invalidateQueries({ queryKey: getListPartsQueryKey() });
      },
      onError: () => toast.error("حدث خطأ أثناء الإضافة")
    });
  };

  const handleDelete = (part: any) => {
    setDeleteTarget(part);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deletePart.mutate({ id: deleteTarget.id }, {
      onSuccess: () => {
        toast.success("تم حذف القطعة من الذاكرة");
        setDeleteTarget(null);
        queryClient.invalidateQueries({ queryKey: getListPartsQueryKey() });
      },
      onError: () => { toast.error("حدث خطأ أثناء الحذف"); setDeleteTarget(null); },
    });
  };

  const handleOpenEdit = (part: any) => {
    setEditingPart(part);
    setEditPartNumber(part.partNumber);
    setEditOriginalPartNumber(part.originalPartNumber || "");
    setEditPackFactor(part.packFactor ?? 1);
    setEditDescription(part.description);
    setIsEditOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPart || !editPartNumber || !editDescription) return;
    setIsSavingEdit(true);
    try {
      const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/api/parts/${editingPart.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partNumber: editPartNumber,
          originalPartNumber: editOriginalPartNumber || null,
          packFactor: editPackFactor || 1,
          description: editDescription
        })
      });
      if (!res.ok) throw new Error("Failed to update part");
      toast.success("تم تعديل الصنف بنجاح ✓");
      setIsEditOpen(false);
      setEditingPart(null);
      queryClient.invalidateQueries({ queryKey: getListPartsQueryKey() });
    } catch {
      toast.error("حدث خطأ أثناء تعديل الصنف");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir(key === "usageCount" ? "desc" : "asc");
    }
    setPage(0);
  };

  const filteredAndSorted = useMemo(() => {
    if (!parts) return [];
    const filtered = parts.filter(p =>
      p.partNumber.toLowerCase().includes(search.toLowerCase()) ||
      (p.originalPartNumber && p.originalPartNumber.toLowerCase().includes(search.toLowerCase())) ||
      p.description.toLowerCase().includes(search.toLowerCase())
    );
    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "usageCount") cmp = (a.usageCount ?? 0) - (b.usageCount ?? 0);
      else if (sortKey === "partNumber") cmp = a.partNumber.localeCompare(b.partNumber);
      else if (sortKey === "description") cmp = a.description.localeCompare(b.description);
      return sortDir === "desc" ? -cmp : cmp;
    });
    return filtered;
  }, [parts, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / ITEMS_PER_PAGE));
  const paginated = filteredAndSorted.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  // Reset page on search change
  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(0);
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (
      <span className={`text-primary text-[10px] font-mono ${sortDir === "desc" ? "opacity-100" : "opacity-60"}`}>
        {sortDir === "desc" ? "↓" : "↑"}
      </span>
    ) : (
      <ArrowUpDown className="w-3 h-3 text-muted-foreground/40" />
    );

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">ذاكرة القطع</h2>
        <p className="text-muted-foreground text-sm mt-1">
          إدارة قاعدة بيانات القطع للتعرف التلقائي عليها مستقبلاً.
        </p>
      </div>

      {/* ── نموذج الإضافة ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            إضافة قطعة جديدة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddPart} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  الرقم المعتمد عندنا <span className="text-destructive">*</span>
                </label>
                <Input
                  value={newPartNumber}
                  onChange={e => setNewPartNumber(e.target.value)}
                  placeholder="الكود المعتمد لدينا"
                  className="font-mono text-purple-300 h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  الرقم الأصلي بالفاتورة{" "}
                  <span className="text-muted-foreground/50">(اختياري)</span>
                </label>
                <Input
                  value={newOriginalPartNumber}
                  onChange={e => setNewOriginalPartNumber(e.target.value)}
                  placeholder="الرقم كما يطبعه المورد"
                  className="font-mono h-9"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  الوصف المعتمد <span className="text-destructive">*</span>
                </label>
                <Input
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder="وصف القطعة المعتمد في النظام"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">حبة / كرتون</label>
                <Input
                  type="number"
                  value={newPackFactor}
                  onChange={e => setNewPackFactor(Number(e.target.value))}
                  placeholder="1"
                  min={1}
                  className="h-9"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={createPart.isPending || !newPartNumber || !newDescription}
                size="sm"
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                إضافة للذاكرة
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── شريط البحث والفلتر ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث في الذاكرة..."
            className="pr-10 h-9"
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>

        {/* ترتيب بالاستخدام */}
        <button
          onClick={() => handleSort("usageCount")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
            sortKey === "usageCount"
              ? "bg-primary/10 border-primary/25 text-primary"
              : "bg-card border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          الأكثر استخداماً
          <SortIcon k="usageCount" />
        </button>

        {filteredAndSorted.length > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">
            {filteredAndSorted.length} قطعة
            {filteredAndSorted.length > ITEMS_PER_PAGE && (
              <span className="text-muted-foreground/50">
                {" "}— صفحة {page + 1} من {totalPages}
              </span>
            )}
          </span>
        )}
      </div>

      {/* ── الجدول ── */}
      <Card className="bg-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th
                    className="p-3 font-medium text-right cursor-pointer hover:text-foreground select-none"
                    onClick={() => handleSort("partNumber")}
                  >
                    <span className="flex items-center gap-1.5">
                      الرقم المعتمد <SortIcon k="partNumber" />
                    </span>
                  </th>
                  <th className="p-3 font-medium text-right">الرقم الأصلي</th>
                  <th
                    className="p-3 font-medium text-right cursor-pointer hover:text-foreground select-none"
                    onClick={() => handleSort("description")}
                  >
                    <span className="flex items-center gap-1.5">
                      الوصف <SortIcon k="description" />
                    </span>
                  </th>
                  <th className="p-3 font-medium text-center w-28">حبة/كرتون</th>
                  <th
                    className="p-3 font-medium text-center w-24 cursor-pointer hover:text-foreground select-none"
                    onClick={() => handleSort("usageCount")}
                  >
                    <span className="flex items-center justify-center gap-1">
                      الاستخدام <SortIcon k="usageCount" />
                    </span>
                  </th>
                  <th className="p-3 font-medium text-center w-24">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array(6).fill(0).map((_, i) => (
                    <tr key={i}>
                      {Array(6).fill(0).map((_, j) => (
                        <td key={j} className="p-4">
                          <Skeleton className="h-5 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2 opacity-60">
                        <Database className="w-8 h-8 opacity-40" />
                        <p className="text-sm">{search ? "لا توجد نتائج مطابقة" : "لا توجد قطع في الذاكرة"}</p>
                        {!search && <p className="text-xs">أضف قطعة جديدة من الأعلى</p>}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginated.map((part) => (
                    <tr key={part.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-mono text-sm font-semibold text-violet-600 dark:text-violet-300">
                        {part.partNumber}
                      </td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">
                        {part.originalPartNumber || "—"}
                      </td>
                      <td className="p-3 text-sm">{part.description}</td>
                      <td className="p-3 text-center">
                        {part.packFactor && part.packFactor > 1 ? (
                          <span className="px-2 py-0.5 bg-violet-500/10 border border-violet-500/20 text-violet-600 dark:text-violet-300 rounded-full text-xs font-semibold">
                            {part.packFactor} حبة
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 text-xs">—</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {(part.usageCount ?? 0) > 0 ? (
                          <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-semibold tabular-nums">
                            {part.usageCount}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => handleOpenEdit(part)}
                            title="تعديل"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive/60 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleDelete(part)}
                            disabled={deletePart.isPending}
                            title="حذف"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── ترقيم الصفحات ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronRight className="w-3.5 h-3.5" />
                السابق
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const idx = totalPages <= 7 ? i : 
                    page < 4 ? i :
                    page > totalPages - 5 ? totalPages - 7 + i :
                    page - 3 + i;
                  return (
                    <button
                      key={idx}
                      onClick={() => setPage(idx)}
                      className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                        page === idx
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                التالي
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── تأكيد الحذف ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-sm rounded-2xl border-border bg-card" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <Trash2 className="w-4 h-4 text-red-400" />
              حذف القطعة
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              هل تريد حذف{" "}
              <span className="font-semibold text-foreground">«{deleteTarget?.partNumber}»</span>{" "}
              من ذاكرة القطع؟ لا يمكن التراجع عن هذا الإجراء.
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

      {/* ── نافذة التعديل ── */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md bg-card border-border overflow-hidden rounded-xl" dir="rtl">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
              <Edit className="w-4 h-4 text-primary" />
              تعديل بيانات الصنف
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveEdit} className="space-y-4 py-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                الرقم المعتمد عندنا <span className="text-destructive">*</span>
              </label>
              <Input
                value={editPartNumber}
                onChange={e => setEditPartNumber(e.target.value)}
                placeholder="رقم القطعة المعتمد"
                className="font-mono text-purple-300 h-9"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                الرقم الأصلي بالفاتورة{" "}
                <span className="text-muted-foreground/50">(اختياري)</span>
              </label>
              <Input
                value={editOriginalPartNumber}
                onChange={e => setEditOriginalPartNumber(e.target.value)}
                placeholder="الرقم كما يطبع عند المورد"
                className="font-mono h-9"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                الوصف المعتمد <span className="text-destructive">*</span>
              </label>
              <Input
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                placeholder="وصف القطعة المعتمد"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">حبة بالكرتون</label>
              <Input
                type="number"
                value={editPackFactor}
                onChange={e => setEditPackFactor(Number(e.target.value))}
                placeholder="1"
                min={1}
                className="h-9"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsEditOpen(false)}
                disabled={isSavingEdit}
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSavingEdit || !editPartNumber || !editDescription}
              >
                {isSavingEdit ? "جاري الحفظ..." : "حفظ التعديلات"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
