# Publication summary

Audited commit: `784377c499899529145c0dac7f1d0000329e0794`

Approval: all three exact drafts approved by the user on 2026-07-29.

## Published and verified

| Issue                                                                                                                                 | Severity | Labels | Verification                                 |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | -------------------------------------------- |
| [#477 CoreBox: prevent duplicate IPC handlers from superseding programmatic searches](https://github.com/talex-touch/tuff/issues/477) | P1       | `bug`  | OPEN; title/body/labels match approved draft |
| [#478 Docs: restore SSR status and prerendering for directory index routes](https://github.com/talex-touch/tuff/issues/478)           | P0       | `bug`  | OPEN; title/body/labels match approved draft |
| [#479 Build: keep Nexus test files outside the server API route tree](https://github.com/talex-touch/tuff/issues/479)                 | P1       | `bug`  | OPEN; title/body/labels match approved draft |

No published Issue was edited, closed, deleted, assigned, or added to a milestone/project after creation.

## Existing Issues reused

- #323: CoreApp full-suite baseline.
- #324: deployed preview, OAuth, authenticated Dashboard, and bfcache evidence.
- #327: Nexus full-suite failures and Store first-load/hydration regression.
- #329: Auth.js/NextAuth dependency advisories.
- #332: Vue Router/Volar resolution warnings.

No comment or edit was posted to an existing Issue.

## Excluded observations

- Intentional CoreBox `shortcutTriggered` ordering/fallback without proven duplicate side effect.
- One non-reproducible `vision.ocr` native error contaminated by unrelated worktree changes.
- File-provider timing, unsigned local packaging, and later unrelated native typecheck failures.
- Environment prerequisite failures before building TuffEx in the detached worktree.
- Three fallback-covered English auth locale warnings.
- Worker analysis findings derived from an aborted partial build.

## Remaining evidence gaps

- Current Nexus production build and Worker analysis remain blocked by #478.
- Strict deployed OAuth/Dashboard/bfcache evidence remains #324.
- Full Nexus test restoration remains #327.
- No product fix was made in this debugging/publication task.
