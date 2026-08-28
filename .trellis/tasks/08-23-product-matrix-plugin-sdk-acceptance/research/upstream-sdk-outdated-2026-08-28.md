# Upstream SDK Outdated Snapshot

## Scope

- Date: 2026-08-28 (America/Los_Angeles)
- Command: `corepack pnpm outdated -r --format json`
- Result: registry query completed; command returned `1` because outdated dependencies were found.

## High-Impact SDK / Framework Deltas

| Package | Current | Wanted | Latest | Dependents | Migration Judgment |
| --- | ---: | ---: | ---: | --- | --- |
| `@modelcontextprotocol/sdk` | 1.29.0 | 1.29.0 | 1.30.0 | CoreApp | Minor bump candidate, but live MCP smoke remains opt-in and must not be counted from static tests alone. |
| `@langchain/core` | 0.3.80 | 0.3.80 | 1.2.9 | CoreApp, Nexus, Tuff Intelligence | Breaking migration; requires dedicated import/API/stream/quota/audit compatibility pass. |
| `@langchain/openai` | 0.4.9 | 0.4.9 | 1.5.10 | CoreApp, Nexus | Breaking migration; cannot be folded into plugin matrix cleanup. |
| `@langchain/anthropic` | 0.3.34 | 0.3.34 | 1.5.8 | CoreApp, Nexus | Breaking migration; same LangChain v1 track. |
| `@langchain/langgraph` | 0.4.9 | 0.4.9 | 1.4.13 | CoreApp, Nexus, Tuff Intelligence | Breaking migration; graph/runtime behavior needs separate acceptance. |
| `@anthropic-ai/claude-agent-sdk` | 0.2.141 | 0.2.141 | 0.3.250 | CoreApp | Minor-series migration candidate; requires packaged AI provider smoke. |
| `@earendil-works/pi-ai` | 0.80.10 | 0.80.10 | 0.84.3 | CoreApp | Minor-series migration candidate; requires Pi runtime/provider regression pass. |
| `@earendil-works/pi-agent-core` | 0.80.10 | 0.80.10 | 0.84.3 | CoreApp | Minor-series migration candidate; coupled to Pi tool gateway contracts. |
| `@sentry/electron` | 7.16.0 | 7.16.0 | 7.17.0 | CoreApp | Patch/minor candidate after privacy telemetry gate tests remain green. |
| `@sentry/nuxt` | 10.65.0 | 10.65.0 | 10.71.0 | Nexus | Patch/minor candidate after Nuxt build and telemetry/privacy route tests. |
| `@nuxt/content` | 3.15.0 | 3.15.0 | 3.16.0 | Nexus | Minor candidate, but docs SSG payload contract must be revalidated. |
| `@nuxtjs/i18n` | 10.4.1 | 10.4.1 | 10.6.0 | Nexus | Minor candidate; needs docs locale route parity. |
| `nuxt` | 4.4.8 | 4.4.8 | 4.5.2 | Nexus | Minor candidate; requires full Nexus typecheck/build. |
| `vite` | 7.3.6 | 7.3.6 | 8.2.2 | Root, CoreApp, TuffEx, plugins, packages | Major migration; release packaging and plugin builds must be split into a separate design. |
| `typescript` | 5.9.3 | 5.9.3 | 7.0.2 | Workspace-wide | Major migration; workspace type semantics and generated declarations require dedicated task. |
| `vitest` | 3.2.7 | 3.2.7 | 4.1.11 | Workspace-wide | Major migration; test harness and Electron mocks require dedicated task. |

## Decision

- Do not bulk-update SDK/framework packages in this acceptance slice.
- Safe candidates are patch/minor updates with focused owner tests and no public API shape change.
- Breaking tracks (`LangChain` v1, Vite 8, TypeScript 7, Vitest 4) need independent design, rollback points and package-by-package evidence.
