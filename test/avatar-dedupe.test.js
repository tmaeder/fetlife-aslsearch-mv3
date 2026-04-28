import test from "node:test";
import assert from "node:assert/strict";
import { avatarKey, findDuplicateAvatars, dedupeMap } from "../search/avatar-dedupe.js";

test("avatarKey: attachment URL", () => {
  assert.equal(
    avatarKey("https://picav2-c160.cdn.fetlife.com/picture/attachments/154886844/c160.jpg?sig=x"),
    "att:154886844"
  );
});

test("avatarKey: album style", () => {
  const k = avatarKey("https://picv2-c160.cdn.fetlife.com/1289884/00063416-d17d-4938-a1ea-7a002da2bbcb/c160.jpg?sig=x");
  assert.equal(k, "alb:1289884:00063416-d17d-4938-a1ea-7a002da2bbcb");
});

test("avatarKey: nullish", () => {
  assert.equal(avatarKey(null), null);
  assert.equal(avatarKey(""), null);
});

test("findDuplicateAvatars + dedupeMap", () => {
  const results = [
    { nickname: "A", avatarUrl: "https://x.com/picture/attachments/100/c160.jpg" },
    { nickname: "B", avatarUrl: "https://x.com/picture/attachments/100/c160.jpg" },
    { nickname: "C", avatarUrl: "https://x.com/picture/attachments/200/c160.jpg" },
    { nickname: "D", avatarUrl: null },
  ];
  const dups = findDuplicateAvatars(results);
  assert.equal(dups.size, 1);
  assert.deepEqual(dups.get("att:100"), ["A", "B"]);
  const m = dedupeMap(results);
  assert.deepEqual(m.get("A"), ["B"]);
  assert.deepEqual(m.get("B"), ["A"]);
  assert.equal(m.has("C"), false);
  assert.equal(m.has("D"), false);
});
