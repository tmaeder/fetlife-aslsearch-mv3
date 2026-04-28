// Single-file FetLife DOM contract. Update here when FetLife changes layout.
// Verified live 2026-04-28.

export const SEARCH_URL = (q, page = 1) =>
  `https://fetlife.com/search/kinksters?q=${encodeURIComponent(q)}${page > 1 ? `&page=${page}` : ""}`;

// Place-based directory: /p/{country-slug}/{city-slug}/kinksters
// Accepts either a full URL, a path, or a "country/city" pair.
export function PLACE_URL(input, page = 1) {
  let path;
  if (/^https?:\/\//.test(input)) {
    try { path = new URL(input).pathname; } catch { path = input; }
  } else if (input.startsWith("/")) path = input;
  else if (input.startsWith("p/")) path = "/" + input;
  else path = "/p/" + input;
  // Ensure path ends with /kinksters
  if (!/\/kinksters\/?$/.test(path)) path = path.replace(/\/?$/, "/kinksters");
  const sep = path.includes("?") ? "&" : "?";
  return `https://fetlife.com${path}${page > 1 ? `${sep}page=${page}` : ""}`;
}

export function isPlaceQuery(s) {
  return typeof s === "string" && (/^https?:\/\/fetlife\.com\/p\//.test(s) || /^\/p\//.test(s) || /^p\//.test(s));
}

export function isLoggedIn(doc) {
  // FetLife is now an SSR'd app where logged-out responses inject a red banner
  // "you need to be logged in" plus the "Welcome Home / Log In to FetLife" form.
  // Logged-in raw HTML omits both. Inbox/profile links exist in nav too.
  const html = doc.documentElement?.outerHTML || "";
  if (/you need to be logged in|Welcome Home[\s\S]{0,300}Log In to FetLife/i.test(html)) return false;
  if (doc.querySelector('a[href="/inbox"], a[href$="/home"], meta[name="action-cable-url"]')) return true;
  // Last resort: presence of csrf-token meta + absence of login-form indicators
  return !!doc.querySelector('meta[name="csrf-token"]') && !/Log In to FetLife/i.test(html);
}

const RESERVED_SLUGS = /^\/(home|inbox|search|explore|groups|events|p|fetishes|writings|kinktionary|notifications|requests|languages|help|bookmarks|settings|support|legal|conversations|accounts|users|pictures|videos|posts|kinksters|login|logout|signup)$/;
const SLUG_RE = /^\/[A-Za-z0-9_.\-]+$/;

export function getResultCards(doc) {
  // Verified live 2026-04-28: cards are <div class="rounded-sm bg-gray-900 cursor-pointer ...">
  // each containing a slug-anchor, ASR span, location div, count anchors.
  const cards = [...doc.querySelectorAll("div.cursor-pointer")].filter(el =>
    [...el.querySelectorAll("a[href]")].some(a => {
      const h = a.getAttribute("href") || "";
      return SLUG_RE.test(h) && !RESERVED_SLUGS.test(h);
    })
  );
  const out = [];
  const seen = new Set();
  for (const el of cards) {
    const slug = getCardNickname(el);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, el });
  }
  if (out.length) return out;

  // Fallback: walk up from each slug anchor until we find a container with a count link
  const anchors = [...doc.querySelectorAll("main a[href]")].filter(a => {
    const h = a.getAttribute("href") || "";
    return SLUG_RE.test(h) && !RESERVED_SLUGS.test(h);
  });
  for (const a of anchors) {
    const slug = a.getAttribute("href").slice(1);
    if (seen.has(slug)) continue;
    let n = a.parentElement;
    while (n && n !== doc.body && !n.querySelector(`a[href^="/${slug}/pictures"], a[href^="/${slug}/videos"], a[href^="/${slug}/posts"]`)) {
      n = n.parentElement;
    }
    if (n && n !== doc.body) { seen.add(slug); out.push({ slug, el: n }); }
  }
  return out;
}

// Parse age, sex, role from composite string like "29M sub", "31M Dom-leaning Switch",
// "47Man Switch", "29F sub", "70M Bottom", "44M Exploring".
export function parseASR(text) {
  if (!text) return null;
  const m = text.trim().match(/^(\d{1,3})\s*([A-Za-z]+?)(?:\s+(.+))?$/);
  if (!m) return null;
  const age = parseInt(m[1], 10);
  let sex = m[2];
  let role = (m[3] || "").trim();
  // Normalize: "Man"/"Woman" sometimes appear instead of M/F. Common tokens:
  const sexMap = { M: "M", F: "F", Man: "M", Woman: "F", Trans: "T", FtM: "FtM", MtF: "MtF" };
  const normalizedSex = sexMap[sex] || sex;
  return { age, sex: normalizedSex, sexRaw: sex, role };
}

export function getCardNickname(cardEl) {
  const anchors = [...cardEl.querySelectorAll('a[href]')];
  for (const a of anchors) {
    const h = a.getAttribute('href') || "";
    if (SLUG_RE.test(h) && !RESERVED_SLUGS.test(h)) return h.slice(1);
  }
  return null;
}

const ASR_RE = /^(\d{1,3})\s*([A-Za-z]+)(?:\s+(.+))?$/;
const COUNT_RE = /^\d+\s+(Pic|Vid|Writing)s?$/i;

export function getCardASRText(cardEl) {
  const leaves = cardEl.querySelectorAll("*");
  for (const el of leaves) {
    if (el.children.length !== 0) continue;
    const t = (el.textContent || "").trim();
    if (ASR_RE.test(t)) return t;
  }
  return null;
}

export function getCardLocation(cardEl, slug) {
  const leaves = [...cardEl.querySelectorAll("*")].filter(el => el.children.length === 0);
  for (const el of leaves) {
    const t = (el.textContent || "").trim();
    if (!t) continue;
    if (ASR_RE.test(t)) continue;
    if (COUNT_RE.test(t)) continue;
    if (/^(Follow|Following|Unfollow|Add as Friend|FetLife Supporter)/i.test(t)) continue;
    if (slug && (t === slug || /^Unfollow\s+/i.test(t))) continue;
    if (t.length < 2) continue;
    return t;
  }
  return null;
}

export function getCardCounts(cardEl, slug) {
  const counts = { pics: 0, vids: 0, writings: 0 };
  const parse = (sel) => {
    const a = cardEl.querySelector(sel);
    if (!a) return 0;
    const m = (a.textContent || "").match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  };
  counts.pics = parse(`a[href^="/${slug}/pictures"]`);
  counts.vids = parse(`a[href^="/${slug}/videos"]`);
  counts.writings = parse(`a[href^="/${slug}/posts"]`);
  return counts;
}

export function isSupporter(cardEl) {
  return !!cardEl.querySelector('a[href*="/support?cta="]');
}

export function getCardAvatarUrl(cardEl) {
  const img = cardEl.querySelector('img');
  return img ? img.getAttribute('src') : null;
}

export function getNextPageHref(doc) {
  const next = doc.querySelector(
    'a[rel="next"], a[aria-label="Next page"], [role="navigation"][aria-label="Pagination"] a[rel="next"]'
  );
  if (next) return next.getAttribute('href');
  // Fallback: highest page number among numeric pagination links
  const candidates = [...doc.querySelectorAll('a[href*="page="]')];
  const m = candidates
    .map(a => parseInt((a.getAttribute('href') || '').match(/[?&]page=(\d+)/)?.[1] || '0', 10))
    .filter(Boolean);
  return null;
}

export function parseTotalCount(doc) {
  // Banner like "1 - 20 of 58,241"
  const heading = [...doc.querySelectorAll('main *')].find(el =>
    /\b\d+\s*-\s*\d+\s*of\s*[\d,]+/.test((el.textContent || "").trim())
  );
  if (!heading) return null;
  const m = heading.textContent.match(/of\s*([\d,]+)/);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
}

// Profile page selectors (for /{nickname})
export function getProfileUserId(doc) {
  // /conversations/new?with=NNN or gift_to=NNN
  const a = doc.querySelector('a[href*="conversations/new?with="]') || doc.querySelector('a[href*="gift_to="]');
  if (!a) return null;
  const href = a.getAttribute('href');
  const m = href.match(/(?:with|gift_to)=(\d+)/);
  return m ? m[1] : null;
}

export function getProfileNickname(doc) {
  const path = doc.location ? doc.location.pathname : null;
  if (path) {
    const m = path.match(/^\/([A-Za-z0-9_.\-]+)\/?$/);
    if (m) return m[1];
  }
  return null;
}

export function getProfileAvatar(doc) {
  const a = doc.querySelector('a[href$="/pictures"] img');
  return a ? a.getAttribute('src') : null;
}

export function isProfilePage(url) {
  const u = new URL(url);
  if (u.hostname !== 'fetlife.com') return false;
  // /{nickname} with no further sub-path
  return /^\/[A-Za-z0-9_.\-]+\/?$/.test(u.pathname) && !/^\/(home|inbox|search|explore|groups|events|p|fetishes|writings|kinktionary|notifications|requests|languages|help|bookmarks|settings|support|legal|conversations|accounts|pictures|videos|posts|login|logout|signup)\/?$/.test(u.pathname);
}
