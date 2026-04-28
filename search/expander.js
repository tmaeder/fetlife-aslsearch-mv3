// Query expander: lightweight synonym table + intent extraction for chip auto-fill.

const SYNONYMS = {
  sub: ["sub", "submissive", "bottom"],
  dom: ["dom", "dominant", "domme"],
  switch: ["switch", "versatile"],
  rope: ["rope", "shibari", "kinbaku", "bondage"],
  daddy: ["daddy", "dad"],
  mommy: ["mommy", "mom"],
};

const ROLE_HINTS = {
  sub: /\b(submissive|sub|bottom)\b/i,
  dom: /\b(dom(?:me|inant)?|master|mistress|top)\b/i,
  switch: /\bswitch\b/i,
  bottom: /\bbottom\b/i,
  top: /\btop\b/i,
};

const SEX_HINTS = {
  M: /\b(male|man|men|guy|guys)\b/i,
  F: /\b(female|woman|women|girl|girls|lady)\b/i,
  T: /\b(trans|nonbinary|enby)\b/i,
};

export function expandQuery(q) {
  const tokens = q.trim().split(/\s+/);
  const expanded = new Set();
  for (const t of tokens) {
    const lc = t.toLowerCase();
    const syns = SYNONYMS[lc];
    if (syns) syns.forEach(s => expanded.add(s));
    else expanded.add(t);
  }
  return [...expanded].join(" ");
}

export function detectIntent(q) {
  const out = { sexes: new Set(), roles: new Set() };
  for (const [k, re] of Object.entries(SEX_HINTS)) if (re.test(q)) out.sexes.add(k);
  for (const [k, re] of Object.entries(ROLE_HINTS)) if (re.test(q)) out.roles.add(k);
  return { sexes: [...out.sexes], roles: [...out.roles] };
}
