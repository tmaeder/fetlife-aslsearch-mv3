#!/usr/bin/env node
// Build a versioned zip of the unpacked extension into ./dist/
// Usage: npm run build

import { mkdirSync, readFileSync, createWriteStream, statSync } from "node:fs";
import { resolve, dirname, relative, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const version = manifest.version;
const distDir = join(root, "dist");
mkdirSync(distDir, { recursive: true });
const zipPath = join(distDir, `fetlife-aslsearch-mv3-v${version}.zip`);

const includes = [
  "manifest.json",
  "background", "content", "icons",
  "options", "search", "storage",
  "_locales",
];
const excludes = ["**/*.test.js", "**/.DS_Store"];

// Rely on system zip — universally available on macOS/Linux.
try { execFileSync("rm", ["-f", zipPath]); } catch {}
const args = ["-r", zipPath, ...includes];
for (const e of excludes) args.push("-x", e);
execFileSync("zip", args, { cwd: root, stdio: "inherit" });

const size = statSync(zipPath).size;
console.log(`\n✓ ${relative(root, zipPath)} (${(size / 1024).toFixed(1)} KB)`);
