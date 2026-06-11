import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, ScanLine, FileText, Database,
  ChevronRight, Sun, Moon, LogOut, Users, KeyRound,
  Eye, EyeOff, Cpu, ShieldCheck,
} from "lucide-react";
import { useState, useEffect, createContext, useContext } from "react";
import { useAuth, getAuthHeader } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ── سياق الثيم ──────────────────────────────────────────────
type Theme = "dark" | "light";
interface ThemeContextValue { theme: Theme; toggleTheme: () => void; }

export const ThemeContext = createContext<ThemeContextValue>({ theme: "dark", toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("rukn-theme") as Theme) ?? "dark";
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") { root.classList.add("dark"); root.classList.remove("light"); }
    else { root.classList.remove("dark"); root.classList.add("light"); }
    localStorage.setItem("rukn-theme", theme);
  }, [theme]);
  const toggleTheme = () => setTheme(t => (t === "dark" ? "light" : "dark"));
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }

// ── ألوان الدور ──────────────────────────────────────────────
const ROLE_COLORS = {
  admin: {
    accent: "#8b5cf6",
    dim: "#8b5cf615",
    border: "#8b5cf630",
    glow: "#8b5cf640",
    gradient: "linear-gradient(135deg,#8b5cf6,#6d28d9)",
    label: "مدير النظام",
  },
  employee: {
    accent: "#10b981",
    dim: "#10b98115",
    border: "#10b98130",
    glow: "#10b98140",
    gradient: "linear-gradient(135deg,#10b981,#059669)",
    label: "موظف",
  },
};

const SIDEBAR_EXPANDED = 224;
const SIDEBAR_COLLAPSED = 60;

const PAGE_TITLES: Record<string, string> = {
  "/": "لوحة التحكم",
  "/extract": "استخراج فاتورة",
  "/invoices": "سجل الفواتير",
  "/parts": "ذاكرة القطع",
  "/admin/users": "إدارة المستخدمين",
  "/admin/settings": "إعدادات الذكاء الاصطناعي",
};

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user, logout, isAdmin, token } = useAuth();
  const canParts = isAdmin || (user?.canEditParts ?? false);
  const colors = ROLE_COLORS[isAdmin ? "admin" : "employee"];

  // كلمة السر
  const [showPassModal, setShowPassModal] = useState(false);
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingPass, setSavingPass] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass.length < 6) { toast.error("كلمة السر الجديدة يجب أن تكون 6 أحرف على الأقل"); return; }
    setSavingPass(true);
    const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
    try {
      const res = await fetch(`${BASE}/api/auth/change-password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeader(token) },
        body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم تغيير كلمة السر بنجاح ✓");
      setShowPassModal(false); setOldPass(""); setNewPass("");
    } finally { setSavingPass(false); }
  };

  const pageTitle = PAGE_TITLES[location] || "RuknAuto";

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("rukn-sidebar-collapsed") === "true";
  });
  useEffect(() => { localStorage.setItem("rukn-sidebar-collapsed", String(isCollapsed)); }, [isCollapsed]);

  const navItems = [
    { href: "/", label: "الرئيسية", icon: LayoutDashboard },
    { href: "/extract", label: "استخراج فاتورة", icon: ScanLine },
    { href: "/invoices", label: "سجل الفواتير", icon: FileText },
    ...(canParts ? [{ href: "/parts", label: "ذاكرة القطع", icon: Database }] : []),
  ];
  const adminItems = isAdmin
    ? [
        { href: "/admin/users", label: "المستخدمون", icon: Users },
        { href: "/admin/settings", label: "نموذج الذكاء", icon: Cpu },
      ]
    : [];

  const fadeStyle = (show: boolean) => ({
    opacity: show ? 1 : 0,
    maxWidth: show ? 200 : 0,
    overflow: "hidden" as const,
    transition: "opacity 160ms ease, max-width 280ms cubic-bezier(0.4,0,0.2,1)",
    whiteSpace: "nowrap" as const,
  });

  function NavItem({ href, label, icon: Icon }: { href: string; label: string; icon: any }) {
    const isActive = location === href;
    return (
      <Link href={href}>
        <span
          title={isCollapsed ? label : undefined}
          className="relative flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all duration-150 cursor-pointer select-none overflow-hidden"
          style={{
            background: isActive ? colors.dim : "transparent",
            border: isActive ? `1px solid ${colors.border}` : "1px solid transparent",
            color: isActive ? colors.accent : "hsl(var(--sidebar-foreground) / 0.5)",
          }}
        >
          <Icon className="w-4 h-4 shrink-0" />
          <span className="text-[13px] font-medium" style={fadeStyle(!isCollapsed)}>{label}</span>
          {isActive && !isCollapsed && (
            <span className="mr-auto w-1.5 h-1.5 rounded-full shrink-0" style={{ background: colors.accent }} />
          )}
          {isActive && isCollapsed && (
            <span
              className="absolute top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
              style={{ insetInlineStart: 0, background: colors.accent }}
            />
          )}
        </span>
      </Link>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background" dir="rtl">
      {/* ── الشريط الجانبي ── */}
      <aside
        className="flex flex-col h-full shrink-0"
        style={{
          width: isCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED,
          transition: "width 280ms cubic-bezier(0.4,0,0.2,1)",
          overflow: "hidden",
          background: "hsl(var(--sidebar))",
          borderLeft: "1px solid hsl(var(--sidebar-border))",
        }}
      >
        {/* الشعار */}
        <div className="px-3 pt-4 pb-3 flex items-center gap-2.5 overflow-hidden">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: colors.gradient, boxShadow: `0 0 14px ${colors.glow}` }}
          >
            <ScanLine className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0" style={fadeStyle(!isCollapsed)}>
            <h1 className="font-bold text-[14px] tracking-tight text-sidebar-foreground leading-none">RuknAuto</h1>
            <div className="flex items-center gap-1 mt-0.5">
              {isAdmin && <ShieldCheck className="w-2.5 h-2.5 shrink-0" style={{ color: colors.accent }} />}
              <p className="text-[9px]" style={{ color: colors.accent }}>{colors.label}</p>
            </div>
          </div>
        </div>

        <div className="h-px mx-3 mb-2 bg-sidebar-border" />

        {/* التنقل */}
        <nav className="flex-1 px-2 py-1 space-y-0.5 overflow-hidden">
          {navItems.map(item => <NavItem key={item.href} {...item} />)}

          {adminItems.length > 0 && (
            <>
              <div className="mx-1 my-2 flex items-center gap-2" style={{ opacity: isCollapsed ? 0 : 1, transition: "opacity 160ms ease" }}>
                <div className="flex-1 h-px bg-sidebar-border" />
                <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: colors.accent + "80" }}>إدارة</span>
                <div className="flex-1 h-px bg-sidebar-border" />
              </div>
              {adminItems.map(item => <NavItem key={item.href} {...item} />)}
            </>
          )}
        </nav>

        <div className="h-px mx-3 bg-sidebar-border" />

        {/* ثيم + طي */}
        <div className="p-2 space-y-0.5">
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "الوضع الصباحي" : "الوضع الليلي"}
            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-sidebar-foreground/45 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground transition-all duration-150 cursor-pointer overflow-hidden"
          >
            {theme === "dark"
              ? <Sun className="w-4 h-4 shrink-0 text-amber-400/80" />
              : <Moon className="w-4 h-4 shrink-0 text-blue-400/80" />}
            <span className="text-xs" style={fadeStyle(!isCollapsed)}>
              {theme === "dark" ? "الوضع الصباحي" : "الوضع الليلي"}
            </span>
          </button>
          <button
            onClick={() => setIsCollapsed(c => !c)}
            title={isCollapsed ? "توسيع القائمة" : "طي القائمة"}
            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-sidebar-foreground/30 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground/60 transition-all duration-150 cursor-pointer overflow-hidden"
          >
            <ChevronRight
              className="w-4 h-4 shrink-0 transition-transform duration-300"
              style={{ transform: isCollapsed ? "rotate(180deg)" : "rotate(0deg)" }}
            />
            <span className="text-xs" style={fadeStyle(!isCollapsed)}>طي القائمة</span>
          </button>
        </div>

        {/* المستخدم */}
        <div className="p-3 border-t border-sidebar-border overflow-hidden">
          <div className="rounded-xl p-2.5" style={{ background: colors.dim, border: `1px solid ${colors.border}` }}>
            <div className="flex items-center gap-2 min-w-0 mb-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                style={{ background: colors.gradient }}
              >
                {user?.displayName?.[0] || "م"}
              </div>
              <div className="min-w-0 flex-1" style={fadeStyle(!isCollapsed)}>
                <p className="text-xs font-semibold text-sidebar-foreground truncate">{user?.displayName || "مستخدم"}</p>
                <p className="text-[9px] truncate" style={{ color: colors.accent }}>{colors.label}</p>
              </div>
            </div>
            <div className="flex gap-1.5" style={{ opacity: isCollapsed ? 0 : 1, transition: "opacity 160ms ease" }}>
              <button
                onClick={() => setShowPassModal(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium bg-sidebar-accent/50 text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
              >
                <KeyRound className="w-3 h-3" />
                <span>كلمة السر</span>
              </button>
              <button
                onClick={logout}
                title="تسجيل الخروج"
                className="flex items-center justify-center p-1.5 rounded-lg bg-sidebar-accent/50 text-red-400/70 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* نافذة كلمة السر */}
        <Dialog open={showPassModal} onOpenChange={setShowPassModal}>
          <DialogContent className="max-w-sm bg-card border-border rounded-xl" dir="rtl">
            <DialogHeader className="border-b border-border pb-4">
              <DialogTitle className="text-sm font-bold flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" />
                تغيير كلمة السر
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleChangePassword} className="space-y-3 py-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">كلمة السر الحالية</label>
                <div className="relative">
                  <Input type={showOld ? "text" : "password"} value={oldPass} onChange={e => setOldPass(e.target.value)} className="h-9 pl-9" dir="ltr" placeholder="كلمة السر الحالية" />
                  <button type="button" onClick={() => setShowOld(s => !s)} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground">
                    {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">كلمة السر الجديدة</label>
                <div className="relative">
                  <Input type={showNew ? "text" : "password"} value={newPass} onChange={e => setNewPass(e.target.value)} className="h-9 pl-9" dir="ltr" placeholder="6 أحرف على الأقل" />
                  <button type="button" onClick={() => setShowNew(s => !s)} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground">
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowPassModal(false)} disabled={savingPass}>إلغاء</Button>
                <Button type="submit" size="sm" disabled={savingPass || !oldPass || !newPass}>
                  {savingPass ? "جاري الحفظ..." : "حفظ"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </aside>

      {/* ── المحتوى ── */}
      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <header className="flex items-center px-6 shrink-0 gap-3 bg-card/50 border-b border-border" style={{ height: "52px" }}>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground/40">RuknAuto</span>
            <ChevronRight className="w-3 h-3 text-muted-foreground/30 shrink-0" style={{ transform: "rotate(180deg)" }} />
            {isAdmin && <ShieldCheck className="w-3 h-3 shrink-0" style={{ color: colors.accent }} />}
            <span className="font-semibold text-foreground text-sm">{pageTitle}</span>
          </div>
          <div className="flex-1" />
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
            style={{ background: "#10b98112", border: "1px solid #10b98128", color: "#10b981" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
            <span className="hidden sm:block">NewPoint ERP متصل</span>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-6 bg-background">
          <div className="max-w-7xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
}
