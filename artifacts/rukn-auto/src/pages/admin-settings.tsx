/**
 * صفحة إعدادات النموذج الذكي — للمدير فقط
 */
import { useState, useEffect } from "react";
import { useAuth, getAuthHeader } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Settings, Zap, Star, DollarSign, BarChart2, CheckCircle2,
  TrendingUp, Activity, Cpu, Shield, Brain, RefreshCw, Sparkles
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface ModelOption {
  id: string;
  label: string;
  badge: string;
  speed: number;
  quality: number;
  costPer1kIn: number;
  costPer1kOut: number;
  supportsJson: boolean;
}

interface SettingsData {
  activeModel: string;
  models: ModelOption[];
  usage: {
    month: string;
    tokensIn: number;
    tokensOut: number;
    extractions: number;
    estimatedCostUsd: number;
  };
  costLimitUsd: number;
}

function StarRating({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={`w-1.5 h-1.5 rounded-full transition-colors ${
            i < value ? "bg-primary" : "bg-muted-foreground/20"
          }`}
        />
      ))}
    </div>
  );
}

function UsageBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function AdminSettings() {
  const { token } = useAuth();
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [costLimit, setCostLimit] = useState<string>("");
  const [rebuildingEmbeddings, setRebuildingEmbeddings] = useState(false);
  const [rebuildResult, setRebuildResult] = useState<{ total: number; built: number; failed: number } | null>(null);

  const headers = { "Content-Type": "application/json", ...getAuthHeader(token) };

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/admin/settings`, { headers });
      if (res.ok) {
        const d: SettingsData = await res.json();
        setData(d);
        setSelected(d.activeModel);
        setCostLimit(String(d.costLimitUsd || ""));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleRebuildEmbeddings = async () => {
    setRebuildingEmbeddings(true);
    setRebuildResult(null);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/rebuild-embeddings`, {
        method: "POST",
        headers,
      });
      if (res.ok) {
        const d = await res.json();
        setRebuildResult(d);
        if (d.total === 0) {
          toast.success("جميع القطع لديها ذاكرة ذكية بالفعل ✓");
        } else {
          toast.success(`تم بناء ذاكرة ذكية لـ ${d.built} قطعة من أصل ${d.total} ✓`);
        }
      } else {
        const d = await res.json();
        toast.error(d.error || "فشل إعادة البناء");
      }
    } catch {
      toast.error("خطأ في الاتصال بالخادم");
    } finally {
      setRebuildingEmbeddings(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/settings`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          activeModel: selected,
          costLimitUsd: parseFloat(costLimit) || 0,
        }),
      });
      if (res.ok) {
        toast.success("تم حفظ الإعدادات ✓");
        fetchSettings();
      } else {
        const d = await res.json();
        toast.error(d.error);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Activity className="w-5 h-5 animate-pulse ml-2" />
        جاري التحميل...
      </div>
    );
  }

  if (!data) return null;

  const activeModelMeta = data.models.find(m => m.id === data.activeModel);
  const { usage } = data;
  const totalTokens = usage.tokensIn + usage.tokensOut;
  const monthLabel = usage.month
    ? new Date(usage.month + "-01").toLocaleDateString("ar-SA", { month: "long", year: "numeric" })
    : "";

  // تقدير التكلفة للنموذج المختار
  const selectedMeta = data.models.find(m => m.id === selected);
  const projectedCost = selectedMeta
    ? Math.round(
        ((usage.tokensIn / 1000) * selectedMeta.costPer1kIn +
          (usage.tokensOut / 1000) * selectedMeta.costPer1kOut) *
          10000
      ) / 10000
    : 0;

  return (
    <div className="space-y-6" dir="rtl">
      {/* العنوان */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Cpu className="w-6 h-6 text-primary" />
          نموذج الذكاء الاصطناعي
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          اختر النموذج المناسب وتابع استهلاكك الشهري — غير مرئي للموظفين.
        </p>
      </div>

      {/* إحصائيات الاستهلاك */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            icon: <TrendingUp className="w-4 h-4 text-blue-400" />,
            label: "فواتير الشهر",
            value: usage.extractions.toLocaleString(),
            sub: monthLabel,
          },
          {
            icon: <BarChart2 className="w-4 h-4 text-purple-400" />,
            label: "التوكنات الإجمالية",
            value: totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}K` : totalTokens.toLocaleString(),
            sub: `دخل: ${(usage.tokensIn / 1000).toFixed(1)}K | خرج: ${(usage.tokensOut / 1000).toFixed(1)}K`,
          },
          {
            icon: <DollarSign className="w-4 h-4 text-green-400" />,
            label: "التكلفة المقدّرة",
            value: `$${usage.estimatedCostUsd.toFixed(4)}`,
            sub: activeModelMeta?.label ?? "",
          },
          {
            icon: <Shield className="w-4 h-4 text-amber-400" />,
            label: "النموذج النشط",
            value: activeModelMeta?.label ?? "غير محدد",
            sub: activeModelMeta?.badge ?? "",
          },
        ].map((stat, i) => (
          <Card key={i} className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                {stat.icon}
                <span className="text-[11px] text-muted-foreground font-medium">{stat.label}</span>
              </div>
              <p className="text-lg font-bold text-foreground">{stat.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{stat.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* اختيار النموذج */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            اختر نموذج الاستخراج
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.models.map(m => {
              const isActive = m.id === data.activeModel;
              const isPicked = m.id === selected;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelected(m.id)}
                  className={`relative text-right p-4 rounded-xl border transition-all duration-200 hover:border-primary/40 ${
                    isPicked
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border bg-card/60 hover:bg-card"
                  }`}
                >
                  {isActive && (
                    <span className="absolute top-2 left-2 flex items-center gap-1 text-[10px] text-green-400 font-semibold bg-green-400/10 border border-green-400/20 px-1.5 py-0.5 rounded-full">
                      <span className="w-1 h-1 rounded-full bg-green-400" />
                      نشط
                    </span>
                  )}
                  {isPicked && !isActive && (
                    <CheckCircle2 className="absolute top-2 left-2 w-4 h-4 text-primary" />
                  )}

                  <p className="font-bold text-sm text-foreground mb-0.5">{m.label}</p>
                  <p className="text-[11px] text-primary/70 font-medium mb-3">{m.badge}</p>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Zap className="w-3 h-3" /> سرعة
                      </span>
                      <StarRating value={m.speed} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Star className="w-3 h-3" /> جودة
                      </span>
                      <StarRating value={m.quality} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <DollarSign className="w-3 h-3" /> تكلفة/1K
                      </span>
                      <span className="text-[11px] font-mono text-foreground/70">
                        ${(m.costPer1kIn * 1000).toFixed(3)}
                      </span>
                    </div>
                  </div>

                  {/* شريط التكلفة التقريبية بالاستهلاك الحالي */}
                  {usage.extractions > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/40">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] text-muted-foreground">تكلفة مشابهة</span>
                        <span className="text-[10px] font-mono text-foreground/60">
                          ${(
                            (usage.tokensIn / 1000) * m.costPer1kIn +
                            (usage.tokensOut / 1000) * m.costPer1kOut
                          ).toFixed(4)}
                        </span>
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* حد التكلفة الشهرية */}
          <div className="mt-4 pt-4 border-t border-border/50 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400 shrink-0" />
              <label className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                حد التكلفة الشهرية ($)
              </label>
            </div>
            <input
              type="number"
              min="0"
              step="1"
              value={costLimit}
              onChange={e => setCostLimit(e.target.value)}
              placeholder="0 = بلا حد"
              className="w-28 h-8 px-3 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              {parseFloat(costLimit) > 0
                ? "عند الاقتراب من الحد سيتحوّل تلقائياً للنموذج الأوفر"
                : "لا يوجد حد — النظام يستخدم النموذج المختار دائماً"}
            </p>
          </div>

          <div className="flex justify-end mt-4">
            <Button
              onClick={handleSave}
              disabled={saving || (selected === data.activeModel && costLimit === String(data.costLimitUsd))}
              size="sm"
              className="gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* الذاكرة الذكية — Vector Embeddings */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            الذاكرة الذكية — Vector Embeddings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground leading-relaxed">
                الذاكرة الذكية تستخدم تضمينات متجهية (Vector Embeddings) لمطابقة أوصاف القطع بدقة تصل إلى 95%،
                حتى مع الاختلافات اللغوية والأخطاء الإملائية. اضغط إعادة البناء لتحسين دقة جميع القطع الموجودة.
              </p>
              {rebuildResult && (
                <div className="mt-3 flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-green-400">
                    <Sparkles className="w-3.5 h-3.5" />
                    {rebuildResult.built} قطعة تمت معالجتها
                  </span>
                  {rebuildResult.failed > 0 && (
                    <span className="text-amber-400">{rebuildResult.failed} فشلت</span>
                  )}
                  {rebuildResult.total === 0 && (
                    <span className="text-green-400">جميع القطع محدّثة بالفعل ✓</span>
                  )}
                </div>
              )}
            </div>
            <Button
              onClick={handleRebuildEmbeddings}
              disabled={rebuildingEmbeddings}
              variant="outline"
              size="sm"
              className="gap-2 shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${rebuildingEmbeddings ? "animate-spin" : ""}`} />
              {rebuildingEmbeddings ? "جاري البناء..." : "إعادة بناء الذاكرة"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* مقارنة التكلفة */}
      {usage.extractions > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground">
              مقارنة التكلفة — بنفس الاستهلاك الحالي ({usage.extractions} فاتورة)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.models
              .map(m => ({
                ...m,
                cost:
                  (usage.tokensIn / 1000) * m.costPer1kIn +
                  (usage.tokensOut / 1000) * m.costPer1kOut,
              }))
              .sort((a, b) => a.cost - b.cost)
              .map(m => {
                const maxCost = Math.max(...data.models.map(x => (usage.tokensIn / 1000) * x.costPer1kIn + (usage.tokensOut / 1000) * x.costPer1kOut));
                return (
                  <div key={m.id} className="flex items-center gap-3">
                    <span className={`text-[11px] font-semibold w-32 truncate ${m.id === selected ? "text-primary" : "text-foreground/70"}`}>
                      {m.label}
                    </span>
                    <div className="flex-1">
                      <UsageBar
                        value={m.cost}
                        max={maxCost}
                        color={m.id === selected ? "bg-primary" : "bg-muted-foreground/30"}
                      />
                    </div>
                    <span className="text-[11px] font-mono text-foreground/60 w-16 text-left">
                      ${m.cost.toFixed(4)}
                    </span>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
