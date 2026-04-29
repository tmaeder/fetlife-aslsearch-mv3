# FetLife Search (MV3) — v0.3.0

Modern Chrome extension successor to [fabacab/fetlife-search](https://github.com/fabacab/fetlife-search). Side-panel ASL filtering, deep-profile filters, place-based search, distance filtering, saved/scheduled watchers with notifications, profile diff watchers, compare panel, avatar duplicate detection, shareable filter URLs, and profile-page tools (TinEye / Google Lens / DDG / Reddit / FabSwingers / PAT-FetLife abuse warnings).

No external server, no Google Apps Script, no jQuery. Self-contained.

## Install (unpacked)

1. Clone or download this directory.
2. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick the folder.
3. Pin the icon. Sign in to fetlife.com in the same browser.

## Use

- Click the toolbar icon (or `⌘⇧K` / `Ctrl+Shift+K`) — the **side panel** opens.
- Type a free-text query, **or paste a place URL** like `https://fetlife.com/p/switzerland/zurich` (auto-detected; a 📍 *Place* badge appears).
- Toggle **Sex** / **Role** chips, set **Age** range, type into **Loc** for substring match. Click **Search**.
- After results arrive, **location chips** auto-populate from the result pool — click to narrow without re-crawling.
- Open **More** for advanced filters (regex, supporter, distance, deep filter, synonym expansion, account type, relationship status, profile-verified-only, incognito mode, crawl limits).
- ★ saves the current search. From the **Saved** drawer, click **Watch** for periodic background re-runs with notifications. Drag rows to reorder.

### Keyboard (in results)

| Key | |
|---|---|
| `j` / `k` | move cursor |
| `o` | open profile (shift = new tab) |
| `x` | mark seen |
| `b` | block |
| `n` | edit private note |
| `p` | pin (always shows on top) |
| `c` | select for compare (up to 4) |
| `w` | watch profile for diff |
| `/` | focus inline filter |

### Result-card features

- Avatar · nickname · age/sex/role · location · distance · activity ("Just In The Bedroom" / "Active 2 days ago")
- Badges: ★ supporter · ✓ verified · ↻N duplicate-avatar (links to other nicks with same FetLife CDN attachment ID) · ↻ recurring-in-recent-searches · 📌 pinned · 📝 has-note
- **Compare panel**: select 2–4 cards (key `c`), click *Compare* in the bar that appears, opens a side-by-side table with bio/roles/orientation/looking-for/account/verified/friends/pics/vids.

### On FetLife profile pages

- Toolbar with **TinEye**, **Google Lens**, **DuckDuckGo**, **Reddit**, **FabSwingers** lookups
- Inline **PAT-FetLife** warning if profile is in the configured abuse dataset
- Inline **private-note** banner if you've taken notes
- "✓ seen" badge if you marked the profile in search results
- Right-click any FetLife profile link → **FetLife ASL: search similar** (auto-prefills nick into the side panel)

### Watchers

Two kinds:
- **Saved-search watchers** — re-run a saved search on a schedule, notify on new matches.
- **Profile diff watchers** — press `w` on a result to track that profile; SW re-fetches periodically and diffs `bio` / `roles` / `orientation` / `lookingFor` / `activity` / `isProfileVerified`. Notification fires on change.

Both managed in **Watchers** drawer. Run only while Chrome is open (MV3 SW constraint).

## Architecture

```
manifest.json                   MV3 + side_panel + i18n stubs
background/service_worker.js    PAT refresh, watchers (search + profile diff),
                                fl:fetch via chrome.scripting in fetlife tab,
                                context menu, cache cleanup, profile preview tab
offscreen/                      DOMParser host for service-worker (legacy/optional)
content/fetlife.js              Profile tools, PAT banner, note overlay, ASL button
content/selectors.js            FetLife URL contract (SEARCH_URL, PLACE_URL, isPlaceQuery)
search/search-page.html/css/js  Side-panel UI: form, card list, drawer, compare
search/crawler.js               Login probe (HEAD), parallel throttled paginator,
                                resume state, per-page cache flush
search/parser.js                data-component="SearchUserList" JSON extractor with
                                multi-component fallback
search/filters.js               Surface predicate builder (age/sex/role/location +
                                substring/regex/chips, regex, counts, supporter)
search/profile-fetch.js         data-component="UserProfile" JSON extractor + buildDeepPredicate
search/distance.js              Nominatim geocode + haversine
search/expander.js              Synonyms + intent detection
search/vocab.js                 Stable role/orientation/gender/looking-for keymaps
search/activity-parse.js        "Active 2 days ago" → ms
search/avatar-dedupe.js         FetLife CDN attachment ID dedupe
storage/store.js                seen / blocked / pinned / notes / history / cache /
                                savedSearches / scheduled / profileWatches / prefs /
                                geoCache / crawlResume / telemetry
popup/                          (Action click opens side panel via SW)
options/                        PAT URL, home location, paranoid mode, list import/export
_locales/en/messages.json       i18n scaffold
test/                           Node tests (58 cases)
tools/build.js                  zip release builder
tools/dev-watch.js              chokidar reminder watcher
.github/workflows/test.yml      CI (test + lint)
```

## Reliability vs the original 2015 userscript

| Original | Now |
|---|---|
| Single 1,695-line file | Modular ES modules |
| jQuery 2.1.4 | Vanilla |
| `unsafeWindow`, `GM_*` | `chrome.storage`, `fetch`, message-passing |
| `setTimeout(5000)` for PAT init | Stored index, synchronous lookup |
| No request throttling | Configurable delay + jitter, 4-attempt exponential backoff on 429/5xx, parallel concurrency 2 |
| DOM-scrape selectors, fragile | Structured JSON via `data-component="SearchUserList"` / `"UserProfile"` data-props, with multi-component fallback |
| Google Apps Script backend | Removed (client-side only) |
| `setAttribute('onclick', ...)` | `addEventListener` |
| No login check | HEAD probe before crawl |
| No resume on interruption | Crawl state persisted, per-page cache flush, resume banner |
| No login-aware fetch | SW bridge: same-origin fetch via `chrome.scripting` in a managed fetlife tab |

## Privacy

- `host_permissions` limited to `fetlife.com` and `nominatim.openstreetmap.org` (latter only if Home location is set).
- Third-party links carry `rel="noopener noreferrer" referrerpolicy="no-referrer"`.
- Service-worker validates that `fl:fetch` and `profile:open` URLs are on `fetlife.com` before acting.
- No `web_accessible_resources` declared — extension UI cannot be embedded by third-party pages.
- **Per-search incognito** checkbox skips writing to history and cache for sensitive queries.
- **Paranoid mode** auto-clears search cache after configurable TTL.
- **Settings → Reset all data** wipes all local + sync storage.
- **Block / seen / pinned / notes** import + export as JSON for sharing community lists.

### Known data-at-rest exposure

`chrome.storage.local` (notes, blocked, seen, pinned, profileWatches, cache, history, geoCache) and `chrome.storage.sync` (savedSearches, scheduled, prefs) are stored **unencrypted** — that's how Chrome works. They contain identifying information about real people. If you sign into Chrome with sync enabled, Chrome syncs these to your Google account. If your OS user account is compromised, these are readable. Use a separate Chrome profile if this matters; or use **Per-search incognito** + **Paranoid mode** to minimize on-disk traces.

## PAT-FetLife data source

The original 2015-era public Google Sheet may be defunct. The extension does not bundle a default dataset. Point **Settings → PAT-FetLife dataset URL** at a JSON endpoint:

```json
[
  { "userId": "12345", "reason": "...", "url": "https://..." }
]
```

Without a configured URL, no warnings show; the rest of the extension works normally.

## Place URLs

The query field accepts:

- Free text (`Berlin`, `submissive Tokyo`, `rope`)
- Full place URL (`https://fetlife.com/p/switzerland/zurich`)
- Path (`/p/uk/london/kinksters`)
- Bare path (`p/germany/berlin`)

Place mode is auto-detected; a 📍 *Place* badge appears in the input. All Age/Sex/Role/etc. filters apply on top.

## Tests

```
npm test
```

58 cases covering: ASR parsing, filter predicates, profile parsing (bio / roles / orientation / pronouns / activity / friends / fetishes / verified / account-type / relationship), data-props extraction with fallback, synonym expansion + intent detection, distance haversine, activity-string parsing, avatar dedupe, place URL handling.

## Build / release

```
npm install
npm run dev       # source watcher (prints reload reminders)
npm run lint      # web-ext lint
npm run build     # → dist/fetlife-search-vX.Y.Z.zip
npm run release   # test + lint + build
```

CI: `.github/workflows/test.yml` runs on push/PR.

## i18n

Strings live in `_locales/{locale}/messages.json`. Manifest references `__MSG_extName__` / `__MSG_extDescription__`. Add `_locales/de/messages.json` (etc.) for additional languages.

## Caveats

- FetLife's search accepts only free-text `q=` server-side. Age/sex/role/location filtering happens **client-side** post-fetch — use specific seed queries to keep crawl size manageable.
- Deep filter visits each candidate's profile JSON; throttled.
- Watchers run only while Chrome is open (MV3 service-worker constraint).
- Adult-content extensions may be rejected by the Chrome Web Store. Distribute unpacked or as a `.zip` GitHub release.

## Known deferrals

- **Friend graph / event cross-reference**: blocked on FetLife's friends/events pages being pure SPA routes with no SSR'd structured data; would require fragile XHR API reverse-engineering.
- **WebSocket cable for real-time watchers**: schema unknown; polling is sufficient.
- **Direct-connection / VPN warnings**: opsec heuristics are unreliable; opted not to mislead.
- **Result virtualization**: current performance is fine for ≤200 cards.

See `PLAN.md` for the full backlog.

## License

MIT.
