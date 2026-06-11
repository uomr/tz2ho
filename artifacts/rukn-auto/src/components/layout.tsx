import { Link, useLocation } from "wouter";
import { LayoutDashboard, ScanLine, FileText, Database, ChevronRight, Sun, Moon, LogOut, Users, KeyRound, Eye, EyeOff, Cpu } from "lucide-react";
import { useState, useEffect, createContext, useContext } from "react";
import { useAuth, getAuthHeader } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ── سياق الثيم ──────────────────────────────────────────────
type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("rukn-theme") as Theme) ?? "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
    } else {
      root.classList.remove("dark");
      root.classList.add("light");
    }
    localStorage.setItem("rukn-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

// ── الشريط الجانبي ──────────────────────────────────────────
const SIDEBAR_EXPANDED = 228;
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

  // نافذة تغيير كلمة السر
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
      setShowPassModal(false);
      setOldPass(""); setNewPass("");
    } finally {
      setSavingPass(false);
    }
  };
  const pageTitle = PAGE_TITLES[location] || "RuknAuto";

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("rukn-sidebar-collapsed") === "true";
  });

  useEffect(() => {
    localStorage.setItem("rukn-sidebar-collapsed", String(isCollapsed));
  }, [isCollapsed]);

  const navItems = [
    { href: "/", label: "لوحة التحكم", icon: LayoutDashboard },
    { href: "/extract", label: "استخراج فاتورة", icon: ScanLine },
    { href: "/invoices", label: "سجل الفواتير", icon: FileText },
    ...(canParts ? [{ href: "/parts", label: "ذاكرة القطع", icon: Database }] : []),
    ...(isAdmin ? [
      { href: "/admin/users", label: "المستخدمون", icon: Users },
      { href: "/admin/settings", label: "نموذج الذكاء", icon: Cpu },
    ] : []),
  ];

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden" dir="rtl">
      {/* ── الشريط الجانبي ── */}
      <aside
        className="flex flex-col bg-sidebar border-l border-sidebar-border h-full shrink-0 relative"
        style={{
          width: isCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED,
          transition: "width 280ms cubic-bezier(0.4,0,0.2,1)",
          overflow: "hidden",
        }}
      >
        {/* الشعار */}
        <div className="px-3 py-4 flex items-center gap-3 overflow-hidden min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center shrink-0">
            <ScanLine className="w-4 h-4 text-primary" />
          </div>
          <div
            className="min-w-0 overflow-hidden"
            style={{
              opacity: isCollapsed ? 0 : 1,
              maxWidth: isCollapsed ? 0 : 160,
              transition: "opacity 180ms ease, max-width 280ms cubic-bezier(0.4,0,0.2,1)",
              whiteSpace: "nowrap",
            }}
          >
            <h1 className="font-bold text-[15px] tracking-tight text-sidebar-foreground leading-none">RuknAuto</h1>
            <p className="text-[10px] text-sidebar-foreground/40 mt-0.5">استخراج الفواتير الذكي</p>
          </div>
        </div>

        <div className="h-px bg-sidebar-border mx-3 mb-2" />

        {/* التنقل */}
        <nav className="flex-1 px-2 space-y-0.5 py-2">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <span
                  title={isCollapsed ? item.label : undefined}
                  className={`relative flex items-center gap-3 px-2.5 py-2.5 rounded-lg transition-all duration-150 cursor-pointer select-none overflow-hidden ${
                    isActive
                      ? "bg-primary/10 text-primary font-semibold border border-primary/15"
                      : "text-sidebar-foreground/55 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
                  <span
                    className="text-sm whitespace-nowrap"
                    style={{
                      opacity: isCollapsed ? 0 : 1,
                      maxWidth: isCollapsed ? 0 : 200,
                      overflow: "hidden",
                      transition: "opacity 160ms ease, max-width 280ms cubic-bezier(0.4,0,0.2,1)",
                    }}
                  >
                    {item.label}
                  </span>
                  {isActive && !isCollapsed && (
                    <span className="mr-auto w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  )}
                  {isActive && isCollapsed && (
                    <span
                      className="absolute top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full"
                      style={{ insetInlineStart: 0 }}
                    />
                  )}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="h-px bg-sidebar-border mx-3" />

        {/* ثيم + طي */}
        <div className="p-2 space-y-0.5">
          {/* الوضع الصباحي / الليلي */}
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "الوضع الصباحي" : "الوضع الليلي"}
            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-sidebar-foreground/50 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-all duration-150 overflow-hidden cursor-pointer"
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4 shrink-0 text-amber-400/80" />
            ) : (
              <Moon className="w-4 h-4 shrink-0 text-blue-400/80" />
            )}
            <span
              className="text-xs whitespace-nowrap"
              style={{
                opacity: isCollapsed ? 0 : 1,
                maxWidth: isCollapsed ? 0 : 160,
                overflow: "hidden",
                transition: "opacity 160ms ease, max-width 280ms cubic-bezier(0.4,0,0.2,1)",
              }}
            >
              {theme === "dark" ? "الوضع الصباحي" : "الوضع الليلي"}
            </span>
          </button>

          {/* طي / توسيع القائمة */}
          <button
            onClick={() => setIsCollapsed(c => !c)}
            title={isCollapsed ? "توسيع القائمة" : "طي القائمة"}
            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-sidebar-foreground/35 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground/70 transition-all duration-150 overflow-hidden cursor-pointer"
          >
            <ChevronRight
              className="w-4 h-4 shrink-0 transition-transform duration-300"
              style={{ transform: isCollapsed ? "rotate(180deg)" : "rotate(0deg)" }}
            />
            <span
              className="text-xs whitespace-nowrap"
              style={{
                opacity: isCollapsed ? 0 : 1,
                maxWidth: isCollapsed ? 0 : 160,
                overflow: "hidden",
                transition: "opacity 160ms ease, max-width 280ms cubic-bezier(0.4,0,0.2,1)",
              }}
            >
              طي القائمة
            </span>
          </button>
        </div>

        {/* المستخدم + تسجيل خروج */}
        <div className="p-3 border-t border-sidebar-border overflow-hidden">
          <div className="flex items-center gap-2.5 px-0.5 overflow-hidden min-w-0">
            <div
              className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"
              title={isCollapsed ? (user?.displayName || "مستخدم") : undefined}
            >
              <span className="text-[11px] font-bold text-primary">
                {user?.displayName?.[0] || "م"}
              </span>
            </div>
            <div
              className="min-w-0 flex-1 overflow-hidden"
              style={{
                opacity: isCollapsed ? 0 : 1,
                maxWidth: isCollapsed ? 0 : 130,
                transition: "opacity 160ms ease, max-width 280ms cubic-bezier(0.4,0,0.2,1)",
                whiteSpace: "nowrap",
              }}
            >
              <p className="text-xs font-semibold text-sidebar-foreground truncate">{user?.displayName || "مستخدم"}</p>
              <p className="text-[10px] text-sidebar-foreground/35 truncate">{user?.role === "admin" ? "مدير النظام" : "موظف"}</p>
            </div>
            {/* تغيير كلمة السر */}
            <button
              onClick={() => setShowPassModal(true)}
              title="تغيير كلمة السر"
              className="shrink-0 p-1 rounded text-sidebar-foreground/25 hover:text-primary hover:bg-primary/10 transition-colors"
              style={{ opacity: isCollapsed ? 0 : 1, transition: "opacity 160ms ease" }}
            >
              <KeyRound className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={logout}
              title="تسجيل الخروج"
              className="shrink-0 p-1 rounded text-sidebar-foreground/30 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              style={{ opacity: isCollapsed ? 0 : 1, transition: "opacity 160ms ease" }}
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* نافذة تغيير كلمة السر */}
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

      {/* ── المحتوى الرئيسي ── */}
      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* شريط العنوان */}
        <header
          className="flex items-center px-6 border-b border-border bg-card/50 shrink-0 gap-3"
          style={{ height: "52px" }}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground/50 text-xs">RuknAuto</span>
            <ChevronRight
              className="w-3 h-3 text-muted-foreground/30 shrink-0"
              style={{ transform: "rotate(180deg)" }}
            />
            <span className="font-semibold text-foreground text-sm">{pageTitle}</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground/40 hidden sm:block font-mono">NewPoint ERP</span>
            <div className="w-1.5 h-1.5 rounded-full bg-green-500/60 shrink-0" title="متصل" />
          </div>
        </header>

        {/* المحتوى */}
        <div className="flex-1 overflow-auto p-6 bg-background">
          <div className="max-w-7xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
}
