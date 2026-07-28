"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { vapidConfig } from "@/lib/env";
import { sendToUser } from "@/lib/push/send";

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  label?: string;
}

/** De publieke sleutel mag de browser gewoon zien; die zit in het abonnement. */
export async function pushPublicKeyAction(): Promise<string | null> {
  await requireUser();
  return vapidConfig()?.publicKey ?? null;
}

/**
 * Slaat een apparaat op. Het endpoint is uniek, dus opnieuw aanzetten op
 * hetzelfde apparaat werkt de bestaande rij bij in plaats van te verdubbelen.
 */
export async function subscribePushAction(input: PushSubscriptionInput): Promise<void> {
  const user = await requireUser();

  if (!input?.endpoint || !input.p256dh || !input.auth) {
    throw new Error("Onvolledig push-abonnement ontvangen.");
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      userId: user.id,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      label: input.label?.slice(0, 120) ?? null,
    },
    // Ook userId bijwerken: hetzelfde apparaat kan van gebruiker wisselen.
    update: {
      userId: user.id,
      p256dh: input.p256dh,
      auth: input.auth,
      label: input.label?.slice(0, 120) ?? null,
      failures: 0,
    },
  });

  revalidatePath("/account");
}

/** Zet notificaties uit voor dit ene apparaat. */
export async function unsubscribePushAction(endpoint: string): Promise<void> {
  const user = await requireUser();
  if (!endpoint) return;

  // Op userId meefilteren, zodat je geen apparaat van iemand anders wist.
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  revalidatePath("/account");
}

/** Stuurt een proefmelding, zodat je ziet dat het werkt zonder op een sale te wachten. */
export async function testPushAction(): Promise<number> {
  const user = await requireUser();
  return sendToUser(user.id, {
    title: "Kasboek werkt",
    body: "Zo ziet een melding eruit als er een nieuwe sale binnenkomt.",
    url: "/",
    tag: "kasboek-test",
  });
}
