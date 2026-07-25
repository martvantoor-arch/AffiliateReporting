import assert from "node:assert/strict";
import { test } from "node:test";

import { parseCsv, parseCsvObjects } from "../lib/csv";
import { normaliseCurrency, normaliseStatus, parseAmount, parseDate } from "../lib/networks/types";
import { PAGE_SIZE, mapStatus, toCompactDate } from "../lib/networks/tradedoubler";

test("parseAmount begrijpt Nederlandse en Engelse notatie", () => {
  assert.equal(parseAmount("12,45"), 12.45);
  assert.equal(parseAmount("12.45"), 12.45);
  assert.equal(parseAmount("1.234,56"), 1234.56);
  assert.equal(parseAmount("1,234.56"), 1234.56);
  assert.equal(parseAmount("€ 1.234,56"), 1234.56);
  assert.equal(parseAmount("-8,20"), -8.2);
  assert.equal(parseAmount(9.99), 9.99);
});

test("parseAmount groepeert duizendtallen met komma niet als decimalen", () => {
  // "3,500" is drieduizendvijfhonderd, niet drie-en-een-halve euro.
  assert.equal(parseAmount("3,500"), 3500);
  // Twee decimalen achter de komma blijven decimalen.
  assert.equal(parseAmount("3,50"), 3.5);
});

test("parseAmount geeft 0 bij onbruikbare invoer", () => {
  assert.equal(parseAmount(""), 0);
  assert.equal(parseAmount("n/a"), 0);
  assert.equal(parseAmount(null), 0);
  assert.equal(parseAmount(undefined), 0);
  assert.equal(parseAmount(Number.NaN), 0);
});

test("parseDate leest de formaten die netwerken gebruiken", () => {
  assert.equal(parseDate("2026-07-25")?.toISOString().slice(0, 10), "2026-07-25");
  assert.equal(parseDate("25-07-2026")?.toISOString().slice(0, 10), "2026-07-25");
  assert.equal(parseDate("25/07/2026")?.toISOString().slice(0, 10), "2026-07-25");
  assert.equal(
    parseDate("2026-07-25 14:30:00")?.toISOString(),
    "2026-07-25T14:30:00.000Z",
  );
  assert.equal(
    parseDate("2026-07-25T14:30:00Z")?.toISOString(),
    "2026-07-25T14:30:00.000Z",
  );
  // Epoch in seconden én in milliseconden.
  assert.equal(parseDate(1_784_000_000)?.getTime(), 1_784_000_000_000);
  assert.equal(parseDate(1_784_000_000_000)?.getTime(), 1_784_000_000_000);
  assert.equal(parseDate("geen datum"), null);
  assert.equal(parseDate(""), null);
});

test("normaliseStatus vertaalt de woorden van elk netwerk", () => {
  for (const value of ["approved", "accepted", "confirmed", "validated", "paid"]) {
    assert.equal(normaliseStatus(value), "approved", value);
  }
  for (const value of ["declined", "disapproved", "rejected", "deleted", "cancelled"]) {
    assert.equal(normaliseStatus(value), "rejected", value);
  }
  for (const value of ["pending", "open", "", "iets onbekends"]) {
    assert.equal(normaliseStatus(value), "pending", value);
  }
  assert.equal(normaliseStatus("APPROVED"), "approved");
});

test("normaliseCurrency herkent codes en symbolen", () => {
  assert.equal(normaliseCurrency("eur"), "EUR");
  assert.equal(normaliseCurrency("€"), "EUR");
  assert.equal(normaliseCurrency("£"), "GBP");
  assert.equal(normaliseCurrency(""), "EUR");
  assert.equal(normaliseCurrency("onzin"), "EUR");
  assert.equal(normaliseCurrency("onzin", "SEK"), "SEK");
});

test("parseCsv respecteert aanhalingstekens en ingesloten scheidingstekens", () => {
  const rows = parseCsv('a;b\n"met;puntkomma";2\n"met ""dubbel""";3');
  assert.deepEqual(rows, [
    ["a", "b"],
    ["met;puntkomma", "2"],
    ['met "dubbel"', "3"],
  ]);
});

test("parseCsv kiest zelf het scheidingsteken", () => {
  assert.deepEqual(parseCsv("a,b,c\n1,2,3")[1], ["1", "2", "3"]);
  assert.deepEqual(parseCsv("a;b;c\n1;2;3")[1], ["1", "2", "3"]);
  assert.deepEqual(parseCsv("a\tb\tc\n1\t2\t3")[1], ["1", "2", "3"]);
});

test("parseCsvObjects maakt objecten en negeert lege regels", () => {
  const rows = parseCsvObjects("datum;commissie\n01-07-2026;12,45\n\n03-07-2026;4,10\n");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { datum: "01-07-2026", commissie: "12,45" });
});

test("parseCsv verwerkt een regeleinde binnen een veld", () => {
  const rows = parseCsv('naam;waarde\n"regel1\nregel2";7');
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], "regel1\nregel2");
  assert.equal(rows[1][1], "7");
});

test("TradeDoubler krijgt datums als 20190101, niet als 2019-01-01", () => {
  // Het verkeerde datumformaat kostte bij Daisycon een ronde; hier vastgelegd.
  assert.equal(toCompactDate(new Date("2019-01-01T00:00:00Z")), "20190101");
  assert.equal(toCompactDate(new Date("2026-07-25T22:30:00Z")), "20260725");
});

test("TradeDoubler-status is één letter: A, P of D", () => {
  assert.equal(mapStatus({ status: "A" }), "approved");
  assert.equal(mapStatus({ status: "P" }), "pending");
  assert.equal(mapStatus({ status: "D" }), "rejected");
  // Kleine letters en onbekende waarden mogen niet als "goedgekeurd" eindigen.
  assert.equal(mapStatus({ status: "d" }), "rejected");
  assert.equal(mapStatus({ status: undefined }), "pending");
});

test("TradeDoubler accepteert hoogstens 100 regels per pagina", () => {
  // Groter geeft {"code":2031,"message":"Limit should be between 1 to 100"}.
  assert.ok(PAGE_SIZE >= 1 && PAGE_SIZE <= 100);
});
