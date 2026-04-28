---
name: declutter-remove-unused-feature-or-directory
description: Workflow command scaffold for declutter-remove-unused-feature-or-directory in fetlife-aslsearch-mv3.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /declutter-remove-unused-feature-or-directory

Use this workflow when working on **declutter-remove-unused-feature-or-directory** in `fetlife-aslsearch-mv3`.

## Goal

Removes an obsolete feature or directory and all related code, configuration, and build/dev scripts.

## Common Files

- `popup/*`
- `offscreen/*`
- `background/service_worker.js`
- `manifest.json`
- `tools/build.js`
- `tools/dev-watch.js`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Identify all files and code related to the obsolete feature or directory.
- Delete the feature's files (e.g., popup/, offscreen/).
- Remove related code from main logic files (e.g., service_worker.js, selectors.js).
- Update manifest.json to drop related permissions or references.
- Update build/dev scripts (e.g., tools/build.js, tools/dev-watch.js) to remove globs or paths.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.