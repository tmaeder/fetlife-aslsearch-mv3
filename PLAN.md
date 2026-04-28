# FetLife ASL Search — improvement plan

30 items grouped by sprint. Each: scope, files, dependencies, effort (S/M/L), risk, acceptance.

---

## Sprint 1 — Profile-data wins (lean on the new `dataCore` JSON)

### 1. Stable-key filter dropdowns
- **Why:** users currently type free text into orientation/looking-for; data has stable keys (`switch_dom`, `lifetime_relationship`, etc.). Replace text inputs with multi-select chips populated from a maintained vocabulary.
- **Files:** `search/search-page.html`, `search/search-page.js`, new `search/vocab.js` (static maps key→displayName).
- **Effort:** S
- **Risk:** vocabulary drift if FetLife adds new keys → fall back to free-text input alongside.
- **Accept:** Role / Orientation / Gender / Looking-for show chip pickers; deep-filter matches by key.

### 2. Verified / supporter badges on result cards
- **Why:** profile JSON has `isProfileVerified`, `isSupporter`. After deep-filter pass, surface visually.
- **Files:** `search/search-page.js` (buildCard).
- **Depends:** existing deep-filter (#1 done).
- **Effort:** S
- **Accept:** verified profile shows ✓; supporter shows ★. Tooltip explains.

### 3. Account-type filter
- **Why:** `accountType` ∈ {free, supporter, employee, greeter_alumni, …}. Add to deep-filter.
- **Files:** `search/profile-fetch.js`, `search/search-page.{html,js}`.
- **Depends:** #1 vocab map.
- **Effort:** S
- **Accept:** dropdown filters by accountType.

### 4. Relationship-status filter
- **Why:** `dataCore.relationships[]` exposes single/partnered/poly.
- **Files:** `search/profile-fetch.js`, deep-filter UI.
- **Effort:** S
- **Risk:** schema unverified — must inspect 5 sample profiles to confirm shape.
- **Accept:** "Single only" / "Partnered only" toggles in deep-filter.

### 5. Last-active parse + sort
- **Why:** `dataCore.activity` = "Just In The Bedroom" / "Active 2 days ago". Parse into a relative timestamp.
- **Files:** new `search/activity-parse.js` + tests; sort column added.
- **Effort:** M (string parsing, locale variants).
- **Accept:** sort by last-active descending; "≤ 7d" filter chip.

---

## Sprint 2 — Search UX

### 6. Live-search-as-you-type
- **Why:** 600ms debounced auto-run feels alive.
- **Files:** `search/search-page.js`.
- **Risk:** burns FetLife requests. Gate behind a toggle, off by default.
- **Effort:** S
- **Accept:** typing pauses → search runs automatically; cancels in-flight.

### 7. Result virtualization
- **Why:** re-render all cards on every chip toggle is O(N). 200+ rows → jank.
- **Files:** `search/search-page.js` (renderTable → virtual scroll via IntersectionObserver).
- **Effort:** M
- **Accept:** 1000-card render is <50ms paint; chip toggle <16ms.

### 8. Pinned results
- **Why:** star a card to keep on top across re-filters.
- **Files:** new key in `storage/store.js` (pinned), card-action button, sort logic.
- **Effort:** S
- **Accept:** pinning persists across reloads; pinned always visible regardless of filters.

### 9. Compare panel
- **Why:** select 2–4 profiles, side-by-side bio/roles/orientation diff.
- **Files:** new `search/compare-panel.js`, drawer panel, card checkbox.
- **Depends:** profile-fetch output (already structured).
- **Effort:** M
- **Accept:** ≥2 cards selected → "Compare" button → drawer shows table.

### 10. Shareable filter URL
- **Why:** encode form state in URL hash for "send this search".
- **Files:** `search/search-page.js` — hash sync on form change + on init read.
- **Effort:** S
- **Accept:** changing filters updates `location.hash`; loading URL with hash applies filters.

### 11. Recent-searches with chip preview
- **Why:** current list shows query text only. Show active chips too.
- **Files:** `search/search-page.js` (renderRecentSearches).
- **Effort:** S

### 12. Drag-to-reorder saved searches
- **Why:** small touch; FetLife already uses Sortable.js.
- **Files:** drawer renderSaved; vendor Sortable.js minified (~30KB).
- **Effort:** S
- **Risk:** adds bundle size — skip if you care.

---

## Sprint 3 — Performance & reliability

### 13. Parallel page crawl (concurrency 2)
- **Why:** ~2× wall-clock speed.
- **Files:** `search/crawler.js` — replace serial loop with throttled queue.
- **Risk:** FetLife may rate-limit. Test carefully; add backoff.
- **Effort:** M
- **Accept:** 10-page crawl finishes in ~half the previous time; no 429s.

### 14. Persist results per-page in cache
- **Why:** if user closes panel mid-crawl, they get partial results on reopen.
- **Files:** `storage/store.js` (cache.set per page); `search/crawler.js` writes after each page.
- **Effort:** S
- **Accept:** kill panel mid-crawl → reopen → resume banner offers replay of cached pages.

### 15. Multi-component fallback parser
- **Why:** if FetLife renames `SearchUserList`, search breaks. Try multiple component names.
- **Files:** `search/parser.js`.
- **Effort:** S
- **Accept:** parser searches `SearchUserList`, then any `data-component` whose props contain a `users` array.

### 16. "Search within my groups"
- **Why:** `/sidebar/groups` returns user's groups. Add a group-restricted search using `/groups/{id}/members`.
- **Files:** `search/crawler.js` (new path), HTML group picker.
- **Risk:** different DOM/JSON schema per group page — needs verification.
- **Effort:** L
- **Accept:** "My groups" picker → search returns only members of selected groups.

### 17. WebSocket cable for live watcher events
- **Why:** `action-cable-url` enables real-time. Replace polling with cable.
- **Files:** new `search/cable.js`, SW alarm replaced with subscription.
- **Risk:** unknown channel API — needs reverse engineering.
- **Effort:** L
- **Accept:** new matches notify within seconds, not minutes.

### 18. HEAD-only login probe
- **Why:** GET /home is 25KB. HEAD enough.
- **Files:** `search/crawler.js` `probeLogin`.
- **Risk:** FetLife may not respect HEAD properly — fall back.
- **Effort:** S
- **Accept:** login probe transfer ≤ 1KB.

---

## Sprint 4 — Privacy & safety

### 19. Avatar perceptual-hash dedupe
- **Why:** detect when same avatar appears under multiple nicks (sock puppets / scraping).
- **Files:** new `search/phash.js` (8×8 average-hash via canvas), card badge "↻ duplicate".
- **Effort:** M
- **Risk:** hash on canvas requires loading image cross-origin → must use `crossOrigin=anonymous` and accept CORS failures.
- **Accept:** profiles with avatars within Hamming distance ≤ 5 grouped; flagged in UI.

### 20. Block-list import/export
- **Why:** community-shared blocklists.
- **Files:** new options panel buttons; chrome.storage.local roundtrip.
- **Effort:** S
- **Accept:** export → JSON file; import merges into local blocked list.

### 21. Direct-connection warning banner
- **Why:** opsec hint when not on Tor/VPN.
- **Files:** new content-script-side check (heuristic via WebRTC IP).
- **Risk:** browser fingerprinting concerns; opt-in only.
- **Effort:** M (heuristic accuracy is murky).

### 22. Per-search incognito mode
- **Why:** don't write to history/cache for sensitive queries.
- **Files:** `search/search-page.js` toggle; bypass `cache.set` and `history.push`.
- **Effort:** S
- **Accept:** toggle on → search runs but leaves no trace in storage.

---

## Sprint 5 — Discovery features

### 23. Top-fetishes summary post-search
- **Why:** after a deep-filter search, show the 10 most common fetishes among matches.
- **Files:** `search/search-page.js` (render summary panel).
- **Depends:** deep-filter must be enabled.
- **Effort:** S

### 24. Connected-people graph
- **Why:** fetch `/{nick}/friends` for each top-N, find mutual connections.
- **Files:** new `search/social-graph.js`, drawer panel.
- **Effort:** L
- **Risk:** N×friends-pages = many requests. Throttle aggressively.
- **Accept:** for any 10 selected profiles, show shared friends count.

### 25. Event cross-reference
- **Why:** `/events/near` lists upcoming events with attendees. Cross-reference current matches.
- **Files:** new `search/events.js`.
- **Effort:** L (events JSON shape unverified).
- **Accept:** "Going to events with [N] of these matches" badge.

### 26. Profile diff watcher
- **Why:** alert when a watched profile changes bio/roles/looking-for.
- **Files:** SW snapshots full profile JSON; diff on next refresh; notification.
- **Effort:** M
- **Accept:** watcher fires on change to bio / roles / lookingFor / activity.

---

## Sprint 6 — Tooling & release

### 27. Dev hot-reload
- **Why:** manual reload on every change is slow.
- **Files:** new `dev/watch.js` Node script + dev-only message handler.
- **Effort:** S
- **Accept:** save a file → SW reloads automatically.

### 28. Build script + lintable .zip
- **Files:** `package.json` add `web-ext lint`, `web-ext build`.
- **Effort:** S
- **Accept:** `npm run release` produces `dist/fetlife-aslsearch-vX.zip`.

### 29. CI workflow
- **Files:** `.github/workflows/test.yml` running `npm test` on push.
- **Effort:** S
- **Accept:** PR fails if any test breaks.

### 30. i18n scaffold
- **Files:** `_locales/en/messages.json`, replace strings in HTML/JS with `chrome.i18n.getMessage`.
- **Effort:** M (every visible string).
- **Accept:** German UI possible by adding `_locales/de/messages.json`.

---

## Effort summary

| Effort | Items |
|---|---|
| S (≤2h) | 1, 2, 3, 4, 6, 8, 10, 11, 12, 14, 15, 18, 20, 22, 23, 27, 28, 29 |
| M (~half day) | 5, 7, 9, 13, 19, 21, 26, 30 |
| L (1+ day) | 16, 17, 24, 25 |

**S total:** 18 × ~2h = ~36h
**M total:** 8 × ~4h = ~32h
**L total:** 4 × ~10h = ~40h
**Grand:** ~108h / ~2.5 weeks of focused work

## Sequencing constraints

- Sprint 1 unlocks Sprint 5 (deep-filter data feeds discovery).
- Sprint 3.13 (parallel) must come before Sprint 5 to keep crawls tolerable.
- Sprint 6 (tooling) can run in parallel with anything; don't block features on it.

## Deferred / risky

- **17, 24, 25** — schemas unverified. Spike with 1h investigation each before committing.
- **21** — opsec is socially complex; ship only with clear copy & opt-in.
- **12** — bundle size cost; reconsider if footprint matters.

## Acceptance criteria for "all done"

- All 30 items marked done in a checklist
- Tests still pass; new features have ≥1 test each
- README updated with new feature list
- `web-ext lint` clean
- One full e2e smoke (search → place → deep-filter → save → watch → notification fires)
