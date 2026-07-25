/**
 * Genereert de Prisma-client voor het juiste doelplatform.
 *
 *   node scripts/generate-prisma.mjs          # Node (lokaal, eigen server, Docker)
 *   node scripts/generate-prisma.mjs workerd  # Cloudflare Workers
 *
 * Waarom dit script bestaat: de gegenereerde client verschilt per platform in
 * precies één opzicht. Op Node wordt de WASM-querycompiler op runtime
 * gecompileerd; dat verbiedt Cloudflare ("Wasm code generation disallowed by
 * embedder"), dus daar moet de WASM als module geïmporteerd worden. Prisma
 * regelt dat met `runtime = "workerd"` in het generator-blok.
 *
 * Om schema.prisma niet te hoeven aanpassen (en dus nooit half aangepast achter
 * te laten), schrijven we een kopie naar .prisma-build/ en genereren daaruit.
 * Beide varianten komen op dezelfde plek terecht, zodat lib/db.ts één vast
 * importpad heeft.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const target = process.argv[2] === "workerd" ? "workerd" : "node";
const root = process.cwd();
const schemaPath = path.join(root, "prisma", "schema.prisma");

if (target === "node") {
  // Niets bijzonders: gewoon het schema zelf gebruiken.
  run(schemaPath);
  console.log("Prisma-client gegenereerd voor Node.");
} else {
  const buildDir = path.join(root, ".prisma-build");
  const copyPath = path.join(buildDir, "schema.prisma");

  let schema = readFileSync(schemaPath, "utf8");

  if (!/generator\s+client\s*\{/.test(schema)) {
    throw new Error("Geen generator-blok 'client' gevonden in prisma/schema.prisma.");
  }
  // Commentaarregels eerst weg, anders struikelt de controle over het woord
  // "runtime" in de toelichting boven het generator-blok.
  const code = schema
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  if (/^\s*runtime\s*=/m.test(code)) {
    throw new Error(
      "prisma/schema.prisma zet zelf al een `runtime`. Haal die regel weg; dit script bepaalt het doelplatform.",
    );
  }

  // `output` is relatief aan het schemabestand. .prisma-build/ en prisma/ zitten
  // beide één map onder de projectwortel, dus "../lib/generated/prisma" wijst
  // vanuit de kopie naar precies dezelfde plek. Alleen de runtime erbij dus.
  schema = schema.replace(/(generator\s+client\s*\{)/, '$1\n  runtime  = "workerd"');

  mkdirSync(buildDir, { recursive: true });
  writeFileSync(copyPath, schema, "utf8");

  try {
    run(copyPath);
    console.log("Prisma-client gegenereerd voor Cloudflare Workers (workerd).");
  } finally {
    rmSync(buildDir, { recursive: true, force: true });
  }
}

function run(schema) {
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "generate", "--schema", schema],
    { stdio: "inherit" },
  );
}
