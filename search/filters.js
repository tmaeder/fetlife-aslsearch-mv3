// Client-side filter predicates applied to parsed result objects.

// Diacritic-fold: "Zürich" → "zurich", "São Paulo" → "sao paulo".
export function fold(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function buildPredicate(criteria) {
  const checks = [];

  if (criteria.ageMin != null) checks.push(r => r.age != null && r.age >= criteria.ageMin);
  if (criteria.ageMax != null) checks.push(r => r.age != null && r.age <= criteria.ageMax);

  if (criteria.sexes && criteria.sexes.length) {
    const set = new Set(criteria.sexes);
    checks.push(r => r.sex && set.has(r.sex));
  }

  if (criteria.roles && criteria.roles.length) {
    const lcRoles = criteria.roles.map(s => s.toLowerCase());
    checks.push(r => {
      if (!r.role) return false;
      const role = r.role.toLowerCase();
      return lcRoles.some(rr => role.includes(rr));
    });
  }

  // Location filtering — three modes (any combination, OR-of-modes within location):
  // 1. locationsAny: array of substrings (diacritic-insensitive contains, any-of)
  // 2. locationRegex: literal regex string (advanced)
  // 3. locationSubstring: free-text contains (diacritic-insensitive)
  const locModes = [];
  if (Array.isArray(criteria.locationsAny) && criteria.locationsAny.length) {
    const folded = criteria.locationsAny.map(fold).filter(Boolean);
    locModes.push(loc => folded.some(needle => loc.includes(needle)));
  }
  if (criteria.locationRegex) {
    let re; try { re = new RegExp(criteria.locationRegex, "i"); } catch { re = null; }
    if (re) locModes.push(loc => re.test(loc));
  }
  if (criteria.locationSubstring) {
    const needle = fold(criteria.locationSubstring);
    if (needle) locModes.push(loc => loc.includes(needle));
  }
  if (locModes.length) {
    checks.push(r => {
      if (!r.location) return false;
      const f = fold(r.location);
      return locModes.some(fn => fn(f));
    });
  }

  if (criteria.nicknameRegex) {
    let re;
    try { re = new RegExp(criteria.nicknameRegex, "i"); } catch { re = null; }
    if (re) checks.push(r => re.test(r.nickname));
  }

  if (criteria.hasPics) checks.push(r => (r.counts?.pics ?? 0) > 0);
  if (criteria.hasVids) checks.push(r => (r.counts?.vids ?? 0) > 0);
  if (criteria.minPics != null) checks.push(r => (r.counts?.pics ?? 0) >= criteria.minPics);
  if (criteria.minVids != null) checks.push(r => (r.counts?.vids ?? 0) >= criteria.minVids);

  if (criteria.supporter === true) checks.push(r => r.supporter === true);
  if (criteria.supporter === false) checks.push(r => r.supporter === false);

  return r => checks.every(c => c(r));
}

export function applyFilters(results, criteria) {
  const pred = buildPredicate(criteria);
  return results.filter(pred);
}
