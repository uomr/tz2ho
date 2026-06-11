import { useGetStats, getGetStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Database, ScanLine, Activity, TrendingUp, ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { data: stats, isLoading } = useGetStats({
    query: { queryKey: getGetStatsQueryKey() },
  });

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">لوحة التحكم</h2>
          <p className="text-muted-foreground text-sm mt-1">نظرة عامة على نشاط استخراج الفواتير</p>
        </div>
        <Link href="/extract">
          <Button size="sm" className="gap-2">
            <ScanLine className="w-4 h-4" />
            استخراج جديد
          </Button>
        </Link>
      </div>

      {/* بطاقات الإحصاء */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="إجمالي الفواتير"
          value={stats?.totalInvoices}
          icon={<FileText className="w-4 h-4" />}
          isLoading={isLoading}
          color="text-blue-400"
          bg="bg-blue-500/10"
        />
        <StatsCard
          title="القطع بالذاكرة"
          value={stats?.totalParts}
          icon={<Database className="w-4 h-4" />}
          isLoading={isLoading}
          color="text-purple-400"
          bg="bg-purple-500/10"
        />
        <StatsCard
          title="البنود المستخرجة"
          value={stats?.totalItemsExtracted}
          icon={<ScanLine className="w-4 h-4" />}
          isLoading={isLoading}
          color="text-primary"
          bg="bg-primary/10"
        />
        <StatsCard
          title="نسبة النجاح"
          value={stats?.successRate != null ? `${stats.successRate}%` : undefined}
          icon={<TrendingUp className="w-4 h-4" />}
          isLoading={isLoading}
          color="text-green-400"
          bg="bg-green-500/10"
        />
      </div>

      {/* روابط سريعة */}
      <div className="grid gap-3 md:grid-cols-3">
        <QuickLink
          href="/extract"
          icon={<ScanLine className="w-5 h-5 text-primary" />}
          title="استخراج فاتورة"
          desc="ارفع صورة واستخرج البيانات تلقائياً بالذكاء الاصطناعي"
        />
        <QuickLink
          href="/invoices"
          icon={<FileText className="w-5 h-5 text-blue-400" />}
          title="سجل الفواتير"
          desc="عرض وإدارة الفواتير المحفوظة وحقنها في NewPoint ERP"
        />
        <QuickLink
          href="/parts"
          icon={<Database className="w-5 h-5 text-purple-400" />}
          title="ذاكرة القطع"
          desc="إدارة قاعدة أرقام القطع للتعرف التلقائي عليها"
        />
      </div>

      {/* النشاط الأخير */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            النشاط الأخير
          </CardTitle>
          <Link href="/invoices">
            <span className="text-xs text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1 transition-colors">
              عرض الكل
              <ArrowLeft className="w-3 h-3" />
            </span>
          </Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-2 h-2 rounded-full shrink-0" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
          ) : stats?.recentActivity && stats.recentActivity.length > 0 ? (
            <div>
              {stats.recentActivity.map((activity, idx) => (
                <div
                  key={activity.id}
                  className={`flex items-start gap-3 py-3 ${
                    idx < stats.recentActivity.length - 1 ? "border-b border-border/40" : ""
                  }`}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug">{activity.description}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(activity.createdAt).toLocaleString("ar-SA", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
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
        </CardContent>
      </Card>
    </div>
  );
}

function StatsCard({
  title, value, icon, isLoading, color, bg,
}: {
  title: string;
  value?: number | string;
  icon: React.ReactNode;
  isLoading: boolean;
  color: string;
  bg: string;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{title}</p>
            {isLoading ? (
              <Skeleton className="h-7 w-16 mt-1.5" />
            ) : (
              <p className="text-2xl font-bold mt-1 tabular-nums">{value ?? 0}</p>
            )}
          </div>
          <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center shrink-0 ${color}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickLink({ href, icon, title, desc }: {
  href: string; icon: React.ReactNode; title: string; desc: string;
}) {
  return (
    <Link href={href}>
      <div className="group flex items-start gap-3 p-4 rounded-xl border border-border bg-card hover:bg-muted/20 hover:border-border/80 transition-all cursor-pointer">
        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
        </div>
      </div>
    </Link>
  );
}

function ActivityBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    extract: { label: "استخراج", cls: "bg-primary/10 text-primary" },
    save: { label: "حفظ", cls: "bg-blue-500/10 text-blue-400" },
    inject: { label: "حقن", cls: "bg-green-500/10 text-green-400" },
  };
  const badge = map[type] ?? { label: type, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${badge.cls}`}>
      {badge.label}
    </span>
  );
}