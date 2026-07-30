# CoreBox and Nexus debugging program summary

## Final baseline

- Final fetched default branch: `784377c499899529145c0dac7f1d0000329e0794`.
- CoreBox runtime evidence was collected from `38860855b9a59acfd9abdf18182fa3b0d6a64310`; the audited CoreBox and transport files have no diff to final `origin/master`.
- Nexus execution used a frozen detached worktree at final `origin/master`.
- Host/tooling: macOS arm64, Node `24.18.0`, pnpm `10.34.4`, Chrome `150.0.7871.187`.
- No product source or product test was modified by this program.

## CoreBox outcome

The isolated packaged flow covered onboarding, app search, result rendering, selection, clear, expand, pin, focus, bounds, hide/show, keyboard execution, and module teardown.

A new P1 defect was confirmed: 21 canonical transport events are registered twice. Real transport evidence proved that all handlers execute; programmatic set/rapid-set/clear produced deterministic `1 + 3 + 1` unhandled `Search stream superseded` rejections. Ordinary keyboard input remained clean.

The full CoreApp test baseline failed only in the existing #323 groups. The double `shortcutTriggered` send was retained as intentional ordering/fallback behavior. One native OCR crash was not reproducible and was excluded.

Detailed evidence:

- [CoreBox report](../../07-28-debug-corebox-end-to-end/research/report.md)
- [CoreBox candidate ledger](../../07-28-debug-corebox-end-to-end/research/candidates.md)

## Nexus outcome

Pure Nuxt and local Cloudflare dev covered public pages, both docs locales, docs/store/release APIs, unauthenticated auth/Dashboard boundaries, desktop/mobile layout, reload, back/forward, and fresh-profile Chrome console/network behavior. Bounded production GET/HEAD probes confirmed the deployed public site remained available without making a current-build claim.

Two new defects were confirmed:

1. P0: 24 localized docs directory aliases return SSR 404 and block Nitro production build even though explicit index routes and the docs API return 200.
2. P1: five Vitest files under `server/api` make the documented route-tree guard fail.

Store hydration mismatch and two identical full-suite failures map to #327. Volar warnings remain #332; deployed OAuth/Dashboard/bfcache evidence remains #324. Worker analysis after the aborted build was excluded as incomplete evidence.

Detailed evidence:

- [Nexus report](../../07-28-debug-nexus-end-to-end/research/report.md)
- [Nexus candidate ledger](../../07-28-debug-nexus-end-to-end/research/candidates.md)

## Published Issues

The user reviewed and approved the exact title, severity, `bug` label, duplicate result, and full body for all three drafts. Each Issue was created sequentially and then remotely verified for OPEN state, exact title, normalized body equality, and exact labels.

| Issue                                                                                                                                 | Severity | Flow                              |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------- |
| [#477 CoreBox: prevent duplicate IPC handlers from superseding programmatic searches](https://github.com/talex-touch/tuff/issues/477) | P1       | CoreBox programmatic input/search |
| [#478 Docs: restore SSR status and prerendering for directory index routes](https://github.com/talex-touch/tuff/issues/478)           | P0       | Nexus docs SSR/prerender/build    |
| [#479 Build: keep Nexus test files outside the server API route tree](https://github.com/talex-touch/tuff/issues/479)                 | P1       | Nexus API route-tree quality gate |

Publication evidence:

- [Deduplication map](../../07-28-publish-corebox-nexus-issues/research/deduplication.md)
- [Publication manifest](../../07-28-publish-corebox-nexus-issues/publication-manifest.json)
- [Publication summary](../../07-28-publish-corebox-nexus-issues/research/final-summary.md)

## Existing acceptance boundaries retained

- #323: CoreApp full-suite baseline.
- #324: deployed Nexus preview, OAuth, Dashboard, and bfcache evidence.
- #327: Nexus full-suite restoration and Store first-load/hydration behavior.
- #329: Auth.js/NextAuth advisories.
- #332: Vue Router/Volar resolution warnings.

No existing Issue was commented on or edited.

## Safety and cleanup

- CoreApp used disposable profiles and synthetic fixtures after explicit clipboard readiness confirmation; automation did not inspect or persist clipboard content.
- Nexus used synthetic local state and bounded unauthenticated public GET/HEAD requests only.
- No production write, OAuth login, reusable auth state, D1/R2 mutation, deploy, Git commit, or Git push occurred.
- Nuxt/Chrome processes and temporary browser profiles were removed; no diagnostic listener remained.
