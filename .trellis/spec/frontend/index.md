# Frontend Development Guidelines

> Project-specific frontend conventions for Tuff, CoreApp, Nexus, TuffEx, and official plugin surfaces.

---

## Overview

This repository is a pnpm monorepo. Frontend work usually lands in one of four places:

- `apps/core-app/src/renderer/src/` for the Electron renderer UI.
- `apps/nexus/app/` for the Nuxt docs, store, dashboard, and public web surfaces.
- `packages/tuffex/packages/components/src/` for reusable Vue component primitives.
- `plugins/<plugin>/src/` for official plugin UI surfaces.

Use these guidelines together with the package-level `AGENTS.md` files:

- `apps/core-app/AGENTS.md`
- `apps/nexus/AGENTS.md`
- `plugins/AGENTS.md`
- `docs/engineering/coreapp-ui-contract.md`

---

## Guidelines Index

| Guide                                                         | Description                                                                          | Status |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------ |
| [Directory Structure](./directory-structure.md)               | Module organization and file layout                                                  | Filled |
| [Component Guidelines](./component-guidelines.md)             | Component patterns, props, composition                                               | Filled |
| [BUI Component Family](./bui-component-family.md)             | Beautiful UI port: `--tx-bui-*` tokens, mixins, hard rules, registration chain       | Filled |
| [Anchor Overlay Chain](./anchor-overlay-chain.md)             | Nested overlay chain: anchor-delay links, hover travel, outside-click, submenus      | Filled |
| [Hook Guidelines](./hook-guidelines.md)                       | Custom composables, lifecycle, data access                                           | Filled |
| [State Management](./state-management.md)                     | Local state, Pinia, host/server state                                                | Filled |
| [CoreBox Results Contracts](./corebox-results-contracts.md)   | CoreBox renderer: selection follow, append-only merge and refresh reconcile, searching cue, one motion gate, selection block, list FLIP, preview pane | Filled |
| [TuffEx Design Rules](./tuffex-design-rules.md)               | Kumo-derived type/spacing/colour/motion rules restated in `--tx-*` tokens and BEM      | Filled |
| [TuffEx Charts Package](./tuffex-charts-package.md)           | tuffex-charts contracts: no echarts, CSS-var theming, kumo divergences               | Filled |
| [TuffEx Text Motion](./tuffex-text-motion.md)                 | One text-morph engine: torph port, the shared spring, unscoped styles, mode fallbacks | Filled |
| [TuffEx Docs Sync](./tuffex-docs-sync.md)                     | Component change → Nexus docs: wrapper blast radius, placement, demos, gate traps    | Filled |
| [Quality Guidelines](./quality-guidelines.md)                 | Code standards, forbidden patterns, verification                                     | Filled |
| [Type Safety](./type-safety.md)                               | TypeScript, runtime guards, typed transport                                          | Filled |
| [Plugin Runtime Security](./plugin-runtime-security.md)       | Privileged plugin handlers, views, preload, and Electron policy                      | Filled |
| [Privacy Data Lifecycle](./privacy-data-lifecycle.md)         | Typed Privacy transport, retention/export, and main-owned credential transactions    | Filled |
| [Nexus Deployment Secrets](./nexus-preview-secret-deployment.md) | Cloudflare Preview and Production Secret inventory, deploy preflight, runtime policy, and evidence | Filled |
| [Nexus Docs Rendering](./nexus-docs-rendering-contract.md)    | Docs HTML always embeds the body; payload-key agreement, body-fetch retry rules       | Filled |
| [Nexus Docs Static Delivery](./nexus-docs-static-delivery.md) | `<route>.html` layout, `_headers` windows and the zone Cache Rule they need, `404.html` + `_redirects`, i18n preload off the hydration path, one nav request | Filled |
| [Nexus Docs Templates](./nexus-docs-templates.md)           | Templates tab: registration chain, `TemplateFrame` stage contract (slot size, `@enter`, overlay layers, Esc), template demo rules | Filled |
| [Nexus Docs Layout Chrome](./nexus-docs-layout.md)           | Docs layout stacking tree, header band, and the effect-free progressive-blur edge fade | Filled |
| [Nexus DashScope Filetrans](./nexus-dashscope-filetrans-contract.md) | Nexus-owned DashScope ASR handoff, routing, reservation, and disclosure rules | Filled |
| [Release Acceptance Testing](./release-testing.md)            | Downloaded release, integrity, trust, and isolated packaged-runtime gates            | Filled |
| [Native Resource Protocols](./native-resource-protocols.md)   | Protocol data-plane rules, path-only native callbacks, and macOS app-icon extraction | Filled |

---

## Pre-Development Checklist

Before editing frontend code:

1. Read the package-level `AGENTS.md` for the target area.
2. Read [Directory Structure](./directory-structure.md) to place files in the existing ownership boundary.
3. Read [Component Guidelines](./component-guidelines.md) before changing Vue SFCs, UI primitives, accessibility, or i18n.
4. Read [TuffEx Design Rules](./tuffex-design-rules.md) before adding a TuffEx component or restyling one; it fixes the type scale, spacing grouping, ring-vs-border choice, concentric radii, token-only colour, and the immediate-hover motion rule that a new component is otherwise free to reinvent.
5. Read the [Loading States](./component-guidelines.md#loading-states) section before adding or changing a view that waits on data; a skeleton mirroring the loaded layout is the default, not an optional follow-up.
6. Read [Nexus Docs Static Delivery](./nexus-docs-static-delivery.md) before touching prerender layout, `routeRules` headers, `_redirects`, the 404 fallback, nuxt-i18n options, or anything on the docs hydration path; each rule there removes a measured round trip.
7. Read [TuffEx Docs Sync](./tuffex-docs-sync.md) before changing any component under `packages/tuffex/packages/components/src/`; the change is not done until the Nexus docs that display it — and the docs of every wrapper component — say what the source now does. A page-level composition goes in the Templates tab instead: read [Nexus Docs Templates](./nexus-docs-templates.md) before adding a template page or changing `TemplateFrame`.
8. Read [Hook Guidelines](./hook-guidelines.md) before adding or changing a `use*` composable or browser lifecycle code.
9. Read [State Management](./state-management.md) before adding Pinia state, SDK subscriptions, caches, or host/server data mirrors.
10. Read [Type Safety](./type-safety.md) before changing payloads, event kinds, SDK domains, manifest shapes, or JSON evidence.
11. Read [Plugin Runtime Security](./plugin-runtime-security.md) before changing plugin windows, hosted plugin views, permission handlers, preload bridges, or plugin Electron preferences.
12. Read [Privacy Data Lifecycle](./privacy-data-lifecycle.md) before changing Privacy SDK payloads, retention/export owners, Provider or Plugin credential persistence/runtime resolution, Secret backup envelopes, portable credential catalogs, secure-store batch mutation, the sensitive-data inventory, or the isolated Privacy lifecycle smoke.
13. Read [Nexus Deployment Secrets](./nexus-preview-secret-deployment.md) before changing Preview or Production variables, Cloudflare Pages credentials, auth/emergency runtime secrets, deployment commands, or deployment evidence.
14. Read [Native Resource Protocols](./native-resource-protocols.md) before adding native media/file callbacks, worker/IPC byte payloads, custom protocol consumers, or macOS application-icon extraction.
15. Read [CoreBox Results Contracts](./corebox-results-contracts.md) before changing CoreBox result rows, the selection, the search status or result motion (`useSearch.ts`, `CoreBox.vue`, `BoxItem.vue`, `useSelectionBlock`, `useListFlip`): rows on screen keep their place, an untouched selection stays on row 0, the glow means no rows yet, and every script-driven motion asks one gate.
16. Read [Quality Guidelines](./quality-guidelines.md) before finishing, and run the smallest relevant tests plus `git diff --check`.
17. Read [Release Acceptance Testing](./release-testing.md) whenever the user says “发版测试”, asks to validate a published build, or requests download/update acceptance.

Also read shared thinking guides when the trigger applies:

- [Cross-Layer Thinking Guide](../guides/cross-layer-thinking-guide.md) for features spanning UI, transport, service, database, or plugin boundaries.
- [Code Reuse Thinking Guide](../guides/code-reuse-thinking-guide.md) before changing constants/config, adding helpers, or repeating payload-field logic.

---

## Hard Frontend Rules

- Prefer TuffEx primitives for new UI. CoreApp business components may remain as semantic composition layers, but new primitive behavior belongs in TuffEx.
- A TuffEx component change ships with its Nexus docs in the same commit — the component's own `.zh.mdc` **and** `.en.mdc`, plus every wrapper component's pages. A user-visible change also ships a demo; a props-table row is not a docs update. Place new entries where they belong in each ordered list rather than appending to the tail.
- Do not add raw `ipcMain`, `ipcRenderer`, raw channels, broad preload exposure, or ad-hoc plugin runtime bridges.
- New interactive UI must use semantic controls with focus and keyboard behavior. Avoid new `div/span @click` debt.
- TuffEx visual work follows [TuffEx Design Rules](./tuffex-design-rules.md): content text at 13–14px, colour only from `--tx-*` tokens, an inset ring instead of a border wherever the element has a fixed height or a shadow, concentric nested radii, no `letter-spacing` on body text, no `font-weight: 700` on prose, and no colour in a hover `transition`. Reuse a `size` / `status` union that `pnpm -C packages/tuffex audit:vocab` already prints; a single component offering two spellings of one tier is a defect.
- A skeleton is the default loading state for any view that waits on data, and it must mirror the loaded layout so nothing shifts when content arrives. Reuse `TxRowSkeleton` / `TxSkeleton` / `SettingSkeleton` and `useDeferredLoading`; do not hand-roll placeholder markup or a local `@keyframes`.
- Plugins must fail closed when permission SDKs, clipboard SDKs, secret SDKs, or host capabilities are unavailable.
- New user-facing text must go through the owning message catalog or localized manifest path, not direct `window.$t` / `window.$i18n`.
- Sensitive-data lifecycle changes must update `docs/engineering/sensitive-data-inventory.json` and pass `corepack pnpm privacy:inventory:verify`; credential values must never use ordinary renderer/app/plugin storage.
- SQLite is the local business source of truth. JSON is only a local config/sync payload or a verifiable catalog/evidence artifact, not a replacement SoT.
