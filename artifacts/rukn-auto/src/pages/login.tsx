import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ScanLine, LogIn, Eye, EyeOff, Zap, Brain, ArrowLeftRight } from "lucide-react";
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
      if (!res.ok) { toast.error(data.error || "حدث خطأ في تسجيل الدخول"); return; }
      login(data.token, data.user);
      toast.success(`أهلاً ${data.user.displayName} 👋`);
    } catch {
      toast.error("لا يمكن الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" dir="rtl">

      {/* ══ اليمين — لوحة العلامة التجارية ══ */}
      <div
        className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-14 overflow-hidden"
        style={{
          background: "linear-gradient(160deg, hsl(222 38% 11%) 0%, hsl(222 30% 7%) 100%)",
        }}
      >
        {/* خلفية شبكية هندسية */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(hsl(222 20% 20% / 0.25) 1px, transparent 1px),
              linear-gradient(90deg, hsl(222 20% 20% / 0.25) 1px, transparent 1px)
            `,
            backgroundSize: "48px 48px",
          }}
        />
        {/* ضوء في الزاوية */}
        <div
          className="absolute -top-32 -right-32 w-80 h-80 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(160 84% 39% / 0.12) 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 left-0 w-64 h-64 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(224 76% 55% / 0.08) 0%, transparent 70%)" }}
        />

        {/* الشعار */}
        <div className="relative z-10 flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center border"
            style={{
              background: "hsl(160 84% 39% / 0.15)",
              borderColor: "hsl(160 84% 39% / 0.3)",
            }}
          >
            <ScanLine className="w-5 h-5 text-primary" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">RuknAuto</span>
        </div>

        {/* المحتوى الرئيسي */}
        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-[36px] font-extrabold text-white leading-tight tracking-tight">
              نظام استخراج<br />
              <span className="text-primary">الفواتير الذكي</span>
            </h1>
            <p className="mt-4 text-base leading-relaxed" style={{ color: "hsl(210 18% 90% / 0.55)" }}>
              حوّل فواتيرك العربية الورقية إلى بيانات رقمية دقيقة وأدخلها في ERP تلقائياً في ثوانٍ
            </p>
          </div>

          <div className="space-y-4">
            {[
              { icon: Brain,         text: "ذكاء اصطناعي متخصص في الفواتير العربية",    color: "#8b5cf6" },
              { icon: ArrowLeftRight, text: "حقن تلقائي مباشر في NewPoint ERP",          color: "#3b82f6" },
              { icon: Zap,           text: "ذاكرة تتعلم أرقام قطعك تلقائياً",           color: "#f59e0b" },
            ].map(({ icon: Icon, text, color }) => (
              <div key={text} className="flex items-center gap-4">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: color + "18", border: `1px solid ${color}30` }}
                >
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <span className="text-sm" style={{ color: "hsl(210 18% 90% / 0.65)" }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ذيل */}
        <div className="relative z-10">
          <p className="text-xs" style={{ color: "hsl(210 18% 90% / 0.25)" }}>
            نظام SaaS متعدد المستأجرين • مدعوم بـ Qwen VL • مشفّر بالكامل
          </p>
        </div>
      </div>

      {/* ══ اليسار — نموذج تسجيل الدخول ══ */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-[360px]">

          {/* شعار للشاشات الصغيرة */}
          <div className="flex flex-col items-center mb-10 lg:hidden">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center border mb-4"
              style={{
                background: "hsl(160 84% 39% / 0.12)",
                borderColor: "hsl(160 84% 39% / 0.25)",
              }}
            >
              <ScanLine className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-xl font-bold">RuknAuto</h1>
          </div>

          {/* عنوان النموذج */}
          <div className="mb-8">
            <h2 className="text-2xl font-extrabold text-foreground tracking-tight">مرحباً بعودتك</h2>
            <p className="text-sm text-muted-foreground mt-1.5">أدخل بياناتك للمتابعة إلى النظام</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* اسم المستخدم */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                اسم المستخدم
              </label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم"
                className="w-full h-11 px-4 rounded-xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40 transition-all"
                autoComplete="username"
                autoFocus
                disabled={loading}
              />
            </div>

            {/* كلمة السر */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                كلمة السر
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="أدخل كلمة السر"
                  className="w-full h-11 px-4 pl-11 rounded-xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40 transition-all"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
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
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2.5 hover:bg-primary/90 disabled:opacity-45 disabled:cursor-not-allowed transition-all active:scale-[0.98] mt-2"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading ? "جاري التحقق..." : "دخول إلى النظام"}
            </button>
          </form>

          <p className="text-center text-xs text-muted-foreground/35 mt-8 leading-relaxed">
            تواصل مع مسؤول النظام للحصول على بيانات الدخول
          </p>
        </div>
      </div>
    </div>
  );
}
