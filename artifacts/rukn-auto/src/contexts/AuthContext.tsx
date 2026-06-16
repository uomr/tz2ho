/**
 * AuthContext.tsx — سياق المصادقة للواجهة الأمامية
 * يحفظ بيانات المستخدم المسجّل في localStorage ويوفرها لكل التطبيق
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: "admin" | "employee" | "superadmin";
  department: string;
  canEditParts: boolean;
  orgId: number | null;
  orgName?: string | null;
  orgPlan?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  activeOrgId: number | null;
  setActiveOrgId: (id: number | null) => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
  isAdmin: false,
  isSuperAdmin: false,
  activeOrgId: null,
  setActiveOrgId: () => {},
});

const TOKEN_KEY = "ruknauto_token";
const USER_KEY = "ruknauto_user";
const ORG_KEY = "ruknauto_active_org";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  });
  const [activeOrgId, setActiveOrgIdState] = useState<number | null>(() => {
    const raw = localStorage.getItem(ORG_KEY);
    return raw ? parseInt(raw, 10) : null;
  });

  const setActiveOrgId = useCallback((id: number | null) => {
    if (id === null) localStorage.removeItem(ORG_KEY);
    else localStorage.setItem(ORG_KEY, id.toString());
    setActiveOrgIdState(id);
  }, []);

  const login = useCallback((t: string, u: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setToken(t);
    setUser(u);
    setActiveOrgId(null);
  }, [setActiveOrgId]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ORG_KEY);
    setToken(null);
    setUser(null);
    setActiveOrgIdState(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, token, login, logout,
      isAdmin: user?.role === "admin" || user?.role === "superadmin",
      isSuperAdmin: user?.role === "superadmin",
      activeOrgId, setActiveOrgId
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/** يُعيد Authorization header و x-ruknauto-org-id إذا كان متوفراً */
export function getAuthHeader(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  
  const activeOrg = localStorage.getItem(ORG_KEY);
  if (activeOrg) headers["x-ruknauto-org-id"] = activeOrg;

  return headers;
}
