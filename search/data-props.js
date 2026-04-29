// Shared helpers for extracting `data-component=... data-props="..."` JSON
// blobs from FetLife's SSR HTML. Used by parser.js (search/group/place lists)
// and profile-fetch.js (profile pages).

const ENTITY_MAP = { "&quot;": '"', "&amp;": "&", "&#39;": "'", "&lt;": "<", "&gt;": ">", "&apos;": "'" };

export function decodeEntities(s) {
  return s.replace(/&(?:quot|amp|#39|lt|gt|apos);/g, m => ENTITY_MAP[m] || m);
}

export function extractDataProps(html, componentName, maxLen = 500000) {
  const re = new RegExp(`data-component="${componentName}"[\\s\\S]{0,${maxLen}}?data-props="([^"]+)"`);
  const m = html.match(re);
  if (!m) return null;
  try { return JSON.parse(decodeEntities(m[1])); } catch { return null; }
}
