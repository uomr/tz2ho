/**
 * register.tsx — صفحة تسجيل شركة جديدة في منصة RuknAuto
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Building2, User, Lock, ArrowLeft, CheckCircle2,
  Loader2, Globe, Sparkles, ChevronRight,
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const PLANS = [
  {
    id: "trial",
    label: "تجريبي مجاني",
    desc: "50 فاتورة/شهر — لا يلزم بطاقة ائتمان",
    badge: "ابدأ الآن",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/30",
  },
];

export default function Register() {
  const { login } = useAuth();
  const [, navigate] = useLocation();

  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);

  // بيانات الشركة
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // بيانات المدير
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);

  // توليد slug من الاسم تلقائياً
  const handleOrgNameChange = (v: string) => {
    setOrgName(v);
    const slug = v
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 32);
    setOrgSlug(slug);
  };

  const handleRegister = async () => {
    if (!orgName || !orgSlug || !displayName || !username || !password) {
      toast.error("يرجى تعبئة جميع الحقول المطلوبة");
      return;
    }
    if (password.length < 8) {
      toast.error("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgName, orgSlug, contactEmail, displayName, username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "فشل التسجيل");
        return;
      }

      login(data.token, data.user);
      toast.success(`مرحباً بـ ${orgName} في RuknAuto! 🎉`);
      navigate("/");
    } catch {
      toast.error("تعذّر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md space-y-6">

        {/* الشعار */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <Sparkles className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">RuknAuto</h1>
          <p className="text-muted-foreground text-sm mt-1">سجّل شركتك — ابدأ مجاناً</p>
        </div>

        {/* شريط التقدم */}
        <div className="flex items-center gap-2">
          {[1, 2].map(s => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                step >= s ? "bg-primary border-primary text-primary-foreground" : "border-border text-muted-foreground"
              }`}>
                {step > s ? <CheckCircle2 className="w-3.5 h-3.5" /> : s}
              </div>
              <span className={`text-xs font-medium ${step >= s ? "text-foreground" : "text-muted-foreground"}`}>
                {s === 1 ? "بيانات الشركة" : "حساب المدير"}
              </span>
              {s < 2 && <div className={`flex-1 h-px ${step > s ? "bg-primary" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        {/* البطاقة الرئيسية */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-lg space-y-4">

          {step === 1 ? (
            <>
              <div>
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" />
                  بيانات الشركة
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">المعلومات الأساسية لمؤسستك</p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    اسم الشركة <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={orgName}
                    onChange={e => handleOrgNameChange(e.target.value)}
                    placeholder="مثال: قطع السيارات النجمة"
                    className="h-10"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    معرّف الشركة (للنظام) <span className="text-destructive">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <Input
                      value={orgSlug}
                      onChange={e => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      placeholder="najma-parts"
                      className="h-10 font-mono text-sm"
                      dir="ltr"
                    />
                  </div>
                  {orgSlug && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      المعرّف: <span className="font-mono text-primary">{orgSlug}</span> — يجب أن يكون فريداً
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    البريد الإلكتروني (اختياري)
                  </label>
                  <Input
                    type="email"
                    value={contactEmail}
                    onChange={e => setContactEmail(e.target.value)}
                    placeholder="info@company.com"
                    className="h-10"
                    dir="ltr"
                  />
                </div>

                {/* خطة تجريبية */}
                <div className={`rounded-xl p-3 border ${PLANS[0].bg}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-xs font-bold ${PLANS[0].color}`}>{PLANS[0].label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{PLANS[0].desc}</p>
                    </div>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${PLANS[0].bg} ${PLANS[0].color}`}>
                      {PLANS[0].badge}
                    </span>
                  </div>
                </div>
              </div>

              <Button
                className="w-full gap-2"
                onClick={() => {
                  if (!orgName.trim() || !orgSlug.trim()) {
                    toast.error("اسم الشركة ومعرّفها مطلوبان");
                    return;
                  }
                  setStep(2);
                }}
              >
                التالي — إنشاء حساب المدير
                <ChevronRight className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStep(1)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" />
                    حساب المدير
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">أنت أول مدير لـ <strong>{orgName}</strong></p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    الاسم الكامل <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="أحمد العمري"
                    className="h-10"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    اسم المستخدم <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={username}
                    onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    placeholder="ahmed_admin"
                    className="h-10 font-mono"
                    dir="ltr"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">أحرف إنجليزية صغيرة وأرقام وشرطة سفلية فقط</p>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    كلمة المرور <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Input
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="8 أحرف على الأقل"
                      className="h-10 pl-10"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(p => !p)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <Lock className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {password && (
                    <div className="mt-1.5 flex gap-1">
                      {[8, 12, 16].map(n => (
                        <div
                          key={n}
                          className={`flex-1 h-1 rounded-full transition-colors ${
                            password.length >= n ? "bg-emerald-500" : "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <Button
                className="w-full gap-2"
                onClick={handleRegister}
                disabled={loading}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> جاري إنشاء الحساب...</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" /> إنشاء الشركة والدخول</>
                )}
              </Button>
            </>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          لديك حساب بالفعل؟{" "}
          <Link href="/login" className="text-primary hover:underline font-medium">
            تسجيل الدخول
          </Link>
        </p>

      </div>
    </div>
  );
}
