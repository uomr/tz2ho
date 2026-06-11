import {
  LayoutDashboard, ScanLine, FileText, Database,
  Sun, LogOut, KeyRound, ChevronLeft,
  TrendingUp, Activity, ArrowUpRight, CheckCircle2,
  Clock, Zap, Package, BarChart3, Upload, Eye,
  AlertCircle, RefreshCw
} from "lucide-react";
import { useState } from "react";

const TEAL = "#10b981";
const TEAL_DIM = "#064e3b";

function Sidebar({ active }: { active: string }) {
  const navItems = [
    { id: "dashboard", label: "الرئيسية", icon: LayoutDashboard },
    { id: "extract", label: "استخراج فاتورة", icon: ScanLine },
    { id: "invoices", label: "سجل الفواتير", icon: FileText },
    { id: "parts", label: "ذاكرة القطع", icon: Database },
  ];

  return (
    <aside
      dir="rtl"
      className="w-56 h-full flex flex-col shrink-0"
      style={{ background: "#0a0f0d", borderLeft: "1px solid #1a2e24" }}
    >
      {/* Logo */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg,#10b981,#059669)", boxShadow: "0 0 14px #10b98140" }}
          >
            <ScanLine className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-white leading-none tracking-tight">RuknAuto</p>
            <p className="text-[9px] mt-0.5" style={{ color: "#4ade80" }}>موظف</p>
          </div>
        </div>
      </div>

      <div className="mx-3 mb-3" style={{ height: "1px", background: "#1a2e24" }} />

      {/* Nav */}
      <nav className="flex-1 px-2 space-y-0.5">
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right transition-all duration-150"
              style={{
                background: isActive ? "#10b98115" : "transparent",
                border: isActive ? "1px solid #10b98130" : "1px solid transparent",
                color: isActive ? "#10b981" : "#6b7280",
              }}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="text-[13px] font-medium">{label}</span>
              {isActive && <div className="mr-auto w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }} />}
            </button>
          );
        })}
      </nav>

      <div className="mx-3 mb-2" style={{ height: "1px", background: "#1a2e24" }} />

      {/* User card */}
      <div className="p-3">
        <div className="rounded-xl p-3" style={{ background: "#0f1a14", border: "1px solid #1a2e24" }}>
          <div className="flex items-center gap-2.5 mb-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0"
              style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
            >
              أ
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-white truncate">أحمد محمد</p>
              <p className="text-[10px]" style={{ color: "#4ade80" }}>موظف مبيعات</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            <button
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
              style={{ background: "#1a2e24", color: "#9ca3af" }}
            >
              <KeyRound className="w-3 h-3" />
              <span>كلمة السر</span>
            </button>
            <button
              className="flex items-center justify-center p-1.5 rounded-lg transition-colors"
              style={{ background: "#1a2e24", color: "#f87171" }}
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function StatCard({
  title, value, sub, icon: Icon, color, trend
}: {
  title: string; value: string; sub: string; icon: any; color: string; trend?: string;
}) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: "#0f1a14", border: "1px solid #1a2e24" }}
    >
      <div className="flex items-start justify-between">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: color + "20" }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        {trend && (
          <span
            className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: "#10b98120", color: "#10b981" }}
          >
            <TrendingUp className="w-3 h-3" />
            {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
        <p className="text-[11px] mt-0.5" style={{ color: "#6b7280" }}>{title}</p>
        <p className="text-[10px] mt-1" style={{ color: "#4ade8070" }}>{sub}</p>
      </div>
    </div>
  );
}

function QuickAction({
  label, desc, icon: Icon, color, primary
}: {
  label: string; desc: string; icon: any; color: string; primary?: boolean;
}) {
  return (
    <button
      className="flex items-center gap-3.5 p-4 rounded-2xl text-right w-full transition-all duration-150 hover:scale-[1.01]"
      style={{
        background: primary ? `linear-gradient(135deg, ${color}20, ${color}10)` : "#0f1a14",
        border: `1px solid ${primary ? color + "40" : "#1a2e24"}`,
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: color + "25" }}
      >
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="min-w-0 flex-1 text-right">
        <p className="text-[13px] font-semibold text-white">{label}</p>
        <p className="text-[11px] mt-0.5" style={{ color: "#6b7280" }}>{desc}</p>
      </div>
      <ChevronLeft className="w-4 h-4 shrink-0" style={{ color: "#374151" }} />
    </button>
  );
}

const activities = [
  { type: "استخراج", desc: "فاتورة شركة الأجزاء الذهبية — 12 بند", time: "منذ 8 دقائق", status: "success" },
  { type: "حقن", desc: "فاتورة النور للتوزيع — 7 بنود → NewPoint", time: "منذ 35 دقيقة", status: "success" },
  { type: "استخراج", desc: "فاتورة موردي قطع الغيار — صفحتين", time: "منذ 1.5 ساعة", status: "warning" },
  { type: "حفظ", desc: "فاتورة الرياض لقطع السيارات — 9 بنود", time: "منذ 3 ساعات", status: "success" },
];

function ActivityRow({ item, last }: { item: typeof activities[0]; last?: boolean }) {
  const colorMap: Record<string, string> = {
    success: "#10b981", warning: "#f59e0b", error: "#ef4444"
  };
  const c = colorMap[item.status];
  const typeColorMap: Record<string, string> = {
    استخراج: "#10b981", حقن: "#3b82f6", حفظ: "#8b5cf6"
  };
  const tc = typeColorMap[item.type] || "#6b7280";

  return (
    <div
      className="flex items-start gap-3 py-3"
      style={{ borderBottom: last ? "none" : "1px solid #1a2e2440" }}
    >
      <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: c }} />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-white leading-snug">{item.desc}</p>
        <p className="text-[10px] mt-0.5" style={{ color: "#6b7280" }}>{item.time}</p>
      </div>
      <span
        className="text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0"
        style={{ background: tc + "20", color: tc }}
      >
        {item.type}
      </span>
    </div>
  );
}

export function EmployeeView() {
  const [active] = useState("dashboard");

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ background: "#060d09", fontFamily: "'IBM Plex Sans Arabic', sans-serif" }} dir="rtl">
      <Sidebar active={active} />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header
          className="flex items-center px-6 shrink-0"
          style={{ height: "56px", background: "#0a0f0d", borderBottom: "1px solid #1a2e24" }}
        >
          <div className="flex items-center gap-2 text-[12px]" style={{ color: "#4b5563" }}>
            <span>RuknAuto</span>
            <ChevronLeft className="w-3.5 h-3.5" />
            <span className="text-white font-semibold">لوحة التحكم</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: "#10b98115", border: "1px solid #10b98130" }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }} />
              <span className="text-[11px] font-medium" style={{ color: "#10b981" }}>NewPoint ERP متصل</span>
            </div>
            <button
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#10b981,#059669)", boxShadow: "0 0 14px #10b98140" }}
            >
              <ScanLine className="w-3.5 h-3.5" />
              استخراج جديد
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6" style={{ background: "#060d09" }}>
          {/* Welcome */}
          <div className="mb-6">
            <h1 className="text-[22px] font-bold text-white">مرحباً، أحمد 👋</h1>
            <p className="text-[13px] mt-1" style={{ color: "#6b7280" }}>
              اليوم الأربعاء، 11 يونيو 2026 — لديك 3 فواتير معلّقة
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatCard title="فواتير هذا الشهر" value="47" sub="↑ 12 عن الشهر الماضي" icon={FileText} color="#10b981" trend="+34%" />
            <StatCard title="بنود مستخرجة" value="312" sub="بدقة ذكاء اصطناعي" icon={Zap} color="#8b5cf6" />
            <StatCard title="قطع بالذاكرة" value="1,240" sub="متاحة للتعرف التلقائي" icon={Package} color="#3b82f6" />
            <StatCard title="نسبة النجاح" value="96%" sub="من آخر 50 فاتورة" icon={BarChart3} color="#f59e0b" trend="+2%" />
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            {/* Quick Actions */}
            <div className="col-span-1 flex flex-col gap-3">
              <p className="text-[12px] font-semibold" style={{ color: "#6b7280" }}>الإجراءات السريعة</p>
              <QuickAction label="استخراج فاتورة" desc="رفع صورة وتحليلها" icon={Upload} color="#10b981" primary />
              <QuickAction label="سجل الفواتير" desc="عرض وحقن الفواتير" icon={FileText} color="#3b82f6" />
              <QuickAction label="ذاكرة القطع" desc="إدارة قاعدة البيانات" icon={Database} color="#8b5cf6" />
            </div>

            {/* Recent Activity */}
            <div
              className="col-span-2 rounded-2xl p-4"
              style={{ background: "#0f1a14", border: "1px solid #1a2e24" }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4" style={{ color: "#10b981" }} />
                  <span className="text-[13px] font-semibold text-white">النشاط الأخير</span>
                </div>
                <button
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full transition-colors"
                  style={{ color: "#10b981", background: "#10b98115" }}
                >
                  <Eye className="w-3 h-3" />
                  عرض الكل
                </button>
              </div>
              <div>
                {activities.map((a, i) => (
                  <ActivityRow key={i} item={a} last={i === activities.length - 1} />
                ))}
              </div>
            </div>
          </div>

          {/* Pending banner */}
          <div
            className="rounded-2xl p-4 flex items-center gap-4"
            style={{ background: "#f59e0b10", border: "1px solid #f59e0b30" }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#f59e0b25" }}>
              <AlertCircle className="w-5 h-5" style={{ color: "#f59e0b" }} />
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-white">3 فواتير تنتظر الحقن في NewPoint ERP</p>
              <p className="text-[11px] mt-0.5" style={{ color: "#9ca3af" }}>تحقق من سجل الفواتير لإكمال العملية</p>
            </div>
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold"
              style={{ background: "#f59e0b20", color: "#f59e0b", border: "1px solid #f59e0b40" }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              مراجعة الآن
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
