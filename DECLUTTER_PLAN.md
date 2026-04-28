# Declutter Plan

**Branch:** `declutter`
**Baseline:** 61/61 tests pass · 41 source files · v0.3.1 just shipped
**Smoke test:** `npm test`
**Build:** `npm run build`
**Lint:** `npm run lint`

## Operating principles
- Every commit small, reviewable, revertable.
- Evidence trail in commit messages.
- No public-API surface to worry about (extension is end-user, not a library).
- Keep all features the user explicitly asked for.

## Phases
1. ✅ Phase 0 — branch + smoke test
2. Phase 1 — repo map
3. Phase 2 — candidates inventory
4. Phase 3 — execute batches
5. Phase 4 — folder structure + READMEs
6. Phase 5 — skip (perf is fine for this size)

## Risk areas
- `offscreen/` may still be referenced by SW's `parseInOffscreen` (watcher path)
- `popup/` may still be referenced by manifest action — verify before removing
- Comments referencing old DOM-scraping behavior (now obsolete since data-props parsing) could mislead

## What stays no matter what
- Every shipped feature (Sprints 1–6)
- All tests
- Locales scaffold
- Tooling (build/dev/CI)
