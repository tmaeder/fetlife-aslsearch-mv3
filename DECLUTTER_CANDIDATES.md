# Declutter Candidates

All evidence-backed. Grouped by risk.

## Group A — Dead code (zero callers)

| Candidate | File | Evidence | Action |
|---|---|---|---|
| `applyFilters` import | `search/search-page.js:18` | imported, never called in file (only used in `test/filters.test.js`) | remove import |
| `state.density` + `state.density = p.density` + classList target | `search/search-page.js` | targets `#results-table` which no longer exists in HTML; toggle has no effect | remove state field + assignment + dead toggle |
| Dead density CSS rules | `search/search-page.css` | `.density-compact th/td` rules apply to a `<table>` removed in the cards rewrite | remove rules |
| `isLoggedIn` (exported) | `content/selectors.js:43` | parser.js has its own local `isLoggedIn`. Exported version: 0 importers | remove export |
| `getResultCards` | `content/selectors.js:57` | DOM scraping helper, replaced by `data-component` JSON parsing. 0 importers | remove |
| `getCardNickname` | `content/selectors.js:108` | as above | remove |
| `getCardASRText` | `content/selectors.js:120` | as above | remove |
| `getCardLocation` | `content/selectors.js:130` | as above | remove |
| `getCardCounts` | `content/selectors.js:145` | as above | remove |
| `isSupporter` (exported) | `content/selectors.js:159` | DOM helper; profile-fetch's `isSupporter` is a different thing (a field). 0 importers of the export | remove |
| `getCardAvatarUrl` | `content/selectors.js:163` | as above | remove |
| `getNextPageHref` | `content/selectors.js:168` | parser.js has its own regex-based getNextHref. 0 importers of selectors version | remove |
| `parseTotalCount` | `content/selectors.js:181` | parser.js has its own regex `getTotalCount`. 0 importers | remove |
| `getProfileUserId` | `content/selectors.js:192` | profile-fetch parses userId from `dataCore.userId` | remove |
| `getProfileNickname` | `content/selectors.js:201` | same — from `dataCore.nickname` | remove |
| `getProfileAvatar` | `content/selectors.js:210` | same — from `dataCore.avatarUrl` | remove |
| `RESERVED_SLUGS` const | `content/selectors.js:55` | used only by `getResultCards` (also dead) | remove |
| `SLUG_RE` const | `content/selectors.js:56` | used only by removed DOM helpers | remove |
| `popup/popup.html`, `popup.css`, `popup.js` | `popup/` | manifest no longer references `default_popup`; action click opens side panel via SW | remove dir |

## Group B — Unused capability (kept "in case")

| Candidate | File | Evidence | Action |
|---|---|---|---|
| Offscreen document path | `background/service_worker.js:213-242` + `offscreen/` | SW's `parseInOffscreen` was needed when parser used DOMParser. parser.js is now regex-only — no DOMParser, no offscreen needed. SW can call `parseSearchPage(html)` directly. | inline + remove offscreen/ + drop "offscreen" permission |
| `state.density`, `prefs.density` storage | various | only effect was on a removed table; cards have no density variant | remove from storage layer + form |
| `telemetry` storage namespace | `storage/store.js:172` | `record()` never called from anywhere. Stub. | remove |
| `getCardLocation` selector params (now-removed function) | — | covered above | — |

## Group C — Documentation clutter

| Candidate | File | Evidence | Action |
|---|---|---|---|
| Comments referencing "DOM scraping" / "card text node" | `content/selectors.js`, `search/parser.js` | obsolete after JSON migration | rewrite comment headers |
| Outdated paragraph in PLAN.md | `PLAN.md` | doc still claims items as L/deferred even though some shipped | append "shipped" markers (or just leave — it's the original plan, intentional history) |

## Group D — Keep but flag

| Candidate | Reason |
|---|---|
| `applyFilters` (function in filters.js) | useful utility; tests cover it; even if unused in app today, keeping costs nothing |
| `vocab.js` ROLES with 30+ entries | overkill for current pickers, but stable so harmless |
| `expander.js` SYNONYMS / hint regexes | actively used; keep |
| `_locales/en/messages.json` keys not yet wired into HTML | scaffold for future i18n; intentional |

## Plan

Three batches, ordered low→high risk:
1. **Batch 1** — drop dead exports/functions in `content/selectors.js`, dead import in `search-page.js`, dead density code.
2. **Batch 2** — remove `popup/` directory.
3. **Batch 3** — remove offscreen path: inline `parseSearchPage` in SW, delete `offscreen/`, drop `offscreen` permission from manifest, remove dead telemetry namespace.

Each batch: tests must stay 61/61, `node --check` clean.
