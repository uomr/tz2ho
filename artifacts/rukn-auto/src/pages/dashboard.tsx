import { useGetStats, getGetStatsQueryKey } from "@workspace/api-client-react";
import { FileText, Database, ScanLine, Activity, TrendingUp, Upload, AlertCircle, ChevronLeft, Zap, BarChart3, Users, Eye, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

export default function Dashboard() {
  const { data: stats, isLoading } = useGetStats({
    query: { queryKey: getGetStatsQueryKey() },
  });
  const { user, isAdmin } = useAuth();

  const colors = isAdmin
    ? { accent: "#8b5cf6", dim: "#8b5cf615", border: "#8b5cf630", gradient: "linear-gradient(135deg,#8b5cf6,#6d28d9)" }
    : { accent: "#10b981", dim: "#10b98115", border: "#10b98130", gradient: "linear-gradient(135deg,#10b981,#059669)" };

  const greeting = getGreeting();
  const displayName = user?.displayName || "مستخدم";

  return (
    <div className="space-y-5" dir="rtl">
      {/* ── ترحيب ── */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[22px] font-bold tracking-tight">
            {greeting}، {displayName} 👋
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            {isAdmin ? "نظرة شاملة على أداء النظام والفرق" : "نظرة عامة على نشاط استخراج الفواتير"}
          </p>
        </div>
        <Link href="/extract">
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white transition-all hover:opacity-90"
            style={{ background: colors.gradient, boxShadow: `0 0 16px ${colors.dim}` }}
          >
            <ScanLine className="w-4 h-4" />
            استخراج جديد
          </button>
        </Link>
      </div>

      {/* ── بطاقات الإحصاء ── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="إجمالي الفواتير"
          value={stats?.totalInvoices}
          icon={FileText}
          isLoading={isLoading}
          color="#3b82f6"
          sub="منذ بداية التشغيل"
        />
        <StatCard
          title="القطع بالذاكرة"
          value={stats?.totalParts}
          icon={Database}
          isLoading={isLoading}
          color="#8b5cf6"
          sub="متاحة للتعرف التلقائي"
        />
        <StatCard
          title="البنود المستخرجة"
          value={stats?.totalItemsExtracted}
          icon={Zap}
          isLoading={isLoading}
          color={colors.accent}
          sub="بدقة ذكاء اصطناعي"
        />
        <StatCard
          title="نسبة النجاح"
          value={stats?.successRate != null ? `${stats.successRate}%` : undefined}
          icon={BarChart3}
          isLoading={isLoading}
          color="#f59e0b"
          sub="من آخر الفواتير"
          isPercent
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── إجراءات سريعة ── */}
        <div className="space-y-2.5">
          <p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest px-0.5">
            الإجراءات السريعة
          </p>
          <QuickAction
            href="/extract"
            icon={Upload}
            label="استخراج فاتورة"
            desc="رفع صورة وتحليلها بالذكاء الاصطناعي"
            color={colors.accent}
            primary
          />
          <QuickAction
            href="/invoices"
            icon={FileText}
            label="سجل الفواتير"
            desc="عرض وحقن الفواتير في NewPoint ERP"
            color="#3b82f6"
          />
          <QuickAction
            href="/parts"
            icon={Database}
            label="ذاكرة القطع"
            desc="إدارة قاعدة أرقام القطع"
            color="#8b5cf6"
          />
          {isAdmin && (
            <QuickAction
              href="/admin/users"
              icon={Users}
              label="إدارة المستخدمين"
              desc="صلاحيات الموظفين والأدوار"
              color="#f59e0b"
            />
          )}
        </div>

        {/* ── النشاط الأخير ── */}
        <div
          className="lg:col-span-2 rounded-2xl p-4"
          style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <span className="text-[13px] font-semibold">النشاط الأخير</span>
            </div>
            <Link href="/invoices">
              <span className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full cursor-pointer transition-colors hover:opacity-80"
                style={{ color: colors.accent, background: colors.dim }}>
                <Eye className="w-3 h-3" />
                عرض الكل
              </span>
            </Link>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-2 h-2 rounded-full shrink-0" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          ) : stats?.recentActivity && stats.recentActivity.length > 0 ? (
            <div>
              {stats.recentActivity.map((activity, idx) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 py-3"
                  style={{ borderBottom: idx < stats.recentActivity.length - 1 ? "1px solid hsl(var(--border) / 0.4)" : "none" }}
                >
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: colors.accent }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug">{activity.description}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(activity.createdAt).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  </div>
                  <ActivityBadge type={activity.type} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <Activity className="w-8 h-8 mx-auto mb-3 opacity-20" />
              <p className="text-sm">لا يوجد نشاط حديث</p>
              <p className="text-xs mt-1 opacity-60">ابدأ باستخراج فاتورة جديدة</p>
            </div>
          )}
        </div>
      </div>

      {/* ── بانر الفواتير المعلّقة ── */}
      {!isLoading && stats && stats.totalInvoices > 0 && (
        <div className="rounded-2xl p-4 flex items-center gap-4 bg-amber-500/5 border border-amber-500/20">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/15">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-semibold">تحقق من سجل الفواتير</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              قد تكون بعض الفواتير تنتظر الحقن في NewPoint ERP
            </p>
          </div>
          <Link href="/invoices">
            <button className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] font-semibold transition-all hover:opacity-80 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              <RefreshCw className="w-3.5 h-3.5" />
              مراجعة الآن
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}

// ── مكوّنات مساعدة ────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "صباح الخير";
  if (h < 17) return "مساء النور";
  return "مساء الخير";
}

function StatCard({
  title, value, icon: Icon, isLoading, color, sub, isPercent,
}: {
  title: string; value?: number | string; icon: any;
  isLoading: boolean; color: string; sub: string; isPercent?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
    >
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: color + "18" }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        {isPercent && !isLoading && value != null && (
          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="w-2.5 h-2.5" />
            جيد
          </span>
        )}
      </div>
      <div>
        {isLoading
          ? <Skeleton className="h-7 w-16 mt-1" />
          : <p className="text-2xl font-bold tabular-nums">{value ?? 0}</p>
        }
        <p className="text-[11px] text-muted-foreground mt-0.5">{title}</p>
        <p className="text-[10px] text-muted-foreground/50 mt-1">{sub}</p>
      </div>
    </div>
  );
}

function QuickAction({ href, icon: Icon, label, desc, color, primary }: {
  href: string; icon: any; label: string; desc: string; color: string; primary?: boolean;
}) {
  return (
    <Link href={href}>
      <div
        className="flex items-center gap-3.5 p-3.5 rounded-xl cursor-pointer transition-all duration-150 hover:scale-[1.01]"
        style={{
          background: primary ? color + "12" : "hsl(var(--card))",
          border: `1px solid ${primary ? color + "35" : "hsl(var(--border))"}`,
        }}
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: color + "20" }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold leading-none">{label}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{desc}</p>
        </div>
        <ChevronLeft className="w-4 h-4 text-muted-foreground/30 shrink-0" />
      </div>
    </Link>
  );
}

function ActivityBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; color: string }> = {
    extract: { label: "استخراج", color: "#10b981" },
    save:    { label: "حفظ",     color: "#3b82f6" },
    inject:  { label: "حقن",     color: "#8b5cf6" },
  };
  const b = map[type] ?? { label: type, color: "#6b7280" };
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
      style={{ background: b.color + "18", color: b.color }}
    >
      {b.label}
    </span>
  );
}
