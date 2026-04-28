import { parseASR } from "../content/selectors.js";

// FetLife now ships a Vue-based hydration layer where search/place results are
// embedded as JSON in a `data-component="SearchUserList" data-props="..."` attr.
// Parsing the JSON is dramatically more reliable than DOM scraping the SSR
// shell or waiting for hydration.

const ENTITY_MAP = {
  "&quot;": '"',
  "&amp;": "&",
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&apos;": "'",
};
function decodeEntities(s) {
  return s.replace(/&(?:quot|amp|#39|lt|gt|apos);/g, m => ENTITY_MAP[m] || m);
}

function extractDataProps(html, componentName) {
  const re = new RegExp(`data-component="${componentName}"[\\s\\S]{0,400000}?data-props="([^"]+)"`);
  const m = html.match(re);
  if (!m) return null;
  try { return JSON.parse(decodeEntities(m[1])); } catch { return null; }
}

const KNOWN_LIST_COMPONENTS = ["SearchUserList", "GroupMembers", "MemberList", "KinksterList", "UserList", "PlaceUserList"];

function findUserListProps(html) {
  for (const name of KNOWN_LIST_COMPONENTS) {
    const props = extractDataProps(html, name);
    if (props && (props.users || props.kinksters || props.results)) return { name, props };
  }
  const re = /data-component="([^"]+)"[\s\S]{0,400000}?data-props="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    let parsed;
    try { parsed = JSON.parse(decodeEntities(m[2])); } catch { continue; }
    const arr = parsed?.users || parsed?.kinksters || parsed?.results;
    if (Array.isArray(arr) && arr.length && arr[0]?.nickname) return { name: m[1], props: parsed };
  }
  return null;
}

function isLoggedIn(html) {
  if (/you need to be logged in|Welcome Home[\s\S]{0,300}Log In to FetLife/i.test(html)) return false;
  return /name="action-cable-url"|name="csrf-token"/i.test(html);
}

function getNextHref(html) {
  // Pagination wrapper: <div role="navigation" aria-label="Pagination"> ... <a rel="next" href="...">
  const m = html.match(/<a\s+[^>]*\brel="next"[^>]*\bhref="([^"]+)"/i)
        || html.match(/<a\s+[^>]*\bhref="([^"]+)"[^>]*\brel="next"/i)
        || html.match(/<a\s+[^>]*\baria-label="Next page"[^>]*\bhref="([^"]+)"/i);
  return m ? decodeEntities(m[1]) : null;
}

function getTotalCount(html) {
  // "Kinksters 1 - 20 of 2,012"
  const m = html.match(/of\s*([\d,]+)\s*&[lg]t;?\s*Perv|of\s*([\d,]+)<\/span>/i)
        || html.match(/\d+\s*-\s*\d+\s*of\s*([\d,]+)/);
  if (!m) return null;
  const num = m[1] || m[2];
  return num ? parseInt(num.replace(/,/g, ""), 10) : null;
}

export function parseSearchPage(html) {
  if (!isLoggedIn(html)) return { loggedIn: false, results: [], total: null, nextHref: null };
  const found = findUserListProps(html);
  if (!found) return { loggedIn: true, results: [], total: getTotalCount(html), nextHref: getNextHref(html), warning: "no user-list component found" };
  const data = found.props;
  const users = data.users || data.kinksters || data.results || [];
  const results = users.map(u => normalizeUser(u));
  return {
    loggedIn: true,
    componentName: found.name,
    results,
    total: getTotalCount(html),
    nextHref: getNextHref(html),
  };
}

export function normalizeUser(u) {
  const asr = parseASR(u.identity || "") || { age: null, sex: null, role: "" };
  const profileUrl = u.profileUrl?.startsWith("http") ? u.profileUrl
    : `https://fetlife.com${u.profileUrl || "/" + u.nickname}`;
  return {
    userId: u.id != null ? String(u.id) : null,
    nickname: u.nickname,
    profileUrl,
    avatarUrl: u.avatarUrl || u.avatarSmallUrl || null,
    avatarSmallUrl: u.avatarSmallUrl || null,
    age: asr.age,
    sex: asr.sex,
    sexRaw: asr.sexRaw,
    role: asr.role,
    identity: u.identity || "",
    asrText: u.identity || "",
    location: u.location || "",
    counts: {
      pics: u.picCount || 0,
      vids: u.vidCount || 0,
      writings: u.writingsCount || 0,
    },
    supporter: !!u.organization || !!u.showBadge,
    relation: u.currentUserRelation || null,
    links: u.links || {},
  };
}
