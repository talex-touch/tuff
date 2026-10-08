# Tuff 当前执行顺序

> Authority: this document is the sole global execution-order source. Confirm scope and acceptance with the user, then establish current status, blockers and handoff with the current owner using existing PRDs, engineering specifications and observed runtime evidence. Work planned before the 2026-10-03 cutover remains frozen in the [pre-cutover backlog](../engineering/workflow/backlog.md). `docs/comet/` preserves read-only pre-exit records and is not a source of live status or an execution entrypoint.

## Current order

1. **Close verified release and runtime blockers.** The OTA, macOS release-evidence, and application-icon acceptance work is frozen in the [pre-cutover backlog](../engineering/workflow/backlog.md); resume each one after confirming scope and acceptance with the user and handoff with the current owner, using its frozen record, PRD and evidence. The OTA parent was concurrently owned at cutover; this document does not restate its volatile child status.
2. **Complete the search and cross-platform remediation.** The [living audit](../engineering/reports/search-crossplatform-audit.md) owns the backlog; Windows productionization and the [search-index split write-path migration](../engineering/workflow/backlog.md#07-28-migrate-search-index-split-write-paths) are frozen records. The default-on topology is reconciled; the isolated-profile runtime evidence is still owed (see the [split acceptance record](../engineering/reports/search-index-split-write-acceptance.md)), and `=0` stays the emergency rollback.
3. **Continue remaining independently-owned work** in the order recorded here only after the preceding blocker lane is resolved; use user-agreed scope and acceptance, existing PRDs and engineering specifications, observed runtime evidence, and the current owner's handoff.

## Non-negotiable safety gates

- `TUFF_DB_SEARCH_SPLIT_ENABLED` defaults **on** since `cd39bdbf6` (2026-08-05). The 2d.3 write-path migration landed with it, so `database.db` and `search-index.db` each have exactly one writer connection and the half-migrated failure mode this gate used to guard against no longer exists. Setting it to `0` is the emergency revert to the shared-file topology, not the safe default.
- That flip was proved by three app runs, not by typecheck: schema parity plus a first-launch bootstrap reindex of 4678 items, a second boot that correctly skipped it, and a V2 run with zero `SQLITE_BUSY`, zero cross-home FK failures and zero retry exhaustion. Any future change to the split topology owes the same class of evidence.
- Historical reports prove only their recorded environment. Packaged and production claims require exact observed artifacts or deployed surfaces; they are never inferred from source state.

## Work-state rules

- Confirm live status with the current owner against the relevant existing PRD, engineering specification and observed evidence. Do not copy active counts, branch names, HEADs, dirty-worktree state, or implementation snapshots into this document.
- Independently verify the agreed acceptance before recording completion and handing off. Frozen pre-cutover records are never completed or archived by editing the backlog.
- Roadmaps, PRDs, engineering specifications, frozen task records, historical Comet records, and topical TODOs may describe local scope or immutable history but must not define another global priority order.

## Local and historical references

- Search/cross-platform audit: [living audit](../engineering/reports/search-crossplatform-audit.md)
- AI: [TODO-AI.md](./TODO-AI.md)
- R3: [TODO-R3.md](./TODO-R3.md)
- Nexus: [TODO-nexus.md](./TODO-nexus.md)
- Long-term debt: [docs/TODO-BACKLOG-LONG-TERM.md](./TODO-BACKLOG-LONG-TERM.md)
- Historical completion facts: [01-project/CHANGES.md](./01-project/CHANGES.md)
- 2026-08-31 maintenance audit: [actionable report](../engineering/reports/maintenance-audit-2026-08-31.md).
- 2026-09-01 maintenance audit: [actionable report](../engineering/reports/maintenance-audit-2026-09-01.md).
- 2026-09-02 maintenance audit: [actionable report](../engineering/reports/maintenance-audit-2026-09-02.md).
- 2026-08-30 maintenance audit: [actionable report](../engineering/reports/maintenance-audit-2026-08-30.md).
- 2026-09-03 maintenance audit: [actionable report](../engineering/reports/maintenance-audit-2026-09-03.md).

## Topical guardrails

- **R2 AI Stable** remains `historical 13/13 / current recapture open`. Any current-version claim must use `--requireCurrentVersion` and a manifest baseline matching `apps/core-app/package.json`; historical artifacts do not become current proof.
- **R9.2 ContextHygiene** retains completed P0/P1 and isolated packaged-entrypoint evidence, while real-profile and later scope migration remain open.
- **R8-F CatalogService MVP** 的 domain-lexicon 产品触发仍暂停；已获执行授权的 `09-13-voice-provider-cloud-pack` 是独立 scoped extension，代码与本地验证已完成，待 review/landing。AI/Assistant/OmniPanel polish、desktop fireworks 与 broad search-class refactors 继续按原顺序暂停。
- **macOS 原生能力渠道化**先进入 AI topical backlog，不抢占当前 release/search blocker：评估机器本地能力的运行时发现、自动注入与平台降级，详细范围见 [`TODO-AI.md`](./TODO-AI.md#macos-原生能力渠道化候选)。
