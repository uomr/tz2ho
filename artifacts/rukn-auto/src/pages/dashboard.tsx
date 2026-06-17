import { useGetStats, getGetStatsQueryKey } from "@workspace/api-client-react";
import { FileText, Database, ScanLine, Zap, BarChart3, Upload, Users, ChevronLeft, Activity, TrendingUp, Eye } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

export default function Dashboard() {
  const { data: stats, isLoading } = useGetStats({
    query: { queryKey: getGetStatsQueryKey() },
  });
  const { user, isAdmin } = useAuth();

  const accentColor = isAdmin ? "hsl(271 55% 60%)" : "hsl(142 55% 42%)";

  const greeting = getGreeting();
  const displayName = user?.displayName || "مستخدم";

  return (
    <div className="space-y-6" dir="rtl">

      {/* ── ترحيب ── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.15em] uppercase text-muted-foreground mb-1">
            {new Date().toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h2 className="text-[22px] font-extrabold tracking-tight">
            {greeting}، <span style={{ color: accentColor }}>{displayName}</span>
          </h2>
        </div>
        <Link href="/extract">
          <button
            className="flex items-center gap-2 px-4 h-10 rounded-xl text-[13px] font-bold transition-all hover:opacity-85 active:scale-[.98]"
            style={{
              background: "hsl(var(--primary))",
              color: "hsl(var(--primary-foreground))",
            }}
          >
            <ScanLine className="w-4 h-4" />
            استخراج جديد
          </button>
        </Link>
      </div>

      {/* ── بطاقات الإحصاء الأربع ── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="الفواتير"
          value={stats?.totalInvoices}
          icon={FileText}
          isLoading={isLoading}
          color="#3b82f6"
          label="إجمالي"
        />
        <StatCard
          title="ذاكرة القطع"
          value={stats?.totalParts}
          icon={Database}
          isLoading={isLoading}
          color="hsl(271 55% 60%)"
          label="قطعة محفوظة"
        />
        <StatCard
          title="البنود"
          value={stats?.totalItemsExtracted}
          icon={Zap}
          isLoading={isLoading}
          color={accentColor}
          label="بند مستخرج"
        />
        <StatCard
          title="النجاح"
          value={stats?.successRate != null ? `${stats.successRate}%` : undefined}
          icon={BarChart3}
          isLoading={isLoading}
          color="hsl(38 62% 52%)"
          label="نسبة الدقة"
          isPercent
        />
      </div>

      {/* ── المحتوى الرئيسي ── */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* الإجراءات السريعة */}
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60 mb-3">
            الإجراءات السريعة
          </p>
          <QuickAction
            href="/extract"
            icon={Upload}
            label="استخراج فاتورة"
            desc="رفع صورة وتحليلها"
            color={accentColor}
            primary
          />
          <QuickAction
            href="/invoices"
            icon={FileText}
            label="سجل الفواتير"
            desc="عرض وحقن الفواتير"
            color="#3b82f6"
          />
          <QuickAction
            href="/parts"
            icon={Database}
            label="ذاكرة القطع"
            desc="إدارة قاعدة القطع"
            color="hsl(271 55% 60%)"
          />
          {isAdmin && (
            <QuickAction
              href="/admin/users"
              icon={Users}
              label="المستخدمون"
              desc="صلاحيات وأدوار الفريق"
              color="hsl(38 62% 52%)"
            />
          )}
        </div>

        {/* النشاط الأخير */}
        <div
          className="lg:col-span-2 rounded-xl p-5"
          style={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--card-border))",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground/50" />
              <span className="text-[13px] font-bold">النشاط الأخير</span>
            </div>
            <Link href="/invoices">
              <span
                className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg cursor-pointer transition-opacity hover:opacity-70"
                style={{
                  color: accentColor,
                  background: accentColor + "12",
                }}
              >
                <Eye className="w-3 h-3" />
                عرض الكل
              </span>
            </Link>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : stats?.recentActivity && stats.recentActivity.length > 0 ? (
            <div className="space-y-1">
              {stats.recentActivity.map((activity, idx) => (
                <div
                  key={activity.id}
                  className="flex items-center gap-3 py-2.5 transition-colors rounded-lg px-2 hover:bg-muted/40"
                  style={{
                    borderBottom: idx < stats.recentActivity.length - 1
                      ? "1px solid hsl(var(--border)/0.4)"
                      : "none",
                  }}
                >
                  <ActivityIcon type={activity.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] leading-snug truncate">{activity.description}</p>
                    <p className="text-[11px] text-muted-foreground/55 mt-0.5 font-mono">
                      {new Date(activity.createdAt).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  </div>
                  <ActivityBadge type={activity.type} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="w-10 h-10 mx-auto mb-3 opacity-15" />
              <p className="text-sm font-medium">لا يوجد نشاط حديث</p>
              <p className="text-xs mt-1 opacity-50">ابدأ باستخراج فاتورة جديدة</p>
            </div>
          )}
        </div>
      </div>
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
  title, value, icon: Icon, isLoading, color, label, isPercent,
}: {
  title: string;
  value?: number | string;
  icon: any;
  isLoading: boolean;
  color: string;
  label: string;
  isPercent?: boolean;
}) {
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-4 relative overflow-hidden"
      style={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--card-border))",
      }}
    >
      {/* أيقونة خلفية */}
      <Icon
        className="absolute -left-2 -bottom-2 w-16 h-16 pointer-events-none"
        style={{ color, opacity: 0.05 }}
      />

      <div className="flex items-center justify-between">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: color + "18" }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        {isPercent && !isLoading && value != null && (
          <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md"
            style={{ background: "hsl(142 55% 40% / 0.12)", color: "hsl(142 55% 42%)" }}>
            <TrendingUp className="w-2.5 h-2.5" />
            جيد
          </span>
        )}
      </div>

      <div>
        {isLoading
          ? <Skeleton className="h-9 w-20" />
          : <p className="text-[32px] font-black tabular-nums leading-none font-mono" style={{ color }}>
              {value ?? "—"}
            </p>
        }
        <p className="text-[12px] font-semibold text-foreground mt-2">{title}</p>
        <p className="text-[11px] text-muted-foreground/50 mt-0.5">{label}</p>
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
        className="flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-all duration-150 hover:scale-[1.01] active:scale-[.99]"
        style={{
          background: primary ? color + "10" : "hsl(var(--card))",
          border: `1px solid ${primary ? color + "30" : "hsl(var(--card-border))"}`,
        }}
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: color + "18" }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold leading-none">{label}</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">{desc}</p>
        </div>
        <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground/25 shrink-0" />
      </div>
    </Link>
  );
}

function ActivityIcon({ type }: { type: string }) {
  const map: Record<string, { icon: any; color: string }> = {
    extract: { icon: ScanLine,  color: "hsl(142 55% 42%)" },
    save:    { icon: FileText,  color: "#3b82f6" },
    inject:  { icon: Zap,       color: "hsl(271 55% 60%)" },
  };
  const b = map[type] ?? { icon: Activity, color: "#6b7280" };
  const Icon = b.icon;
  return (
    <div
      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
      style={{ background: b.color + "15" }}
    >
      <Icon className="w-3.5 h-3.5" style={{ color: b.color }} />
    </div>
  );
}

function ActivityBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; color: string }> = {
    extract: { label: "استخراج", color: "hsl(142 55% 42%)" },
    save:    { label: "حفظ",     color: "#3b82f6" },
    inject:  { label: "حقن",     color: "hsl(271 55% 60%)" },
  };
  const b = map[type] ?? { label: type, color: "#6b7280" };
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0"
      style={{ background: b.color + "15", color: b.color }}
    >
      {b.label}
    </span>
  );
}
