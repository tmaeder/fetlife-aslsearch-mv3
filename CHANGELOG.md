# Changelog

## v0.3.5

- **Filters collapse after a successful search**, replaced with a single pill that summarizes active criteria. Click to re-expand. Persists across reloads.
- Results auto-**scrollIntoView** as soon as the first matches arrive.
- **Deep filter auto-enables** when any deep-only field has a value. Removed the explicit "Enable deep filtering" checkbox — it was the cause of orientation / looking-for / fetishes filters silently doing nothing if the user forgot to tick it.
- **Avatar thumbnails now load**: FetLife's CDN rejects no-referrer requests, so `referrerPolicy="no-referrer"` was making every avatar fail. Removed from `<img>` tags; kept on click-through anchors.
- Side-panel-on-action-click is now set on **every SW startup**, not just `onInstalled`. Fixes the "icon does nothing" bug after Chrome evicts the service worker.
- Layout pass: dropped header title text and fetlife.com link; condensed the four drawer buttons to icons (★ ⏱ ⊝ 👁); moved the keyboard-shortcut hint behind a `?` toggle.
- Memo helper bug fix (`memoVersioned` returned `undefined.value` when both sides were undefined).

## v0.3.4 — denser layout

Internal layout pass; no behavior changes.

## v0.3.3 — minimalist UI

Single-accent palette, hairline dividers, quieter status banner, hover-revealed card actions.

## v0.3.2 — post-declutter

Removed dead code from earlier rewrites that data-props parsing made obsolete.

- **content/selectors.js**: dropped 13 unused exports (DOM-scraping helpers and pre-data-props profile getters). 220 → 42 lines. Kept `parseASR` (used by parser.js), `SEARCH_URL` / `PLACE_URL` / `GROUP_URL` builders, `isPlaceQuery` / `isGroupQuery` / `isProfilePage`.
- **search/search-page.js**: dropped `applyFilters` import (never called), `state.density` field + dead `#results-table` toggle.
- **storage/store.js**: dropped `prefs.density` (no readers) and the `telemetry` namespace (`record()` never called).
- **search/search-page.css**: dead `density-compact` rules.
- **popup/**: directory removed. The action click was switched to `chrome.sidePanel.open()` when v0.3.0 shipped; the popup HTML/CSS/JS were unreachable.
- **offscreen/**: directory removed. parser.js is regex-only (no `DOMParser`) so the SW can call `parseSearchPage()` directly. Dropped the `offscreen` permission from manifest.
- **tools/build.js**: added `_locales/` to the include list (was missing).

Tests: 61/61 still pass. Functional surface unchanged — every shipped feature still works.

## v0.3.1

- Group-restricted search via `/groups/{id}/members`. `data-component="GroupMembers"` exposes the same user schema as `SearchUserList`. Detected automatically; 👥 *Group* mode badge.
- 3 new tests (61 total).

## v0.3.0

- **Side panel UI** (replaces full-page tab). Card layout with avatar/identity/location/activity/stats/actions.
- **data-component JSON parsing** (`SearchUserList` for search, `UserProfile` for profiles, `GroupMembers` for groups). Dropped DOM scraping. Multi-component fallback parser.
- **Place URL search** (`/p/{country}/{city}`). Auto-detected via `📍 Place` badge.
- **Parallel throttled crawler** (concurrency=2) with HEAD login probe and per-page cache flush.
- **Profile diff watchers** (press `w` on a result). SW periodically re-fetches and notifies on bio/roles/activity changes.
- **Saved-search watchers** with Chrome notifications.
- **Compare panel** for 2–4 profiles (key `c` to select, side-by-side table).
- **Avatar duplicate detection** via FetLife CDN attachment ID (`↻N` badge with tooltip).
- **Pinned / seen / blocked / notes** lists with JSON import/export in Settings.
- **Per-search incognito** mode (no history/cache write).
- **Stable-key chip pickers** for orientation, role, looking-for (no more typing free text).
- **Filters**: account type, relationship status, profile-verified-only, distance (Nominatim).
- **Last-active sort** ("Just In The Bedroom" / "Active 2 days ago" → ms).
- **Top-fetishes summary** panel after deep filter.
- **Shareable filter URLs** via `location.hash`.
- **Drag-to-reorder** saved searches.
- **i18n scaffold** (`_locales/en/messages.json` + `__MSG_*__` in manifest).
- **Tooling**: `npm run build` produces a versioned zip; `npm run dev` watches; CI on push.
- **58 unit tests** (was 35).
