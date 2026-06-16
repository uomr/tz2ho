import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, ScanLine, FileText, Database,
  ChevronRight, Sun, Moon, LogOut, Users, KeyRound,
  Eye, EyeOff, Cpu, ShieldCheck, ChevronDown, BarChart3, Shield,
  Loader2, CheckCircle2, X as XIcon, AlertCircle,
  ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { useState, useEffect, createContext, useContext } from "react";
import { useAuth, getAuthHeader } from "@/contexts/AuthContext";
import { useExtraction } from "@/contexts/ExtractionContext";
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
  admin:      { accent: "#8b5cf6", dim: "#8b5cf610", border: "#8b5cf620", gradient: "linear-gradient(135deg,#8b5cf6,#6d28d9)", label: "مدير" },
  employee:   { accent: "#10b981", dim: "#10b98110", border: "#10b98120", gradient: "linear-gradient(135deg,#10b981,#059669)", label: "موظف" },
  superadmin: { accent: "#f59e0b", dim: "#f59e0b10", border: "#f59e0b20", gradient: "linear-gradient(135deg,#f59e0b,#d97706)", label: "مدير المنصة" },
} as const;

const PAGE_TITLES: Record<string, string> = {
  "/": "لوحة التحكم",
  "/extract": "استخراج فاتورة",
  "/invoices": "سجل الفواتير",
  "/parts": "ذاكرة القطع",
  "/analytics": "التحليلات",
  "/admin/users": "المستخدمون",
  "/admin/settings": "إعدادات الذكاء الاصطناعي",
  "/super-admin": "لوحة المنصة",
};

const SIDEBAR_W = 220;
const SIDEBAR_W_COLLAPSED = 54;

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user, logout, isAdmin, isSuperAdmin, token, activeOrgId, setActiveOrgId } = useAuth();
  const { progress, cancelExtraction, dismissCompletion } = useExtraction();
  const canParts = isAdmin || (user?.canEditParts ?? false);
  const roleKey = isSuperAdmin ? "superadmin" : (isAdmin ? "admin" : "employee");
  const colors = ROLE[roleKey];

  // تلاشي تلقائي لبانر الاكتمال بعد 10 ثوان
  useEffect(() => {
    if (progress.status === "done") {
      const timer = setTimeout(dismissCompletion, 10000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [progress.status, dismissCompletion]);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() =>
    typeof window !== "undefined" && localStorage.getItem("rukn-sidebar-collapsed") === "true"
  );
  useEffect(() => { localStorage.setItem("rukn-sidebar-collapsed", String(isCollapsed)); }, [isCollapsed]);

  const [showPassModal, setShowPassModal] = useState(false);
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingPass, setSavingPass] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass.length < 6) { toast.error("كلمة السر الجديدة أقل من 6 أحرف"); return; }
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
      toast.success("تم تغيير كلمة السر");
      setShowPassModal(false); setOldPass(""); setNewPass("");
    } finally { setSavingPass(false); }
  };

  const navItems = [
    { href: "/",          label: "الرئيسية",       icon: LayoutDashboard },
    { href: "/extract",   label: "استخراج فاتورة", icon: ScanLine },
    { href: "/invoices",  label: "سجل الفواتير",   icon: FileText },
    { href: "/analytics", label: "التحليلات",       icon: BarChart3 },
    ...(canParts ? [{ href: "/parts", label: "ذاكرة القطع", icon: Database }] : []),
  ];
  const adminItems = isAdmin ? [
    { href: "/admin/users",    label: "المستخدمون",  icon: Users },
  ] : [];
  const superAdminItems = isSuperAdmin ? [
    { href: "/admin/settings", label: "إعدادات المنصة", icon: Cpu },
    { href: "/super-admin", label: "لوحة المنصة", icon: Shield },
  ] : [];

  const initials = user?.displayName?.[0] ?? "م";
  const pageTitle = PAGE_TITLES[location] ?? "RuknAuto";

  const fade = (show: boolean): React.CSSProperties => ({
    opacity: show ? 1 : 0,
    maxWidth: show ? 200 : 0,
    overflow: "hidden",
    whiteSpace: "nowrap",
    transition: "opacity 150ms ease, max-width 250ms cubic-bezier(0.4,0,0.2,1)",
    pointerEvents: show ? "auto" : "none",
  });

  function NavItem({ href, label, icon: Icon }: { href: string; label: string; icon: any }) {
    const active = location === href;
    return (
      <Link href={href}>
        <span
          title={isCollapsed ? label : undefined}
          className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer select-none transition-colors duration-150"
          style={{
            background: active ? colors.dim : "transparent",
            color: active ? colors.accent : "hsl(var(--sidebar-foreground)/0.50)",
          }}
        >
          {active && (
            <span
              className="absolute top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full"
              style={{ insetInlineEnd: 0, background: colors.accent }}
            />
          )}
          <Icon className="w-5 h-5 shrink-0" />
          <span className="text-sm font-medium" style={fade(!isCollapsed)}>{label}</span>
        </span>
      </Link>
    );
  }

  function SectionLabel({ text, color }: { text: string; color?: string }) {
    return (
      <div
        className="flex items-center gap-2 mx-1 my-1.5"
        style={{ opacity: isCollapsed ? 0 : 1, transition: "opacity 150ms ease", pointerEvents: isCollapsed ? "none" : "auto" }}
      >
        <div className="flex-1 h-px" style={{ background: "hsl(var(--sidebar-border))" }} />
        <span className="text-[11px] font-semibold tracking-wider uppercase" style={{ color: color ?? colors.accent + "80" }}>
          {text}
        </span>
        <div className="flex-1 h-px" style={{ background: "hsl(var(--sidebar-border))" }} />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background" dir="rtl">

      {/* ══ الشريط الجانبي ══ */}
      <aside
        className="flex flex-col h-full shrink-0 relative"
        style={{
          width: isCollapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W,
          transition: "width 250ms cubic-bezier(0.4,0,0.2,1)",
          overflow: "hidden",
          background: "hsl(var(--sidebar))",
          borderLeft: "1px solid hsl(var(--sidebar-border))",
        }}
      >
        {/* الشعار */}
        <div className={`flex items-center gap-3 ${isCollapsed ? "px-[11px]" : "px-3"} py-4 overflow-hidden shrink-0 transition-all duration-150`}>
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
            style={{ background: colors.gradient }}
          >
            <ScanLine className="w-4 h-4 text-white" />
          </div>
          <div style={fade(!isCollapsed)}>
            <p className="font-bold text-sm text-sidebar-foreground leading-none">RuknAuto</p>
            <p className="text-[11px] mt-0.5 font-medium" style={{ color: colors.accent }}>
              {user?.orgName ?? colors.label}
            </p>
          </div>
        </div>

        <div className="h-px mx-3 shrink-0" style={{ background: "hsl(var(--sidebar-border))" }} />

        {/* التنقل */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {navItems.map(item => <NavItem key={item.href} {...item} />)}

          {adminItems.length > 0 && (
            <>
              <SectionLabel text="الإدارة" />
              {adminItems.map(item => <NavItem key={item.href} {...item} />)}
            </>
          )}
          {superAdminItems.length > 0 && (
            <>
              <SectionLabel text="المنصة" color="#f59e0b80" />
              {superAdminItems.map(item => <NavItem key={item.href} {...item} />)}
            </>
          )}
        </nav>

        <div className="h-px mx-3 shrink-0" style={{ background: "hsl(var(--sidebar-border))" }} />

        {/* أدوات */}
        <div className="px-2 py-2 space-y-0.5 shrink-0">
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "وضع صباحي" : "وضع ليلي"}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-150"
            style={{ color: "hsl(var(--sidebar-foreground)/0.40)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "hsl(var(--sidebar-foreground)/0.75)")}
            onMouseLeave={e => (e.currentTarget.style.color = "hsl(var(--sidebar-foreground)/0.40)")}
          >
            {theme === "dark"
              ? <Sun className="w-5 h-5 shrink-0 text-amber-400/60" />
              : <Moon className="w-5 h-5 shrink-0 text-blue-400/60" />}
            <span className="text-sm" style={fade(!isCollapsed)}>
              {theme === "dark" ? "وضع صباحي" : "وضع ليلي"}
            </span>
          </button>

          <button
            onClick={() => setIsCollapsed(c => !c)}
            title={isCollapsed ? "توسيع" : "طي"}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-150"
            style={{ color: "hsl(var(--sidebar-foreground)/0.28)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "hsl(var(--sidebar-foreground)/0.55)")}
            onMouseLeave={e => (e.currentTarget.style.color = "hsl(var(--sidebar-foreground)/0.28)")}
          >
            {isCollapsed
              ? <ChevronsLeft className="w-5 h-5 shrink-0" />
              : <ChevronsRight className="w-5 h-5 shrink-0" />}
            <span className="text-sm" style={fade(!isCollapsed)}>طي القائمة</span>
          </button>
        </div>

        {/* المستخدم */}
        <div className={`${isCollapsed ? "px-1.5" : "px-2"} pb-3 shrink-0 transition-all duration-150`}>
          <div className="h-px mb-2 mx-1" style={{ background: "hsl(var(--sidebar-border))" }} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`w-full flex items-center rounded-xl transition-all duration-150 outline-none group ${isCollapsed ? "p-1.5" : "p-2"}`}
                style={{ 
                  border: `1px solid ${colors.border}`,
                  gap: isCollapsed ? "0px" : "10px",
                  justifyContent: isCollapsed ? "center" : "flex-start"
                }}
                onMouseEnter={e => { e.currentTarget.style.background = colors.dim; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                title={isCollapsed ? (user?.displayName ?? "الحساب") : undefined}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0"
                  style={{ background: colors.gradient }}
                >
                  {initials}
                </div>
                <div className="flex-1 min-w-0 text-right" style={fade(!isCollapsed)}>
                  <p className="text-[13px] font-semibold text-sidebar-foreground leading-none truncate">
                    {user?.displayName ?? "مستخدم"}
                  </p>
                  <p className="text-[12px] mt-0.5 truncate font-medium" style={{ color: colors.accent }}>
                    {colors.label}
                  </p>
                </div>
                <ChevronDown className="w-3 h-3 shrink-0 text-sidebar-foreground/25" style={fade(!isCollapsed)} />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              side="top"
              align="end"
              sideOffset={12}
              className="w-56 p-2 rounded-xl border-border bg-popover shadow-xl"
            >
              <DropdownMenuLabel className="px-3 py-2.5">
                <p className="text-xs font-bold text-foreground truncate">{user?.displayName ?? "مستخدم"}</p>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{user?.username}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2.5 cursor-pointer px-3 py-2 rounded-lg mx-1" onClick={() => setShowPassModal(true)}>
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

        {/* الـ header */}
        <header
          className="flex items-center px-6 shrink-0 gap-4"
          style={{
            height: "58px",
            borderBottom: "1px solid hsl(var(--border))",
            background: "hsl(var(--card)/0.65)",
            backdropFilter: "blur(10px)",
          }}
        >
          {/* عنوان الصفحة */}
          <h1 className="text-base font-bold text-foreground tracking-tight">
            {pageTitle}
          </h1>

          <div className="flex-1" />

          {/* المؤسسة */}
          {user?.orgName && (
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground/70 font-medium">
              {isAdmin && <ShieldCheck className="w-3 h-3 shrink-0" style={{ color: colors.accent }} />}
              {user.orgName}
            </span>
          )}

          {/* مؤشر ERP */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/8 border border-emerald-500/15 text-emerald-500 dark:text-emerald-400/80">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="hidden md:block">ERP</span>
          </div>
        </header>

        {/* ══ بانر إدارة المؤسسة (Impersonation) ══ */}
        {isSuperAdmin && activeOrgId && (
          <div className="flex items-center gap-3 px-5 py-2.5 bg-primary/10 border-b border-primary/20 text-primary">
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold">وضع إدارة مؤسسة</p>
              <p className="text-xs opacity-80 mt-0.5">أنت الآن تقوم بإدارة هذه المؤسسة (معرّف: {activeOrgId})</p>
            </div>
            <button
              onClick={() => {
                setActiveOrgId(null);
                setLocation("/super-admin");
              }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              الخروج والعودة للمنصة
            </button>
          </div>
        )}

        {/* ══ بانر تقدم الاستخراج الذكي ══ */}
        {progress.status === "extracting" && (
          <div
            className="flex items-center gap-3 px-5 py-2.5 border-b cursor-pointer select-none"
            style={{
              background: "linear-gradient(90deg, rgba(139,92,246,0.08), rgba(59,130,246,0.08))",
              borderColor: "rgba(139,92,246,0.2)",
            }}
            onClick={() => { if (location !== "/extract") setLocation("/extract"); }}
          >
            <Loader2 className="w-4 h-4 animate-spin text-purple-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-purple-300">
                جاري استخراج الفاتورة — الصفحة {progress.currentPage} من {progress.totalPages}
              </p>
              {/* شريط تقدم متحرك */}
              <div className="mt-1.5 h-1 rounded-full bg-purple-900/30 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    background: "linear-gradient(90deg, #8b5cf6, #3b82f6)",
                    width: progress.totalPages > 1
                      ? `${(progress.currentPage / progress.totalPages) * 100}%`
                      : "60%",
                    transition: "width 500ms ease",
                    animation: progress.totalPages === 1 ? "pulse 2s ease-in-out infinite" : undefined,
                  }}
                />
              </div>
            </div>
            {location !== "/extract" && (
              <span className="text-xs text-purple-400/70 font-medium whitespace-nowrap">
                اضغط للعودة
              </span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); cancelExtraction(); }}
              className="p-1 rounded-md hover:bg-red-500/15 text-muted-foreground/50 hover:text-red-400 transition-colors"
              title="إلغاء الاستخراج"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {progress.status === "done" && location !== "/extract" && (
          <div
            className="flex items-center gap-3 px-5 py-2.5 border-b cursor-pointer select-none"
            style={{
              background: "linear-gradient(90deg, rgba(16,185,129,0.08), rgba(59,130,246,0.06))",
              borderColor: "rgba(16,185,129,0.2)",
            }}
            onClick={() => setLocation("/extract")}
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="flex-1 text-xs font-semibold text-emerald-300">
              ✓ اكتمل الاستخراج — اضغط لعرض النتائج وحفظ الفاتورة
            </p>
            <button
              onClick={(e) => { e.stopPropagation(); dismissCompletion(); }}
              className="p-1 rounded-md hover:bg-muted text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {progress.status === "error" && (
          <div
            className="flex items-center gap-3 px-5 py-2.5 border-b select-none"
            style={{
              background: "rgba(239,68,68,0.06)",
              borderColor: "rgba(239,68,68,0.2)",
            }}
          >
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="flex-1 text-xs font-medium text-red-300 truncate">
              فشل الاستخراج: {progress.errorMessage || "خطأ غير معروف"}
            </p>
            <button
              onClick={dismissCompletion}
              className="p-1 rounded-md hover:bg-red-500/15 text-muted-foreground/40 hover:text-red-400 transition-colors"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* المحتوى */}
        <div className="flex-1 overflow-auto">
          <div className="p-7 max-w-7xl mx-auto">{children}</div>
        </div>
      </main>

      {/* ── نافذة تأكيد الخروج ── */}
      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent className="max-w-sm rounded-2xl border-border bg-card" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <LogOut className="w-4 h-4 text-red-400" />
              تسجيل الخروج
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              هل تريد الخروج؟ ستحتاج لإعادة تسجيل الدخول.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 flex-row-reverse">
            <AlertDialogCancel className="flex-1 rounded-xl">إلغاء</AlertDialogCancel>
            <AlertDialogAction className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white" onClick={logout}>
              خروج
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── نافذة تغيير كلمة السر ── */}
      <Dialog open={showPassModal} onOpenChange={setShowPassModal}>
        <DialogContent className="max-w-sm bg-card border-border rounded-2xl" dir="rtl">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" />
              تغيير كلمة السر
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-3 py-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">كلمة السر الحالية</label>
              <div className="relative">
                <Input type={showOld ? "text" : "password"} value={oldPass} onChange={e => setOldPass(e.target.value)} className="h-9 pl-9" dir="ltr" />
                <button type="button" onClick={() => setShowOld(s => !s)} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground">
                  {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">كلمة السر الجديدة</label>
              <div className="relative">
                <Input type={showNew ? "text" : "password"} value={newPass} onChange={e => setNewPass(e.target.value)} className="h-9 pl-9" dir="ltr" placeholder="6 أحرف على الأقل" />
                <button type="button" onClick={() => setShowNew(s => !s)} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowPassModal(false)} disabled={savingPass}>إلغاء</Button>
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
