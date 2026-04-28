#!/usr/bin/env node
// Dev watcher: prints a reminder to reload the extension when source files change.
// MV3 doesn't expose a programmatic "reload extension" channel without an
// installed receiver, so this script is intentionally a noisy nag rather than
// auto-reload magic. Run `npm run dev` while iterating.

import chokidar from "chokidar";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const watcher = chokidar.watch([
  "manifest.json",
  "background/**/*", "content/**/*", "search/**/*",
  "options/**/*", "offscreen/**/*", "storage/**/*",
], {
  cwd: root,
  ignored: ["**/.DS_Store", "node_modules/**", "dist/**", "test/**"],
  ignoreInitial: true,
});

console.log("dev-watch: watching " + relative(process.cwd(), root));
console.log("Reload chrome://extensions → ↻ on the FetLife ASL Search card after each change.\n");

watcher.on("all", (event, path) => {
  const ts = new Date().toLocaleTimeString();
  console.log(`[${ts}] ${event}  ${path}  →  reload extension`);
});
