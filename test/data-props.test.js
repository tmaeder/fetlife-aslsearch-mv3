import test from "node:test";
import assert from "node:assert/strict";
import { parseSearchPage, normalizeUser } from "../search/parser.js";
import { PLACE_URL, isPlaceQuery, SEARCH_URL } from "../content/selectors.js";

const SAMPLE_USERS = [
  {
    id: 1289884,
    nickname: "ExampleA",
    avatarUrl: "https://example.com/a.jpg",
    avatarSmallUrl: "https://example.com/a-small.jpg",
    profileUrl: "/ExampleA",
    showBadge: true,
    identity: "45FtM Daddy",
    organization: false,
    location: "Grand Rapids, Michigan, United States",
    picCount: 122,
    vidCount: 5,
    writingsCount: 0,
    currentUserRelation: null,
    links: { pictures: "/ExampleA/pictures", videos: "/ExampleA/videos", posts: "/ExampleA/posts" }
  },
  {
    id: 2,
    nickname: "ExampleB",
    avatarUrl: "https://example.com/b.jpg",
    profileUrl: "/ExampleB",
    showBadge: false,
    identity: "29F sub",
    organization: "FetLife Supporter",
    location: "Zürich, Switzerland",
    picCount: 0, vidCount: 0, writingsCount: 3,
  }
];

function buildSampleHtml(users) {
  const json = JSON.stringify({ users, source: "search", everything: false })
    .replace(/"/g, "&quot;");
  return `<!doctype html><html><head>
<meta name="csrf-token" content="abc">
<meta name="action-cable-url" content="wss://example">
</head><body>
<div data-component="SearchUserList" data-fl-vue-component="true" data-props="${json}"></div>
<div role="navigation" aria-label="Pagination">
  <a rel="next" href="/search/kinksters?q=Berlin&amp;page=2">Next &gt;</a>
</div>
<span>1 - 20 of 2,012</span>
</body></html>`;
}

test("parseSearchPage: extracts users from data-props", () => {
  const html = buildSampleHtml(SAMPLE_USERS);
  const r = parseSearchPage(html);
  assert.equal(r.loggedIn, true);
  assert.equal(r.results.length, 2);
  assert.equal(r.results[0].nickname, "ExampleA");
  assert.equal(r.results[0].userId, "1289884");
  assert.equal(r.results[0].age, 45);
  assert.equal(r.results[0].sex, "FtM");
  assert.equal(r.results[0].role, "Daddy");
  assert.equal(r.results[0].location, "Grand Rapids, Michigan, United States");
  assert.equal(r.results[0].counts.pics, 122);
  assert.equal(r.results[0].profileUrl, "https://fetlife.com/ExampleA");
  assert.equal(r.results[1].sex, "F");
  assert.equal(r.results[1].supporter, true); // organization=string truthy
  assert.equal(r.total, 2012);
  assert.equal(r.nextHref, "/search/kinksters?q=Berlin&page=2");
});

test("parseSearchPage: logged-out detection", () => {
  const html = "<html><body>Welcome Home<br>Log In to FetLife</body></html>";
  const r = parseSearchPage(html);
  assert.equal(r.loggedIn, false);
});

test("parseSearchPage: logged in but no SearchUserList warns", () => {
  const html = `<html><head><meta name="csrf-token" content="x"><meta name="action-cable-url" content="x"></head><body></body></html>`;
  const r = parseSearchPage(html);
  assert.equal(r.loggedIn, true);
  assert.equal(r.results.length, 0);
  assert.match(r.warning || "", /user-list component/);
});

test("normalizeUser: handles missing identity", () => {
  const u = normalizeUser({ id: 1, nickname: "X", profileUrl: "/X" });
  assert.equal(u.age, null);
  assert.equal(u.sex, null);
  assert.equal(u.role, "");
});

test("isPlaceQuery: detects URL forms", () => {
  assert.ok(isPlaceQuery("https://fetlife.com/p/switzerland/zurich"));
  assert.ok(isPlaceQuery("/p/switzerland/zurich"));
  assert.ok(isPlaceQuery("p/switzerland/zurich"));
  assert.ok(!isPlaceQuery("zurich"));
  assert.ok(!isPlaceQuery("submissive Berlin"));
});

test("PLACE_URL: builds /kinksters URL with pagination", () => {
  assert.equal(
    PLACE_URL("https://fetlife.com/p/switzerland/zurich"),
    "https://fetlife.com/p/switzerland/zurich/kinksters"
  );
  assert.equal(
    PLACE_URL("/p/switzerland/zurich/kinksters", 3),
    "https://fetlife.com/p/switzerland/zurich/kinksters?page=3"
  );
  assert.equal(
    PLACE_URL("p/uk/london"),
    "https://fetlife.com/p/uk/london/kinksters"
  );
});

test("SEARCH_URL: text query", () => {
  assert.equal(SEARCH_URL("submissive Berlin"), "https://fetlife.com/search/kinksters?q=submissive%20Berlin");
  assert.equal(SEARCH_URL("Zurich", 5), "https://fetlife.com/search/kinksters?q=Zurich&page=5");
});

test("parseSearchPage: falls back to alternative component name", () => {
  const json = JSON.stringify({ users: SAMPLE_USERS, source: "search" }).replace(/"/g, "&quot;");
  const html = `<html><head><meta name="csrf-token" content="x"></head><body>
<div data-component="MemberList" data-props="${json}"></div>
</body></html>`;
  const r = parseSearchPage(html);
  assert.equal(r.loggedIn, true);
  assert.equal(r.results.length, 2);
  assert.equal(r.componentName, "MemberList");
});

test("parseSearchPage: scans any component if known names absent", () => {
  const json = JSON.stringify({ users: SAMPLE_USERS, source: "search" }).replace(/"/g, "&quot;");
  const html = `<html><head><meta name="csrf-token" content="x"></head><body>
<div data-component="SomeFutureComponent" data-props="${json}"></div>
</body></html>`;
  const r = parseSearchPage(html);
  assert.equal(r.loggedIn, true);
  assert.equal(r.results.length, 2);
  assert.equal(r.componentName, "SomeFutureComponent");
});

import { GROUP_URL, isGroupQuery } from "../content/selectors.js";

test("isGroupQuery: detects forms", () => {
  assert.ok(isGroupQuery("https://fetlife.com/groups/322506"));
  assert.ok(isGroupQuery("/groups/322506/members"));
  assert.ok(isGroupQuery("groups/322506"));
  assert.ok(!isGroupQuery("zurich"));
});

test("GROUP_URL: builds /members URL", () => {
  assert.equal(GROUP_URL("https://fetlife.com/groups/322506"),
    "https://fetlife.com/groups/322506/members");
  assert.equal(GROUP_URL("/groups/322506/members", 3),
    "https://fetlife.com/groups/322506/members?page=3");
  assert.equal(GROUP_URL("groups/322506"),
    "https://fetlife.com/groups/322506/members");
});

test("parseSearchPage: GroupMembers component recognized", () => {
  const json = JSON.stringify({ users: SAMPLE_USERS, group: { id: 1, name: "Test" } }).replace(/"/g, "&quot;");
  const html = `<html><head><meta name="csrf-token" content="x"></head><body>
<div data-component="GroupMembers" data-props="${json}"></div>
</body></html>`;
  const r = parseSearchPage(html);
  assert.equal(r.componentName, "GroupMembers");
  assert.equal(r.results.length, 2);
});
