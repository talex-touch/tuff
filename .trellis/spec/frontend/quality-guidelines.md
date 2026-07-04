# Quality Guidelines

> Frontend quality standards, forbidden patterns, and verification expectations.

---

## Overview

Quality in this repo means matching the owning surface, preserving trust boundaries, and proving the exact behavior changed. A focused test can close a narrow code contract, but it cannot replace packaged Electron evidence, real-profile migration evidence, or production/preview Nexus evidence when a roadmap item explicitly requires those artifacts.

---

## Forbidden Patterns

- Raw `ipcMain`, `ipcRenderer`, raw channels, or ad-hoc preload exposure in CoreApp.
- New browser-native clipboard fallback in plugins, such as `navigator.clipboard`, when plugin clipboard SDK permission gates should be used.
- Plugin shell/network/fs/clipboard/window/AI mutations after permission SDK failure, missing SDK, or user denial.
- Plaintext provider secrets, API keys, tokens, prompts, responses, recovery codes, or sensitive paths in ordinary JSON, localStorage, logs, analytics, or sync payloads.
- New `div/span @click` for normal controls when native `button`, `input`, `select`, tabs, menus, or TuffEx primitives can express the control.
- Nexus SSR output that depends on `window`, `document`, localStorage, random values, current time, or unhydrated user state.
- Mock, dry-run, local-only, or isolated evidence marked as production completion.
- Mixing unrelated CoreApp, Nexus, plugin, package, and docs changes in one slice.

---

## Required Patterns

- Use TuffEx for new primitives and semantic interactive controls.
- Use typed transport/domain SDKs instead of raw channels.
- Fail closed with an explicit reason when a permission, SDK, host capability, provider, or platform dependency is unavailable.
- Keep user-facing text in the owning message catalog or localized manifest path.
- Preserve existing class/event contracts during semantic UI migrations.
- Normalize untrusted or cross-layer payloads at the boundary.
- Keep generated chunks, local profiles, raw logs, and exploratory evidence out of source changes unless an evidence README explicitly lists them as curated artifacts.

---

## Testing Requirements

Choose the smallest meaningful verification for the slice:

- TuffEx component primitives: component-local Vitest tests plus focused lint/type checks when relevant.
- CoreApp renderer UI: nearest Vitest tests and `pnpm -C "apps/core-app" run typecheck:web` when the change touches renderer types.
- CoreApp main/transport/SDK surfaces: focused main/module tests and `pnpm -C "apps/core-app" run typecheck:node` when applicable.
- Plugins: plugin-local tests/build/lint when scripts exist, plus manifest validation for manifest changes.
- Nexus: focused route/component/build guard tests, `pnpm -C "apps/nexus" run typecheck`, and production preview evidence when the TODO requires it.
- Always run `git diff --check` before reporting completion.

Package-level recommended commands are listed in:

- `apps/core-app/AGENTS.md`
- `apps/nexus/AGENTS.md`
- `plugins/AGENTS.md`

---

## Evidence Boundaries

- R2 AI Stable visible evidence is governed by `docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/README.md` and its strict verifier.
- R3 Search / Indexing Runtime evidence is governed by `docs/plan-prd/TODO-R3.md` and `docs/engineering/reports/r3-indexing-runtime-2026-06-25/README.md`.
- Nexus performance and production conclusions are governed by `docs/plan-prd/TODO-nexus.md`.
- Governance production evidence must distinguish `live`, `d1`, `r2`, `local-only`, `memory`, and `open`.
- Isolated/controlled evidence can prove wiring, guardrails, or artifact collectors. It must not be rewritten as real-profile or production proof.

---

## Code Review Checklist

Reviewers should check:

- Does the change stay inside the owning package and task slice?
- Are interactive elements semantic, focusable, and keyboard accessible?
- Are plugin and host trust boundaries fail-closed?
- Are shared payloads typed in the owning package and normalized at runtime?
- Are secrets, paths, prompt/response content, and provider credentials kept out of ordinary logs/state/storage?
- Are i18n strings in the correct catalog or localized manifest path?
- Are tests focused on the changed behavior, and is any required evidence stronger than the test?
- Does `git diff --check` pass?

---

## Common Mistakes

- Treating "typecheck passed" as proof of user-visible Electron behavior.
- Treating local-only Nexus smoke as deployed Cloudflare production evidence.
- Pairing a verifier JSON from one run with screenshots or DOM from another run.
- Fixing a semantic control by adding ARIA to a `div` when a native button is available.
- Updating a shared payload in one package without updating SDK mirror tests.
