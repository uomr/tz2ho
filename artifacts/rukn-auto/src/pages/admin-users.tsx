/**
 * صفحة إدارة المستخدمين — للمدير فقط
 */
import { useState, useEffect } from "react";
import { useAuth, getAuthHeader } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Users, Plus, Edit, Power, PowerOff, Shield, User,
  Clock, Eye, EyeOff, Database, Trash2, AlertTriangle
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

function DeptBadge({ dept }: { dept: string }) {
  if (!dept || dept === "admin") return null;
  return (
    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold border text-primary/80 bg-primary/8 border-primary/15">
      {dept}
    </span>
  );
}

/** مفتاح تبديل صلاحية ذاكرة القطع */
function PartsToggle({
  userId,
  canEditParts,
  isAdmin,
  onChanged,
  headers,
}: {
  userId: number;
  canEditParts: boolean;
  isAdmin: boolean;
  onChanged: () => void;
  headers: Record<string, string>;
}) {
  const [busy, setBusy] = useState(false);

  if (isAdmin) {
    return (
      <span className="text-[11px] text-yellow-400/70 font-medium">دائماً ✓</span>
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
        toast.success(canEditParts ? "تم سحب صلاحية ذاكرة القطع" : "تم منح صلاحية ذاكرة القطع ✓");
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
      title={canEditParts ? "انقر لسحب الصلاحية" : "انقر لمنح الصلاحية"}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50
        ${canEditParts ? "bg-primary" : "bg-muted-foreground/25"}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform
          ${canEditParts ? "translate-x-4" : "translate-x-0.5"}`}
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
}

export default function UsersAdmin() {
  const { token } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // نموذج إضافة
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newRole, setNewRole] = useState("employee");
  const [newDept, setNewDept] = useState("");
  const [newCanEditParts, setNewCanEditParts] = useState(false);
  const [adding, setAdding] = useState(false);

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
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword || !newDisplayName) return;
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
      toast.success(`تم إنشاء حساب "${newDisplayName}" بنجاح ✓`);
      setNewUsername(""); setNewPassword(""); setNewDisplayName("");
      setNewRole("employee"); setNewDept(""); setNewCanEditParts(false);
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
      toast.success(u.isActive ? `تم تعطيل حساب ${u.displayName}` : `تم تفعيل حساب ${u.displayName}`);
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
        canEditParts: editRole === "admin" ? true : editCanEditParts,
      };
      if (editPassword) body.password = editPassword;
      const res = await fetch(`${BASE_URL}/api/users/${editUser.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم حفظ التعديلات ✓");
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
        toast.success(`تم حذف حساب ${deleteTarget.displayName}`);
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

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          إدارة المستخدمين
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          إنشاء حسابات الموظفين وتحديد صلاحياتهم لتفعيل الذاكرة الذكية.
        </p>
      </div>

      {/* ── نموذج إضافة مستخدم ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            إضافة موظف جديد
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">الاسم الكامل *</label>
                <Input value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} placeholder="مثال: أحمد محمد" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">اسم المستخدم (للدخول) *</label>
                <Input value={newUsername} onChange={e => setNewUsername(e.target.value.toLowerCase())} placeholder="مثال: ahmed" className="h-9 font-mono" dir="ltr" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">كلمة السر *</label>
                <div className="relative">
                  <Input
                    type={showNewPass ? "text" : "password"}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="6 أحرف على الأقل"
                    className="h-9 pl-9"
                    dir="ltr"
                  />
                  <button type="button" onClick={() => setShowNewPass(s => !s)} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground">
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">القسم <span className="text-muted-foreground/40">(اختياري)</span></label>
                <Input
                  value={newDept}
                  onChange={e => setNewDept(e.target.value)}
                  placeholder="مثال: تويوتا ولكزس"
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">الدور</label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value)}
                  className="w-full h-9 px-3 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="employee">موظف</option>
                  <option value="admin">مدير</option>
                </select>
              </div>
            </div>

            {/* صلاحية ذاكرة القطع */}
            {newRole === "employee" && (
              <label className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border/50 cursor-pointer hover:bg-muted/60 transition-colors">
                <input
                  type="checkbox"
                  checked={newCanEditParts}
                  onChange={e => setNewCanEditParts(e.target.checked)}
                  className="w-4 h-4 rounded accent-primary"
                />
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-primary/70" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">صلاحية ذاكرة القطع</p>
                    <p className="text-[11px] text-muted-foreground">يمكنه إضافة وتعديل وحذف القطع في الذاكرة</p>
                  </div>
                </div>
              </label>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={adding || !newUsername || !newPassword || !newDisplayName} size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                {adding ? "جاري الإنشاء..." : "إنشاء الحساب"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── قائمة المستخدمين ── */}
      <Card className="bg-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="p-3 font-medium">الاسم</th>
                  <th className="p-3 font-medium">اسم المستخدم</th>
                  <th className="p-3 font-medium">القسم</th>
                  <th className="p-3 font-medium text-center">الدور</th>
                  <th className="p-3 font-medium text-center">
                    <span className="flex items-center justify-center gap-1">
                      <Database className="w-3.5 h-3.5" /> القطع
                    </span>
                  </th>
                  <th className="p-3 font-medium text-center">آخر دخول</th>
                  <th className="p-3 font-medium text-center">الحالة</th>
                  <th className="p-3 font-medium text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">لا يوجد مستخدمون بعد</td></tr>
                ) : users.map(u => (
                  <tr key={u.id} className={`hover:bg-muted/30 transition-colors ${!u.isActive ? "opacity-50" : ""}`}>
                    <td className="p-3 font-semibold">{u.displayName}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{u.username}</td>
                    <td className="p-3"><DeptBadge dept={u.department} /></td>
                    <td className="p-3 text-center">
                      {u.role === "admin" ? (
                        <span className="flex items-center justify-center gap-1 text-yellow-400 text-xs font-semibold">
                          <Shield className="w-3.5 h-3.5" /> مدير
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-1 text-muted-foreground text-xs">
                          <User className="w-3.5 h-3.5" /> موظف
                        </span>
                      )}
                    </td>
                    {/* toggle ذاكرة القطع */}
                    <td className="p-3 text-center">
                      <div className="flex justify-center">
                        <PartsToggle
                          userId={u.id}
                          canEditParts={u.canEditParts}
                          isAdmin={u.role === "admin"}
                          onChanged={fetchUsers}
                          headers={headers}
                        />
                      </div>
                    </td>
                    <td className="p-3 text-center text-xs text-muted-foreground">
                      <span className="flex items-center justify-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(u.lastLogin)}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                        u.isActive ? "text-green-400 bg-green-400/10 border-green-400/20" : "text-red-400 bg-red-400/10 border-red-400/20"
                      }`}>
                        {u.isActive ? "فعّال" : "معطّل"}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(u)} title="تعديل">
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 ${u.isActive ? "text-red-400/60 hover:text-red-400" : "text-green-400/60 hover:text-green-400"}`}
                          onClick={() => handleToggleActive(u)}
                          title={u.isActive ? "تعطيل الحساب" : "تفعيل الحساب"}
                        >
                          {u.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                        </Button>
                        {u.role !== "admin" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500/40 hover:text-red-500 hover:bg-red-500/10"
                            onClick={() => setDeleteTarget(u)}
                            title="حذف الحساب"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── نافذة التعديل ── */}
      <Dialog open={!!editUser} onOpenChange={open => !open && setEditUser(null)}>
        <DialogContent className="max-w-md bg-card border-border rounded-xl" dir="rtl">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Edit className="w-4 h-4 text-primary" />
              تعديل بيانات {editUser?.displayName}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4 py-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">الاسم الكامل</label>
              <Input value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">القسم <span className="text-muted-foreground/40">(اختياري)</span></label>
              <Input
                value={editDept}
                onChange={e => setEditDept(e.target.value)}
                placeholder="مثال: تويوتا ولكزس"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">الدور</label>
              <select
                value={editRole}
                onChange={e => setEditRole(e.target.value)}
                className="w-full h-9 px-3 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="employee">موظف</option>
                <option value="admin">مدير</option>
              </select>
            </div>

            {/* صلاحية ذاكرة القطع في التعديل */}
            {editRole === "employee" && (
              <label className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border/50 cursor-pointer hover:bg-muted/60 transition-colors">
                <input
                  type="checkbox"
                  checked={editCanEditParts}
                  onChange={e => setEditCanEditParts(e.target.checked)}
                  className="w-4 h-4 rounded accent-primary"
                />
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-primary/70" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">صلاحية ذاكرة القطع</p>
                    <p className="text-[11px] text-muted-foreground">يمكنه إضافة وتعديل وحذف القطع</p>
                  </div>
                </div>
              </label>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                كلمة سر جديدة <span className="text-muted-foreground/50">(اتركها فارغة للإبقاء)</span>
              </label>
              <div className="relative">
                <Input
                  type={showEditPass ? "text" : "password"}
                  value={editPassword}
                  onChange={e => setEditPassword(e.target.value)}
                  placeholder="اترك فارغاً لعدم التغيير"
                  className="h-9 pl-9"
                  dir="ltr"
                />
                <button type="button" onClick={() => setShowEditPass(s => !s)} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground">
                  {showEditPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditUser(null)} disabled={saving}>إلغاء</Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {/* ── نافذة تأكيد الحذف ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-sm" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              تأكيد حذف الحساب
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-right">
              <span className="block">
                هل أنت متأكد من حذف حساب{" "}
                <span className="font-bold text-foreground">"{deleteTarget?.displayName}"</span>؟
              </span>
              <span className="block text-xs text-muted-foreground">
                لا يمكن التراجع عن هذه العملية. جميع بيانات الدخول ستُحذف نهائياً.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground flex-1 rounded-xl"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? "جاري الحذف..." : "حذف الحساب"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
