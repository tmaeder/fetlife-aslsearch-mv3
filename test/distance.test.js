import test from "node:test";
import assert from "node:assert/strict";
import { haversineKm } from "../search/distance.js";

test("haversineKm: Zurich to Berlin ~ 670km", () => {
  const z = { lat: 47.3769, lng: 8.5417 };
  const b = { lat: 52.5200, lng: 13.4050 };
  const km = haversineKm(z, b);
  assert.ok(km > 600 && km < 750, `expected ~670, got ${km}`);
});

test("haversineKm: same point = 0", () => {
  const p = { lat: 1, lng: 2 };
  assert.ok(haversineKm(p, p) < 0.01);
});

test("haversineKm: nullish returns null", () => {
  assert.equal(haversineKm(null, { lat: 1, lng: 2 }), null);
});
