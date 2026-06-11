import {
  LayoutDashboard, ScanLine, FileText, Database,
  Users, Cpu, LogOut, KeyRound, ChevronLeft,
  TrendingUp, Activity, ShieldCheck, Zap, Package,
  BarChart3, ArrowUpRight, AlertCircle, Settings,
  RefreshCw, DollarSign, UserCheck, Clock, Eye,
  PieChart
} from "lucide-react";
import { useState } from "react";

function Sidebar({ active }: { active: string }) {
  const navItems = [
    { id: "dashboard", label: "الرئيسية", icon: LayoutDashboard },
    { id: "extract", label: "استخراج فاتورة", icon: ScanLine },
    { id: "invoices", label: "سجل الفواتير", icon: FileText },
    { id: "parts", label: "ذاكرة القطع", icon: Database },
    { id: "separator" },
    { id: "users", label: "إدارة المستخدمين", icon: Users },
    { id: "settings", label: "نموذج الذكاء", icon: Cpu },
  ];

  return (
    <aside
      dir="rtl"
      className="w-56 h-full flex flex-col shrink-0"
      style={{ background: "#0a0a1a", borderLeft: "1px solid #1a1a2e" }}
    >
      {/* Logo */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)", boxShadow: "0 0 14px #8b5cf640" }}
          >
            <ScanLine className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-white leading-none tracking-tight">RuknAuto</p>
            <div className="flex items-center gap-1 mt-0.5">
              <ShieldCheck className="w-2.5 h-2.5" style={{ color: "#a78bfa" }} />
              <p className="text-[9px]" style={{ color: "#a78bfa" }}>مدير النظام</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-3 mb-3" style={{ height: "1px", background: "#1a1a2e" }} />

      {/* Nav */}
      <nav className="flex-1 px-2 space-y-0.5">
        {navItems.map(({ id, label, icon: Icon }: any) => {
          if (id === "separator") {
            return <div key="sep" className="mx-2 my-2" style={{ height: "1px", background: "#1a1a2e" }} />;
          }
          const isActive = active === id;
          const isAdmin = id === "users" || id === "settings";
          const color = isAdmin ? "#a78bfa" : "#10b981";
          return (
            <button
              key={id}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right transition-all duration-150"
              style={{
                background: isActive ? color + "15" : "transparent",
                border: isActive ? `1px solid ${color}30` : "1px solid transparent",
                color: isActive ? color : "#6b7280",
              }}
            >
              {Icon && <Icon className="w-4 h-4 shrink-0" />}
              <span className="text-[13px] font-medium">{label}</span>
              {isActive && (
                <div className="mr-auto w-1.5 h-1.5 rounded-full" style={{ background: color }} />
              )}
            </button>
          );
        })}
      </nav>

      <div className="mx-3 mb-2" style={{ height: "1px", background: "#1a1a2e" }} />

      {/* User card */}
      <div className="p-3">
        <div className="rounded-xl p-3" style={{ background: "#0f0f1a", border: "1px solid #1a1a2e" }}>
          <div className="flex items-center gap-2.5 mb-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0"
              style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)" }}
            >
              م
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-white truncate">محمد العتيبي</p>
              <div className="flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5" style={{ color: "#a78bfa" }} />
                <p className="text-[10px]" style={{ color: "#a78bfa" }}>مدير النظام</p>
              </div>
            </div>
          </div>
          <div className="flex gap-1.5">
            <button
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium"
              style={{ background: "#1a1a2e", color: "#9ca3af" }}
            >
              <KeyRound className="w-3 h-3" />
              <span>الإعدادات</span>
            </button>
            <button
              className="flex items-center justify-center p-1.5 rounded-lg"
              style={{ background: "#1a1a2e", color: "#f87171" }}
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function KpiCard({ title, value, sub, icon: Icon, color, trend, badge }: {
  title: string; value: string; sub: string; icon: any; color: string; trend?: string; badge?: string;
}) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: "#0f0f1a", border: "1px solid #1a1a2e" }}
    >
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: color + "20" }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div className="flex flex-col items-end gap-1">
          {trend && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#10b98120", color: "#10b981" }}>
              <TrendingUp className="w-2.5 h-2.5" />{trend}
            </span>
          )}
          {badge && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#f59e0b20", color: "#f59e0b" }}>
              {badge}
            </span>
          )}
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
        <p className="text-[11px] mt-0.5" style={{ color: "#6b7280" }}>{title}</p>
        <p className="text-[10px] mt-1" style={{ color: "#a78bfa60" }}>{sub}</p>
      </div>
    </div>
  );
}

const employees = [
  { name: "أحمد محمد", invoices: 47, success: "96%", last: "منذ 8 دق", status: "online" },
  { name: "سارة العلي", invoices: 31, success: "94%", last: "منذ 2 ساعة", status: "online" },
  { name: "خالد الزهراني", invoices: 28, success: "91%", last: "أمس", status: "offline" },
  { name: "نورة السعد", invoices: 19, success: "98%", last: "منذ 30 دق", status: "online" },
];

const alerts = [
  { msg: "3 فواتير تنتظر الحقن في ERP", type: "warning", time: "الآن" },
  { msg: "نموذج Gemini 2.5 Flash متاح — تحديث مقترح", type: "info", time: "منذ 1 ساعة" },
  { msg: "تكلفة الرموز اليوم: $1.24 — أعلى من المعدل بـ 18%", type: "warning", time: "منذ 3 ساعات" },
];

export function AdminView() {
  const [active] = useState("dashboard");

  return (
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{ background: "#06060f", fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
      dir="rtl"
    >
      <Sidebar active={active} />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header
          className="flex items-center px-6 shrink-0"
          style={{ height: "56px", background: "#0a0a1a", borderBottom: "1px solid #1a1a2e" }}
        >
          <div className="flex items-center gap-2 text-[12px]" style={{ color: "#4b5563" }}>
            <span>RuknAuto</span>
            <ChevronLeft className="w-3.5 h-3.5" />
            <ShieldCheck className="w-3.5 h-3.5" style={{ color: "#a78bfa" }} />
            <span className="text-white font-semibold">لوحة المدير</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ background: "#10b98115", border: "1px solid #10b98130" }}
            >
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#10b981" }} />
              <span className="text-[11px] font-medium" style={{ color: "#10b981" }}>4 موظفين نشطين</span>
            </div>
            <button
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)", boxShadow: "0 0 14px #8b5cf640" }}
            >
              <Settings className="w-3.5 h-3.5" />
              إعدادات النظام
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6" style={{ background: "#06060f" }}>
          {/* Welcome */}
          <div className="mb-6">
            <h1 className="text-[22px] font-bold text-white">لوحة إدارة النظام</h1>
            <p className="text-[13px] mt-1" style={{ color: "#6b7280" }}>
              نظرة شاملة على الأداء والموظفين والتكاليف — الأربعاء 11 يونيو 2026
            </p>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-4 gap-4 mb-5">
            <KpiCard title="إجمالي الفواتير" value="1,247" sub="هذا الشهر: 183 فاتورة" icon={FileText} color="#10b981" trend="+24%" />
            <KpiCard title="إجمالي الموظفين" value="6" sub="4 نشطين الآن" icon={Users} color="#8b5cf6" badge="4 نشطين" />
            <KpiCard title="تكلفة الذكاء اليوم" value="$1.24" sub="المعدل: $0.89/يوم" icon={DollarSign} color="#f59e0b" badge="+18%" />
            <KpiCard title="نسبة النجاح الكلية" value="94.2%" sub="من آخر 200 فاتورة" icon={BarChart3} color="#3b82f6" trend="+1.4%" />
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            {/* Employee table */}
            <div
              className="col-span-2 rounded-2xl p-4"
              style={{ background: "#0f0f1a", border: "1px solid #1a1a2e" }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4" style={{ color: "#a78bfa" }} />
                  <span className="text-[13px] font-semibold text-white">أداء الموظفين</span>
                </div>
                <button
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full"
                  style={{ color: "#a78bfa", background: "#8b5cf615" }}
                >
                  <Users className="w-3 h-3" />
                  إدارة المستخدمين
                </button>
              </div>

              {/* Table header */}
              <div
                className="grid text-[10px] font-semibold px-3 py-2 rounded-lg mb-2"
                style={{
                  gridTemplateColumns: "1fr 80px 70px 90px 60px",
                  color: "#6b7280",
                  background: "#ffffff08"
                }}
              >
                <span>الموظف</span>
                <span className="text-center">الفواتير</span>
                <span className="text-center">النجاح</span>
                <span className="text-center">آخر نشاط</span>
                <span className="text-center">الحالة</span>
              </div>

              <div className="space-y-1">
                {employees.map((emp, i) => (
                  <div
                    key={i}
                    className="grid items-center px-3 py-2.5 rounded-xl transition-colors"
                    style={{
                      gridTemplateColumns: "1fr 80px 70px 90px 60px",
                      background: i === 0 ? "#8b5cf610" : "transparent",
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                        style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)" }}
                      >
                        {emp.name[0]}
                      </div>
                      <span className="text-[12px] font-medium text-white">{emp.name}</span>
                    </div>
                    <span className="text-[12px] text-center" style={{ color: "#e5e7eb" }}>{emp.invoices}</span>
                    <span className="text-[12px] text-center font-semibold" style={{ color: "#10b981" }}>{emp.success}</span>
                    <span className="text-[11px] text-center" style={{ color: "#6b7280" }}>{emp.last}</span>
                    <div className="flex justify-center">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: emp.status === "online" ? "#10b981" : "#374151" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Alerts */}
            <div
              className="rounded-2xl p-4 flex flex-col"
              style={{ background: "#0f0f1a", border: "1px solid #1a1a2e" }}
            >
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="w-4 h-4" style={{ color: "#f59e0b" }} />
                <span className="text-[13px] font-semibold text-white">تنبيهات النظام</span>
                <span
                  className="mr-auto text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: "#f59e0b", color: "#000" }}
                >
                  3
                </span>
              </div>
              <div className="space-y-3 flex-1">
                {alerts.map((a, i) => {
                  const col = a.type === "warning" ? "#f59e0b" : "#3b82f6";
                  return (
                    <div
                      key={i}
                      className="p-3 rounded-xl"
                      style={{ background: col + "10", border: `1px solid ${col}30` }}
                    >
                      <p className="text-[11px] text-white leading-relaxed">{a.msg}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px]" style={{ color: "#6b7280" }}>{a.time}</span>
                        <button className="text-[10px] font-semibold" style={{ color: col }}>مراجعة</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                className="mt-4 w-full py-2 rounded-xl text-[12px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)" }}
              >
                عرض السجل الكامل
              </button>
            </div>
          </div>

          {/* AI Usage Bar */}
          <div
            className="rounded-2xl p-4 flex items-center gap-6"
            style={{ background: "#0f0f1a", border: "1px solid #1a1a2e" }}
          >
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#8b5cf620" }}>
                <Cpu className="w-5 h-5" style={{ color: "#a78bfa" }} />
              </div>
              <div>
                <p className="text-[12px] font-semibold text-white">استخدام الذكاء الاصطناعي</p>
                <p className="text-[10px]" style={{ color: "#6b7280" }}>Gemini 2.0 Flash — هذا الشهر</p>
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px]" style={{ color: "#9ca3af" }}>الرموز المستخدمة</span>
                <span className="text-[11px] font-semibold" style={{ color: "#a78bfa" }}>1.24M / 5M</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "#1a1a2e" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: "24.8%", background: "linear-gradient(90deg,#8b5cf6,#a78bfa)" }}
                />
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px]" style={{ color: "#6b7280" }}>التكلفة المتوقعة للشهر</p>
              <p className="text-[18px] font-bold" style={{ color: "#a78bfa" }}>$14.80</p>
            </div>
            <button
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-semibold shrink-0"
              style={{ background: "#8b5cf620", color: "#a78bfa", border: "1px solid #8b5cf630" }}
            >
              <Settings className="w-3.5 h-3.5" />
              تغيير النموذج
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
