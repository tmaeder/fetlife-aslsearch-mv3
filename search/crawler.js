import { SEARCH_URL, PLACE_URL, GROUP_URL, isPlaceQuery, isGroupQuery } from "../content/selectors.js";
import { parseSearchPage } from "./parser.js";
import { buildPredicate } from "./filters.js";
import { crawlResume, cache } from "../storage/store.js";

function urlForPage(query, page) {
  if (isGroupQuery(query)) return GROUP_URL(query, page);
  if (isPlaceQuery(query)) return PLACE_URL(query, page);
  return SEARCH_URL(query, page);
}

const DEFAULT_DELAY_MS = 1500;
const DEFAULT_JITTER_MS = 500;
const MAX_BACKOFF_MS = 60_000;
const DEFAULT_CONCURRENCY = 2;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jitter = (base, j) => base + Math.floor(Math.random() * j);

async function flFetch(url, signal) {
  try {
    const r = await chrome.runtime.sendMessage({ type: "fl:fetch", url });
    if (r?.ok) return r;
    throw new Error(r?.error || "fl:fetch failed");
  } catch {
    const res = await fetch(url, { credentials: "include", signal });
    return { status: res.status, html: await res.text() };
  }
}

// HEAD-only login probe — much smaller transfer than fetching /home.
// Falls back to a GET if the server doesn't honor HEAD.
export async function probeLogin(signal) {
  try {
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: "fl:fetch", url: "https://fetlife.com/inbox", method: "HEAD" });
    } catch { res = null; }
    if (res?.ok && res.status === 200) return true;
    if (res?.ok && res.status >= 300 && res.status < 400) {
      // Redirect to login = logged out
      const loc = (res.headers || {}).location || "";
      return !/login|welcome/i.test(loc);
    }
    // Fallback: tiny GET (still needs the body since we can't always trust status)
    const r = await flFetch("https://fetlife.com/home", signal);
    if (r.status !== 200 || !r.html) return false;
    if (/you need to be logged in|Welcome Home[\s\S]{0,300}Log In to FetLife/i.test(r.html)) return false;
    return /name="action-cable-url"|name="csrf-token"/i.test(r.html);
  } catch { return false; }
}

async function fetchHtml(url, signal) {
  const r = await flFetch(url, signal);
  if (r.status === 429 || r.status >= 500) {
    const err = new Error(`HTTP ${r.status}`);
    err.retryable = true; err.status = r.status; throw err;
  }
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  return r.html;
}

async function fetchWithBackoff(url, signal) {
  let attempt = 0;
  let delay = 2000;
  while (true) {
    try { return await fetchHtml(url, signal); }
    catch (e) {
      if (signal?.aborted) throw e;
      if (!e.retryable || attempt >= 4) throw e;
      await sleep(Math.min(delay, MAX_BACKOFF_MS));
      delay *= 2;
      attempt++;
    }
  }
}

// Bounded concurrent crawl. Pages 1..N fetched with up to `concurrency` in
// flight at once, separated by `delayMs` between *starts* (not waits) so
// effective request rate ≈ concurrency / delayMs.
//
// Each completed page is yielded as soon as it parses, in completion order
// (not strict page order — see `page` field). Cache flushes after every page.
export async function* crawl({
  query, criteria, maxPages = 25, maxMatches = 200,
  delayMs = DEFAULT_DELAY_MS, concurrency = DEFAULT_CONCURRENCY,
  signal, resumeState = null,
}) {
  const pred = buildPredicate(criteria || {});
  const seen = new Set(resumeState?.seen || []);
  let matchCount = resumeState?.matchCount || 0;
  let parseFailures = 0;
  let parseTotal = 0;
  const startPage = resumeState?.page || 1;

  if (startPage === 1) {
    const ok = await probeLogin(signal);
    if (!ok) { yield { type: "logged_out" }; return; }
  }

  const allMatched = [];
  const inflight = new Map(); // page → promise
  let nextPage = startPage;
  let stop = false;
  let lastPageHadNext = true;

  const launch = (page) => {
    const url = urlForPage(query, page);
    const p = (async () => {
      const html = await fetchWithBackoff(url, signal);
      return { page, parsed: parseSearchPage(html) };
    })();
    inflight.set(page, p);
  };

  // Initial launch up to concurrency.
  while (inflight.size < concurrency && nextPage <= maxPages) {
    launch(nextPage++);
    if (inflight.size < concurrency && nextPage <= maxPages) {
      await sleep(jitter(delayMs, DEFAULT_JITTER_MS));
      if (signal?.aborted) return;
    }
  }

  while (inflight.size > 0) {
    if (signal?.aborted) return;
    let result;
    try {
      // Race all in-flight; pick the first completed.
      result = await Promise.race([...inflight.values()]);
    } catch (e) {
      yield { type: "error", message: e.message, page: nextPage };
      return;
    }
    inflight.delete(result.page);
    const { parsed, page } = result;

    if (!parsed.loggedIn) { yield { type: "logged_out" }; return; }

    const fresh = parsed.results.filter(r => !seen.has(r.nickname));
    fresh.forEach(r => seen.add(r.nickname));
    parseTotal += fresh.length;
    parseFailures += fresh.filter(r => r.age == null && !r.role && !r.location).length;

    const matched = fresh.filter(pred);
    matchCount += matched.length;
    allMatched.push(...matched);
    lastPageHadNext = !!parsed.nextHref;

    // Per-page cache flush (resumable on interruption).
    cache.set(query, criteria, allMatched).catch(() => {});
    crawlResume.save({ query, criteria, maxPages, maxMatches, page, seen: [...seen], matchCount }).catch(() => {});

    yield {
      type: "page", page, total: parsed.total,
      pageResults: fresh, matched, matchCount,
      nextHref: parsed.nextHref,
      parseHealth: parseTotal ? 1 - parseFailures / parseTotal : 1,
    };

    if (matchCount >= maxMatches) stop = true;
    if (!parsed.nextHref) stop = true;
    if (fresh.length === 0) stop = true;

    // Top up: queue the next page unless stopping.
    if (!stop && nextPage <= maxPages && lastPageHadNext) {
      await sleep(jitter(delayMs, DEFAULT_JITTER_MS));
      if (signal?.aborted) return;
      launch(nextPage++);
    }
  }
  await crawlResume.clear();
}
