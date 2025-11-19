<!-- a16c543d-e103-4487-b437-b1af298e52e4 d786bf09-f345-4b68-a2a4-d2c510eedf61 -->
# Path Utility Audit Plan

## Goal

Separate renderer-safe utils from Electron-only code so Node-specific modules use built-in `path` while shared code keeps browser fallbacks.

## Steps

1. **catalog-usage** — Inspect `packages/utils` imports (esp. `common/utils/file.ts`, `common/file-scan-utils.ts`, vue components) to map which consumers run in renderer vs main.
2. **classify-modules** — Based on usage, mark utilities as `node-only` or `shared`; note any renderer files that still need them.
3. **propose-structure** — Suggest directory/package adjustments (e.g., move node-only utils, update import paths, tweak bundler aliases) and outline necessary code changes.

### To-dos

- [ ] Map where path-dependent utils are imported in @talex-touch workspace to understand runtime contexts
- [ ] Label each utility as renderer-safe or node-only based on usage data
- [ ] Draft refactor steps: directory layout, dependency handling, bundler alias updates
