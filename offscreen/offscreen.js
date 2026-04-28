// Offscreen document: parses HTML for the service worker (which lacks DOMParser).

import { parseSearchPage } from "../search/parser.js";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== "offscreen") return;
  if (msg.type === "parseSearch") {
    try { sendResponse({ ok: true, parsed: parseSearchPage(msg.html) }); }
    catch (e) { sendResponse({ ok: false, error: e.message }); }
    return false;
  }
});
