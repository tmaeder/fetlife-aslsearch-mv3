import test from "node:test";
import assert from "node:assert/strict";
import { applyFilters } from "../search/filters.js";

const sample = [
  { nickname: "alpha", age: 25, sex: "M", role: "sub",     location: "Berlin, Germany",          counts: { pics: 3, vids: 0 }, supporter: false },
  { nickname: "beta",  age: 40, sex: "F", role: "Switch",  location: "Zürich, Switzerland",     counts: { pics: 0, vids: 2 }, supporter: true  },
  { nickname: "gamma", age: 33, sex: "M", role: "Dom",     location: "London, United Kingdom",  counts: { pics: 10, vids: 1 }, supporter: false },
  { nickname: "delta", age: 60, sex: "F", role: "sub",     location: "Berlin, Germany",          counts: { pics: 0, vids: 0 }, supporter: false },
];

test("age range", () => {
  const r = applyFilters(sample, { ageMin: 30, ageMax: 50 });
  assert.deepEqual(r.map(x => x.nickname), ["beta", "gamma"]);
});

test("sex filter", () => {
  const r = applyFilters(sample, { sexes: ["F"] });
  assert.deepEqual(r.map(x => x.nickname), ["beta", "delta"]);
});

test("role filter substring", () => {
  const r = applyFilters(sample, { roles: ["sub"] });
  assert.deepEqual(r.map(x => x.nickname), ["alpha", "delta"]);
});

test("location regex", () => {
  const r = applyFilters(sample, { locationRegex: "Berlin|London" });
  assert.deepEqual(r.map(x => x.nickname), ["alpha", "gamma", "delta"]);
});

test("nickname regex", () => {
  const r = applyFilters(sample, { nicknameRegex: "^[ab]" });
  assert.deepEqual(r.map(x => x.nickname), ["alpha", "beta"]);
});

test("hasPics", () => {
  const r = applyFilters(sample, { hasPics: true });
  assert.deepEqual(r.map(x => x.nickname), ["alpha", "gamma"]);
});

test("supporter only", () => {
  const r = applyFilters(sample, { supporter: true });
  assert.deepEqual(r.map(x => x.nickname), ["beta"]);
});

test("combined filters", () => {
  const r = applyFilters(sample, { sexes: ["M"], roles: ["sub", "dom"], ageMin: 30 });
  assert.deepEqual(r.map(x => x.nickname), ["gamma"]);
});

test("empty criteria returns all", () => {
  assert.equal(applyFilters(sample, {}).length, sample.length);
});
