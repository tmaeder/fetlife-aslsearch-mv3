// Deep profile fetcher.
// Profile pages embed structured JSON in
//   <... data-component="UserProfile" data-props="...">
// containing { dataCore, dataCurrentUserRelation, dataCommunityLists }.

import { extractDataProps } from "./data-props.js";

const TTL_MS = 24 * 60 * 60 * 1000;
const PROFILE_CACHE_MAX = 500;
const profileCache = new Map();

export async function fetchProfile(nickname, signal) {
  const cached = profileCache.get(nickname);
  if (cached && Date.now() - cached.ts < TTL_MS) {
    profileCache.delete(nickname);
    profileCache.set(nickname, cached);
    return cached.data;
  }
  const url = `https://fetlife.com/${encodeURIComponent(nickname)}`;
  let html;
  try {
    const r = await chrome.runtime.sendMessage({ type: "fl:fetch", url });
    if (!r?.ok || r.status !== 200) throw new Error(`profile ${nickname}: HTTP ${r?.status || 0}`);
    html = r.html;
  } catch {
    const res = await fetch(url, { credentials: "include", signal });
    if (!res.ok) throw new Error(`profile ${nickname}: HTTP ${res.status}`);
    html = await res.text();
  }
  const data = parseProfile(html, nickname);
  if (profileCache.size >= PROFILE_CACHE_MAX) {
    const oldestKey = profileCache.keys().next().value;
    if (oldestKey) profileCache.delete(oldestKey);
  }
  profileCache.set(nickname, { ts: Date.now(), data });
  return data;
}

export function parseProfile(html, nickname) {
  const props = extractDataProps(html, "UserProfile");
  if (!props?.dataCore) {
    return {
      nickname,
      _warning: "no UserProfile component",
      bio: "", roles: [], roleKeys: [],
      orientation: [], orientationKeys: [],
      genders: [], genderKeys: [],
      pronouns: [], pronounKeys: [],
      lookingFor: [], notLookingFor: [],
      fetishes: { all: [], into: [], curious: [] },
      friendsCount: null, isSupporter: false, isProfileVerified: false, activity: "",
    };
  }
  const dc = props.dataCore;
  const rel = props.dataCurrentUserRelation || {};
  return {
    nickname: dc.nickname || nickname,
    userId: dc.userId != null ? String(dc.userId) : null,
    accountType: dc.accountType || null,
    isSupporter: !!dc.isSupporter,
    isLifetimeSupporter: !!dc.isLifetimeSupporter,
    isProfileVerified: !!dc.isProfileVerified,
    isEmployee: !!dc.isEmployee,
    showBadge: !!dc.showBadge,
    avatarUrl: dc.avatarUrl || null,
    avatarSmallUrl: dc.smallAvatarUrl || null,
    identity: dc.identity || "",
    activity: dc.activity || "",
    joinDate: dc.joinDate || null,
    websites: dc.websites || [],
    bio: stripHtml(dc.aboutHtml || dc.aboutPreviewHtml || ""),
    bioHtml: dc.aboutHtml || dc.aboutPreviewHtml || "",
    pronouns: (dc.pronouns || []).map(p => p.name),
    pronounKeys: (dc.pronouns || []).map(p => p.key),
    roles: (dc.roles || []).map(r => r.name),
    roleKeys: (dc.roles || []).map(r => r.key),
    orientation: (dc.orientations || []).map(o => o.name),
    orientationKeys: (dc.orientations || []).map(o => o.key),
    genders: (dc.genders || []).map(g => g.name),
    genderKeys: (dc.genders || []).map(g => g.key),
    lookingFor: dc.isLookingFor || [],
    notLookingFor: dc.isNotLookingFor || [],
    relationships: dc.relationships || [],
    dsRelationships: dc.dsRelationships || [],
    fetishes: extractFetishesFromHtml(html),
    currentUserRelation: {
      isFollowing: !!rel.isFollowing,
      isFriend: !!rel.isFriend,
      isMuted: !!rel.isMuted,
      isBlocked: !!rel.isBlocked,
    },
    friendsCount: parseCountBefore(html, "Friends"),
    followersCount: parseCountBefore(html, "Followers"),
    followingCount: parseCountBefore(html, "Following"),
  };
}

function stripHtml(s) {
  return (s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseCountBefore(html, label) {
  const re = new RegExp("(\\d[\\d,]*)\\s+" + label, "i");
  const m = html.match(re);
  return m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
}

function extractFetishesFromHtml(html) {
  const all = new Set();
  const into = new Set();
  const curious = new Set();
  const re = /<a[^>]*href="\/fetishes\/(\d+)"[^>]*>([^<]+)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const name = m[2].replace(/\s*\(everything to do with it\)\s*$/i, "").trim();
    if (!name || /^Fetishes$/i.test(name)) continue;
    all.add(name);
  }
  const intoIdx = html.search(/>Into</i);
  const curiousIdx = html.search(/>Curious</i);
  if (intoIdx >= 0 || curiousIdx >= 0) {
    const re2 = /<a[^>]*href="\/fetishes\/\d+"[^>]*>([^<]+)<\/a>/g;
    let m2;
    while ((m2 = re2.exec(html))) {
      const at = m2.index;
      const name = m2[1].replace(/\s*\(everything to do with it\)\s*$/i, "").trim();
      if (!name || /^Fetishes$/i.test(name)) continue;
      const lastInto = intoIdx >= 0 && at > intoIdx ? intoIdx : -1;
      const lastCur = curiousIdx >= 0 && at > curiousIdx ? curiousIdx : -1;
      if (lastCur > lastInto) curious.add(name);
      else if (lastInto > 0) into.add(name);
    }
  }
  return { all: [...all], into: [...into], curious: [...curious] };
}

export function buildDeepPredicate(d) {
  const checks = [];
  if (d.bioRegex) {
    let re; try { re = new RegExp(d.bioRegex, "i"); } catch {}
    if (re) checks.push(p => p.bio && re.test(p.bio));
  }
  if (d.fetishesAny?.length) {
    const lc = d.fetishesAny.map(s => s.toLowerCase());
    checks.push(p => p.fetishes?.all?.some(f => lc.some(needle => f.toLowerCase().includes(needle))));
  }
  if (d.orientationAny?.length) {
    const lc = d.orientationAny.map(s => s.toLowerCase());
    checks.push(p => (p.orientation || []).some(o => lc.some(needle => o.toLowerCase().includes(needle)))
                  || (p.orientationKeys || []).some(k => lc.includes(String(k).toLowerCase())));
  }
  if (d.lookingForAny?.length) {
    const lc = d.lookingForAny.map(s => s.toLowerCase());
    checks.push(p => (p.lookingFor || []).some(l => lc.some(needle => String(l).toLowerCase().includes(needle))));
  }
  if (d.minFriends != null) checks.push(p => (p.friendsCount ?? 0) >= d.minFriends);
  if (d.verifiedOnly) checks.push(p => p.isProfileVerified === true);
  if (d.supporterOnly) checks.push(p => p.isSupporter === true);
  if (d.accountType) checks.push(p => (p.accountType || "").toLowerCase() === d.accountType.toLowerCase());
  if (d.relationshipStatus === "single") checks.push(p => !p.relationships?.length && !p.dsRelationships?.length);
  if (d.relationshipStatus === "partnered") checks.push(p => (p.relationships?.length || 0) + (p.dsRelationships?.length || 0) > 0);
  return p => checks.every(fn => fn(p));
}
