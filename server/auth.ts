import crypto from 'node:crypto';
import type { UserRole } from '../src/shared/types.ts';

const RUNTIME_SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  exp: number;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function signSessionToken(payload: Omit<SessionPayload, 'exp'>, ttlHours = 24): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Date.now() + ttlHours * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', RUNTIME_SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', RUNTIME_SESSION_SECRET)
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.userId || !parsed.role || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function hasEnvAdminConfigured(): boolean {
  return Boolean(
    process.env.ADMIN_EMAIL &&
      process.env.ADMIN_EMAIL.trim().length > 0 &&
      process.env.ADMIN_PASSWORD &&
      process.env.ADMIN_PASSWORD.trim().length >= 6,
  );
}

export function verifyEnvAdminCredentials(email: string, password: string): boolean {
  if (!hasEnvAdminConfigured()) return false;
  const envEmail = process.env.ADMIN_EMAIL!.trim().toLowerCase();
  const envPass = process.env.ADMIN_PASSWORD!;
  const emailMatch = email.trim().toLowerCase() === envEmail;
  const a = Buffer.from(password, 'utf8');
  const b = Buffer.from(envPass, 'utf8');
  if (a.length !== b.length) return false;
  return emailMatch && crypto.timingSafeEqual(a, b);
}
