import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addDays,
  bucketKey,
  dayKey,
  dayRange,
  daysBetween,
  endOfDay,
  monthStart,
  previousRange,
  resolvePreset,
  startOfDay,
  suggestGranularity,
  weekStart,
} from "../lib/dates";

const AMS = "Europe/Amsterdam";

test("dayKey gebruikt de kalender van de tijdzone, niet die van UTC", () => {
  // 22:30 UTC in de zomer is 00:30 de volgende dag in Amsterdam.
  assert.equal(dayKey(new Date("2026-07-25T22:30:00Z"), AMS), "2026-07-26");
  assert.equal(dayKey(new Date("2026-07-25T22:30:00Z"), "UTC"), "2026-07-25");
  // In de winter is het verschil één uur.
  assert.equal(dayKey(new Date("2026-01-15T23:30:00Z"), AMS), "2026-01-16");
  assert.equal(dayKey(new Date("2026-01-15T22:30:00Z"), AMS), "2026-01-15");
});

test("startOfDay geeft het juiste UTC-moment, ook rond zomertijd", () => {
  // Zomertijd: Amsterdam loopt 2 uur voor.
  assert.equal(startOfDay("2026-07-25", AMS).toISOString(), "2026-07-24T22:00:00.000Z");
  // Wintertijd: 1 uur voor.
  assert.equal(startOfDay("2026-01-15", AMS).toISOString(), "2026-01-14T23:00:00.000Z");
  // De dag waarop de klok vooruit gaat (laatste zondag van maart 2026 = 29 maart).
  assert.equal(startOfDay("2026-03-29", AMS).toISOString(), "2026-03-28T23:00:00.000Z");
  // De dag waarop de klok terug gaat (laatste zondag van oktober 2026 = 25 oktober).
  assert.equal(startOfDay("2026-10-25", AMS).toISOString(), "2026-10-24T22:00:00.000Z");
  assert.equal(startOfDay("2026-07-25", "UTC").toISOString(), "2026-07-25T00:00:00.000Z");
});

test("een dag heen en weer omrekenen levert dezelfde dag op", () => {
  for (const day of ["2026-01-01", "2026-03-29", "2026-06-15", "2026-10-25", "2026-12-31"]) {
    assert.equal(dayKey(startOfDay(day, AMS), AMS), day, day);
  }
});

test("endOfDay ligt net voor het begin van de volgende dag", () => {
  const end = endOfDay("2026-07-25", AMS);
  const nextStart = startOfDay("2026-07-26", AMS);
  assert.equal(nextStart.getTime() - end.getTime(), 1);
  assert.equal(dayKey(end, AMS), "2026-07-25");
});

test("addDays rekent over maand- en jaargrenzen", () => {
  assert.equal(addDays("2026-07-25", 1), "2026-07-26");
  assert.equal(addDays("2026-07-31", 1), "2026-08-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29", "2028 is een schrikkeljaar");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
});

test("daysBetween en dayRange horen bij elkaar", () => {
  assert.equal(daysBetween("2026-07-01", "2026-07-31"), 30);
  assert.equal(dayRange("2026-07-01", "2026-07-31").length, 31);
  assert.equal(dayRange("2026-07-25", "2026-07-25").length, 1);
  const range = dayRange("2026-03-28", "2026-03-30");
  assert.deepEqual(range, ["2026-03-28", "2026-03-29", "2026-03-30"]);
});

test("weekStart geeft de maandag van de ISO-week", () => {
  // 2026-07-25 is een zaterdag.
  assert.equal(weekStart("2026-07-25"), "2026-07-20");
  // 2026-07-26 is een zondag: hoort nog bij de week die op 20 juli begon.
  assert.equal(weekStart("2026-07-26"), "2026-07-20");
  // 2026-07-27 is een maandag: die is zijn eigen weekstart.
  assert.equal(weekStart("2026-07-27"), "2026-07-27");
});

test("monthStart en bucketKey groeperen zoals verwacht", () => {
  assert.equal(monthStart("2026-07-25"), "2026-07-01");
  assert.equal(bucketKey("2026-07-25", "day"), "2026-07-25");
  assert.equal(bucketKey("2026-07-25", "week"), "2026-07-20");
  assert.equal(bucketKey("2026-07-25", "month"), "2026-07-01");
});

test("suggestGranularity houdt het aantal staven leesbaar", () => {
  assert.equal(suggestGranularity(7), "day");
  assert.equal(suggestGranularity(45), "day");
  assert.equal(suggestGranularity(90), "week");
  assert.equal(suggestGranularity(365), "week");
  assert.equal(suggestGranularity(500), "month");
});

test("previousRange is even lang en sluit direct aan", () => {
  const current = { from: "2026-07-01", to: "2026-07-31" };
  const previous = previousRange(current);
  assert.equal(previous.to, "2026-06-30", "eindigt de dag voor de huidige periode");
  assert.equal(
    daysBetween(previous.from, previous.to),
    daysBetween(current.from, current.to),
    "even lang",
  );
  assert.equal(previous.from, "2026-05-31");
});

test("presets leveren een geldige periode op", () => {
  for (const preset of ["7d", "30d", "90d", "mtd", "prev-month", "ytd", "12m", "onzin"]) {
    const range = resolvePreset(preset, AMS);
    assert.match(range.from, /^\d{4}-\d{2}-\d{2}$/, preset);
    assert.match(range.to, /^\d{4}-\d{2}-\d{2}$/, preset);
    assert.ok(range.from <= range.to, `${preset}: van mag niet na tot liggen`);
  }
  assert.equal(daysBetween(...(Object.values(resolvePreset("7d", AMS)) as [string, string])), 6);
  // "Vorige maand" eindigt op de laatste dag van die maand.
  const prevMonth = resolvePreset("prev-month", AMS);
  assert.equal(prevMonth.from, monthStart(prevMonth.from));
  assert.equal(addDays(prevMonth.to, 1), monthStart(addDays(prevMonth.to, 1)));
});
