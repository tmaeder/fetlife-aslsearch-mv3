import test from "node:test";
import assert from "node:assert/strict";
import { parseProfile, buildDeepPredicate } from "../search/profile-fetch.js";

const PROPS = {
  dataCore: {
    userId: 3763560,
    accountType: "free",
    nickname: "BamaKinkyBull",
    activity: "Just In The Bedroom",
    aboutHtml: "<p>Hi. I'm Matt and I love living in <strong>Tallassee</strong>.</p>",
    joinDate: "2014-08",
    websites: [],
    isLookingFor: ["lifetime_relationship", "play_partner", "friendship"],
    isNotLookingFor: [],
    showBadge: true,
    isSupporter: false,
    isLifetimeSupporter: false,
    isEmployee: false,
    isProfileVerified: true,
    avatarUrl: "https://example.com/a.jpg",
    smallAvatarUrl: "https://example.com/a-s.jpg",
    identity: "31M Dom-leaning Switch",
    pronouns: [{ key: "he", name: "He/Him" }],
    roles: [
      { key: "switch_dom", name: "Dom-leaning Switch", description: "..." },
      { key: "pleasure_dom", name: "Pleasure Dom", description: "..." },
    ],
    orientations: [{ key: "straight", name: "Straight", description: "..." }],
    genders: [{ key: "M", name: "Male", description: null }],
    relationships: [],
    dsRelationships: [],
  },
  dataCurrentUserRelation: { isFollowing: true, isFriend: false, isMuted: false, isBlocked: false },
  dataCommunityLists: {},
};

function buildHtml(props) {
  const enc = JSON.stringify(props).replace(/"/g, "&quot;");
  return `<!doctype html><html><body>
<div data-component="UserProfile" data-fl-vue-component="true" data-props="${enc}"></div>
<section><h2>Friends</h2><a href="/BamaKinkyBull/friends">80 Friends</a></section>
<section><h2>Followers</h2><a href="/BamaKinkyBull/followers">15 Followers</a></section>
<div><h2>Fetishes</h2>
  <h3>Into</h3>
  <a href="/fetishes/2">Anal Sex</a>
  <a href="/fetishes/1056">Bareback</a>
  <h3>Curious</h3>
  <a href="/fetishes/3398">69</a>
  <a href="/fetishes/82579">"accidental" public humiliation (everything to do with it)</a>
</div></body></html>`;
}

test("parseProfile: extracts core fields from data-props", () => {
  const p = parseProfile(buildHtml(PROPS), "BamaKinkyBull");
  assert.equal(p.userId, "3763560");
  assert.equal(p.nickname, "BamaKinkyBull");
  assert.match(p.bio, /Tallassee/);
  assert.equal(p.identity, "31M Dom-leaning Switch");
  assert.equal(p.activity, "Just In The Bedroom");
  assert.equal(p.isProfileVerified, true);
  assert.equal(p.accountType, "free");
});

test("parseProfile: roles + keys", () => {
  const p = parseProfile(buildHtml(PROPS), "x");
  assert.deepEqual(p.roles, ["Dom-leaning Switch", "Pleasure Dom"]);
  assert.deepEqual(p.roleKeys, ["switch_dom", "pleasure_dom"]);
});

test("parseProfile: orientation + gender + pronouns", () => {
  const p = parseProfile(buildHtml(PROPS), "x");
  assert.deepEqual(p.orientation, ["Straight"]);
  assert.deepEqual(p.orientationKeys, ["straight"]);
  assert.deepEqual(p.genders, ["Male"]);
  assert.deepEqual(p.genderKeys, ["M"]);
  assert.deepEqual(p.pronouns, ["He/Him"]);
});

test("parseProfile: looking-for stable keys", () => {
  const p = parseProfile(buildHtml(PROPS), "x");
  assert.deepEqual(p.lookingFor, ["lifetime_relationship", "play_partner", "friendship"]);
});

test("parseProfile: friends count from HTML fallback", () => {
  const p = parseProfile(buildHtml(PROPS), "x");
  assert.equal(p.friendsCount, 80);
  assert.equal(p.followersCount, 15);
});

test("parseProfile: fetishes split into/curious + suffix stripped", () => {
  const p = parseProfile(buildHtml(PROPS), "x");
  assert.ok(p.fetishes.all.includes("Anal Sex"));
  assert.ok(p.fetishes.into.includes("Anal Sex"));
  assert.ok(p.fetishes.curious.includes("69"));
  assert.ok(p.fetishes.curious.includes('"accidental" public humiliation'));
});

test("parseProfile: missing data-component returns warning stub", () => {
  const p = parseProfile("<html><body>nothing</body></html>", "ghost");
  assert.equal(p.nickname, "ghost");
  assert.match(p._warning, /UserProfile/);
});

test("buildDeepPredicate: bioRegex", () => {
  const p = parseProfile(buildHtml(PROPS), "x");
  assert.ok(buildDeepPredicate({ bioRegex: "Tallassee" })(p));
  assert.ok(!buildDeepPredicate({ bioRegex: "Mars" })(p));
});

test("buildDeepPredicate: minFriends", () => {
  const p = parseProfile(buildHtml(PROPS), "x");
  assert.ok(buildDeepPredicate({ minFriends: 50 })(p));
  assert.ok(!buildDeepPredicate({ minFriends: 100 })(p));
});

test("buildDeepPredicate: verifiedOnly + supporterOnly", () => {
  const p = parseProfile(buildHtml(PROPS), "x");
  assert.ok(buildDeepPredicate({ verifiedOnly: true })(p));
  assert.ok(!buildDeepPredicate({ supporterOnly: true })(p));
});

test("buildDeepPredicate: orientationAny matches by key or name", () => {
  const p = parseProfile(buildHtml(PROPS), "x");
  assert.ok(buildDeepPredicate({ orientationAny: ["straight"] })(p));
  assert.ok(buildDeepPredicate({ orientationAny: ["Straight"] })(p));
  assert.ok(!buildDeepPredicate({ orientationAny: ["queer"] })(p));
});

test("buildDeepPredicate: lookingForAny by key", () => {
  const p = parseProfile(buildHtml(PROPS), "x");
  assert.ok(buildDeepPredicate({ lookingForAny: ["play_partner"] })(p));
  assert.ok(buildDeepPredicate({ lookingForAny: ["friendship"] })(p));
  assert.ok(!buildDeepPredicate({ lookingForAny: ["mentor"] })(p));
});

test("buildDeepPredicate: fetish substring match", () => {
  const p = parseProfile(buildHtml(PROPS), "x");
  assert.ok(buildDeepPredicate({ fetishesAny: ["anal"] })(p));
  assert.ok(!buildDeepPredicate({ fetishesAny: ["rope"] })(p));
});
