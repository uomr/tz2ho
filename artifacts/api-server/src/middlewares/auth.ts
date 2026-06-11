/**
 * auth.ts — JWT Authentication Middleware
 */
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.SESSION_SECRET || "ruknauto-secret-change-me";

export interface AuthPayload {
  userId: number;
  username: string;
  role: string;
  department: string;
  displayName: string;
  canEditParts: boolean; // ← صلاحية تعديل ذاكرة القطع
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

/** Middleware: يطلب تسجيل دخول */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً" });
    return;
  }

  req.user = payload;
  next();
}

/** Middleware: مدير فقط */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "هذه العملية تتطلب صلاحيات المدير" });
      return;
    }
    next();
  });
}

/** Middleware: مدير أو موظف لديه صلاحية تعديل القطع */
export function requirePartsAccess(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role === "admin" || req.user?.canEditParts) {
      next();
    } else {
      res.status(403).json({ error: "ليس لديك صلاحية تعديل ذاكرة القطع — تواصل مع المدير" });
    }
  });
}
