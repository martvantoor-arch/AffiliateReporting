import assert from "node:assert/strict";
import { test } from "node:test";

import { axisTickLabel, niceScale } from "../components/charts/geometry";

/** De labels van één as, zoals ze in de grafiek komen te staan. */
function labels(max: number): string[] {
  const scale = niceScale(max);
  return scale.ticks.map((tick) => axisTickLabel(tick, scale));
}

test("een as krijgt nooit twee keer hetzelfde label", () => {
  // Bij lage bedragen leverde afronden op hele euro's "0 0 1 1 1" op.
  for (const max of [0, 0.12, 0.5, 1, 2, 3.4, 7, 40, 1250, 9000, 42000]) {
    const shown = labels(max);
    assert.equal(
      new Set(shown).size,
      shown.length,
      `dubbele labels bij max ${max}: ${shown.join(" ")}`,
    );
  }
});

test("de as onder de duizend telt in hele euro's, daarboven in k", () => {
  assert.deepEqual(labels(40), ["0", "10", "20", "30", "40"]);
  assert.deepEqual(labels(2), ["0,0", "0,5", "1,0", "1,5", "2,0"]);
  // Eén eenheid per as: staat er ergens k, dan overal.
  assert.deepEqual(labels(1250), ["0", "0,5k", "1,0k", "1,5k"]);
});

test("k-labels ronden niet naar een verkeerd bedrag af", () => {
  // 1500 als "2k" tonen is geen afronding maar een onwaarheid.
  assert.ok(labels(1250).includes("1,5k"));
  assert.ok(!labels(1250).includes("2k"));
});

test("een lege as krijgt hele getallen in plaats van kwarten", () => {
  assert.deepEqual(labels(0), ["0", "1", "2", "3", "4"]);
});
