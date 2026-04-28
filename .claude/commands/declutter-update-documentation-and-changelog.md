---
name: declutter-update-documentation-and-changelog
description: Workflow command scaffold for declutter-update-documentation-and-changelog in fetlife-aslsearch-mv3.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /declutter-update-documentation-and-changelog

Use this workflow when working on **declutter-update-documentation-and-changelog** in `fetlife-aslsearch-mv3`.

## Goal

Updates documentation and changelog files to reflect recent codebase changes, especially after decluttering or major refactors.

## Common Files

- `DECLUTTER_CANDIDATES.md`
- `DECLUTTER_PLAN.md`
- `CHANGELOG.md`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Update DECLUTTER_CANDIDATES.md and/or DECLUTTER_PLAN.md to reflect removed or changed features.
- Update CHANGELOG.md with a summary of changes.
- Commit documentation changes, often alongside or after code changes.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.