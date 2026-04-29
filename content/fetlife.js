// Content script. Runs on every fetlife.com page.
// Injects: profile-tools toolbar (TinEye/Lens/Web/sister-sites), PAT banner,
// nickname-note overlay, ASL Search button (in nav), and friend/seen badges.

(function () {
  const PROFILE_PATH_RE = /^\/[A-Za-z0-9_.\-]+\/?$/;
  const RESERVED = new Set([
    "home","inbox","search","explore","groups","events","p","fetishes","writings",
    "kinktionary","notifications","requests","languages","help","bookmarks",
    "settings","support","legal","conversations","accounts","pictures","videos",
    "posts","login","logout","signup","ads","feed","kinksters","albums",
    "collections","onboarding"
  ]);

  function isProfilePage(loc) {
    if (loc.hostname !== "fetlife.com") return false;
    if (!PROFILE_PATH_RE.test(loc.pathname)) return false;
    const slug = loc.pathname.replace(/^\//, "").replace(/\/$/, "");
    return !RESERVED.has(slug);
  }
  function profileSlug() {
    return location.pathname.replace(/^\//, "").replace(/\/$/, "");
  }
  function profileUserId() {
    const a = document.querySelector('a[href*="conversations/new?with="], a[href*="gift_to="]');
    if (!a) return null;
    const m = a.getAttribute("href").match(/(?:with|gift_to)=(\d+)/);
    return m ? m[1] : null;
  }
  function findAvatarSrc() {
    const a = document.querySelector(`a[href$="/${profileSlug()}/pictures"] img`);
    return a ? a.getAttribute("src") : null;
  }

  function injectProfileTools() {
    if (!isProfilePage(location)) return;
    if (document.querySelector(".flal-toolbar")) return;

    const avatar = findAvatarSrc();
    const slug = profileSlug();
    const q = encodeURIComponent('"' + slug + '"');

    const tools = document.createElement("div");
    tools.className = "flal-toolbar";

    const links = [];
    if (avatar) {
      links.push({ label: "TinEye", href: `https://tineye.com/search/?url=${encodeURIComponent(avatar)}` });
      links.push({ label: "Google Lens", href: `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(avatar)}` });
    }
    links.push({ label: "DuckDuckGo", href: `https://duckduckgo.com/?q=${q}` });
    links.push({ label: "Reddit", href: `https://www.reddit.com/search/?q=${q}` });
    links.push({ label: "FabSwingers", href: `https://www.fabswingers.com/profile/${encodeURIComponent(slug)}` });

    for (const l of links) {
      const a = document.createElement("a");
      a.href = l.href; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.referrerPolicy = "no-referrer";
      a.textContent = l.label;
      tools.appendChild(a);
    }

    const main = document.querySelector("main") || document.body;
    const heading = main.querySelector("h1, [role=heading]") || main.firstElementChild;
    if (heading && heading.parentElement) heading.parentElement.insertBefore(tools, heading.nextSibling);
    else main.prepend(tools);
  }

  async function injectPatWarning() {
    if (!isProfilePage(location)) return;
    const userId = profileUserId();
    if (!userId) return;
    const flagged = await chrome.runtime.sendMessage({ type: "pat:check", userId }).catch(() => null);
    if (!flagged?.match) return;
    if (document.querySelector(".flal-pat-warning")) return;
    const banner = document.createElement("div");
    banner.className = "flal-pat-warning";
    banner.append(
      Object.assign(document.createElement("strong"), { textContent: "⚠ PAT-FetLife match: " }),
      document.createTextNode(flagged.match.reason || "User reported in Predator Alert Tool dataset."),
    );
    if (flagged.match.url) {
      banner.append(" ");
      const a = document.createElement("a");
      a.href = flagged.match.url; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.textContent = "details";
      banner.appendChild(a);
    }
    const main = document.querySelector("main") || document.body;
    main.prepend(banner);
  }

  async function injectNoteOverlay() {
    if (!isProfilePage(location)) return;
    const slug = profileSlug();
    let note = null;
    try {
      const r = await chrome.runtime.sendMessage({ type: "notes:get", nickname: slug });
      note = r?.note || null;
    } catch { return; }
    if (!note?.text) return;
    if (document.querySelector(".flal-note")) return;
    const box = document.createElement("div");
    box.className = "flal-note";
    box.append(
      Object.assign(document.createElement("strong"), { textContent: "📝 Your note: " }),
      document.createTextNode(note.text),
    );
    const main = document.querySelector("main") || document.body;
    main.prepend(box);
  }

  async function markSeenBadge() {
    if (!isProfilePage(location)) return;
    const slug = profileSlug();
    const seen = (await chrome.storage.local.get("seen")).seen || {};
    const blocked = (await chrome.storage.local.get("blocked")).blocked || {};
    if (blocked[slug]) {
      const b = document.createElement("div");
      b.className = "flal-pat-warning";
      b.style.background = "#444";
      b.textContent = "⊘ You blocked this profile in FetLife Search.";
      const main = document.querySelector("main") || document.body;
      main.prepend(b);
    }
    if (seen[slug] && !document.querySelector(".flal-seen-badge")) {
      const tag = document.createElement("span");
      tag.className = "flal-seen-badge";
      tag.textContent = "✓ seen";
      const heading = document.querySelector("main h1, main [role=heading]");
      heading?.appendChild(tag);
    }
  }

  function injectGlobalSearchButton() {
    if (document.querySelector(".flal-search-button")) return;
    const navSearch = document.querySelector('nav form[action*="search"], nav [role=search], header form');
    const target = navSearch || document.querySelector('main h1') || document.querySelector("nav") || document.body;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "flal-search-button";
    btn.textContent = "ASL Search";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      try {
        if (chrome?.runtime?.id) chrome.runtime.sendMessage({ type: "ui:open" }).catch(() => {});
        else window.location.reload();
      } catch {}
    });
    target.appendChild ? target.appendChild(btn) : target.prepend(btn);
  }

  function run() {
    try { injectProfileTools(); } catch (e) {}
    try { injectPatWarning(); } catch (e) {}
    try { injectNoteOverlay(); } catch (e) {}
    try { markSeenBadge(); } catch (e) {}
    try { injectGlobalSearchButton(); } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else { run(); }

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(run, 200);
    }
  }).observe(document, { subtree: true, childList: true });
})();
