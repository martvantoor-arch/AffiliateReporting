import assert from "node:assert/strict";
import { test } from "node:test";

import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateTotpSecret,
  totpCode,
  verifyTotp,
} from "../lib/auth/totp";
import {
  decrypt,
  decryptJson,
  encrypt,
  encryptJson,
  hashPassword,
  sha256,
  verifyPassword,
} from "../lib/crypto";

// Vaste testsleutels; de echte staan in .env en komen hier nooit voorbij.
// lib/env leest process.env pas op het moment van gebruik, dus deze regels
// hoeven niet boven de imports te staan.
process.env.ENCRYPTION_KEY =
  "0000000000000000000000000000000000000000000000000000000000000001";
process.env.SESSION_SECRET = "test-session-secret-minstens-32-tekens-lang";

test("versleutelen en ontsleutelen levert hetzelfde op", () => {
  const secret = "mijn-api-token-!@#$%^&*()_+ éñ 日本語";
  const sealed = encrypt(secret);
  assert.notEqual(sealed, secret, "de leesbare tekst mag er niet in staan");
  assert.ok(!sealed.includes("api-token"));
  assert.equal(decrypt(sealed), secret);
});

test("elke versleuteling krijgt een eigen IV", () => {
  const a = encrypt("zelfde tekst");
  const b = encrypt("zelfde tekst");
  assert.notEqual(a, b, "twee keer hetzelfde mag niet hetzelfde cijfertekst geven");
  assert.equal(decrypt(a), decrypt(b));
});

test("gerommel in de database wordt gedetecteerd", () => {
  const sealed = encrypt("belangrijk");
  const parts = sealed.split(".");
  // Eén byte in de cijfertekst omdraaien.
  const data = Buffer.from(parts[3], "base64url");
  data[0] ^= 0xff;
  const tampered = [parts[0], parts[1], parts[2], data.toString("base64url")].join(".");
  assert.throws(() => decrypt(tampered));
});

test("een onbekend formaat wordt geweigerd", () => {
  assert.throws(() => decrypt("gewoon-tekst"));
  assert.throws(() => decrypt("v2.a.b.c"));
});

test("JSON-credentials gaan heen en terug", () => {
  const credentials = { apiToken: "abc123", publisherId: "999" };
  assert.deepEqual(decryptJson(encryptJson(credentials)), credentials);
});

test("wachtwoorden worden gehasht, niet opgeslagen", async () => {
  const password = "een-heel-lang-wachtwoord-2026";
  const hash = await hashPassword(password);
  assert.ok(hash.startsWith("scrypt."));
  assert.ok(!hash.includes(password));
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword("bijna-hetzelfde-wachtwoord", hash), false);
  assert.equal(await verifyPassword("", hash), false);
});

test("hetzelfde wachtwoord geeft twee verschillende hashes", async () => {
  const a = await hashPassword("herhaling");
  const b = await hashPassword("herhaling");
  assert.notEqual(a, b, "elke hash heeft zijn eigen salt");
  assert.equal(await verifyPassword("herhaling", a), true);
  assert.equal(await verifyPassword("herhaling", b), true);
});

test("verifyPassword valt niet om op rommel", async () => {
  assert.equal(await verifyPassword("x", "onzin"), false);
  assert.equal(await verifyPassword("x", ""), false);
  assert.equal(await verifyPassword("x", "scrypt.te.weinig.delen.hier"), false);
});

test("base32 gaat heen en terug", () => {
  for (const text of ["a", "hallo", "een langere reeks bytes om te coderen"]) {
    const buffer = Buffer.from(text, "utf8");
    assert.equal(base32Decode(base32Encode(buffer)).toString("utf8"), text);
  }
});

test("TOTP accepteert de eigen code en weigert een verkeerde", () => {
  const secret = generateTotpSecret();
  const now = Date.UTC(2026, 6, 25, 12, 0, 0);
  const code = totpCode(secret, now);
  assert.match(code, /^\d{6}$/);
  assert.equal(verifyTotp(secret, code, now), true);
  assert.equal(verifyTotp(secret, "000000", now) && code !== "000000", false);
  assert.equal(verifyTotp(secret, "12345", now), false, "te kort");
  assert.equal(verifyTotp(secret, "", now), false);
});

test("TOTP staat een klein tijdverschil toe, maar niet meer", () => {
  const secret = generateTotpSecret();
  const now = Date.UTC(2026, 6, 25, 12, 0, 0);
  const code = totpCode(secret, now);
  // Eén stap van 30 seconden ervoor en erna mag.
  assert.equal(verifyTotp(secret, code, now + 30_000), true);
  assert.equal(verifyTotp(secret, code, now - 30_000), true);
  // Vijf minuten later niet meer.
  assert.equal(verifyTotp(secret, code, now + 300_000), false);
});

test("TOTP van een ander secret werkt niet", () => {
  const now = Date.UTC(2026, 6, 25, 12, 0, 0);
  const code = totpCode(generateTotpSecret(), now);
  assert.equal(verifyTotp(generateTotpSecret(), code, now), false);
});

test("herstelcodes zijn uniek en herkenbaar opgemaakt", () => {
  const codes = generateRecoveryCodes(8);
  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8, "geen dubbele codes");
  for (const code of codes) {
    assert.match(code, /^[a-z2-7]{5}-[a-z2-7]{5}$/, code);
  }
  // Ze worden gehasht bewaard, dus de hash mag de code niet verraden.
  assert.ok(!sha256(codes[0]).includes(codes[0].slice(0, 4)));
});
