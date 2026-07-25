/**
 * Vult de database met verzonnen transacties, zodat je het dashboard kunt
 * bekijken voordat je echte netwerken koppelt.
 *
 *   npm run demo -- jij@voorbeeld.nl
 *
 * De accounts krijgen de naam "(demo)" en lege credentials; ze doen dus niets
 * bij een sync. Verwijder ze via de netwerkenpagina als je klaar bent.
 */

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Next laadt .env zelf, maar dit script draait los via tsx. Prisma 7 doet het
// (anders dan Prisma 6) ook niet meer voor ons.
try {
  process.loadEnvFile();
} catch {
  // Geen .env: dan moeten de variabelen al in de omgeving staan.
}

import { encryptJson } from "../lib/crypto";
import { dayKey } from "../lib/dates";
import { PrismaClient } from "../lib/generated/prisma/client";
import { NETWORK_IDS } from "../lib/networks/types";

// Dit script draait alleen lokaal tegen het SQLite-bestand.
const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./prisma/kasboek.db",
  }),
});

const PROGRAMS: Record<string, string[]> = {
  daisycon: ["Zalando", "Coolblue", "Wehkamp", "HelloFresh", "Bergfreunde"],
  tradetracker: ["Booking.com", "Decathlon", "Rituals", "MediaMarkt"],
  tradedoubler: ["Apple Store", "Emma Matras", "Fonq", "Nespresso"],
  bol: ["Boeken", "Elektronica", "Huis & tuin", "Speelgoed"],
  awin: ["Etsy", "AliExpress", "HP Store", "Vodafone", "NS International"],
};

/** Vaste reeks, zodat demodata er bij elke run hetzelfde uitziet. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  const user = email
    ? await prisma.user.findUnique({ where: { email } })
    : await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  if (!user) {
    console.error(
      email
        ? `Geen gebruiker gevonden met e-mailadres ${email}.`
        : "Er is nog geen gebruiker. Maak eerst een account aan in de app.",
    );
    process.exit(1);
  }

  const random = makeRandom(20_260_725);
  const timezone = user.timezone;
  const days = 180;
  let created = 0;

  for (const [index, network] of NETWORK_IDS.entries()) {
    const account = await prisma.networkAccount.upsert({
      where: {
        userId_network_label: {
          userId: user.id,
          network,
          label: `${network} (demo)`,
        },
      },
      create: {
        userId: user.id,
        network,
        label: `${network} (demo)`,
        credentials: encryptJson({}),
        settings: JSON.stringify({ demo: "true" }),
        enabled: false,
        lastSyncAt: new Date(),
        lastSyncStatus: "ok",
        lastSyncMessage: "Demodata, geen echte koppeling.",
      },
      update: {},
    });

    // Elk netwerk krijgt een eigen niveau en groei, zodat de grafieken variëren.
    const scale = 0.6 + index * 0.35;
    const growth = 1 + (index - 2) * 0.004;

    for (let back = days; back >= 0; back -= 1) {
      const date = new Date(Date.now() - back * 24 * 60 * 60 * 1000);
      const weekday = date.getUTCDay();
      // Weekenden zijn rustiger; dat maakt de weekgrafiek realistischer.
      const weekendFactor = weekday === 0 || weekday === 6 ? 0.55 : 1;
      const trendFactor = growth ** (days - back);
      const count = Math.floor(random() * 4 * scale * weekendFactor * trendFactor);

      for (let i = 0; i < count; i += 1) {
        const programs = PROGRAMS[network];
        const programName = programs[Math.floor(random() * programs.length)];
        const saleAmount = Math.round((8 + random() * 240) * 100) / 100;
        const commission = Math.round(saleAmount * (0.02 + random() * 0.09) * 100) / 100;
        const roll = random();
        const status = roll > 0.82 ? "pending" : roll > 0.74 ? "rejected" : "approved";
        const occurredAt = new Date(date.getTime() - Math.floor(random() * 86_400_000));

        await prisma.transaction.upsert({
          where: {
            accountId_externalId: {
              accountId: account.id,
              externalId: `demo-${network}-${back}-${i}`,
            },
          },
          create: {
            accountId: account.id,
            network,
            externalId: `demo-${network}-${back}-${i}`,
            occurredAt,
            day: dayKey(occurredAt, timezone),
            status,
            currency: "EUR",
            commission,
            commissionEur: commission,
            saleAmount,
            saleAmountEur: saleAmount,
            programName,
            programId: null,
            countryCode: "NL",
          },
          update: {},
        });
        created += 1;
      }

      await prisma.dailyStat.upsert({
        where: { accountId_day: { accountId: account.id, day: dayKey(date, timezone) } },
        create: {
          accountId: account.id,
          network,
          day: dayKey(date, timezone),
          impressions: Math.floor(random() * 4000 * scale),
          clicks: Math.floor(random() * 180 * scale * weekendFactor),
          sales: count,
        },
        update: {},
      });
    }
  }

  console.log(
    `Demodata toegevoegd voor ${user.email}: ${created} transacties over ${days} dagen, verdeeld over ${NETWORK_IDS.length} netwerken.`,
  );
  console.log(
    "De demo-accounts staan uitgezet, dus een sync raakt ze niet. Verwijder ze via de netwerkenpagina.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
