import webpush from "web-push";

import { prisma } from "@/lib/db";
import { vapidConfig } from "@/lib/env";

/**
 * Web Push. Op iPhone en iPad werkt dit alleen voor een webapp die op het
 * beginscherm staat (iOS 16.4 en nieuwer); in Safari zelf bestaat het niet.
 * De app moet daarnaast over https draaien — op Railway is dat zo.
 */

export interface PushMessage {
  title: string;
  body: string;
  /** Waar de gebruiker heen gaat als hij de melding aantikt. */
  url?: string;
  /**
   * Meldingen met dezelfde tag vervangen elkaar op het scherm. Zo levert een
   * ronde met vijf nieuwe sales geen vijf losse meldingen op als dat niet hoeft.
   */
  tag?: string;
}

let configured = false;

/** Zet de VAPID-gegevens klaar; geeft false als notificaties uitstaan. */
function ensureConfigured(): boolean {
  const config = vapidConfig();
  if (!config) return false;
  if (!configured) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    configured = true;
  }
  return true;
}

export function pushEnabled(): boolean {
  return vapidConfig() !== null;
}

/**
 * Stuurt een melding naar alle apparaten van een gebruiker. Faalt er één, dan
 * gaan de andere gewoon door: een uitgezette telefoon mag een iPad niet in de
 * weg zitten.
 */
export async function sendToUser(userId: string, message: PushMessage): Promise<number> {
  if (!ensureConfigured()) return 0;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return 0;

  const payload = JSON.stringify(message);
  let delivered = 0;

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
        { TTL: 60 * 60 * 12 },
      );
      delivered += 1;
      await prisma.pushSubscription.update({
        where: { id: subscription.id },
        data: { lastOkAt: new Date(), failures: 0 },
      });
    } catch (error) {
      await handleFailure(subscription.id, error);
    }
  }

  return delivered;
}

/**
 * 404 en 410 betekenen dat het apparaat de app heeft verwijderd of de
 * toestemming heeft ingetrokken: die rij is dood en kan weg. Andere fouten zijn
 * meestal tijdelijk, dus die tellen we en ruimen we pas na een reeks op.
 */
async function handleFailure(id: string, error: unknown): Promise<void> {
  const status =
    typeof error === "object" && error !== null && "statusCode" in error
      ? Number((error as { statusCode?: number }).statusCode)
      : 0;

  if (status === 404 || status === 410) {
    await prisma.pushSubscription.delete({ where: { id } }).catch(() => {});
    return;
  }

  const row = await prisma.pushSubscription
    .update({ where: { id }, data: { failures: { increment: 1 } } })
    .catch(() => null);

  if (row && row.failures >= 10) {
    await prisma.pushSubscription.delete({ where: { id } }).catch(() => {});
  }
}
