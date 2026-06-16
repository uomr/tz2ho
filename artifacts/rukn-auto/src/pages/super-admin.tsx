/**
 * super-admin.tsx — لوحة تحكم المنصة (superadmin فقط)
 */
import { useState, useEffect } from "react";
import { useAuth, getAuthHeader } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Building2, Users, FileText, TrendingUp, Shield,
  CheckCircle2, AlertTriangle, RefreshCw,
  ChevronDown, Globe, LayoutDashboard, Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface OrgRow {
  id: number;
  name: string;
  slug: string;
  plan: string;
  status: string;
  contact_email: string | null;
  max_invoices_per_month: number;
  active_users: number;
  total_users: number;
  total_invoices: number;
  invoices_this_month: number;
  plan_usage_pct: number;
  last_activity: string | null;
  created_at: string;
}

interface PlatformStats {
  orgs: { total: number; active: number; trial: number };
  users: { total: number };
  invoices: { total: number };
  monthUsage: { this_month: number };
}

const PLAN_COLORS: Record<string, string> = {
  free: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  trial: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  pro: "bg-primary/10 text-primary border-primary/20",
  enterprise: "bg-violet-500/10 text-violet-400 border-violet-500/20",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  trial: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  suspended: "bg-red-500/10 text-red-400 border-red-500/20",
};

const PLAN_LABELS: Record<string, string> = { free: "مجاني", trial: "تجريبي", pro: "Pro", enterprise: "Enterprise" };
const STATUS_LABELS: Record<string, string> = { active: "نشط", trial: "تجريبي", suspended: "موقوف" };

function UsageBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-primary"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function SuperAdmin() {
  const { token } = useAuth();
  const headers = { "Content-Type": "application/json", ...getAuthHeader(token) };

  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [expandedOrg, setExpandedOrg] = useState<number | null>(null);

  // حالة إضافة مؤسسة جديدة
  const [showAddOrg, setShowAddOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [newOrgEmail, setNewOrgEmail] = useState("");
  const [addingOrg, setAddingOrg] = useState(false);

  // حالة تعديل مؤسسة
  const [editOrg, setEditOrg] = useState<OrgRow | null>(null);
  const [editOrgName, setEditOrgName] = useState("");
  const [editOrgSlug, setEditOrgSlug] = useState("");
  const [editOrgEmail, setEditOrgEmail] = useState("");
  const [savingOrg, setSavingOrg] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [statsRes, orgsRes] = await Promise.all([
        fetch(`${BASE_URL}/api/super-admin/stats`, { headers }),
        fetch(`${BASE_URL}/api/super-admin/orgs`, { headers }),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (orgsRes.ok) setOrgs(await orgsRes.json());
    } catch {
      toast.error("تعذّر تحميل بيانات المنصة");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateOrg = async (id: number, patch: object) => {
    setActionLoading(id);
    try {
      const res = await fetch(`${BASE_URL}/api/super-admin/orgs/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        toast.success("تم التحديث ✓");
        load();
      } else {
        const d = await res.json();
        toast.error(d.error || "فشل التحديث");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName || !newOrgSlug) return;
    setAddingOrg(true);
    try {
      const res = await fetch(`${BASE_URL}/api/super-admin/orgs`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: newOrgName,
          slug: newOrgSlug,
          contactEmail: newOrgEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "فشل إنشاء الشركة");
        return;
      }
      toast.success(`تم تسجيل شركة "${newOrgName}" بنجاح`);
      setShowAddOrg(false);
      setNewOrgName("");
      setNewOrgSlug("");
      setNewOrgEmail("");
      load();
    } finally {
      setAddingOrg(false);
    }
  };

  const handleEditOrgSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editOrg || !editOrgName || !editOrgSlug) return;
    setSavingOrg(true);
    try {
      const res = await fetch(`${BASE_URL}/api/super-admin/orgs/${editOrg.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          name: editOrgName,
          slug: editOrgSlug,
          contactEmail: editOrgEmail,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || "فشل تحديث المؤسسة");
        return;
      }
      toast.success("تم تحديث بيانات المؤسسة بنجاح");
      setEditOrg(null);
      load();
    } finally {
      setSavingOrg(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
        <RefreshCw className="w-4 h-4 animate-spin" />
        تحميل بيانات المنصة...
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">

      {/* ── العنوان ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="w-6 h-6 text-violet-400" />
            لوحة مدير المنصة
          </h2>
          <p className="text-muted-foreground text-sm mt-1">مراقبة جميع الشركات المسجّلة وإدارتها</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setShowAddOrg(true)} className="gap-2 bg-transparent text-sm">
            + تسجيل شركة جديدة
          </Button>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 h-9 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors border border-border"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            تحديث
          </button>
        </div>
      </div>

      {/* ── إحصاءات المنصة ── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: Building2, label: "شركات مسجّلة", value: stats.orgs.total, sub: `${stats.orgs.active} نشط · ${stats.orgs.trial} تجريبي`, color: "#8b5cf6" },
            { icon: Users,     label: "مستخدمون",       value: stats.users.total,   sub: "إجمالي المستخدمين النشطين", color: "#06b6d4" },
            { icon: FileText,  label: "فواتير محفوظة",  value: stats.invoices.total, sub: "منذ الإطلاق", color: "#10b981" },
            { icon: TrendingUp, label: "فواتير الشهر", value: stats.monthUsage.this_month, sub: "هذا الشهر", color: "#f59e0b" },
          ].map(({ icon: Icon, label, value, sub, color }) => (
            <Card key={label} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4" style={{ color }} />
                  <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
                </div>
                <p className="text-2xl font-bold text-foreground leading-none">{Number(value).toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground mt-1 truncate">{sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── جدول الشركات ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            الشركات المسجّلة
            <span className="mr-auto text-[10px] font-medium bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
              {orgs.length} شركة
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {orgs.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">لا توجد شركات مسجّلة بعد</p>
          ) : (
            <div className="divide-y divide-border/40">
              {orgs.map(org => (
                <div key={org.id} className="hover:bg-muted/10 transition-colors">
                  {/* صف الشركة */}
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer"
                    onClick={() => setExpandedOrg(expandedOrg === org.id ? null : org.id)}
                  >
                    {/* الشعار */}
                    <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <span className="text-primary font-bold text-sm">
                        {org.name.charAt(0)}
                      </span>
                    </div>

                    {/* المعلومات الرئيسية */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-foreground text-sm">{org.name}</p>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${PLAN_COLORS[org.plan] ?? PLAN_COLORS.free}`}>
                          {PLAN_LABELS[org.plan] ?? org.plan}
                        </span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${STATUS_COLORS[org.status] ?? ""}`}>
                          {STATUS_LABELS[org.status] ?? org.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          {org.slug}
                        </span>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {org.active_users} مستخدم
                        </span>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {org.total_invoices} فاتورة
                        </span>
                      </div>
                    </div>

                    {/* الاستخدام */}
                    <div className="hidden md:block w-28 shrink-0">
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                        <span>{org.invoices_this_month}/{org.max_invoices_per_month}</span>
                        <span>{Number(org.plan_usage_pct ?? 0).toFixed(0)}%</span>
                      </div>
                      <UsageBar value={org.invoices_this_month} max={org.max_invoices_per_month} />
                    </div>

                    <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expandedOrg === org.id ? "rotate-180" : ""}`} />
                  </div>

                  {/* تفاصيل موسّعة */}
                  {expandedOrg === org.id && (
                    <div className="px-4 pb-4 border-t border-border/30 pt-3 bg-muted/5">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        {[
                          { label: "تاريخ التسجيل", val: new Date(org.created_at).toLocaleDateString("ar-SA") },
                          { label: "آخر نشاط", val: org.last_activity ? new Date(org.last_activity).toLocaleDateString("ar-SA") : "—" },
                          { label: "البريد الإلكتروني", val: org.contact_email || "—" },
                          { label: "الحد الشهري", val: `${org.max_invoices_per_month} فاتورة` },
                        ].map(({ label, val }) => (
                          <div key={label} className="bg-muted/20 rounded-lg p-2.5">
                            <p className="text-[10px] text-muted-foreground">{label}</p>
                            <p className="text-xs font-semibold text-foreground mt-0.5 truncate">{val}</p>
                          </div>
                        ))}
                      </div>

                      {/* أزرار الإجراءات */}
                      <div className="flex flex-wrap gap-2 items-center">
                        <button
                          onClick={() => {
                            // setActiveOrgId(org.id);
                            // setLocation("/");
                            window.location.href = "/";
                          }}
                          className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border border-primary text-primary hover:bg-primary/10 transition-colors shadow-sm shadow-primary/20"
                        >
                          <LayoutDashboard className="w-3.5 h-3.5" />
                          دخول لإدارة المؤسسة
                        </button>

                        <button
                          onClick={() => {
                            setEditOrg(org);
                            setEditOrgName(org.name);
                            setEditOrgSlug(org.slug);
                            setEditOrgEmail(org.contact_email || "");
                          }}
                          className="flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                        >
                          <Settings className="w-3.5 h-3.5" />
                          تعديل
                        </button>

                        <div className="w-px h-5 bg-border/50 mx-1" />

                        {/* تغيير الخطة */}
                        {["free", "trial", "pro", "enterprise"].map(plan => (
                          <button
                            key={plan}
                            disabled={org.plan === plan || actionLoading === org.id}
                            onClick={() => updateOrg(org.id, { plan })}
                            className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                              org.plan === plan
                                ? PLAN_COLORS[plan]
                                : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
                            }`}
                          >
                            {PLAN_LABELS[plan]}
                          </button>
                        ))}

                        <div className="flex-1" />

                        {/* تعليق / تفعيل */}
                        {org.status !== "suspended" ? (
                          <button
                            disabled={actionLoading === org.id}
                            onClick={() => updateOrg(org.id, { status: "suspended" })}
                            className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            تعليق الحساب
                          </button>
                        ) : (
                          <button
                            disabled={actionLoading === org.id}
                            onClick={() => updateOrg(org.id, { status: "active" })}
                            className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            إعادة التفعيل
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>


      {/* ── نافذة إضافة مؤسسة ── */}
      <Dialog open={showAddOrg} onOpenChange={setShowAddOrg}>
        <DialogContent className="sm:max-w-[425px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right flex items-center gap-2 text-lg">
              <Building2 className="w-5 h-5 text-primary" />
              تسجيل شركة جديدة
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddOrg} className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">اسم الشركة (العلامة التجارية)</label>
              <Input
                placeholder="مثال: شركة التقنية الحديثة"
                value={newOrgName}
                onChange={e => setNewOrgName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">المعرّف الإنجليزي (Slug)</label>
              <Input
                placeholder="مثال: modern-tech"
                value={newOrgSlug}
                onChange={e => setNewOrgSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                required
                className="text-left"
                dir="ltr"
              />
              <p className="text-[10px] text-muted-foreground">يُستخدم في الروابط ومعرفات النظام الداخلية ولا يمكن تغييره لاحقاً.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">البريد الإلكتروني (اختياري)</label>
              <Input
                type="email"
                placeholder="info@company.com"
                value={newOrgEmail}
                onChange={e => setNewOrgEmail(e.target.value)}
                className="text-left"
                dir="ltr"
              />
            </div>
            <div className="pt-4 flex justify-end gap-2 border-t border-border/50">
              <Button type="button" variant="outline" onClick={() => setShowAddOrg(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={addingOrg || !newOrgName || !newOrgSlug}>
                {addingOrg ? "جاري التسجيل..." : "تسجيل الشركة"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── نافذة تعديل مؤسسة ── */}
      <Dialog open={!!editOrg} onOpenChange={(o) => !o && setEditOrg(null)}>
        <DialogContent className="sm:max-w-[425px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right flex items-center gap-2 text-lg">
              <Settings className="w-5 h-5 text-primary" />
              تعديل بيانات الشركة
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditOrgSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">اسم الشركة (العلامة التجارية)</label>
              <Input
                placeholder="مثال: شركة التقنية الحديثة"
                value={editOrgName}
                onChange={e => setEditOrgName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">المعرّف الإنجليزي (Slug)</label>
              <Input
                placeholder="مثال: modern-tech"
                value={editOrgSlug}
                onChange={e => setEditOrgSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                required
                className="text-left"
                dir="ltr"
              />
              <p className="text-[10px] text-muted-foreground">تغيير المعرّف قد يؤثر على روابط تسجيل الدخول للمستخدمين!</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">البريد الإلكتروني (اختياري)</label>
              <Input
                type="email"
                placeholder="info@company.com"
                value={editOrgEmail}
                onChange={e => setEditOrgEmail(e.target.value)}
                className="text-left"
                dir="ltr"
              />
            </div>
            <div className="pt-4 flex justify-end gap-2 border-t border-border/50">
              <Button type="button" variant="outline" onClick={() => setEditOrg(null)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={savingOrg || !editOrgName || !editOrgSlug}>
                {savingOrg ? "جاري الحفظ..." : "حفظ التعديلات"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
