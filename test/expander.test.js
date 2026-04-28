import test from "node:test";
import assert from "node:assert/strict";
import { expandQuery, detectIntent } from "../search/expander.js";

test("expandQuery: sub → submissive,bottom", () => {
  const out = expandQuery("sub Berlin").split(" ");
  assert.ok(out.includes("submissive"));
  assert.ok(out.includes("bottom"));
  assert.ok(out.includes("Berlin"));
});

test("expandQuery: passthrough for unknown", () => {
  assert.equal(expandQuery("Berlin Tokyo"), "Berlin Tokyo");
});

test("detectIntent: submissive Berlin → sub role", () => {
  const i = detectIntent("submissive Berlin");
  assert.deepEqual(i.roles, ["sub"]);
});

test("detectIntent: female sub", () => {
  const i = detectIntent("female sub");
  assert.ok(i.sexes.includes("F"));
  assert.ok(i.roles.includes("sub"));
});

test("detectIntent: nothing", () => {
  const i = detectIntent("zurich");
  assert.deepEqual(i.sexes, []);
  assert.deepEqual(i.roles, []);
});
