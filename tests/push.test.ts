import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSaleMessage, type NewSale } from "../lib/push/notify";

function sale(overrides: Partial<NewSale> = {}): NewSale {
  return {
    network: "bol",
    programName: "Een product",
    commissionEur: 12.45,
    status: "pending",
    ...overrides,
  };
}

test("één nieuwe sale noemt het bedrag en waar hij vandaan komt", () => {
  const message = buildSaleMessage([sale()]);
  assert.ok(message);
  assert.match(message.title, /Nieuwe sale/);
  assert.match(message.title, /12,45/);
  assert.match(message.body, /bol\.com/);
  assert.match(message.body, /Een product/);
});

test("meerdere sales tellen het bedrag op", () => {
  const message = buildSaleMessage([
    sale({ commissionEur: 10 }),
    sale({ commissionEur: 5.5, network: "awin" }),
  ]);
  assert.ok(message);
  assert.match(message.title, /2 nieuwe sales/);
  assert.match(message.title, /15,50/);
});

test("bij veel sales worden de netwerken samengevat", () => {
  const many = [
    ...Array.from({ length: 4 }, () => sale({ network: "bol" })),
    ...Array.from({ length: 2 }, () => sale({ network: "awin" })),
  ];
  const message = buildSaleMessage(many);
  assert.ok(message);
  assert.match(message.title, /6 nieuwe sales/);
  // Geen zes regels met productnamen, maar een telling per netwerk.
  assert.match(message.body, /bol\.com \(4\)/);
  assert.match(message.body, /Awin \(2\)/);
  assert.ok(!message.body.includes("Een product"));
});

test("afgekeurde transacties leveren geen melding op", () => {
  assert.equal(buildSaleMessage([sale({ status: "rejected" })]), null);
  assert.equal(buildSaleMessage([]), null);

  // Eén goedgekeurde tussen afgekeurde regels telt wel, en telt alleen zichzelf.
  const message = buildSaleMessage([
    sale({ status: "rejected", commissionEur: 99 }),
    sale({ status: "approved", commissionEur: 3 }),
  ]);
  assert.ok(message);
  assert.match(message.title, /Nieuwe sale/);
  assert.match(message.title, /3,00/);
});

test("alle meldingen delen één tag, zodat ze elkaar vervangen", () => {
  const first = buildSaleMessage([sale()]);
  const second = buildSaleMessage([sale(), sale()]);
  assert.equal(first?.tag, second?.tag);
});
