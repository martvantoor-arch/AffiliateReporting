/**
 * Beheer vanaf de opdrachtregel. Bedoeld voor de gevallen waar de webapp je niet
 * kan helpen: je bent je wachtwoord vergeten, je authenticator is kwijt, of je
 * wilt opnieuw beginnen. Er is geen e-mailherstel in de app, en een
 * herstelknop op internet zou een achterdeur zijn — dus staat het hier.
 *
 *   npm run admin -- lijst
 *   npm run admin -- wachtwoord jij@voorbeeld.nl
 *   npm run admin -- tweestaps-uit jij@voorbeeld.nl
 *   npm run admin -- verwijder jij@voorbeeld.nl
 *
 * Draai dit op de machine waar de database staat. Op Railway kun je met
 * `railway ssh` in de container en daar hetzelfde commando geven.
 */

import { randomBytes } from "node:crypto";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Next laadt .env zelf; dit script draait los.
try {
  process.loadEnvFile();
} catch {
  // Geen .env: dan moeten de variabelen al in de omgeving staan.
}

import { hashPassword } from "../lib/crypto";
import { PrismaClient } from "../lib/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./prisma/kasboek.db",
  }),
});

/** Leesbaar en toch sterk: vier groepen uit een alfabet zonder verwarrende tekens. */
function generatePassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(24);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return [0, 6, 12, 18]
    .map((start) => chars.slice(start, start + 6).join(""))
    .join("-");
}

async function list(): Promise<void> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { accounts: true } } },
  });

  if (users.length === 0) {
    console.log("Geen accounts. De app laat de eerste registratie toe.");
    return;
  }

  console.log(`${users.length} account(s):`);
  for (const user of users) {
    const details = [
      user.totpEnabled ? "2FA aan" : "2FA uit",
      `${user._count.accounts} netwerk(en)`,
      user.lockedUntil && user.lockedUntil > new Date() ? "VERGRENDELD" : null,
    ].filter(Boolean);
    console.log(`  ${user.email}  (${details.join(", ")})`);
  }
}

async function findUser(email: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user) {
    console.error(`Geen account met e-mailadres ${email}.`);
    console.error("Gebruik `npm run admin -- lijst` om te zien welke er zijn.");
    process.exit(1);
  }
  return user;
}

async function resetPassword(email: string): Promise<void> {
  const user = await findUser(email);
  const password = generatePassword();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(password),
      failedLogins: 0,
      lockedUntil: null,
    },
  });
  // Alle sessies weg: wie nog ingelogd was, is dat niet meer.
  await prisma.session.deleteMany({ where: { userId: user.id } });

  console.log(`Nieuw wachtwoord voor ${user.email}:\n\n    ${password}\n`);
  console.log("Log hiermee in en wijzig het daarna via de accountpagina.");
  if (user.totpEnabled) {
    console.log(
      "Let op: tweestapsverificatie staat nog aan, dus je hebt ook je\n" +
        "authenticator-code of een herstelcode nodig. Kwijt? Gebruik dan:\n" +
        `    npm run admin -- tweestaps-uit ${user.email}`,
    );
  }
}

async function disableTotp(email: string): Promise<void> {
  const user = await findUser(email);
  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: false, totpSecret: null, recoveryCodes: null },
  });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  console.log(
    `Tweestapsverificatie staat uit voor ${user.email}. Zet hem weer aan via de accountpagina.`,
  );
}

async function remove(email: string): Promise<void> {
  const user = await findUser(email);
  const counts = await prisma.$transaction([
    prisma.networkAccount.count({ where: { userId: user.id } }),
    prisma.transaction.count({ where: { account: { userId: user.id } } }),
  ]);

  // Alles hangt met onDelete: Cascade aan de gebruiker, dus dit haalt ook de
  // netwerkkoppelingen en transacties weg.
  await prisma.user.delete({ where: { id: user.id } });

  console.log(
    `${user.email} verwijderd, met ${counts[0]} netwerkkoppeling(en) en ${counts[1]} transactie(s).`,
  );
  const remaining = await prisma.user.count();
  if (remaining === 0) {
    console.log("Er zijn nu geen accounts meer; de app laat weer een registratie toe.");
  }
}

async function main(): Promise<void> {
  const [command, argument] = process.argv.slice(2);

  switch (command) {
    case "lijst":
    case "list":
      await list();
      break;
    case "wachtwoord":
    case "password":
      if (!argument) return usage("Geef een e-mailadres mee.");
      await resetPassword(argument);
      break;
    case "tweestaps-uit":
    case "totp-off":
      if (!argument) return usage("Geef een e-mailadres mee.");
      await disableTotp(argument);
      break;
    case "verwijder":
    case "delete":
      if (!argument) return usage("Geef een e-mailadres mee.");
      await remove(argument);
      break;
    default:
      return usage(command ? `Onbekend commando: ${command}` : undefined);
  }
}

function usage(problem?: string): void {
  if (problem) console.error(`${problem}\n`);
  console.log(
    [
      "Beheer van accounts:",
      "",
      "  npm run admin -- lijst                       toon alle accounts",
      "  npm run admin -- wachtwoord <e-mail>         nieuw wachtwoord instellen",
      "  npm run admin -- tweestaps-uit <e-mail>      tweestapsverificatie uitzetten",
      "  npm run admin -- verwijder <e-mail>          account en al zijn gegevens weg",
      "",
      `Database: ${process.env.DATABASE_URL ?? "file:./prisma/kasboek.db"}`,
    ].join("\n"),
  );
  if (problem) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
