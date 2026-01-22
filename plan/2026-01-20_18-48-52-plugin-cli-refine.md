---
mode: plan
cwd: /Users/talexdreamsoul/Workspace/Projects/talex-touch
task: Refine plugin development CLI (tuff) and close feature gaps
complexity: complex
planning_method: builtin
created_at: 2026-01-20T18:49:32+08:00
---

# Plan: Plugin CLI refinement

Task Overview
Align the current tuff CLI implementation with the planned feature set.
Close gaps across dev/build/publish/config and index/ bundling while keeping compatibility.

Execution Plan
1. Confirm scope and success criteria for each command (create/build/dev/publish/validate) based on PRD and current behavior.
2. Map existing CLI entrypoints and user-facing flags to identify exact gaps and conflicts.
3. Design a unified config model (tuff.config.ts + manifest fields) with clear precedence and defaults.
4. Implement tuff dev by wiring Vite dev server + unplugin HMR, including index/ and manifest watcher behavior.
5. Rework tuff build to orchestrate Vite build + tpex packaging, and add flags (watch/dev/output) mapped to config.
6. Adjust tuff publish to target plugin artifacts (.tpex), add validation, and separate app-release publishing if needed.
7. Finalize index/ bundling rules (entry resolution, index.js vs index/ precedence, externals) and optional build:index command.
8. Improve UX: help output, errors, i18n strings, and update README/docs to match behavior.
9. Add tests and smoke checks for config loading, entry detection, bundling, and CLI commands.

Risks and Notes
- Backward compatibility with existing plugin templates and scripts.
- Publish flow depends on Nexus API expectations and auth tokens.
- HMR and bundling performance for large index/ trees.

References
- docs/plan-prd/06-ecosystem/TUFFCLI-PRD.md:1
- packages/unplugin-export-plugin/src/bin/tuff.ts:154
- packages/unplugin-export-plugin/src/index.ts:128
- packages/unplugin-export-plugin/src/core/exporter.ts:262
- packages/unplugin-export-plugin/src/core/publish.ts:165
- packages/unplugin-export-plugin/docs/INDEX-FOLDER-BUNDLING.md:1
- packages/unplugin-export-plugin/docs/index-folder-indexjs.md:1
