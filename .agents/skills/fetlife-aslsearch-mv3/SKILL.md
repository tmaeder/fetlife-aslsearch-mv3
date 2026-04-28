```markdown
# fetlife-aslsearch-mv3 Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill covers the core development practices, coding conventions, and maintenance workflows for the `fetlife-aslsearch-mv3` JavaScript codebase. The repository is a browser extension (Manifest V3) with a focus on modular, maintainable code and regular decluttering of obsolete features. It emphasizes clean file organization, consistent code style, and thorough documentation updates alongside code changes.

## Coding Conventions

**File Naming**
- Use `camelCase` for file and directory names.
  - Example: `serviceWorker.js`, `searchPage.js`, `devWatch.js`

**Imports**
- Use relative import paths.
  - Example:
    ```javascript
    import { getSelectors } from '../content/selectors.js';
    ```

**Exports**
- Use named exports for modules.
  - Example:
    ```javascript
    // selectors.js
    export function getSelectors() { ... }
    ```

**Commit Messages**
- Freeform style, sometimes prefixed with context like `declutter` or `docs`.
  - Example: `declutter: remove unused popup UI`

## Workflows

### declutter-remove-unused-feature-or-directory
**Trigger:** When a feature or directory is no longer needed (e.g., popup UI, offscreen document) and should be fully removed from the codebase.  
**Command:** `/declutter-remove-feature`

1. **Identify** all files and code related to the obsolete feature or directory.
2. **Delete** the feature's files (e.g., `popup/`, `offscreen/`).
3. **Remove** related code from main logic files (e.g., `service_worker.js`, `selectors.js`).
   - Example:
     ```javascript
     // Before
     import { popupHandler } from '../popup/popupHandler.js';

     // After
     // (Remove the import and any usage)
     ```
4. **Update** `manifest.json` to drop related permissions or references.
5. **Update** build/dev scripts (e.g., `tools/build.js`, `tools/dev-watch.js`) to remove globs or paths.
6. **Verify** removal with code search (e.g., `grep` for references).
7. **Run tests** to ensure nothing is broken.

**Files Involved:**
- `popup/*`
- `offscreen/*`
- `background/service_worker.js`
- `manifest.json`
- `tools/build.js`
- `tools/dev-watch.js`
- `content/selectors.js`
- `search/search-page.js`
- `storage/store.js`

---

### declutter-update-documentation-and-changelog
**Trigger:** When codebase changes (especially removals or refactors) need to be documented for future reference.  
**Command:** `/update-docs-changelog`

1. **Update** `DECLUTTER_CANDIDATES.md` and/or `DECLUTTER_PLAN.md` to reflect removed or changed features.
2. **Update** `CHANGELOG.md` with a summary of changes.
   - Example:
     ```
     ## [Unreleased]
     - Removed popup UI and related scripts.
     - Updated selectors for new search page structure.
     ```
3. **Commit** documentation changes, often alongside or after code changes.

**Files Involved:**
- `DECLUTTER_CANDIDATES.md`
- `DECLUTTER_PLAN.md`
- `CHANGELOG.md`

---

## Testing Patterns

- Test files use the `*.test.*` pattern (e.g., `selectors.test.js`).
- The specific testing framework is not detected, but tests are likely colocated with source files.
- To run tests, use the project's standard test command (see project documentation or `package.json`).

**Example:**
```javascript
// selectors.test.js
import { getSelectors } from './selectors.js';

test('getSelectors returns expected keys', () => {
  const selectors = getSelectors();
  expect(selectors).toHaveProperty('searchInput');
});
```

## Commands

| Command                   | Purpose                                                        |
|---------------------------|----------------------------------------------------------------|
| /declutter-remove-feature | Remove an obsolete feature or directory and all related code.  |
| /update-docs-changelog    | Update documentation and changelog after codebase changes.     |
```
