import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, ScanLine, FileText, Database,
  ChevronRight, Sun, Moon, LogOut, Users, KeyRound,
  Eye, EyeOff, Cpu, ShieldCheck, ChevronDown, BarChart3, Shield,
} from "lucide-react";
import { useState, useEffect, createContext, useContext } from "react";
import { useAuth, getAuthHeader } from "@/contexts/AuthContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme: () => setTheme(t => t === "dark" ? "light" : "dark") }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function useTheme() { return useContext(ThemeContext); }

// ── ألوان الدور ──────────────────────────────────────────────
const ROLE = {
  admin:      { accent: "#8b5cf6", dim: "#8b5cf614", border: "#8b5cf628", gradient: "linear-gradient(135deg,#8b5cf6,#6d28d9)", label: "مدير النظام" },
  employee:   { accent: "#10b981", dim: "#10b98114", border: "#10b98128", gradient: "linear-gradient(135deg,#10b981,#059669)", label: "موظف" },
  superadmin: { accent: "#f59e0b", dim: "#f59e0b14", border: "#f59e0b28", gradient: "linear-gradient(135deg,#f59e0b,#d97706)", label: "مدير المنصة" },
};

const PAGE_TITLES: Record<string, string> = {
  "/": "لوحة التحكم",
  "/extract": "استخراج فاتورة",
  "/invoices": "سجل الفواتير",
  "/parts": "ذاكرة القطع",
  "/analytics": "تحليلات الموردين",
  "/admin/users": "إدارة المستخدمين",
  "/admin/settings": "إعدادات الذكاء الاصطناعي",
};

const SIDEBAR_EXPANDED = 224;
const SIDEBAR_COLLAPSED = 56;

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user, logout, isAdmin, isSuperAdmin, token } = useAuth();
  const canParts = isAdmin || (user?.canEditParts ?? false);
  const roleKey = isSuperAdmin ? "superadmin" : (isAdmin ? "admin" : "employee");
  const colors = ROLE[roleKey];

  // طي الشريط
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() =>
    typeof window !== "undefined" && localStorage.getItem("rukn-sidebar-collapsed") === "true"
  );
  useEffect(() => { localStorage.setItem("rukn-sidebar-collapsed", String(isCollapsed)); }, [isCollapsed]);

  // تغيير كلمة السر
  const [showPassModal, setShowPassModal] = useState(false);
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingPass, setSavingPass] = useState(false);

  // تأكيد الخروج
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

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

  const navItems = [
    { href: "/",           label: "الرئيسية",         icon: LayoutDashboard },
    { href: "/extract",    label: "استخراج فاتورة",   icon: ScanLine },
    { href: "/invoices",   label: "سجل الفواتير",     icon: FileText },
    { href: "/analytics",  label: "التحليلات",         icon: BarChart3 },
    ...(canParts ? [{ href: "/parts", label: "ذاكرة القطع", icon: Database }] : []),
  ];
  const adminItems = isAdmin ? [
    { href: "/admin/users",    label: "المستخدمون",    icon: Users },
    { href: "/admin/settings", label: "نموذج الذكاء", icon: Cpu },
  ] : [];
  const superAdminItems = isSuperAdmin ? [
    { href: "/super-admin", label: "لوحة المنصة", icon: Shield },
  ] : [];

  const initials = user?.displayName?.[0] || "م";
  const pageTitle = PAGE_TITLES[location] || (isSuperAdmin && location === "/super-admin" ? "لوحة المنصة" : "RuknAuto");

  // مساعد: تلاشي + طي نصي
  const fadeStyle = (visible: boolean): React.CSSProperties => ({
    opacity: visible ? 1 : 0,
    maxWidth: visible ? 200 : 0,
    overflow: "hidden",
    whiteSpace: "nowrap",
    transition: "opacity 160ms ease, max-width 280ms cubic-bezier(0.4,0,0.2,1)",
  });

  // مكوّن NavItem داخلي
  function NavItem({ href, label, icon: Icon }: { href: string; label: string; icon: any }) {
    const active = location === href;
    return (
      <Link href={href}>
        <span
          title={isCollapsed ? label : undefined}
          className="relative flex items-center gap-3 px-2.5 py-2.5 rounded-xl cursor-pointer select-none transition-all duration-150"
          style={{
            background: active ? colors.dim : "transparent",
            border: `1px solid ${active ? colors.border : "transparent"}`,
            color: active ? colors.accent : "hsl(var(--sidebar-foreground)/0.5)",
          }}
        >
          {/* مؤشر جانبي حين مطوي */}
          {active && isCollapsed && (
            <span className="absolute top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full" style={{ insetInlineStart: 0, background: colors.accent }} />
          )}
          <Icon className="w-4 h-4 shrink-0" />
          <span className="text-[13px] font-medium" style={fadeStyle(!isCollapsed)}>{label}</span>
          {active && !isCollapsed && (
            <span className="mr-auto w-1.5 h-1.5 rounded-full shrink-0" style={{ background: colors.accent }} />
          )}
        </span>
      </Link>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background" dir="rtl">

      {/* ══ الشريط الجانبي ══ */}
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
            style={{ background: colors.gradient, boxShadow: `0 0 14px ${colors.dim}` }}
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
        <nav className="flex-1 px-2 py-1 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {navItems.map(item => <NavItem key={item.href} {...item} />)}

          {adminItems.length > 0 && (
            <>
              <div
                className="mx-1 my-2 flex items-center gap-2"
                style={{ opacity: isCollapsed ? 0 : 1, transition: "opacity 160ms ease", pointerEvents: isCollapsed ? "none" : "auto" }}
              >
                <div className="flex-1 h-px bg-sidebar-border" />
                <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: colors.accent + "80" }}>إدارة</span>
                <div className="flex-1 h-px bg-sidebar-border" />
              </div>
              {adminItems.map(item => <NavItem key={item.href} {...item} />)}
            </>
          )}
          {superAdminItems.length > 0 && (
            <>
              <div
                className="mx-1 my-2 flex items-center gap-2"
                style={{ opacity: isCollapsed ? 0 : 1, transition: "opacity 160ms ease", pointerEvents: isCollapsed ? "none" : "auto" }}
              >
                <div className="flex-1 h-px bg-sidebar-border" />
                <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: "#f59e0b80" }}>المنصة</span>
                <div className="flex-1 h-px bg-sidebar-border" />
              </div>
              {superAdminItems.map(item => <NavItem key={item.href} {...item} />)}
            </>
          )}
        </nav>

        <div className="h-px mx-3 bg-sidebar-border" />

        {/* أدوات أسفل: ثيم + طي */}
        <div className="p-2 space-y-0.5">
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "الوضع الصباحي" : "الوضع الليلي"}
            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-sidebar-foreground/40 hover:text-sidebar-foreground/70 hover:bg-sidebar-accent/40 transition-all duration-150 cursor-pointer"
          >
            {theme === "dark"
              ? <Sun className="w-4 h-4 shrink-0 text-amber-400/70" />
              : <Moon className="w-4 h-4 shrink-0 text-blue-400/70" />}
            <span className="text-xs" style={fadeStyle(!isCollapsed)}>
              {theme === "dark" ? "الوضع الصباحي" : "الوضع الليلي"}
            </span>
          </button>

          <button
            onClick={() => setIsCollapsed(c => !c)}
            title={isCollapsed ? "توسيع القائمة" : "طي القائمة"}
            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-sidebar-foreground/30 hover:text-sidebar-foreground/60 hover:bg-sidebar-accent/30 transition-all duration-150 cursor-pointer"
          >
            <ChevronRight
              className="w-4 h-4 shrink-0 transition-transform duration-300"
              style={{ transform: isCollapsed ? "rotate(180deg)" : "rotate(0deg)" }}
            />
            <span className="text-xs" style={fadeStyle(!isCollapsed)}>طي القائمة</span>
          </button>
        </div>

        {/* ══ قسم المستخدم — قائمة ذكية ══ */}
        <div className="p-2 border-t border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="w-full flex items-center gap-2.5 p-2 rounded-xl transition-all duration-150 cursor-pointer hover:bg-sidebar-accent/40 outline-none"
                style={{ border: `1px solid ${colors.border}`, background: colors.dim }}
                title={isCollapsed ? user?.displayName || "الحساب" : undefined}
              >
                {/* الأفاتار */}
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                  style={{ background: colors.gradient }}
                >
                  {initials}
                </div>

                {/* الاسم والدور — يختفيان عند الطي */}
                <div className="flex-1 min-w-0 text-right" style={fadeStyle(!isCollapsed)}>
                  <p className="text-xs font-semibold text-sidebar-foreground leading-none truncate">
                    {user?.displayName || "مستخدم"}
                  </p>
                  <p className="text-[9px] mt-0.5 truncate" style={{ color: colors.accent }}>
                    {colors.label}
                  </p>
                </div>

                <ChevronDown
                  className="w-3 h-3 shrink-0 text-sidebar-foreground/30"
                  style={fadeStyle(!isCollapsed)}
                />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              side="top"
              align="end"
              sideOffset={8}
              className="w-52 rounded-xl border-border bg-card shadow-xl"
              dir="rtl"
            >
              <DropdownMenuLabel className="px-3 py-2.5">
                <p className="text-xs font-bold text-foreground truncate">{user?.displayName || "مستخدم"}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{user?.username}</p>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                className="gap-2.5 cursor-pointer px-3 py-2 rounded-lg mx-1"
                onClick={() => setShowPassModal(true)}
              >
                <KeyRound className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">تغيير كلمة السر</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                className="gap-2.5 cursor-pointer px-3 py-2 rounded-lg mx-1 mb-1 text-red-400 focus:text-red-400 focus:bg-red-400/10"
                onClick={() => setShowLogoutConfirm(true)}
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm">تسجيل الخروج</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* ══ المحتوى الرئيسي ══ */}
      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* شريط العنوان */}
        <header className="flex items-center px-5 shrink-0 gap-3 bg-card/50 border-b border-border" style={{ height: "52px" }}>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground/40 text-[11px]">RuknAuto</span>
            <ChevronRight className="w-3 h-3 text-muted-foreground/25 shrink-0" style={{ transform: "rotate(180deg)" }} />
            {isAdmin && <ShieldCheck className="w-3 h-3 shrink-0" style={{ color: colors.accent }} />}
            <span className="font-semibold text-foreground text-sm">{pageTitle}</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="hidden sm:block">NewPoint ERP متصل</span>
          </div>
        </header>

        {/* المحتوى */}
        <div className="flex-1 overflow-auto p-6 bg-background">
          <div className="max-w-7xl mx-auto">{children}</div>
        </div>
      </main>

      {/* ══ تأكيد تسجيل الخروج ══ */}
      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent className="max-w-sm rounded-2xl border-border bg-card" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <LogOut className="w-4 h-4 text-red-400" />
              تسجيل الخروج
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              هل تريد الخروج من حسابك؟ ستحتاج إلى إعادة تسجيل الدخول.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 flex-row-reverse">
            <AlertDialogCancel className="flex-1 rounded-xl">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white"
              onClick={logout}
            >
              خروج
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══ نافذة تغيير كلمة السر ══ */}
      <Dialog open={showPassModal} onOpenChange={setShowPassModal}>
        <DialogContent className="max-w-sm bg-card border-border rounded-2xl" dir="rtl">
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
                <Input type={showOld ? "text" : "password"} value={oldPass} onChange={e => setOldPass(e.target.value)} className="h-9 pl-9" dir="ltr" placeholder="أدخل كلمة سرك الحالية" />
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

    </div>
  );
}
