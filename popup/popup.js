document.getElementById("open").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("search/search-page.html") });
  window.close();
});

document.getElementById("open-tools").addEventListener("click", () => {
  chrome.runtime.openOptionsPage?.() ||
    chrome.tabs.create({ url: chrome.runtime.getURL("options/options.html") });
  window.close();
});
