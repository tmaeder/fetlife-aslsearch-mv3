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

// Group-members URL: /groups/{id}/members[?page=N]
export function GROUP_URL(input, page = 1) {
  let path;
  if (/^https?:\/\//.test(input)) {
    try { path = new URL(input).pathname; } catch { path = input; }
  } else if (input.startsWith("/")) path = input;
  else if (/^groups\//.test(input)) path = "/" + input;
  else path = "/groups/" + input;
  if (!/\/members\/?$/.test(path)) path = path.replace(/\/?$/, "/members");
  const sep = path.includes("?") ? "&" : "?";
  return `https://fetlife.com${path}${page > 1 ? `${sep}page=${page}` : ""}`;
}

export function isGroupQuery(s) {
  return typeof s === "string" && (/^https?:\/\/fetlife\.com\/groups\//.test(s) || /^\/groups\//.test(s) || /^groups\/\d+/.test(s));
}

// Parse age, sex, role from composite string like "29M sub", "31M Dom-leaning Switch",
// "47Man Switch", "29F sub", "70M Bottom", "44M Exploring".
// Used by parser.js to normalize the `identity` field of SearchUserList JSON.
export function parseASR(text) {
  if (!text) return null;
  const m = text.trim().match(/^(\d{1,3})\s*([A-Za-z]+?)(?:\s+(.+))?$/);
  if (!m) return null;
  const age = parseInt(m[1], 10);
  const sex = m[2];
  const role = (m[3] || "").trim();
  const sexMap = { M: "M", F: "F", Man: "M", Woman: "F", Trans: "T", FtM: "FtM", MtF: "MtF" };
  return { age, sex: sexMap[sex] || sex, sexRaw: sex, role };
}

export function isProfilePage(url) {
  const u = new URL(url);
  if (u.hostname !== 'fetlife.com') return false;
  // /{nickname} with no further sub-path
  return /^\/[A-Za-z0-9_.\-]+\/?$/.test(u.pathname) && !/^\/(home|inbox|search|explore|groups|events|p|fetishes|writings|kinktionary|notifications|requests|languages|help|bookmarks|settings|support|legal|conversations|accounts|pictures|videos|posts|login|logout|signup)\/?$/.test(u.pathname);
}
