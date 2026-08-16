# Verification: W1 status/loading cluster (task #26)

- **Query**: Run vitest filters for the 4 W1 dirs + tuffex typecheck; confirm no new errors
- **Scope**: internal (read-only verification)
- **Date**: 2026-08-15 (re-verified after W4 fix; see "Update")
- **Components**: `working-indicator/`, `agent-trace/`, `task-rows/`, `code-stream/`

## Verdict

**W1 itself is clean.** Tests, typecheck and lint all pass for the four components. `pnpm typecheck` still exits 2 overall, but on **one** remaining error, in W3's `approval-card` — not W1's. Separately, **none of the four W1 dirs are exported from the barrel**, so they are not yet part of the built package.

## Commands run

Taken from `.github/workflows/package-tuffex-ci.yml` → `package-ci.yml`, which runs `pnpm typecheck` and `pnpm test` with `working-directory: packages/tuffex`. Not equivalents — CI's own commands.

| Check | Command | Result |
|---|---|---|
| Tests | `pnpm exec vitest run working-indicator agent-trace task-rows code-stream` | ✅ 4 files, **83/83 pass** (1.22s) |
| Typecheck | `pnpm typecheck` (`vue-tsc --noEmit -p tsconfig.json`) | ❌ exit 2 — **0 errors in W1**, 1 elsewhere |
| Lint | `pnpm exec eslint --no-cache <4 dirs>` | ✅ clean |

Per-file test counts: `working-indicator` 17, `agent-trace` 23, `task-rows` 21, `code-stream` 22.

## Typecheck errors (outside W1)

First pass found two; a re-run after W4's fix leaves one.

```
approval-card/src/TxApprovalCard.vue(147,8): error TS2769: No overload matches this call.
  Argument of type '"dismiss" | "reopen"' is not assignable to parameter of type '"dismiss"'.   ← STILL OPEN

dot-indicator/src/TxDotIndicator.vue(44,6): error TS2322:
  Type 'string | undefined' is not assignable to type 'Booleanish | undefined'.                 ← FIXED by W4
```

Both were **new, not pre-existing**: `git cat-file -e HEAD:<path>` reported both absent at HEAD, and `git status --porcelain` showed both directories untracked. Established without stashing or checking out, since several agents write this tree concurrently.

- `approval-card/` → task **#2** (W3), marked `completed` while its code does not typecheck. Blocks **#17**.
- `dot-indicator/` → task **#11** (W4) — resolved.

The `TxApprovalCard` error shape: calling a `defineEmits` overload with a pre-unioned event name (`'dismiss' | 'reopen'`). TS resolves overloads one at a time, so a union argument matches none. Fix is to branch at the call site rather than union the event name.

## Barrel gap — W1 is not in the package

None of the four directories appear in `packages/tuffex/packages/components/src/components.ts`:

| dir | files | in `components.ts` |
|---|---|---|
| `working-indicator/` | 5 | ❌ |
| `agent-trace/` | 4 | ❌ |
| `task-rows/` | 4 | ❌ |
| `code-stream/` | 4 | ❌ |

Consequences: not in the build output, unreachable via `@talex-touch/tuffex` or its `./*` subpath export, and **AC1 is not met** until this lands. PRD constraint says shared files (barrel, demo-registry, docs index) are edited by the main session, so this is expected pending work rather than a W1 defect — but W1 cannot be called done without it.

Verified nothing external references them yet, using a positive control (a bare `grep` with unquoted `--include` globs silently returns nothing under zsh, which produces a false "no references"):

- Positive control `TxSpinner`: **65** files outside its own dir ✅ scan works
- `TxWorkingIndicator|TxAgentTrace|TxTaskRows|TxCodeStream`: **0** files outside their own dirs

## Update: the `inert` fix generalises to two shipped components

W1 added `inert` to the closed disclosures in `agent-trace` and `task-rows`, on the reasoning that a `grid-template-rows: 0fr` region still leaves its contents in the tab order. That is correct, and it is **not** specific to the new components — the same 0fr/1fr disclosure grammar is used by four existing tuffex components, none of which set `inert`:

| component | `inert`? | focusable content while collapsed | real? |
|---|---|---|---|
| `TxSources` | ❌ | `<a :href="source.url">` — **one per source** (`TxSources.vue:106-110`) | **yes** |
| `TxToolCallCard` | ❌ | retry `<button>` in the error branch (`TxToolCallCard.vue:141`) | **yes** |
| `TxChainOfThought` | ❌ | only `overflow: auto` bodies (`:337`) | marginal |
| `TxReasoningDisclosure` | ❌ | only `overflow: auto` text (`:177`) | marginal |

`TxSources` is the worst case: a collapsed source list puts N links in the tab order, so keyboard users tab through invisible destinations. `TxToolCallCard` exposes one button, and only when the call errored. The bottom two have no focusable elements of their own — a scrollable region can take sequential focus in some engines, but at zero height while collapsed it is browser-dependent and marginal, so they are noted rather than claimed.

**Timing note:** task **#20** (`TxSources variant='stack'`) is in progress as of this writing, so `TxSources` is already open on someone's desk — the cheapest moment to fix it.

The binding form matters and is easy to get wrong: it must be `:inert="open ? undefined : true"`. Vue does not treat `inert` as a special boolean attribute, so `:inert="false"` renders the literal `inert="false"`, which is **still inert** — the attribute's mere presence is what counts. Same trap applies to any component adopting this.

## Deferred: downstream typecheck

tuffex's own `vue-tsc` is weaker than both consumers — nexus adds `noUncheckedIndexedAccess`, and CoreApp lacks `allowImportingTsExtensions` (a `./x.ts` value import there is TS5097). New tuffex source can pass here and fail downstream.

That check is **moot right now** (nothing imports these components), but it **must be re-run after the barrel export lands**. One risk pre-cleared: no `.ts`-extension value imports exist in any of the four dirs, so the TS5097 trap is not present.

## Convention note (not a defect)

The four `index.ts` files use `import component from './Tx*.vue'` + `const TxX = withInstall(component)` + `export { TxX }`, exporting only the installed binding. The older `spinner/index.ts` exports both an alias and the raw component (`export { Spinner, TxSpinner }`). Both satisfy the `install()` loop in `src/index.ts`, which registers anything carrying a runtime `.install`. Flagged only so the barrel edit uses the right name.

## Known accepted deviation (AC2)

`code-stream` takes the shiki path rather than porting BUI's hand-rolled `Tok[][]` model, and accepts the palette delta instead of writing a custom theme mapping `kw → --accent-ink` / `str → --green` / `dim → --ink-3`. Pre-authorised by design.md §8.2 ("结构一致、高亮配色近似") and recorded with the coordinator as the one known visual delta against `shots/` in W1. If the visual spot-check rejects it, the scope mapping in `fusion-status-loading.md` §4.1 is what the custom theme would be built from.

## What I could not verify

- Build (`pnpm build`) — not run; the barrel gap makes it uninformative for W1 regardless.
- The `post-build-command` audit chain (`audit:exports`/`audit:readme`/`audit:types`/`audit:size`). Note `package-tuffex-ci.yml:38-40` carries a comment saying only two of these pass and that `audit:types`/`audit:size` are broken/over-budget, yet line 41 runs all eight — a pre-existing contradiction between comment and command, tracked upstream in #1555.
- Visual parity against `shots/` (AC2) — needs a rendering pass, not a typecheck.
