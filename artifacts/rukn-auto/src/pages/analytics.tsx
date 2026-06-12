import { useState, useEffect } from "react";
import { useAuth, getAuthHeader } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp, TrendingDown, AlertTriangle, Package, DollarSign,
  BarChart3, Brain, Truck, Calendar, RefreshCw, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface Overview {
  monthlySpend: { month: string; spend: number; invoices: number }[];
  memoryStats: { total: number; matched: number; avg_confidence: number | null };
  topSupplier: { supplier: string; invoices: number; total_spend: number } | null;
  anomalyCount: number;
}

interface Supplier {
  supplier: string;
  invoice_count: number;
  total_items: number;
  total_spend: number;
  avg_invoice_value: number;
  memory_hit_rate: number;
  last_invoice_at: string;
}

interface Anomaly {
  item_id: number;
  description: string;
  part_number: string;
  unit_cost: number;
  quantity: number;
  avg_cost: number;
  min_cost: number;
  max_cost: number;
  sample_size: number;
  deviation_pct: number;
  invoice_id: number;
  supplier: string;
  date: string;
}

// ── مكوّنات مساعدة ──────────────────────────────────────────

function Stat({
  icon: Icon, label, value, sub, color = "#10b981", badge,
}: {
  icon: any; label: string; value: string | number; sub?: string;
  color?: string; badge?: { text: string; type: "up" | "down" | "neutral" };
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="w-4 h-4" style={{ color }} />
          <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
        </div>
        <div className="flex items-end gap-2">
          <p className="text-xl font-bold text-foreground leading-none">{value}</p>
          {badge && (
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full mb-0.5 ${
                badge.type === "up"
                  ? "bg-red-500/10 text-red-600 dark:text-red-400"
                  : badge.type === "down"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {badge.text}
            </span>
          )}
        </div>
        {sub && <p className="text-[11px] text-muted-foreground mt-1 truncate">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function AnomalyRow({ a, idx }: { a: Anomaly; idx: number }) {
  const isUp = a.deviation_pct > 0;
  const absPct = Math.abs(a.deviation_pct);

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-border/60 bg-card/40 hover:bg-card/70 transition-colors">
      <div
        className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
          isUp ? "bg-red-500/10" : "bg-green-500/10"
        }`}
      >
        {isUp
          ? <TrendingUp className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
          : <TrendingDown className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate" title={a.description}>
              {a.description || "—"}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[10px] font-mono text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                {a.part_number}
              </span>
              <span className="text-[10px] text-muted-foreground">{a.supplier}</span>
              {a.date && (
                <span className="text-[10px] text-muted-foreground">{a.date}</span>
              )}
            </div>
          </div>

          <div className="text-left shrink-0">
            <p
              className={`text-sm font-bold ${isUp ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}
            >
              {isUp ? "+" : ""}{a.deviation_pct}%
            </p>
            <p className="text-[10px] text-muted-foreground">انحراف</p>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          {[
            { label: "السعر الحالي", val: a.unit_cost, highlight: true },
            { label: "المتوسط التاريخي", val: a.avg_cost, highlight: false },
            { label: "نماذج بيانات", val: a.sample_size, highlight: false, noFormat: true },
          ].map(({ label, val, highlight, noFormat }) => (
            <div
              key={label}
              className={`rounded-lg py-1.5 px-2 ${
                highlight
                  ? isUp
                    ? "bg-red-500/8 border border-red-500/15"
                    : "bg-emerald-500/8 border border-emerald-500/15"
                  : "bg-muted/30"
              }`}
            >
              <p className={`text-xs font-bold ${highlight ? (isUp ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400") : "text-foreground"}`}>
                {noFormat ? val : typeof val === "number" ? val.toFixed(2) : val}
              </p>
              <p className="text-[9px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── الصفحة الرئيسية ──────────────────────────────────────────
export default function Analytics() {
  const { token } = useAuth();
  const headers = { "Content-Type": "application/json", ...getAuthHeader(token) };

  const [overview, setOverview] = useState<Overview | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllAnomalies, setShowAllAnomalies] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [ovRes, supRes, anoRes] = await Promise.all([
        fetch(`${BASE_URL}/api/analytics/overview`, { headers }),
        fetch(`${BASE_URL}/api/analytics/suppliers`, { headers }),
        fetch(`${BASE_URL}/api/analytics/anomalies`, { headers }),
      ]);

      if (!ovRes.ok || !supRes.ok || !anoRes.ok) throw new Error("فشل التحميل");

      const [ov, sup, ano] = await Promise.all([ovRes.json(), supRes.json(), anoRes.json()]);
      setOverview(ov);
      setSuppliers(sup);
      setAnomalies(ano);
    } catch {
      toast.error("تعذّر تحميل بيانات التحليل");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" />
        جاري تحميل التحليلات...
      </div>
    );
  }

  const memRate = overview
    ? overview.memoryStats.total > 0
      ? Math.round((overview.memoryStats.matched / overview.memoryStats.total) * 100)
      : 0
    : 0;

  const totalMonthlySpend = overview?.monthlySpend.reduce((s, m) => s + Number(m.spend), 0) ?? 0;
  const lastMonth = overview?.monthlySpend.at(-1);
  const prevMonth = overview?.monthlySpend.at(-2);
  const monthDiff =
    lastMonth && prevMonth && Number(prevMonth.spend) > 0
      ? Math.round(((Number(lastMonth.spend) - Number(prevMonth.spend)) / Number(prevMonth.spend)) * 100)
      : null;

  const visibleAnomalies = showAllAnomalies ? anomalies : anomalies.slice(0, 6);

  const spendData = (overview?.monthlySpend ?? []).map(m => ({
    name: m.month.slice(5),
    spend: Number(m.spend),
    invoices: m.invoices,
  }));

  const supplierBarData = suppliers.slice(0, 8).map(s => ({
    name: s.supplier?.slice(0, 14) ?? "؟",
    spend: Number(s.total_spend),
    rate: Number(s.memory_hit_rate),
  }));

  // ألوان شريط الموردين
  const COLORS = ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ec4899", "#3b82f6", "#14b8a6", "#f97316"];

  return (
    <div className="space-y-6" dir="rtl">

      {/* ── العنوان ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            تحليلات الموردين والأسعار
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            رصد الإنفاق، كشف شذوذ الأسعار، وأداء الذاكرة الذكية
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors border border-border"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          تحديث
        </button>
      </div>

      {/* ── بطاقات الإحصاء ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          icon={DollarSign}
          label="إجمالي الإنفاق"
          value={`${totalMonthlySpend.toLocaleString("ar-SA", { maximumFractionDigits: 0 })}`}
          sub="آخر 6 أشهر"
          color="#3b82f6"
          badge={
            monthDiff !== null
              ? {
                  text: `${monthDiff > 0 ? "+" : ""}${monthDiff}% هذا الشهر`,
                  type: monthDiff > 10 ? "up" : monthDiff < -5 ? "down" : "neutral",
                }
              : undefined
          }
        />
        <Stat
          icon={Truck}
          label="أعلى مورد"
          value={overview?.topSupplier?.supplier ?? "—"}
          sub={
            overview?.topSupplier
              ? `${overview.topSupplier.invoices} فاتورة — ${Number(overview.topSupplier.total_spend).toLocaleString()}`
              : undefined
          }
          color="#8b5cf6"
        />
        <Stat
          icon={Brain}
          label="دقة الذاكرة الذكية"
          value={`${memRate}%`}
          sub={
            overview
              ? `${overview.memoryStats.matched.toLocaleString()} من ${overview.memoryStats.total.toLocaleString()} بند`
              : undefined
          }
          color="#10b981"
          badge={
            memRate > 80
              ? { text: "ممتاز", type: "neutral" }
              : memRate > 50
              ? { text: "جيد", type: "neutral" }
              : { text: "يحتاج تدريب", type: "up" }
          }
        />
        <Stat
          icon={AlertTriangle}
          label="تنبيهات الأسعار"
          value={overview?.anomalyCount ?? 0}
          sub="بند شاذ السعر — آخر 30 يوماً"
          color={(overview?.anomalyCount ?? 0) > 0 ? "#f59e0b" : "#6b7280"}
          badge={
            (overview?.anomalyCount ?? 0) > 0
              ? { text: "يحتاج مراجعة", type: "up" }
              : { text: "لا شذوذ", type: "neutral" }
          }
        />
      </div>

      {/* ── مخطط الإنفاق الشهري ── */}
      {spendData.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              الإنفاق الشهري — آخر 6 أشهر
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={spendData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={50}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12, direction: "rtl" }}
                  formatter={(v: any) => [Number(v).toLocaleString(), "إنفاق"]}
                />
                <Area type="monotone" dataKey="spend" stroke="#8b5cf6" fill="url(#spendGrad)" strokeWidth={2} dot={{ fill: "#8b5cf6", r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── الموردون + الذاكرة ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* شريط الموردين */}
        {supplierBarData.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Truck className="w-4 h-4 text-primary" />
                إنفاق الموردين
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={supplierBarData} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeOpacity={0.3} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}
                    tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12, direction: "rtl" }}
                    formatter={(v: any) => [Number(v).toLocaleString(), "إنفاق"]}
                  />
                  <Bar dataKey="spend" radius={[0, 6, 6, 0]}>
                    {supplierBarData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* جدول الموردين التفصيلي */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              تفاصيل الموردين
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {suppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">لا توجد بيانات كافية بعد</p>
            ) : (
              <div className="overflow-auto max-h-[220px]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50">
                      {["المورد", "فواتير", "إنفاق", "ذاكرة %"].map(h => (
                        <th key={h} className="px-4 py-2.5 text-right font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((s, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-foreground max-w-[120px] truncate">{s.supplier}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{s.invoice_count}</td>
                        <td className="px-4 py-2.5 text-foreground font-mono">
                          {Number(s.total_spend).toLocaleString("ar-SA", { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                              Number(s.memory_hit_rate) >= 80
                                ? "bg-green-500/10 text-green-400"
                                : Number(s.memory_hit_rate) >= 50
                                ? "bg-amber-500/10 text-amber-400"
                                : "bg-red-500/10 text-red-400"
                            }`}
                          >
                            {s.memory_hit_rate ?? 0}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── تنبيهات شذوذ الأسعار ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            تنبيهات شذوذ الأسعار
            {anomalies.length > 0 && (
              <span className="mr-auto text-[10px] font-medium bg-amber-400/10 text-amber-400 border border-amber-400/20 px-2 py-0.5 rounded-full">
                {anomalies.length} بند
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {anomalies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
              <AlertTriangle className="w-8 h-8 opacity-20" />
              <p className="text-sm">لا يوجد شذوذ مسجّل في الأسعار</p>
              <p className="text-xs opacity-60">يحتاج النظام 2+ سجل لكل قطعة لاكتشاف الشذوذ</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {visibleAnomalies.map((a, i) => (
                  <AnomalyRow key={a.item_id} a={a} idx={i} />
                ))}
              </div>
              {anomalies.length > 6 && (
                <button
                  onClick={() => setShowAllAnomalies(s => !s)}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-lg transition-colors border border-border/50"
                >
                  {showAllAnomalies
                    ? <><ChevronUp className="w-3.5 h-3.5" /> عرض أقل</>
                    : <><ChevronDown className="w-3.5 h-3.5" /> عرض الكل ({anomalies.length})</>}
                </button>
              )}
            </>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
