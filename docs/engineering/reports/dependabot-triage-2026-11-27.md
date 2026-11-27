# Dependency & Security Triage Report (`#483`, Dependabot PRs `#2299`–`#2307`)

- **Date**: 2026-11-27
- **Baseline**: `origin/master` @ `6022abdce` (`#2319`, after `#2321` Nuxt 4.5.2/unhead 3 & `#2325` `unplugin <3`)
- **Scope**: Read-only live triage of GitHub Dependabot alerts (`#483`), `pnpm check prod-audit` / `pnpm audit --prod`, and all 9 open Dependabot PRs (`#2299`–`#2307`). No advisory payloads or exploit details are copied into this record.

---

## 1. Issue `#483` — Live Reachability & Disposition

### Live Production Gate (`pnpm check prod-audit`)

- **Status**: **PASS** (`1 Critical/High advisories, 1 allowlisted`; `--self-test` 19/19 passed).
- **Live `pnpm audit --prod` counts** (1,303 prod + 325 optional deps):
  - **Critical**: `0`
  - **High**: `1` — `electron@41.10.7` (`GHSA-jr5w-w6x2-84p9`, allowlisted in `.github/prod-audit-allowlist.json`, owner `#328`, expires `2026-12-23`; no patched 41.x release exists, requires dedicated Electron 42+ major upgrade).
  - **Moderate**: `39`
  - **Low**: `12`
  - **Total `--prod` advisories**: `52`

#### Breakdown of the 51 Unblocked Moderate + Low `--prod` Advisories

| Dependency Chain | Count | Severities | Reachability / Notes |
| --- | ---: | --- | --- |
| `apps/core-app -> @anthropic-ai/claude-agent-sdk -> @modelcontextprotocol/sdk` (`hono`, `@hono/node-server`, `ip-address`, `fast-uri`) | 23 | 20 mod, 3 low | Transitive inside MCP SDK HTTP/schema deps (`hono@4.12.34`, `@hono/node-server@1.19.14`, `ip-address@10.3.1`, `fast-uri@3.1.7`). Note: PR `#2299` bumps `claude-agent-sdk` `0.2.141 -> 0.3.330` but keeps `@modelcontextprotocol/sdk@1.32.1`, so it does not clear these by itself. |
| `apps/nexus -> @sentry/nuxt -> nuxt@4.5.2` (`nuxt`, `@nuxt/nitro-server`, `@nuxt/schema`, `@nuxt/vite-builder`, `node-forge`, `@humanfs/node`, `serialize-javascript`) | 17 | 12 mod, 5 low | Reaches `--prod` because `@sentry/nuxt` is a runtime dependency of `apps/nexus`; `listhen`/`node-forge`, `@nuxt/vite-builder`, `@humanfs/node`, and `serialize-javascript` are build/dev-server subgraphs not executed inside the Cloudflare Pages Worker bundle. |
| `. -> electron@41.10.7` (excluding 1 allowlisted High) | 7 | 4 mod, 3 low | Tracked under the same Electron 42+ major-upgrade batch (`#328`). |
| `. -> @sentry/vite-plugin` (`glob`, `minimatch`) | 2 | 2 mod | Build-time Sentry source-map upload plugin listed in root `dependencies`. |
| `apps/core-app -> katex@0.16.45` | 1 | 1 low | Markdown math rendering dependency. |
| `apps/core-app -> v-wave -> @nuxt/kit -> ... -> postcss-selector-parser` | 1 | 1 mod | Transitive build-tooling chain via `v-wave`'s Nuxt module helper; not executed at Electron runtime. |

### Live GitHub Dependabot Alerts (`repos/talex-touch/tuff/dependabot/alerts?state=open`)

- **Total open alerts (paginated)**: **113** (all `npm`; `67` tagged `runtime`, `46` tagged `development`).
- **By severity**: `2` Critical · `11` High · `75` Medium · `25` Low.
- **Why Dependabot shows 2 Critical + 11 High while `pnpm audit --prod` shows 0 Critical + 1 High**:
  - **2 Critical (`tinypool`)**: `development` scope only (Vitest test runner in `pnpm-lock.yaml`, `0` hits in `--prod`).
  - **2 High (`electron` in `apps/core-app/package.json` & `apps/screenshot-acceptance/package.json`)**: `development` scope duplicates of the same Electron 41.10.7 advisory (`GHSA-jr5w-w6x2-84p9`).
  - **2 High (`electron` in root `package.json` & `pnpm-lock.yaml`)**: the **only** live `--prod` High advisory (allowlisted in `.github/prod-audit-allowlist.json` through `2026-12-23`, owner `#328`).
  - **7 High (`@intlify/shared`, `@nuxt/content`, `prosemirror-view`, `sharp` ×3, `zod`)**: flagged in `pnpm-lock.yaml` with Dependabot's coarse `runtime` tag, but **zero hits in `pnpm audit --prod`** (only present in `devDependencies` / non-prod workspace graphs).

### Recommended Disposition for `#483`

- **Keep `#483` OPEN** (do **not** close yet):
  - **Already complete**: Critical/High production release gate (`scripts/check-prod-audit.mjs` + `.github/prod-audit-allowlist.json` in `ci.yml`), plus `#2321` clearing all 9 Nuxt 4.4.8 / `simple-git` Critical+High allowlist entries.
  - **Remaining gaps blocking `#483` closure**:
    1. Electron 41 -> 42+ major upgrade (`GHSA-jr5w-w6x2-84p9`, expires `2026-12-23`, tracked by `#328`).
    2. Recorded triage/remediation of the `51` Moderate+Low `--prod` advisories (primarily the `@modelcontextprotocol/sdk` + `@sentry/nuxt` chains above) and the `dev`-only Dependabot alerts (`tinypool`, `vitest`, etc.).
    3. Explicit policy decision on whether CI should read the Dependabot alerts API (`security_events` permission scope) vs staying scoped to `pnpm audit --prod`.

---

## 2. Triage Matrix — Open Dependabot PRs (`#2299`–`#2307`)

### Systemic Blockers Affecting Multiple PRs

1. **`Branch Policy` (`scripts/check-branch-policy.mjs`) fails on ALL 9 PRs (`FAIL I3`)**: the branch whitelist only allows `master | stage | task/<type>/<slug> | gh-pages` and does not exempt `dependabot/*` branches. Until `check-branch-policy.mjs` (or merge policy) explicitly accounts for `dependabot/*`, **0 of 9 PRs are 100% green as-is**.
2. **Stale pre-`#2319` `Windows Everything Production Gate` failures on 8 of 9 PRs**: PRs `#2299`, `#2300`, `#2302`–`#2307` all ran before PR `#2319` (`6022abdce`, merged 2026-11-27T02:14Z) fixed the CoreBox result-surface clip bug (`Could not clip the CoreBox result surface; refusing a full-window screenshot that could leak user content`). Rebasing onto `origin/master` (`6022abdce`) picks up that fix.
3. **`napi` / `napi-derive` lockstep mismatch (`#2305` vs `#2306`)**: PR `#2305` bumps `napi-derive = "=3.7.1"` while `Cargo.toml` pins `napi = "=3.16.1"`, causing a real Rust compile failure (`E0425: cannot find function get_class_constructor_in_env in module napi::bindgen_prelude`) on Ubuntu, macOS, and Windows. `napi =3.16.2` (`#2306`) **must land first** (or both must be combined in one PR).

### Per-PR Disposition Table

| PR | Package / Change | Mergeable | Failing / Non-Green Checks | Root Cause & Action Needed | Ready Now? |
| --- | --- | --- | --- | --- | --- |
| **#2301** | `jdx/mise-action` `5.2.8 -> 5.3.0` (`.github/workflows/ci.yml`, `intelligence.yml`) | `MERGEABLE` | `Branch Policy` (1/16) | **Cleanest PR**: all 15 functional checks (CI, PR Body Guard, Cloudflare Pages, CodeRabbit) are **GREEN**. Only blocked by `Branch Policy` rejecting `dependabot/*`. | **Ready once Branch Policy allows `dependabot/*` (or manual admin merge)** |
| **#2302** | `cc` `1.4.0 -> 1.11.3` (`packages/tuff-native/Cargo.lock`) | `MERGEABLE` | `Branch Policy`, `Win Everything` (2/19) | `Native Protocol` (macOS/Linux/Win) + CI all **GREEN**. Needs rebase onto `6022abdce` (`#2319`) + Branch Policy resolution. | Needs rebase + Branch Policy |
| **#2303** | `libc` `0.2.189 -> 0.2.191` (`packages/tuff-native/Cargo.lock`) | `MERGEABLE` | `Branch Policy`, `Win Everything` (2/19) | `Native Protocol` (macOS/Linux/Win) + CI all **GREEN**. Needs rebase onto `6022abdce` (`#2319`) + Branch Policy resolution. | Needs rebase + Branch Policy |
| **#2306** | `napi` `3.16.1 -> 3.16.2` (`packages/tuff-native/Cargo.{toml,lock}`) | `MERGEABLE` | `Branch Policy`, `Win Everything` (2/19) | `Native Protocol` (macOS/Linux/Win) + CI all **GREEN**. **Merge BEFORE `#2305`** after rebase onto `6022abdce` + Branch Policy resolution. | Needs rebase + Branch Policy (prerequisite for `#2305`) |
| **#2300** | `@codemirror/language` `6.12.4 -> 6.13.1` (`packages/tuffex/package.json`, `pnpm-lock.yaml`) | `MERGEABLE` | `Branch Policy`, `Win Everything` (2/30) | All 27 CI / Tuffex / Nexus / Pages checks **GREEN**. Needs rebase onto `6022abdce` (`#2319`) + Branch Policy resolution. | Needs rebase + Branch Policy |
| **#2299** | `@anthropic-ai/claude-agent-sdk` `0.2.141 -> 0.3.330` (`apps/core-app/package.json`, `pnpm-lock.yaml`) | `MERGEABLE` | `Branch Policy`, `Win Everything` (2/30) | All 26 CI / CoreApp / Nexus / Pages checks **GREEN**, but `0.2 -> 0.3` is a `0.x` minor jump (potentially breaking SDK API); verify CoreApp agent integration + rebase onto `6022abdce`. | Needs review (`0.2 -> 0.3`) + rebase + Branch Policy |
| **#2304** | `@codemirror/autocomplete` `6.20.3 -> 6.20.4` (`packages/tuffex/package.json`, `pnpm-lock.yaml`) | `MERGEABLE` | `Branch Policy`, `Win Everything`, `Cloudflare Pages` (3/30) | All 26 GitHub Actions CI / Tuffex checks **GREEN**; `Cloudflare Pages` failed on stale 2026-11-24 base before `#2321`/`#2325`. Rebase onto `6022abdce` and re-check Pages. | Needs rebase + Pages re-check + Branch Policy |
| **#2307** | `vitepress` `2.0.0-alpha.18 -> 2.0.0-alpha.21` (`pnpm-workspace.yaml`, `pnpm-lock.yaml`) | `MERGEABLE` | `Branch Policy`, `Win Everything`, `PR Body Guard` (`CANCELLED`) (3/37) | All 32 CI / Tuffex / Native / Pages checks **GREEN**. `PR Body Guard` was cancelled by concurrency on push; `Win Everything` ran 2h before `#2319` merged. Also check overlap with PR `#2323` (which drops `vitepress` from `apps/nexus`). | Needs rebase + re-run + Branch Policy |
| **#2305** | `napi-derive` `3.7.0 -> 3.7.1` (`packages/tuff-native/Cargo.{toml,lock}`) | `MERGEABLE` | `Branch Policy`, `Win Everything`, `Native Protocol` (all 3 OSes), `Cloudflare Pages` (6/19) | **Real compile failure (`E0425`)**: `napi-derive 3.7.1` requires `napi 3.16.2` (`get_class_constructor_in_env`). **Blocked on `#2306`** (must merge `#2306` first, then rebase `#2305`, or combine both into one `task/chore/bump-napi-3-16-2` PR). | **BLOCKED on `#2306` (real Rust compile error)** |

### Recommended Execution Order for Dependabot Cleanup

1. Decide/fix `Branch Policy` handling for `dependabot/*` branches (separate scoped PR if desired).
2. Merge `#2301` (`jdx/mise-action` — already functionally green).
3. Rebase & merge `#2302` (`cc`), `#2303` (`libc`), `#2306` (`napi 3.16.2`), `#2300` (`@codemirror/language`), `#2304` (`@codemirror/autocomplete`), `#2307` (`vitepress`, checking `#2323` coordination).
4. After `#2306` merges, rebase `#2305` (`napi-derive 3.7.1`) so `Native Protocol` builds against `napi 3.16.2` (or close `#2305`+`#2306` in favor of one combined PR).
5. Review `#2299` (`@anthropic-ai/claude-agent-sdk 0.2.141 -> 0.3.330`) changelog/API compatibility before rebasing & merging.
