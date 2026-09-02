import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export type Role = "CITIZEN" | "STAFF" | "ADMIN";
export type SessionUser = { id: number; role: Role; email: string; name: string };

const secret = process.env.SESSION_SECRET ?? "";

if (!secret) {
  throw new Error("SESSION_SECRET environment variable is required.");
}

function isRole(value: unknown): value is Role {
  return value === "CITIZEN" || value === "STAFF" || value === "ADMIN";
}

export function createToken(user: SessionUser) {
  return jwt.sign(
    { sub: String(user.id), role: user.role, email: user.email, name: user.name },
    secret,
    { expiresIn: "8h" },
  );
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const value = req.header("authorization");
  const token = value?.startsWith("Bearer ") ? value.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as jwt.JwtPayload;
    const id = Number(payload.sub);
    if (!Number.isInteger(id) || id <= 0 || !isRole(payload.role)) {
      res.status(401).json({ error: "Your session is invalid. Please sign in again." });
      return;
    }
    (req as Request & { user: SessionUser }).user = {
      id,
      role: payload.role,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
    };
    next();
  } catch {
    res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}

export function allowRoles(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as Request & { user?: SessionUser }).user;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ error: "You do not have permission to perform this action." });
      return;
    }
    next();
  };
}

export function getSessionUser(req: Request) {
  return (req as Request & { user: SessionUser }).user;
}