import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ScanLine, LogIn, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "بيانات غير صحيحة"); return; }
      login(data.token, data.user);
      toast.success(`أهلاً ${data.user.displayName}`);
    } catch {
      toast.error("تعذّر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" dir="rtl">

      {/* ══ اليمين — لوحة العلامة التجارية ══ */}
      <div
        className="hidden lg:flex lg:w-[52%] relative flex-col justify-between p-16 overflow-hidden"
        style={{ background: "hsl(215 42% 5%)" }}
      >
        {/* نسيج خفيف — نقاط هندسية */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage: `radial-gradient(circle, hsl(38 62% 52%) 1px, transparent 1px)`,
            backgroundSize: "32px 32px",
          }}
        />
        {/* ضوء ذهبي في الزاوية العلوية */}
        <div
          className="absolute -top-40 -right-20 w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(38 62% 52% / 0.08) 0%, transparent 65%)" }}
        />
        {/* ضوء أسفل اليسار */}
        <div
          className="absolute bottom-0 -left-16 w-80 h-80 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(214 60% 40% / 0.07) 0%, transparent 70%)" }}
        />

        {/* الشعار */}
        <div className="relative z-10 flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: "hsl(38 62% 52% / 0.12)",
              border: "1px solid hsl(38 62% 52% / 0.25)",
            }}
          >
            <ScanLine className="w-4 h-4" style={{ color: "hsl(38 62% 52%)" }} />
          </div>
          <span className="text-white font-bold text-base tracking-wide">RuknAuto</span>
        </div>

        {/* العنوان الرئيسي */}
        <div className="relative z-10 space-y-6">
          <div className="space-y-3">
            <p
              className="text-xs font-semibold tracking-[0.2em] uppercase"
              style={{ color: "hsl(38 62% 52%)" }}
            >
              نظام إدارة المشتريات
            </p>
            <h1 className="text-[42px] font-black text-white leading-[1.1] tracking-tight">
              من الورقة<br />
              <span style={{ color: "hsl(38 62% 52%)" }}>إلى السجل.</span>
            </h1>
            <p className="text-base leading-relaxed font-light" style={{ color: "hsl(30 12% 70%)" }}>
              استخراج بيانات الفواتير وحقنها في ERP بدقة تامة وبلا تدخل يدوي.
            </p>
          </div>

          {/* خط فاصل */}
          <div
            className="w-12 h-px"
            style={{ background: "hsl(38 62% 52% / 0.4)" }}
          />

          {/* إحصاء بسيط — ثقيل وواثق */}
          <div className="grid grid-cols-3 gap-6">
            {[
              { n: "٪٩٨", label: "دقة الاستخراج" },
              { n: "٣ث",  label: "متوسط الفاتورة" },
              { n: "∞",   label: "تعلّم مستمر" },
            ].map(({ n, label }) => (
              <div key={label}>
                <p className="text-3xl font-black" style={{ color: "hsl(38 62% 52%)" }}>{n}</p>
                <p className="text-xs mt-1 font-medium" style={{ color: "hsl(30 12% 55%)" }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ذيل */}
        <div className="relative z-10">
          <p className="text-xs" style={{ color: "hsl(30 12% 30%)" }}>
            © {new Date().getFullYear()} RuknAuto
          </p>
        </div>
      </div>

      {/* ══ اليسار — نموذج الدخول ══ */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-[360px] fade-in">

          {/* شعار للشاشات الصغيرة */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{
                background: "hsl(38 62% 52% / 0.12)",
                border: "1px solid hsl(38 62% 52% / 0.25)",
              }}
            >
              <ScanLine className="w-4 h-4 text-primary" />
            </div>
            <span className="font-bold text-base">RuknAuto</span>
          </div>

          {/* العنوان */}
          <div className="mb-8">
            <h2 className="text-2xl font-extrabold text-foreground tracking-tight">
              تسجيل الدخول
            </h2>
            <p className="text-sm text-muted-foreground mt-1.5">
              أدخل بياناتك للمتابعة
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* اسم المستخدم */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">
                اسم المستخدم
              </label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم"
                className="field"
                autoComplete="username"
                autoFocus
                disabled={loading}
              />
            </div>

            {/* كلمة السر */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">
                كلمة السر
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="field pl-11"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* زر الدخول */}
            <button
              id="login-submit"
              type="submit"
              disabled={loading || !username.trim() || !password}
              className="btn-primary w-full mt-2"
              style={{ height: "48px" }}
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading ? "جارٍ التحقق..." : "دخول"}
            </button>
          </form>

          <p className="text-center text-xs text-muted-foreground/35 mt-8">
            تواصل مع مسؤول النظام للحصول على بيانات الدخول
          </p>
        </div>
      </div>
    </div>
  );
}
