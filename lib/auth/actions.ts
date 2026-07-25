"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { toDataURL } from "qrcode";
import { z } from "zod";

import { rateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import {
  clearPendingTwoFactor,
  createSession,
  destroyOtherSessions,
  destroySession,
  getCurrentUser,
  getPendingTwoFactorUserId,
  setPendingTwoFactor,
} from "@/lib/auth/session";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  totpUri,
  verifyTotp,
} from "@/lib/auth/totp";
import {
  decrypt,
  decryptJson,
  encrypt,
  encryptJson,
  hashPassword,
  sha256,
  verifyPassword,
} from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { allowedSignupEmails, defaultTimezone } from "@/lib/env";

export interface ActionState {
  error?: string;
  success?: string;
}

const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 15;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Vul een e-mailadres in.")
  .email("Dat lijkt geen geldig e-mailadres.");

const passwordSchema = z
  .string()
  .min(12, "Kies een wachtwoord van minimaal 12 tekens.")
  .max(200, "Dat wachtwoord is te lang.");

async function clientKey(prefix: string): Promise<string> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || store.get("x-real-ip") || "onbekend";
  return `${prefix}:${sha256(ip).slice(0, 24)}`;
}

async function requestMeta(): Promise<{ userAgent: string | null; ip: string | null }> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    userAgent: store.get("user-agent"),
    ip: forwarded || store.get("x-real-ip") || null,
  };
}

/* ------------------------------------------------------------------ *
 * Registreren — alleen de eerste gebruiker, of een adres uit de witte lijst.
 * ------------------------------------------------------------------ */

export async function canRegister(): Promise<boolean> {
  const count = await prisma.user.count();
  return count === 0 || allowedSignupEmails().length > 0;
}

export async function registerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const limit = rateLimit(await clientKey("register"), 5, 600);
  if (!limit.allowed) {
    return { error: `Te veel pogingen. Probeer het over ${limit.retryAfterSeconds} seconden opnieuw.` };
  }

  const parsed = z
    .object({
      email: emailSchema,
      password: passwordSchema,
      passwordConfirm: z.string(),
    })
    .refine((data) => data.password === data.passwordConfirm, {
      message: "De twee wachtwoorden zijn niet gelijk.",
      path: ["passwordConfirm"],
    })
    .safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
      passwordConfirm: formData.get("passwordConfirm"),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Controleer je gegevens." };
  }
  const { email, password } = parsed.data;

  const userCount = await prisma.user.count();
  const allowList = allowedSignupEmails();
  if (userCount > 0 && !allowList.includes(email)) {
    return {
      error:
        "Registreren is gesloten. Zet je e-mailadres in ALLOWED_SIGNUP_EMAILS als je een extra account nodig hebt.",
    };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Er bestaat al een account met dit e-mailadres." };
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      timezone: defaultTimezone,
    },
  });

  await createSession(user.id, await requestMeta());
  redirect("/netwerken?welkom=1");
}

/* ------------------------------------------------------------------ *
 * Inloggen
 * ------------------------------------------------------------------ */

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const key = await clientKey("login");
  const limit = rateLimit(key, 10, 300);
  if (!limit.allowed) {
    return { error: `Te veel inlogpogingen. Probeer het over ${limit.retryAfterSeconds} seconden opnieuw.` };
  }

  const parsed = z
    .object({ email: emailSchema, password: z.string().min(1, "Vul je wachtwoord in.") })
    .safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Controleer je gegevens." };
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });

  // Bewust dezelfde melding voor "onbekend adres" en "verkeerd wachtwoord",
  // zodat je hier geen accounts kunt aftasten.
  const genericError = { error: "E-mailadres of wachtwoord is onjuist." };
  if (!user) {
    // Even rekenen zodat een onbekend adres niet meetbaar sneller antwoordt.
    await hashPassword(password);
    return genericError;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return {
      error: `Dit account is tijdelijk vergrendeld na te veel mislukte pogingen. Probeer het over ${minutes} minuten opnieuw.`,
    };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins: failed,
        lockedUntil:
          failed >= MAX_FAILED_LOGINS
            ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
            : null,
      },
    });
    return genericError;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  resetRateLimit(key);

  if (user.totpEnabled) {
    await setPendingTwoFactor(user.id);
    redirect("/inloggen/verificatie");
  }

  await createSession(user.id, await requestMeta());
  redirect("/");
}

export async function verifyTwoFactorAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const limit = rateLimit(await clientKey("2fa"), 10, 300);
  if (!limit.allowed) {
    return { error: `Te veel pogingen. Probeer het over ${limit.retryAfterSeconds} seconden opnieuw.` };
  }

  const userId = await getPendingTwoFactorUserId();
  if (!userId) {
    return { error: "De verificatie is verlopen. Log opnieuw in." };
  }

  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Vul de code uit je authenticator-app in." };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.totpEnabled || !user.totpSecret) {
    return { error: "Tweestapsverificatie staat niet aan voor dit account." };
  }

  if (verifyTotp(decrypt(user.totpSecret), code)) {
    await clearPendingTwoFactor();
    await createSession(user.id, await requestMeta());
    redirect("/");
  }

  // Herstelcode? Die mag precies één keer werken.
  if (user.recoveryCodes) {
    const stored = decryptJson<string[]>(user.recoveryCodes);
    const normalised = code.toLowerCase().replace(/\s/g, "");
    const hashed = sha256(normalised);
    const index = stored.indexOf(hashed);
    if (index >= 0) {
      const remaining = stored.filter((_, i) => i !== index);
      await prisma.user.update({
        where: { id: user.id },
        data: { recoveryCodes: encryptJson(remaining) },
      });
      await clearPendingTwoFactor();
      await createSession(user.id, await requestMeta());
      redirect("/");
    }
  }

  return { error: "Die code klopt niet. Let op dat codes 30 seconden geldig zijn." };
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/inloggen");
}

/* ------------------------------------------------------------------ *
 * Accountbeheer
 * ------------------------------------------------------------------ */

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) return { error: "Je bent niet meer ingelogd." };

  const parsed = z
    .object({
      current: z.string().min(1, "Vul je huidige wachtwoord in."),
      next: passwordSchema,
      confirm: z.string(),
    })
    .refine((data) => data.next === data.confirm, {
      message: "De twee nieuwe wachtwoorden zijn niet gelijk.",
    })
    .safeParse({
      current: formData.get("current"),
      next: formData.get("next"),
      confirm: formData.get("confirm"),
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Controleer je gegevens." };
  }

  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) return { error: "Account niet gevonden." };
  if (!(await verifyPassword(parsed.data.current, user.passwordHash))) {
    return { error: "Je huidige wachtwoord is onjuist." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.next) },
  });
  const removed = await destroyOtherSessions(user.id);

  return {
    success:
      removed > 0
        ? `Wachtwoord gewijzigd. ${removed} ander(e) apparaat/apparaten zijn uitgelogd.`
        : "Wachtwoord gewijzigd.",
  };
}

export interface TotpSetup {
  secret: string;
  uri: string;
  /** QR-code als data-URL, zodat er geen externe dienst aan te pas komt. */
  qrDataUrl: string;
}

/** Zet een nieuw secret klaar; pas na een geldige code wordt het geactiveerd. */
export async function startTotpSetup(): Promise<TotpSetup> {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) throw new Error("Niet ingelogd.");

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: sessionUser.id },
    data: { totpSecret: encrypt(secret), totpEnabled: false },
  });

  const uri = totpUri(secret, sessionUser.email);
  const qrDataUrl = await toDataURL(uri, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
    color: { dark: "#191813ff", light: "#ffffffff" },
  });

  return { secret, uri, qrDataUrl };
}

export interface TotpEnableState extends ActionState {
  recoveryCodes?: string[];
}

export async function enableTotpAction(
  _prev: TotpEnableState,
  formData: FormData,
): Promise<TotpEnableState> {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) return { error: "Je bent niet meer ingelogd." };

  const code = String(formData.get("code") ?? "").trim();
  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user?.totpSecret) {
    return { error: "Start eerst het instellen van tweestapsverificatie." };
  }
  if (!verifyTotp(decrypt(user.totpSecret), code)) {
    return { error: "Die code klopt niet. Probeer de volgende code uit je app." };
  }

  const recoveryCodes = generateRecoveryCodes();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      totpEnabled: true,
      recoveryCodes: encryptJson(recoveryCodes.map((c) => sha256(c.replace(/\s/g, "")))),
    },
  });

  return {
    success: "Tweestapsverificatie staat aan. Bewaar de herstelcodes op een veilige plek.",
    recoveryCodes,
  };
}

export async function disableTotpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) return { error: "Je bent niet meer ingelogd." };

  const password = String(formData.get("password") ?? "");
  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) return { error: "Account niet gevonden." };
  if (!(await verifyPassword(password, user.passwordHash))) {
    return { error: "Je wachtwoord is onjuist." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: false, totpSecret: null, recoveryCodes: null },
  });
  return { success: "Tweestapsverificatie staat uit." };
}
