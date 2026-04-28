import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// Make DOMParser available before importing modules that use it.
const { window } = new JSDOM();
globalThis.DOMParser = window.DOMParser;
globalThis.Document = window.Document;
globalThis.Element = window.Element;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;

const { parseASR } = await import("../content/selectors.js");

test("parseASR: M sub", () => {
  assert.deepEqual(parseASR("29M sub"), { age: 29, sex: "M", sexRaw: "M", role: "sub" });
});

test("parseASR: M Dom-leaning Switch", () => {
  assert.deepEqual(parseASR("31M Dom-leaning Switch"), { age: 31, sex: "M", sexRaw: "M", role: "Dom-leaning Switch" });
});

test("parseASR: F sub", () => {
  assert.deepEqual(parseASR("29F sub"), { age: 29, sex: "F", sexRaw: "F", role: "sub" });
});

test("parseASR: Man Switch", () => {
  assert.deepEqual(parseASR("47Man Switch"), { age: 47, sex: "M", sexRaw: "Man", role: "Switch" });
});

test("parseASR: M Exploring", () => {
  assert.deepEqual(parseASR("44M Exploring"), { age: 44, sex: "M", sexRaw: "M", role: "Exploring" });
});

test("parseASR: M Bottom", () => {
  assert.deepEqual(parseASR("70M Bottom"), { age: 70, sex: "M", sexRaw: "M", role: "Bottom" });
});

test("parseASR: empty role", () => {
  assert.deepEqual(parseASR("25M"), { age: 25, sex: "M", sexRaw: "M", role: "" });
});

test("parseASR: garbage returns null", () => {
  assert.equal(parseASR("hello world"), null);
  assert.equal(parseASR(""), null);
  assert.equal(parseASR(null), null);
});
