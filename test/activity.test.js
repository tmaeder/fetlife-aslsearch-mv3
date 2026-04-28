import test from "node:test";
import assert from "node:assert/strict";
import { parseActivity, activityBucket } from "../search/activity-parse.js";

test("parseActivity: just-in-bedroom = 0", () => {
  assert.equal(parseActivity("Just In The Bedroom"), 0);
});
test("parseActivity: today = 0", () => {
  assert.equal(parseActivity("Today"), 0);
});
test("parseActivity: yesterday = 1 day", () => {
  assert.equal(parseActivity("Yesterday"), 86400000);
});
test("parseActivity: 2 days ago", () => {
  assert.equal(parseActivity("Active 2 days ago"), 2 * 86400000);
});
test("parseActivity: a few minutes ago", () => {
  assert.equal(parseActivity("Active a few minutes ago"), 3 * 60_000);
});
test("parseActivity: unknown → null", () => {
  assert.equal(parseActivity(""), null);
  assert.equal(parseActivity("garbage"), null);
});
test("activityBucket: day / week / month / older / unknown", () => {
  assert.equal(activityBucket(0), "day");
  assert.equal(activityBucket(86400000), "day");
  assert.equal(activityBucket(86400000 * 4), "week");
  assert.equal(activityBucket(86400000 * 14), "month");
  assert.equal(activityBucket(86400000 * 100), "older");
  assert.equal(activityBucket(null), "unknown");
});
