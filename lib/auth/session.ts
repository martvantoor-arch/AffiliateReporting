import { createHmac } from "node:crypto";

import { cookies } from "next/headers";

import { constantTimeEqual, randomToken, sha256 } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { isProduction, sessionSecret } from "@/lib/env";

const SESSION_COOKIE = "ar_session";
const PENDING_COOKIE = "ar_2fa";
const SESSION_DAYS = 30;
const PENDING_MINUTES = 10;
/** Sessies die langer dan dit meegaan worden verlengd bij gebruik. */
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  totpEnabled: boolean;
  timezone: string;
}

/**
 * Sessietokens worden met een servergeheim gepeperd voordat ze de database in
 * gaan. Een database zonder dat geheim levert dus geen bruikbare tokens op.
 */
function tokenHash(token: string): string {
  return createHmac("sha256", sessionSecret()).update(token).digest("hex");
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<void> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      tokenHash: tokenHash(token),
      userId,
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      ipHash: meta.ip ? sha256(meta.ip).slice(0, 32) : null,
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(SESSION_DAYS * 24 * 60 * 60));
  store.delete(PENDING_COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: true },
  });
  if (!session) return null;

  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // Bijhouden wanneer de sessie laatst gebruikt is, maar niet bij elke request
  // schrijven — dat zou elke paginaweergave een database-write kosten.
  if (Date.now() - session.lastSeenAt.getTime() > REFRESH_AFTER_MS) {
    await prisma.session
      .update({
        where: { id: session.id },
        data: {
          lastSeenAt: new Date(),
          expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
        },
      })
      .catch(() => {});
  }

  return {
    id: session.user.id,
    email: session.user.email,
    totpEnabled: session.user.totpEnabled,
    timezone: session.user.timezone,
  };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session
      .deleteMany({ where: { tokenHash: tokenHash(token) } })
      .catch(() => {});
  }
  store.delete(SESSION_COOKIE);
  store.delete(PENDING_COOKIE);
}

/** Logt alle andere apparaten uit; handig na een wachtwoordwijziging. */
export async function destroyOtherSessions(userId: string): Promise<number> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const keepHash = token ? tokenHash(token) : "";
  const result = await prisma.session.deleteMany({
    where: { userId, NOT: { tokenHash: keepHash } },
  });
  return result.count;
}

/* ------------------------------------------------------------------ *
 * Tussenstap voor tweestapsverificatie: wachtwoord klopt, code nog niet.
 * ------------------------------------------------------------------ */

export async function setPendingTwoFactor(userId: string): Promise<void> {
  const expiresAt = Date.now() + PENDING_MINUTES * 60 * 1000;
  const payload = `${userId}.${expiresAt}`;
  const signature = createHmac("sha256", sessionSecret())
    .update(`2fa:${payload}`)
    .digest("base64url");
  const store = await cookies();
  store.set(
    PENDING_COOKIE,
    `${payload}.${signature}`,
    cookieOptions(PENDING_MINUTES * 60),
  );
}

export async function getPendingTwoFactorUserId(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(PENDING_COOKIE)?.value;
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAt, signature] = parts;
  const expected = createHmac("sha256", sessionSecret())
    .update(`2fa:${userId}.${expiresAt}`)
    .digest("base64url");
  if (!constantTimeEqual(signature, expected)) return null;
  if (Number(expiresAt) <= Date.now()) return null;
  return userId;
}

export async function clearPendingTwoFactor(): Promise<void> {
  const store = await cookies();
  store.delete(PENDING_COOKIE);
}

/** Verwijdert verlopen sessies; wordt meegenomen in de sync-taak. */
export async function pruneExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  return result.count;
}
