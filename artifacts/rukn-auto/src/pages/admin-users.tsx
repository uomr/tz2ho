/**
 * admin-users.tsx — إدارة المستخدمين
 * المدير: يرى مستخدمي مؤسسته فقط (بدون سوبر أدمن)
 * السوبر أدمن: يرى الجميع + يمنح/يسحب صلاحية القطع من أي دور
 */
import React, { useState, useEffect, useMemo, Fragment } from "react";
import { useAuth, getAuthHeader } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  UserPlus, Pencil, Power, PowerOff, Trash2,
  Eye, EyeOff, Database, AlertTriangle, Clock,
  Users, ShieldCheck, User, Shield, ChevronDown, ChevronUp, Building2
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

// ── أيقونة الدور ──────────────────────────────────────────
function RoleIcon({ role }: { role: string }) {
  if (role === "superadmin") return <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />;
  if (role === "admin") return <Shield className="w-3.5 h-3.5 text-violet-400" />;
  return <User className="w-3.5 h-3.5 text-emerald-400" />;
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: "مدير المنصة",
  admin: "مدير",
  employee: "موظف",
};
const ROLE_COLORS: Record<string, string> = {
  superadmin: "text-amber-400 bg-amber-400/8 border-amber-400/20",
  admin: "text-violet-400 bg-violet-400/8 border-violet-400/20",
  employee: "text-emerald-400 bg-emerald-400/8 border-emerald-400/20",
};

function RolePill({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[role] ?? "text-muted-foreground bg-muted border-border"}`}>
      <RoleIcon role={role} />
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

// ── تبديل صلاحية القطع ───────────────────────────────────
function PartsToggle({
  userId,
  canEditParts,
  targetRole,
  viewerIsSuperAdmin,
  onChanged,
  headers,
}: {
  userId: number;
  canEditParts: boolean;
  targetRole: string;
  viewerIsSuperAdmin: boolean;
  onChanged: () => void;
  headers: Record<string, string>;
}) {
  const [busy, setBusy] = useState(false);

  // superadmin دائماً مسموح ولا يحتاج تبديل
  if (targetRole === "superadmin") {
    return <span className="text-xs text-muted-foreground/50 select-none">—</span>;
  }

  // المدير العادي لا يستطيع سحب صلاحية مدير آخر
  const canToggle = viewerIsSuperAdmin || targetRole === "employee";

  if (!canToggle) {
    return (
      <span className="text-xs text-amber-500/70 font-medium">دائماً</span>
    );
  }

  const toggle = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${BASE_URL}/api/users/${userId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ canEditParts: !canEditParts }),
      });
      if (res.ok) {
        toast.success(canEditParts ? "سُحبت صلاحية ذاكرة القطع" : "مُنحت صلاحية ذاكرة القطع");
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={canEditParts ? "سحب الصلاحية" : "منح الصلاحية"}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-50
        ${canEditParts ? "bg-emerald-500 shadow-[0_0_10px_theme(colors.emerald.500/40%)]" : "bg-muted-foreground/30"}`}
      dir="rtl"
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out
        ${canEditParts ? "-translate-x-4" : "translate-x-0"}`}
      />
    </button>
  );
}

interface UserRecord {
  id: number;
  username: string;
  displayName: string;
  role: string;
  department: string;
  isActive: boolean;
  canEditParts: boolean;
  createdAt: string;
  lastLogin: string | null;
  orgName?: string | null;
  orgId?: number | null;
}

export default function UsersAdmin() {
  const { token, user: currentUser, isSuperAdmin, activeOrgId } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // نموذج إضافة
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newRole, setNewRole] = useState("employee");
  const [newDept, setNewDept] = useState("");
  const [newCanEditParts, setNewCanEditParts] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // نموذج تعديل
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editDept, setEditDept] = useState("");
  const [editCanEditParts, setEditCanEditParts] = useState(false);
  const [editPassword, setEditPassword] = useState("");
  const [showEditPass, setShowEditPass] = useState(false);
  const [saving, setSaving] = useState(false);

  // تأكيد الحذف
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const headers = { "Content-Type": "application/json", ...getAuthHeader(token) };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/users`, { headers });
      if (res.ok) {
        const data = await res.json();
        const roleWeight: Record<string, number> = { superadmin: 1, admin: 2, employee: 3 };
        data.sort((a: UserRecord, b: UserRecord) => {
          if (roleWeight[a.role] !== roleWeight[b.role]) {
            return roleWeight[a.role] - roleWeight[b.role];
          }
          return a.displayName.localeCompare(b.displayName);
        });
        setUsers(data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const resetForm = () => {
    setNewUsername(""); setNewPassword(""); setNewDisplayName("");
    setNewRole("employee"); setNewDept(""); setNewCanEditParts(false);
    setShowForm(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword || !newDisplayName) return;
    if (!/^[a-zA-Z0-9_.-]+$/.test(newUsername)) {
      toast.error("اسم المستخدم يجب أن يكون باللغة الإنجليزية ولا يحتوي على مسافات");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`${BASE_URL}/api/users`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          displayName: newDisplayName,
          role: newRole,
          department: newDept,
          canEditParts: newRole === "admin" ? true : newCanEditParts,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success(`تم إنشاء "${newDisplayName}"`);
      resetForm();
      fetchUsers();
    } finally {
      setAdding(false);
    }
  };

  const handleToggleActive = async (u: UserRecord) => {
    const res = await fetch(`${BASE_URL}/api/users/${u.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    if (res.ok) {
      toast.success(u.isActive ? `عُطِّل حساب ${u.displayName}` : `فُعِّل حساب ${u.displayName}`);
      fetchUsers();
    }
  };

  const openEdit = (u: UserRecord) => {
    setEditUser(u);
    setEditDisplayName(u.displayName);
    setEditRole(u.role);
    setEditDept(u.department);
    setEditCanEditParts(u.canEditParts);
    setEditPassword("");
    setShowEditPass(false);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        displayName: editDisplayName,
        role: editRole,
        department: editDept,
        canEditParts: editRole === "admin" && !isSuperAdmin ? true : editCanEditParts,
      };
      if (editPassword) body.password = editPassword;
      const res = await fetch(`${BASE_URL}/api/users/${editUser.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("حُفظت التعديلات");
      setEditUser(null);
      fetchUsers();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${BASE_URL}/api/users/${deleteTarget.id}`, {
        method: "DELETE",
        headers,
      });
      if (res.ok || res.status === 204) {
        toast.success(`حُذف حساب ${deleteTarget.displayName}`);
        setDeleteTarget(null);
        fetchUsers();
      } else {
        const data = await res.json();
        toast.error(data.error);
      }
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return "لم يدخل بعد";
    return new Date(d).toLocaleDateString("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const activeCount = users.filter(u => u.isActive).length;

  return (
    <div className="space-y-4 max-w-5xl" dir="rtl">

      {/* ── شريط الإجراءات ── */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{users.length}</span> مستخدم
          <span className="text-border">·</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
          <span className="font-semibold text-foreground">{activeCount}</span> نشط
        </div>
        <div className="flex-1" />
        {(!isSuperAdmin || activeOrgId) && (
          <Button size="sm" variant="outline" className="gap-2 h-9 text-xs" onClick={() => setShowForm(s => !s)}>
            <UserPlus className="w-3.5 h-3.5" />
            {showForm ? "إلغاء" : "إضافة مستخدم"}
          </Button>
        )}
      </div>

      {/* ── نموذج الإضافة (قابل للطي) ── */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">حساب جديد</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">الاسم الكامل</label>
                <Input value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} placeholder="أحمد محمد" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">اسم المستخدم</label>
                <Input 
                  value={newUsername} 
                  onChange={e => setNewUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))} 
                  placeholder="ahmed" 
                  className="h-10 font-mono" 
                  dir="ltr" 
                  pattern="[a-zA-Z0-9_.-]+" 
                  title="أحرف إنجليزية، أرقام، شرطة، نقطة فقط"
                />
                <p className="text-xs text-muted-foreground">أحرف إنجليزية وأرقام فقط (للدخول)</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">كلمة السر</label>
                <div className="relative">
                  <Input
                    type={showNewPass ? "text" : "password"}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="6 أحرف على الأقل"
                    className="h-10 pl-9"
                    dir="ltr"
                  />
                  <button type="button" onClick={() => setShowNewPass(s => !s)} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground">
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">القسم <span className="opacity-50">(اختياري)</span></label>
                <Input value={newDept} onChange={e => setNewDept(e.target.value)} placeholder="مثال: تويوتا" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">الدور</label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="employee">موظف</option>
                  <option value="admin">مدير</option>
                </select>
              </div>
            </div>

            {newRole === "employee" && (
              <label className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/40 cursor-pointer hover:bg-muted/50 transition-colors w-fit">
                <input
                  type="checkbox"
                  checked={newCanEditParts}
                  onChange={e => setNewCanEditParts(e.target.checked)}
                  className="w-4 h-4 rounded accent-primary"
                />
                <span className="flex items-center gap-2 text-sm">
                  <Database className="w-4 h-4 text-primary/60" />
                  صلاحية ذاكرة القطع
                </span>
              </label>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={resetForm}>إلغاء</Button>
              <Button type="submit" size="sm" disabled={adding || !newUsername || !newPassword || !newDisplayName}>
                {adding ? "جاري الإنشاء..." : "إنشاء الحساب"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ── جدول المستخدمين ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">جاري التحميل...</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Users className="w-10 h-10 text-muted-foreground/20 mx-auto" />
            <p className="text-sm text-muted-foreground">لا يوجد مستخدمون بعد</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">المستخدم</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">الدور</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-center">
                    <span className="inline-flex items-center gap-1 justify-center">
                      <Database className="w-3 h-3" /> القطع
                    </span>
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-center">آخر دخول</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-center">الحالة</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {(() => {
                  const renderUserRow = (u: UserRecord, isGrouped = false) => {
                    const isSelf = u.id === currentUser?.id;
                    return (
                      <tr
                        key={u.id}
                        className={`transition-colors hover:bg-muted/20 ${!u.isActive ? "opacity-40" : ""} ${isSelf ? "bg-primary/4" : ""}`}
                      >
                        {/* الاسم */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0
                              ${u.role === "superadmin" ? "bg-amber-400/15 text-amber-400" : u.role === "admin" ? "bg-violet-400/15 text-violet-400" : "bg-emerald-400/15 text-emerald-400"}`}>
                              {u.displayName.charAt(0)}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-sm">{u.displayName}</span>
                                {isSelf && (
                                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium border border-primary/20">أنت</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs font-mono text-muted-foreground/60">{u.username}</span>
                                {u.department && (
                                  <span className="text-xs text-muted-foreground/50">{u.department}</span>
                                )}
                              </div>
                              {/* إظهار اسم المؤسسة لمدير المنصة عند عرض الكل إذا لم تكن مقسمة لمجموعات أو للتأكيد */}
                              {!isGrouped && isSuperAdmin && !activeOrgId && (
                                <div className="mt-1">
                                  {u.orgName ? (
                                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                      المؤسسة: {u.orgName}
                                    </span>
                                  ) : u.role === "superadmin" ? (
                                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                      مدير منصة (Global)
                                    </span>
                                  ) : (
                                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                                      غير مرتبط بمؤسسة!
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* الدور */}
                        <td className="px-4 py-3.5">
                          <RolePill role={u.role} />
                        </td>

                        {/* صلاحية القطع */}
                        <td className="px-4 py-3.5 text-center">
                          <div className="flex justify-center">
                            <PartsToggle
                              userId={u.id}
                              canEditParts={u.canEditParts}
                              targetRole={u.role}
                              viewerIsSuperAdmin={isSuperAdmin}
                              onChanged={fetchUsers}
                              headers={headers}
                            />
                          </div>
                        </td>

                        {/* آخر دخول */}
                        <td className="px-4 py-3.5 text-center">
                          <span className="text-xs text-muted-foreground/60 inline-flex items-center gap-1 justify-center">
                            <Clock className="w-3 h-3" />
                            {formatDate(u.lastLogin)}
                          </span>
                        </td>

                        {/* الحالة */}
                        <td className="px-4 py-3.5 text-center">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${u.isActive ? "bg-emerald-400" : "bg-red-400/70"}`} />
                            {u.isActive ? "نشط" : "معطّل"}
                          </span>
                        </td>

                        {/* الإجراءات */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center justify-center gap-0.5">
                            <button
                              onClick={() => openEdit(u)}
                              title="تعديل"
                              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            {u.id !== currentUser?.id && (
                              <button
                                onClick={() => handleToggleActive(u)}
                                title={u.isActive ? "تعطيل" : "تفعيل"}
                                className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors
                                  ${u.isActive ? "text-muted-foreground/50 hover:text-red-400 hover:bg-red-400/8" : "text-muted-foreground/50 hover:text-emerald-400 hover:bg-emerald-400/8"}`}
                              >
                                {u.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                              </button>
                            )}
                            {u.role !== "superadmin" && u.id !== currentUser?.id && (
                              <button
                                onClick={() => setDeleteTarget(u)}
                                title="حذف"
                                className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground/40 hover:text-red-400 hover:bg-red-400/8 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  };

                  if (!isSuperAdmin || activeOrgId) {
                    return users.map(u => renderUserRow(u, false));
                  }

                  // تجميع المستخدمين للمشرف العام
                  const groupsMap = new Map<string, { id: string; name: string | null; users: UserRecord[] }>();
                  users.forEach(u => {
                    const key = u.orgId ? String(u.orgId) : "global";
                    if (!groupsMap.has(key)) {
                      groupsMap.set(key, { id: key, name: u.orgName ?? null, users: [] });
                    }
                    groupsMap.get(key)!.users.push(u);
                  });

                  const sortedGroups = Array.from(groupsMap.values()).sort((a, b) => {
                    if (a.id === "global") return -1;
                    if (b.id === "global") return 1;
                    return (a.name || "").localeCompare(b.name || "");
                  });

                  return sortedGroups.map(group => {
                    const isGlobal = group.id === "global";
                    const isExpanded = expandedGroups[group.id] !== false; // الافتراضي هو الفتح

                    return (
                      <React.Fragment key={group.id}>
                        {/* ترويسة المجموعة */}
                        <tr
                          className="bg-muted/10 hover:bg-muted/20 cursor-pointer border-t-[3px] border-border"
                          onClick={() => setExpandedGroups(prev => ({ ...prev, [group.id]: !isExpanded }))}
                        >
                          <td colSpan={6} className="px-4 py-2 text-right">
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                              {isGlobal ? (
                                <ShieldCheck className="w-4 h-4 text-amber-500" />
                              ) : (
                                <Building2 className="w-4 h-4 text-blue-400" />
                              )}
                              <span className="font-semibold text-sm text-foreground">
                                {isGlobal ? "مدراء المنصة والمستخدمين العائمين (Global)" : `المؤسسة: ${group.name || "مؤسسة محذوفة"}`}
                              </span>
                              <span className="text-[11px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground mr-2">
                                {group.users.length} مستخدم
                              </span>
                            </div>
                          </td>
                        </tr>
                        
                        {/* صفوف المستخدمين داخل المجموعة */}
                        {isExpanded && group.users.map(u => renderUserRow(u, true))}
                      </React.Fragment>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── نافذة التعديل ── */}
      <Dialog open={!!editUser} onOpenChange={open => !open && setEditUser(null)}>
        <DialogContent className="max-w-sm bg-card border-border rounded-xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              تعديل — {editUser?.displayName}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-3.5">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">الاسم الكامل</label>
              <Input value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">القسم <span className="opacity-50">(اختياري)</span></label>
              <Input value={editDept} onChange={e => setEditDept(e.target.value)} placeholder="مثال: تويوتا" className="h-9" />
            </div>

            {editUser?.role !== "superadmin" && (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">الدور</label>
                <select
                  value={editRole}
                  onChange={e => setEditRole(e.target.value)}
                  className="w-full h-9 px-3 rounded-md bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="employee">موظف</option>
                  <option value="admin">مدير</option>
                </select>
              </div>
            )}

            {/* صلاحية القطع: تظهر للموظفين دائماً، وللمديرين عند السوبر أدمن فقط */}
            {editUser?.role !== "superadmin" && (editRole === "employee" || isSuperAdmin) && (
              <label className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/40 cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="checkbox"
                  checked={editRole === "admin" && !isSuperAdmin ? true : editCanEditParts}
                  disabled={editRole === "admin" && !isSuperAdmin}
                  onChange={e => setEditCanEditParts(e.target.checked)}
                  className="w-4 h-4 rounded accent-primary"
                />
                <span className="flex items-center gap-2 text-sm">
                  <Database className="w-4 h-4 text-primary/60" />
                  صلاحية ذاكرة القطع
                </span>
              </label>
            )}

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">
                كلمة سر جديدة <span className="opacity-50">(فارغة = بدون تغيير)</span>
              </label>
              <div className="relative">
                <Input
                  type={showEditPass ? "text" : "password"}
                  value={editPassword}
                  onChange={e => setEditPassword(e.target.value)}
                  placeholder="اتركها فارغة للإبقاء"
                  className="h-9 pl-9"
                  dir="ltr"
                />
                <button type="button" onClick={() => setShowEditPass(s => !s)} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground">
                  {showEditPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1 border-t border-border/40">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditUser(null)} disabled={saving}>إلغاء</Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "جاري الحفظ..." : "حفظ"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── نافذة تأكيد الحذف ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-sm" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive text-base">
              <AlertTriangle className="w-4 h-4" />
              تأكيد الحذف
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right text-sm">
              سيُحذف حساب <span className="font-semibold text-foreground">"{deleteTarget?.displayName}"</span> نهائياً ولا يمكن التراجع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? "جاري الحذف..." : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
