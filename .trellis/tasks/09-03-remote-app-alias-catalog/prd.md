# Remote application alias catalog

## Goal

Close the immediate application-discovery gap for Ghostty, cmux, and Orca, while recording the verified Nexus migration boundary so the growing alias set can later move from source to a signed, offline-safe catalog.

## Confirmed facts

- `app-semantic-catalog.ts` is the current source of application identity matching and aliases. It is static, version 5, and refreshes existing indexed applications only on the next scan.
- Terminal, iTerm, Warp, Hyper, Tabby, and Termius are catalogued. Ghostty, cmux, and Orca are absent from application semantic entries.
- Existing `CatalogService` provides verified whole-pack import, SQLite atomic activation/rollback, an offline built-in pack, a pinned RSA trust root, and content-addressed Nexus client routes, but only for the literal `domain-lexicon` pack type.
- `apps/nexus` has no catalog routes today; CoreApp has no user-visible check/download/import/activate trigger for its catalog service.

## Requirements

1. Add Ghostty and cmux to the existing terminal/development application entry without widening its generic matching semantics.
2. Add Orca as a narrow application identity entry with development, worktree, workspace, and AI-tool aliases.
3. Preserve the existing source-owned catalog versioning, locale expansion, pluralization, and runtime-scan refresh behavior.
4. Record the required Nexus migration design: a distinct `app-semantic-alias` pack type, pinned-key verification, content-addressed artifacts, explicit activation, offline baseline, and post-activation installed-app reprojection.
5. Do not modify the existing `domain-lexicon` contract, CatalogService persistence, Nexus API, or application search/launch behavior in this focused correction.

## Acceptance Criteria

- [x] Ghostty and cmux resolve terminal, shell, CLI, and command-line aliases.
- [x] Orca resolves development, worktree, workspace, and AI-tool aliases.
- [x] The focused semantic-alias test and CoreApp Node typecheck pass.
- [x] `design.md` records the safe Nexus delivery architecture and its explicit non-implemented boundary.

## Out of Scope

- Implementing the `app-semantic-alias` signed pack, CoreApp catalog persistence/activation trigger, Nexus serving API, update UI, or installed-app reprojection. These need one cohesive cross-repository implementation task.
- Automatic polling, staged channels, delta packs, a catalog authoring UI, R2/D1 production provisioning, secret configuration, or production deployment.
- Any change to free-form full-text application-name search, app-launch behavior, recommendation ranking, or plugin-local overlays.
