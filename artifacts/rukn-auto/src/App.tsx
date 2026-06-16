import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { setAuthTokenGetter } from "@workspace/api-client-react";

import { Layout, ThemeProvider } from "@/components/layout";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ExtractionProvider } from "@/contexts/ExtractionContext";
import Dashboard from "@/pages/dashboard";
import Extract from "@/pages/extract";
import Invoices from "@/pages/invoices";
import Parts from "@/pages/parts";
import Login from "@/pages/login";
import Register from "@/pages/register";
import AdminUsers from "@/pages/admin-users";
import AdminSettings from "@/pages/admin-settings";
import Analytics from "@/pages/analytics";
import SuperAdmin from "@/pages/super-admin";

// ربط الـ token بـ api-client-react — يُرفق تلقائياً في كل طلب
setAuthTokenGetter(() => localStorage.getItem("ruknauto_token"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        // لا تُعيد المحاولة عند 401
        if (error?.status === 401) return false;
        return failureCount < 2;
      },
    },
  },
});

function Router() {
  const { user, isAdmin, isSuperAdmin, logout } = useAuth();
  const canParts = isAdmin || (user?.canEditParts ?? false);

  // تسجيل خروج تلقائي عند انتهاء صلاحية الجلسة (401)
  useEffect(() => {
    const unsub = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "observerResultsUpdated") {
        const q = event.query;
        if ((q.state.error as any)?.status === 401) {
          logout();
        }
      }
    });
    return unsub;
  }, [logout]);

  // غير مسجّل → صفحة الدخول أو التسجيل
  if (!user) {
    return (
      <Switch>
        <Route path="/register" component={Register} />
        <Route component={Login} />
      </Switch>
    );
  }

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/extract" component={Extract} />
        <Route path="/invoices" component={Invoices} />
        <Route path="/parts">
          {canParts ? <Parts /> : <Redirect to="/" />}
        </Route>
        {/* صفحة إدارة المستخدمين للمدير فقط */}
        <Route path="/admin/users">
          {isAdmin ? <AdminUsers /> : <Redirect to="/" />}
        </Route>
        <Route path="/admin/settings">
          {isSuperAdmin ? <AdminSettings /> : <Redirect to="/" />}
        </Route>
        <Route path="/analytics" component={Analytics} />
        {/* super admin — مدير المنصة */}
        <Route path="/super-admin">
          {isSuperAdmin ? <SuperAdmin /> : <Redirect to="/" />}
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <ExtractionProvider>
                <Router />
              </ExtractionProvider>
            </WouterRouter>
            <Toaster dir="rtl" />
          </TooltipProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
