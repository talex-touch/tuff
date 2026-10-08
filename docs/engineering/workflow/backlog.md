# 冻结的迁移前任务（Frozen backlog）

> 2026-10-03 项目工作流从 Trellis 切换到 Comet Native。本文件由迁移时（基线 `cfda0a6cd` 之上的工作区）每个旧活跃任务的 `task.json` 原值生成，只读，不是第二套任务状态机。

## 如何使用

- 这里的任务全部**冻结**：既不算完成，也不算放弃，更没有被任何 Comet 变更接管。`冻结时状态` 是切换那一刻的原值，之后不再更新。
- 恢复其中一项：先读它的记录、交接与证据，与用户重新确认目标、范围和验收，再核对现有 PRD、工程规格与真实运行证据，并与当前负责人确认交接。不要直接编辑本文件来推进或关闭任务。
- 当前工作的进展与阻塞以现有工程记录和当前负责人交接为准；`docs/comet/` 只读保留退出前记录，不作为实时状态。全局执行顺序仍以 [docs/plan-prd/TODO.md](../../plan-prd/TODO.md) 为准。
- 全部旧任务（含已归档的历史任务）的身份登记见 [retired-task-index.json](retired-task-index.json)；迁移时有未保存内容的任务在 [handoffs/](handoffs/README.md) 下有逐字节交接副本。
- 本机迁移基线为 `cfda0a6cd1a13b5606c82d7d9d68112177d3fc9d`。历史链接使用已公开的 `0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e`：已核对两者的旧任务与旧归档目录 Git tree 完全相同，因此链接可立即在线打开。本机仍可用 `git show <迁移基线>:<路径>` 恢复原始文件。
- `⚠️ 状态存疑` 只列出记录之间可核对的矛盾（勾选项、`completedAt`、父子关系、外部复验），不代表已判定完成或失效。

## 概况

- 冻结任务 170 项：`in_progress` 100 项、`planning` 70 项。
- 其中 35 项在迁移时有未保存内容，已建立交接；28 项标注了状态存疑。
- 已归档的历史任务 260 项只在身份登记中出现，不在本文件列出。

## 07-09-audit-search-system-architecture

- **标题**：Audit and Remediate Search and System Architecture
- **描述**：Parent planning and integration task for the audited plugin-window, search-session, indexing, storage, and provider-lifecycle risks.
- **旧身份**：id `audit-search-system-architecture` · 冻结时状态 `planning` · 优先级 P0
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-09
- **下一步**（`meta.nextAction`）：When TODO.md reaches the search-architecture tranche, resume the remaining children in dependency order, starting with storage hydration and session scope.
- **阻塞**（`meta.blocker`）：Deferred by the sole global order in docs/plan-prd/TODO.md; no additional parent-level implementation runs before its child prerequisites.
- **证据**（`meta.evidence`）：prd.md acceptance checklist plus the linked child task PRDs.
- **备注**（`notes`）：Parent task only; implementation is split into reviewed child tasks with explicit dependencies.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 `07-09-contain-plugin-window-boundary`（已归档 · `completed`）、`07-09-serialize-search-gather-updates`（已归档 · `completed`）、`07-09-scope-search-sessions-and-streams`（已归档 · `completed`）、`07-09-gate-search-on-storage-hydration`（已归档 · `completed`）、`07-09-establish-single-search-index-writer`（已归档 · `completed`）、[`07-09-unify-search-provider-lifecycle`](#07-09-unify-search-provider-lifecycle)（冻结 · `planning`）、`07-15-progressive-corebox-index-search`（已归档 · `completed`）
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-09-audit-search-system-architecture/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-09-audit-search-system-architecture)

## 07-09-unify-search-provider-lifecycle

- **标题**：Unify Search Provider Lifecycle
- **描述**：Add typed async provider lifecycle, disposal ownership, executable registry entries, and health-aware search admission.
- **旧身份**：id `unify-search-provider-lifecycle` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-09
- **下一步**（`meta.nextAction`）：Implement the typed provider lifecycle and health admission. The three prerequisites this task waited on are complete, so the first step is the PRD acceptance list itself rather than another dependency: give ISearchProvider a typed destroy/lifecycle contract (packages/utils/core-box/tuff/tuff-dsl.ts:1524) and make search execution read the provider registry instead of the hard-coded map at search-core.ts:428.
- **阻塞**（`meta.blocker`）：None from the prerequisite list. All three named prerequisites completed and archived (07-09-gate-search-on-storage-hydration 2026-07-17, 07-09-establish-single-search-index-writer 2026-07-18, 07-09-scope-search-sessions-and-streams 2026-07-27), each with a fully checked PRD. The remaining gate is scheduling order in docs/plan-prd/TODO.md, not an unresolved dependency (#305).
- **证据**（`meta.evidence`）：prd.md acceptance checklist and provider lifecycle/registry tests.
- **备注**（`notes`）：Prerequisites: 07-09-scope-search-sessions-and-streams, 07-09-gate-search-on-storage-hydration, and 07-09-establish-single-search-index-writer.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`07-09-audit-search-system-architecture`](#07-09-audit-search-system-architecture)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-09-unify-search-provider-lifecycle/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-09-unify-search-provider-lifecycle)

## 07-13-search-crossplatform-audit

- **标题**：Search & cross-platform audit backlog
- **描述**：Living search and cross-platform risk backlog; implementation is delegated to independently verifiable child tasks.
- **旧身份**：id `search-crossplatform-audit` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-13
- **下一步**（`meta.nextAction`）：After the active file-filtering slice and earlier TODO.md priorities, create one child task for the highest unclosed audited risk and preserve its evidence boundary.
- **阻塞**（`meta.blocker`）：Deferred by docs/plan-prd/TODO.md; the completed ranking child is archived and the remaining backlog is not an active implementation batch.
- **证据**（`meta.evidence`）：prd.md severity checklist, child-task map, and task-specific focused evidence.
- **备注**（`notes`）：Backlog container only; current global ordering is owned by docs/plan-prd/TODO.md.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 `07-13-fix-ranking-dead-features`（已归档 · `completed`）、[`07-17-windows-everything-productionization`](#07-17-windows-everything-productionization)（冻结 · `in_progress`）、[`07-28-migrate-search-index-split-write-paths`](#07-28-migrate-search-index-split-write-paths)（冻结 · `planning`）
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-13-search-crossplatform-audit/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-13-search-crossplatform-audit)；活审计 [search-crossplatform-audit.md](../reports/search-crossplatform-audit.md)

## 07-17-unify-ota-update-flow

- **标题**：统一 OTA 更新链路
- **旧身份**：id `unify-ota-update-flow` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-17
- **归属说明**：迁移前 `docs:verify` 对该任务的 meta 缺失设有显式豁免，理由原文：“Concurrent owner retains this OTA parent lifecycle metadata until its child acceptance closes.”
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 `07-17-unify-ota-provider-security`（已归档 · `completed`）、`07-17-persist-ota-lifecycle`（已归档 · `completed`）、`07-17-unify-ota-install-recovery`（已归档 · `completed`）、`07-17-ota-ui-release-acceptance`（已归档 · `completed`）、[`07-22-ota-one-click-background-update`](#07-22-ota-one-click-background-update)（冻结 · `in_progress`）、[`07-27-bilingual-whats-changed`](#07-27-bilingual-whats-changed)（冻结 · `in_progress`）
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-17-unify-ota-update-flow/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-17-unify-ota-update-flow)

## 07-17-windows-everything-productionization

- **标题**：Productionize Windows Everything Search
- **描述**：Close SDK/CLI strategy, packaged native availability, diagnostics, Windows acceptance, and P50/P95 evidence for Everything search.
- **旧身份**：id `windows-everything-productionization` · 冻结时状态 `in_progress` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-17
- **下一步**（`meta.nextAction`）：Run the hosted Windows Everything gate, then fill manualChecks.everythingSearch (queries + coreBoxUiEvidence paths) from the uploaded corebox-ui artifacts and run: pnpm -C apps/core-app run windows:acceptance:verify -- --input &lt;manifest.json> --strict --requireEvidencePath --requireExistingEvidenceFiles --requireNonEmptyEvidenceFiles --requireCompletedManualEvidence --requireEvidenceGatePassed --requireCaseEvidenceSchemas --requireVerifierCommand --requireVerifierCommandGateFlags --requireRecommendedCommandGateFlags --requireRecommendedCommandInputMatch --requireSearchTrace --requireClipboardStress --requireEverythingSearchManualChecks --requireEverythingSearchUiEvidence --requireCommonAppLaunchDetails --requireCopiedAppPathManualChecks --requireUpdateInstallManualChecks --requireDivisionBoxDetachedWidgetManualChecks --requireTimeAwareRecommendationManualChecks --requireCommonAppTargets ChatApp,Codex,Apple Music
- **阻塞**（`meta.blocker`）：No Windows run has produced the packaged CoreBox UI artifacts yet: the probe, its strict verifier, the hosted workflow steps, and the manifest contract exist, but only a windows-2022 run can satisfy the win32/platform, live sdk-napi marker rows, and visible degraded-reason invariants.
- **证据**（`meta.evidence`）：GitHub Actions run 29628880312 passed all steps. Artifact windows-everything-production-evidence contains SDK 1.4.1.1032 with 200/200 non-empty samples and P50/P95/max 2/3/4ms; CLI 1.1.0.30 with 200/200 non-empty samples and P50/P95/max 8/9/26ms; exact unavailable state SDK error 2 and CLI exit 8; packaged everything.js, everything-resources.js, and 185856-byte tuff_native_everything.node SHA-256 3fe24155107a74ed61521f4c943f23050ea17c9fc17873ea144fe0791a576d83. Local verification also passed 9 native tests, 161 focused tests, node/web typechecks, production build, lint, PowerShell parser, actionlint, Trellis validation, and reviewer re-check. Packaged CoreBox UI collector observed on macOS (2026-09-29, dist/mac-arm64/tuff.app, isolated profile): ui.show made the packaged CoreBox renderer visible, normal and @file marker queries rendered 29 rows with 29 marker matches, the structured-filter and empty-token queries rendered 0 rows, and the run wrote everything-corebox-ui-evidence.json plus four result-column screenshots (no absolute paths). The strict verifier rejected that artifact for platform=darwin and a missing degraded reason, and accepted the mode/empty/screenshot invariants; no Windows artifact exists yet.
- **备注**（`notes`）：Implementation, diagnostics, managed SDK resources, hosted Windows SDK/CLI/unavailable evidence, focused tests, Windows package/native gates, and the packaged CoreBox UI collector/verifier/manifest contract are complete; packaged CoreBox UI acceptance still needs a hosted Windows artifact run.
- **工作区事实**：base `master` · branch `TalexDreamSoul/goaler` · worktree 无 · commit `9fd368ed36498220f877128e979958b2a9366ebd` · PR `https://github.com/talex-touch/tuff/pull/287`
- **关系**：父任务 [`07-13-search-crossplatform-audit`](#07-13-search-crossplatform-audit)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-17-windows-everything-productionization/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-17-windows-everything-productionization)

## 07-22-ota-one-click-background-update

- **标题**：OTA 一键预下载与无感更新
- **旧身份**：id `ota-one-click-background-update` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-22
- **下一步**（`meta.nextAction`）：Run the N to N+1 smoke on a Mac. The artifacts exist: v2.4.14-beta.1 and v2.4.14-beta.2 both ship a signed macOS arm64 .app.zip, and both release jobs report Developer ID signing with "notarization successful". What is left is the run and its phase timings, not a build.
- **阻塞**（`meta.blocker`）：A macOS benchmark host. Not, as this said before, the absence of an official trusted package -- that arrived on 2026-08-03.
- **证据**（`meta.evidence`）：Nine of the ten prd criteria are checked. The code paths behind them have named tests in update-install-coordinator.test.ts: "prepares and starts one helper even when BEFORE_APP_QUIT and WILL_QUIT repeat" covers the single-helper rule, "keeps a macOS update ready when the current build cannot use silent install" covers the non-writable case staying ready instead of elevating, "confirms the target version once, promotes its package, and writes a matching health ack" and "refuses to acknowledge health when startup runs a version other than the plan target" cover the health handshake, and "marks a previous-version restart as recovered when a matching recovery marker exists" covers one-shot recovery. The unchecked criterion is the end-to-end timing on real hardware, which no test can stand in for.
- **工作区事实**：base `fix/corebox-icons-db-hardening` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：已修改 3 个文件
- **关系**：父任务 [`07-17-unify-ota-update-flow`](#07-17-unify-ota-update-flow)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/07-22-ota-one-click-background-update/README.md](handoffs/07-22-ota-one-click-background-update/README.md)；基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-22-ota-one-click-background-update/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-22-ota-one-click-background-update)

## 07-24-harden-app-icon-self-healing

- **标题**：应用图标自愈与数据库句柄加固
- **旧身份**：id `harden-app-icon-self-healing` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-24
- **下一步**（`meta.nextAction`）：Run the real-profile smoke against an official-attested N+1 release and record native trust pass evidence.
- **阻塞**（`meta.blocker`）：An official-attested N+1 release is unavailable; local unsigned packaging cannot satisfy this acceptance criterion.
- **证据**（`meta.evidence`）：prd.md acceptance criteria record real-profile hydration, native stress, focused tests, and the pending official-release proof.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-24-harden-app-icon-self-healing/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-24-harden-app-icon-self-healing)

## 07-26-install-launch-v2-4-13-beta-23

- **标题**：下载安装并启动 v2.4.13-beta.23
- **描述**：下载已发布的 macOS arm64 beta.23，验证发布资产，备份当前安装后安装并启动
- **旧身份**：id `install-launch-v2-4-13-beta-23` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-26
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：被本机 .git/info/exclude 排除 4 个文件
- **关系**：父任务 无；子任务 无
- **记录**：本机交接位于 `handoffs/07-26-install-launch-v2-4-13-beta-23/README.md`，沿用原有本机忽略边界，不进入版本控制。
- **⚠️ 状态存疑**：PRD 的 4 条验收项全部勾选，但 `status` 仍为 `in_progress`；[2026-07-27 文档问题报告](../reports/nexus-docs-issue-report-2026-07-27.md) 复验时 `~/Applications/Tuff-backups/` 为空，备份验收项没有证据，并建议不归档。该目录原由本机 `.git/info/exclude` 排除，没有 Git 历史；原文仅保存在本机交接与迁移快照中。

## 07-27-bilingual-whats-changed

- **标题**：提供双语 What's Changed 发布日志
- **旧身份**：id `bilingual-whats-changed` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-27
- **下一步**（`meta.nextAction`）：Capture desktop and narrow-window CoreApp screenshots of the release-notes modal and the Update history route, once no release build holds the startup guard.
- **阻塞**（`meta.blocker`）：Visual runtime evidence only. Electron dev launch is still gated by the release-build startup guard; the coreapp-visible-* probe family needs a running app, so no screenshot can be produced from this environment.
- **证据**（`meta.evidence`）：Evidence is recorded in three separate kinds, which must not substitute for one another.<br>1. Workflow syntax — RESOLVED 2026-08-07. actionlint 1.7.12 (installed by mise on darwin/arm64, built with go1.26.1) reports zero findings for .github/workflows/build-and-release.yml, and zero across all 18 workflow files when run with no path argument. Commands: `mise x actionlint@1.7.12 -- actionlint .github/workflows/build-and-release.yml` and `mise x actionlint@1.7.12 -- actionlint`; both exit 0 with empty output. This supersedes the earlier "workflow YAML parse" check, which only proved the file was well-formed YAML, not that its Actions expressions and job graph were valid.<br>2. Automation — 107 focused tests passed; package ESLint, CoreApp node/web typechecks, Nexus typecheck, pnpm quality:pr, CoreApp build, release:notes:verify and git diff --check all passed.<br>3. Visual runtime — STILL OPEN. No screenshot has been taken. Nothing above is a substitute for it.
- **备注**（`notes`）：Implementation complete across gateway, workflow, Nexus, typed transport, SQLite/main service, startup modal, and Update history UI. Automated verification passes; actionlint and isolated Electron visual screenshots remain external acceptance gaps.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`07-17-unify-ota-update-flow`](#07-17-unify-ota-update-flow)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-27-bilingual-whats-changed/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-27-bilingual-whats-changed)

## 07-27-expose-plugin-search-sdk

- **标题**：开放插件 SearchSDK
- **描述**：候选待办：出现至少两个真实插件消费者后，再将现有快速匹配能力封装为通用插件 SearchSDK。
- **旧身份**：id `expose-plugin-search-sdk` · 冻结时状态 `planning` · 优先级 P3
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-27
- **下一步**（`meta.nextAction`）：Reassess the SDK only when a second real plugin consumer exists and then restart scoped planning.
- **阻塞**（`meta.blocker`）：Only one real consumer exists, so a generic SearchSDK abstraction would be premature.
- **证据**（`meta.evidence`）：task.json notes and prd.md record the single-consumer deferral rationale.
- **备注**（`notes`）：2026-07-27: 从 Clipboard History 优化范围移出；单一消费者不足以支撑通用 SDK，等待第二个真实消费者后重启规划。
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-27-expose-plugin-search-sdk/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-27-expose-plugin-search-sdk)

## 07-27-fix-plugin-folder-button

- **标题**：修复插件目录按钮无响应
- **描述**：The folder button on the installed-plugins page did nothing visible. It called appSdk.showInFolder on the plugin root, and the handler passed every target to Electron shell.showItemInFolder -- which reveals a file inside its parent, and is not the same thing as opening a directory. Opening the directory is what this entry did before f86d4596c4, so the SDK migration was a behaviour regression, and the failure was unobservable because showItemInFolder returns void.
- **旧身份**：id `fix-plugin-folder-button` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-27
- **下一步**（`meta.nextAction`）：Confirm on a running macOS build that the plugin-page folder button opens the plugin root in Finder, then check the last prd criterion and close the task.
- **阻塞**（`meta.blocker`）：A launchable Electron runtime. The prd marks this criterion as needing real-machine confirmation, and it is the only one still unchecked.
- **证据**（`meta.evidence`）：system-shell-handlers.ts branches directory -> shell.openPath and file -> showItemInFolder, turning empty, unreachable and failed-open targets into rejected Promises. six vitest cases in system-shell-handlers.test.ts cover exactly those branches: opens directories directly, rejects when Electron fails to open a directory, sanitizes rejected directory-open errors, reveals regular files in their containing folder, rejects empty folder targets, rejects inaccessible folder targets without exposing the path.
- **备注**（`notes`）：Implementation and automated coverage are in the tree. system-shell-handlers.ts branches on fs.stat: a directory goes to shell.openPath and a non-empty error string or a throw becomes a rejected Promise, while a regular file still goes to showItemInFolder, so the reveal-a-file semantics did not regress. Plugin.vue reads info.path.pluginPath rather than modulePath, awaits the call, and on failure logs and shows toast.error(t('plugin.folderOpenFailed')) -- a key that exists in both en-US and zh-CN under the plugin scope -- with the loading flag reset in finally, so the debounce is intact.<br><br>Four of the five prd acceptance criteria are checked. The fifth is annotated in the prd itself as pending confirmation on a launchable Electron runtime, which is the only thing left. Reported on #353.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-27-fix-plugin-folder-button/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-27-fix-plugin-folder-button)

## 07-27-optimize-core-utility-plugins

- **标题**：优化核心效率插件
- **描述**：统一审计并优化 Translation、Intelligence 与 Clipboard 三个插件，建立独立子任务和跨插件验收标准。
- **旧身份**：id `optimize-core-utility-plugins` · 冻结时状态 `planning` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-27
- **下一步**（`meta.nextAction`）：Coordinate the Translation, Intelligence, and Clipboard child plans and define cross-plugin acceptance before implementation starts.
- **阻塞**（`meta.blocker`）：All three child workstreams remain planning tasks without approved scoped acceptance evidence.
- **证据**（`meta.evidence`）：prd.md, design.md, implement.md, and the three-child task map define the program boundary.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 [`07-27-optimize-intelligence-plugin`](#07-27-optimize-intelligence-plugin)（冻结 · `planning`）、[`07-27-optimize-translation-plugin`](#07-27-optimize-translation-plugin)（冻结 · `planning`）、`07-27-optimize-clipboard-plugin`（已归档 · `completed`）、[`08-22-autopaste-plugin-beta-e2e`](#08-22-autopaste-plugin-beta-e2e)（冻结 · `in_progress`）
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-27-optimize-core-utility-plugins/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-27-optimize-core-utility-plugins)

## 07-27-optimize-intelligence-plugin

- **标题**：优化 Intelligence 插件
- **描述**：审计并优化 Intelligence 插件的智能命令工作流、产品体验、交互、稳定性与实现质量。
- **旧身份**：id `optimize-intelligence-plugin` · 冻结时状态 `planning` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-27
- **下一步**（`meta.nextAction`）：Complete the Intelligence workflow audit and turn its findings into a scoped implementation plan and acceptance evidence.
- **阻塞**（`meta.blocker`）：The child remains in planning; implementation cannot start before its audit and acceptance scope are approved.
- **证据**（`meta.evidence`）：prd.md and parent program task map define the Intelligence optimization contract.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`07-27-optimize-core-utility-plugins`](#07-27-optimize-core-utility-plugins)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-27-optimize-intelligence-plugin/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-27-optimize-intelligence-plugin)

## 07-27-optimize-translation-plugin

- **标题**：优化 Translation 插件
- **描述**：审计并优化 Translation 插件的翻译工作流、产品体验、交互、稳定性与实现质量。
- **旧身份**：id `optimize-translation-plugin` · 冻结时状态 `planning` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-27
- **下一步**（`meta.nextAction`）：Complete the Translation workflow audit and turn its findings into a scoped implementation plan and acceptance evidence.
- **阻塞**（`meta.blocker`）：The child remains in planning; implementation cannot start before its audit and acceptance scope are approved.
- **证据**（`meta.evidence`）：prd.md and parent program task map define the Translation optimization contract.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`07-27-optimize-core-utility-plugins`](#07-27-optimize-core-utility-plugins)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-27-optimize-translation-plugin/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-27-optimize-translation-plugin)

## 07-28-migrate-search-index-split-write-paths

- **标题**：Migrate search-index split write paths
- **描述**：Move every remaining search-index write path to the worker-owned database and prove flag-on app behavior before enabling the split.
- **旧身份**：id `migrate-search-index-split-write-paths` · 冻结时状态 `planning` · 优先级 P1
- **归属**：assignee `TalexDreamsoul` · creator `TalexDreamsoul` · 创建于 2026-07-28
- **下一步**（`meta.nextAction`）：Run the app-run gate: `pnpm -C apps/core-app run search-split:app-evidence -- --profile /tmp/tuff-split-evidence` (add `--repoSummary <file>` for the repository copy), then replace the 'Not executed' section of acceptance.md with the observed checks and attach the report.
- **阻塞**（`meta.blocker`）：Release-readiness only: the split defaults on since cd39bdbf6 (runtime-flags.ts:26) and =0 is the rollback; what blocks release claims is the absence of direct runtime evidence, not the flag direction. That evidence is now one command away — no application run has been executed yet, so no R3 criterion is claimed.
- **证据**（`meta.evidence`）：2026-09-29: design.md writer inventory reconciled against the working tree (app-provider transactions are the catalog and stay on the primary on purpose; file-provider has no withDbWrite; embedding-service no longer exposes addEmbedding; 22 of the old line references are stale; the two sites first flagged as unguarded are flag-off branches). Harness delivered: apps/core-app/scripts/search-split-app-evidence.ts + acceptance.md assertion matrix. Executed: --self-check (30 wiring assertions, exit 0), 88 vitest tests across the harness and the topology verifier (real-SQLite sentinel semantics, live-home parity, process-group kill), CLI guard smoke (6 refusal paths exit 1). Fixed in search-split-topology-verify.ts: compareParity compared the union of both files, which reports parity across a rollback while the primary index is empty; it now compares live homes and takes the judged run's `expect`. 2026-08-13: prd/design/implement rewritten against runtime-flags.ts:26 and docs/plan-prd/TODO.md.
- **备注**（`notes`）：Migrated from root todo.md, where the pre-flip contract was default-off with a silent-data-loss warning; cd39bdbf6 (2026-08-05) inverted the default and #1745 reconciled this task's artifacts to the default-on runtime on 2026-08-13.
- **工作区事实**：base `TalexDreamsoul/docs-sot-convergence` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`07-13-search-crossplatform-audit`](#07-13-search-crossplatform-audit)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-28-migrate-search-index-split-write-paths/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-28-migrate-search-index-split-write-paths)；活验收记录 [search-index-split-write-acceptance.md](../reports/search-index-split-write-acceptance.md)

## 07-28-rust-native-protocol-screenshot

- **标题**：Unify Rust native protocol and screenshot runtime
- **旧身份**：id `rust-native-protocol-screenshot` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-28
- **下一步**（`meta.nextAction`）：Release condition: reopen when lanes 1 and 2 close. No bounded child is named yet because the ordering, not the scope, is what is blocking (#309).
- **阻塞**（`meta.blocker`）：Deferred by docs/plan-prd/TODO.md:9 -- remaining independently-owned active tasks continue only after the preceding blocker lane resolves. As of 2026-08-13 lane 1 (release/runtime blockers: #326 OTA, #482 release notes) and lane 2 (search and cross-platform remediation: #334, #351) are both open.
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 `07-28-rust-native-communication-protocol`（已归档 · `completed`）、[`07-28-rust-screenshot-mvp`](#07-28-rust-screenshot-mvp)（冻结 · `planning`）
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-28-rust-native-protocol-screenshot/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-28-rust-native-protocol-screenshot)

## 07-28-rust-screenshot-mvp

- **标题**：Productionize Rust screenshot MVP
- **旧身份**：id `rust-screenshot-mvp` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-28
- **下一步**（`meta.nextAction`）：Start the children in its delivery map, or fold the map into whichever child now leads. The research it produced is done.
- **阻塞**（`meta.blocker`）：None recorded. This is a parent whose scope is carried by child tasks.
- **证据**（`meta.evidence`）：research/pixpin-scrollsnap-feature-audit.md is the produced artefact - a feature audit of the reference implementation. The prd carries a Confirmed Facts section and a Child Delivery Map rather than implementation criteria.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`07-28-rust-native-protocol-screenshot`](#07-28-rust-native-protocol-screenshot)（冻结 · `planning`）；子任务 [`07-29-macos-screenshot-capture-core`](#07-29-macos-screenshot-capture-core)（冻结 · `in_progress`）、`07-29-screenshot-tool-workflow`（已归档 · `completed`）、[`07-29-screenshot-long-capture`](#07-29-screenshot-long-capture)（冻结 · `planning`）、[`07-29-screenshot-annotation-editor`](#07-29-screenshot-annotation-editor)（冻结 · `planning`）、[`07-29-screenshot-image-pin-history`](#07-29-screenshot-image-pin-history)（冻结 · `planning`）、[`07-29-screenshot-ocr-qr-color`](#07-29-screenshot-ocr-qr-color)（冻结 · `planning`）、[`07-29-screenshot-packaged-evidence`](#07-29-screenshot-packaged-evidence)（冻结 · `planning`）
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-28-rust-screenshot-mvp/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-28-rust-screenshot-mvp)

## 07-29-macos-screenshot-capture-core

- **标题**：Build macOS screenshot capture core
- **旧身份**：id `macos-screenshot-capture-core` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-29
- **下一步**（`meta.nextAction`）：Two of the nine acceptance criteria are still open. AC2 needs window-list stability shown across AppKit, Electron and browser windows and across close, minimise, move, cross-screen and expired id generation. AC8 needs Windows and Linux producing a basic single-screen region PNG through the same protocol capability, and declaring the advanced ones unavailable. The other seven are ticked.
- **阻塞**（`meta.blocker`）：Hardware and display access, for both. AC1 already records that this machine is single-display, so cross-screen evidence is not claimed. AC8 cannot be closed on hosted runners either: the Protocol matrix does run on macos-latest, windows-2022 and ubuntu-latest, but its screenshot steps are contract and export checks - verify-screenshot-production.js and screenshot-protocol.test.js contain no capture call at all - because a hosted runner has no display to capture.
- **证据**（`meta.evidence`）：Seven of nine ACs ticked in prd.md, including the Rust coordinate and hit-test suites, the stable protocol error mapping, the stream ordering and credit backpressure, and the local fmt/clippy/workspace/release pass. The Protocol matrix builds and verifies the screenshot addon on all three platforms, which covers the capability surface but not a real capture.
- **备注**（`notes`）：Implementation approved and started 2026-07-29 after PRD/design/TDD review. Scope is capture core only: exact-ID macOS window recognition, AX fallback, mixed-DPI/negative-origin/rotation geometry, ScreenCaptureKit capture/frames, xcap basic Windows/Linux, and protocol/CoreApp migration. Protocol dependency remains uncommitted; screenshot parent and sibling tasks remain planning. Phases 0-3 are complete: shared geometry/window fixtures, bounded region/chunk planning, typed request/error/limits, backend-owned generation contracts, latest-slot stream bridge, protocol N-API exports, Node-only screenshot carrier, and feature-gated real-addon NativeTransport integration. Protocol-only hard cut approved 2026-07-29: all five legacy exports, ./screenshot, CoreApp raw-addon loading, coordinate conversion, and fallback must be deleted; Windows/Linux xcap remains only as a protocol backend. Current execution point is Phase 3C, followed by Phase 4A objc2 build/availability RED.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`07-28-rust-screenshot-mvp`](#07-28-rust-screenshot-mvp)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-29-macos-screenshot-capture-core/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-29-macos-screenshot-capture-core)

## 07-29-screenshot-annotation-editor

- **标题**：Build screenshot annotation editor
- **旧身份**：id `screenshot-annotation-editor` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-29
- **下一步**（`meta.nextAction`）：Release condition: reopen when lanes 1 and 2 close. No bounded child is named yet because the ordering, not the scope, is what is blocking (#309).
- **阻塞**（`meta.blocker`）：Deferred by docs/plan-prd/TODO.md:9 -- remaining independently-owned active tasks continue only after the preceding blocker lane resolves. As of 2026-08-13 lane 1 (release/runtime blockers: #326 OTA, #482 release notes) and lane 2 (search and cross-platform remediation: #334, #351) are both open.
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`07-28-rust-screenshot-mvp`](#07-28-rust-screenshot-mvp)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-29-screenshot-annotation-editor/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-29-screenshot-annotation-editor)

## 07-29-screenshot-image-pin-history

- **标题**：Build image pin and screenshot history
- **旧身份**：id `screenshot-image-pin-history` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-29
- **下一步**（`meta.nextAction`）：Release condition: reopen when lanes 1 and 2 close. No bounded child is named yet because the ordering, not the scope, is what is blocking (#309).
- **阻塞**（`meta.blocker`）：Deferred by docs/plan-prd/TODO.md:9 -- remaining independently-owned active tasks continue only after the preceding blocker lane resolves. As of 2026-08-13 lane 1 (release/runtime blockers: #326 OTA, #482 release notes) and lane 2 (search and cross-platform remediation: #334, #351) are both open.
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`07-28-rust-screenshot-mvp`](#07-28-rust-screenshot-mvp)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-29-screenshot-image-pin-history/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-29-screenshot-image-pin-history)

## 07-29-screenshot-long-capture

- **标题**：Build bounded scrolling capture
- **旧身份**：id `screenshot-long-capture` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-29
- **下一步**（`meta.nextAction`）：Release condition: reopen when lanes 1 and 2 close. No bounded child is named yet because the ordering, not the scope, is what is blocking (#309).
- **阻塞**（`meta.blocker`）：Deferred by docs/plan-prd/TODO.md:9 -- remaining independently-owned active tasks continue only after the preceding blocker lane resolves. As of 2026-08-13 lane 1 (release/runtime blockers: #326 OTA, #482 release notes) and lane 2 (search and cross-platform remediation: #334, #351) are both open.
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`07-28-rust-screenshot-mvp`](#07-28-rust-screenshot-mvp)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-29-screenshot-long-capture/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-29-screenshot-long-capture)

## 07-29-screenshot-ocr-qr-color

- **标题**：Integrate screenshot OCR QR and color tools
- **旧身份**：id `screenshot-ocr-qr-color` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-29
- **下一步**（`meta.nextAction`）：Release condition: reopen when lanes 1 and 2 close. No bounded child is named yet because the ordering, not the scope, is what is blocking (#309).
- **阻塞**（`meta.blocker`）：Deferred by docs/plan-prd/TODO.md:9 -- remaining independently-owned active tasks continue only after the preceding blocker lane resolves. As of 2026-08-13 lane 1 (release/runtime blockers: #326 OTA, #482 release notes) and lane 2 (search and cross-platform remediation: #334, #351) are both open.
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`07-28-rust-screenshot-mvp`](#07-28-rust-screenshot-mvp)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-29-screenshot-ocr-qr-color/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-29-screenshot-ocr-qr-color)

## 07-29-screenshot-packaged-evidence

- **标题**：Verify screenshot packaging and runtime
- **旧身份**：id `screenshot-packaged-evidence` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-29
- **下一步**（`meta.nextAction`）：Release condition: reopen when lanes 1 and 2 close. No bounded child is named yet because the ordering, not the scope, is what is blocking (#309).
- **阻塞**（`meta.blocker`）：Deferred by docs/plan-prd/TODO.md:9 -- remaining independently-owned active tasks continue only after the preceding blocker lane resolves. As of 2026-08-13 lane 1 (release/runtime blockers: #326 OTA, #482 release notes) and lane 2 (search and cross-platform remediation: #334, #351) are both open.
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`07-28-rust-screenshot-mvp`](#07-28-rust-screenshot-mvp)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-29-screenshot-packaged-evidence/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-29-screenshot-packaged-evidence)

## 07-30-docs-roadmap-consolidation-cleanup

- **标题**：项目文档深度分析与 ROADMAP 沉淀及结构清理
- **旧身份**：id `docs-roadmap-consolidation-cleanup` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-07-30
- **下一步**（`meta.nextAction`）：Act on the three inventories, or close the task if the cleanup is no longer wanted. Nothing has been changed yet - the inventory itself says it is read-only analysis.
- **阻塞**（`meta.blocker`）：None recorded.
- **证据**（`meta.evidence`）：Three research artefacts exist and are substantive: research/docs-inventory.md is a full sweep of 125 markdown files under docs/ with per-file last-commit dates and an explicit note that docs/design/ holds no markdown at all; plus roadmap-factcheck.md and root-clutter.md. The inventory states it modified no docs file.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-30-docs-roadmap-consolidation-cleanup/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-30-docs-roadmap-consolidation-cleanup)
- **⚠️ 状态存疑**：`prd.md` 的 5 个勾选项全部已勾，但 `status` 仍为 `planning`。

## 08-03-app-shell-ai-redesign

- **标题**：app 壳层与设置界面 AI 化全面重构
- **旧身份**：id `app-shell-ai-redesign` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-03
- **下一步**（`meta.nextAction`）：Continue through its children. Two of them - 08-04-shell-fixed-frame and 08-04-settings-ia-primitives - are in progress with their own records, and their remaining criteria are board measurements needing a running app.
- **阻塞**（`meta.blocker`）：The same running app its children need, for the visual acceptance.
- **证据**（`meta.evidence`）：design.md is the produced artefact and is measured rather than estimated: it states the values come from the design boards iqbKR (settings v2) and JVvAr (home v2) in docs/design/corebox/v2.5.0.pen, not from estimation.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 [`08-04-shell-fixed-frame`](#08-04-shell-fixed-frame)（冻结 · `in_progress`）、[`08-04-settings-ia-primitives`](#08-04-settings-ia-primitives)（冻结 · `in_progress`）、[`08-04-settings-rewrite`](#08-04-settings-rewrite)（冻结 · `planning`）、[`08-04-home-conversation`](#08-04-home-conversation)（冻结 · `in_progress`）、`08-06-settings-v25-closeout`（已归档 · `completed`）
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-03-app-shell-ai-redesign/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-03-app-shell-ai-redesign)

## 08-04-batch-settings-razor

- **标题**：批量剃刀：收敛设置选项
- **旧身份**：id `batch-settings-razor` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-04
- **下一步**（`meta.nextAction`）：Get the planning artefacts reviewed. The task states its own gate: implementation may not start until the user has reviewed them and task.py start has been run.
- **阻塞**（`meta.blocker`）：User review, by the task's own final criterion. This is a planning task whose output is documents - a settings inventory with code locations, a keep/merge/default/migrate/developer-visible/delete verdict per item, the credential-protection design, and contract updates to sensitive-data-inventory.json and the privacy spec. None of it can be closed by running anything.
- **证据**（`meta.evidence`）：None to measure. Six criteria, all describing documents rather than behaviour, so there is no suite or check that can report on them.
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-04-batch-settings-razor/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-04-batch-settings-razor)

## 08-04-home-conversation

- **标题**：首页对话最小闭环
- **旧身份**：id `home-conversation` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-04
- **下一步**（`meta.nextAction`）：R3 剩余：先把侧栏历史列表接进 ShellSidebar 的 conversations 插槽（refresh() 目前全渲染进程无人调用，conversations 也无人读取），再做时间分桶（今天/昨天/近 7 天/更早）。跟踪在 #969。R2 不需要再动。
- **阻塞**（`meta.blocker`）：无。此前的 blocker 是状态表把已交付的 R2 记成未开始，读起来像整条数据层还没起步。
- **证据**（`meta.evidence`）：2026-08-13 核实：HomePage.vue 只用 history.load / history.persist;useConversationHistory.ts:93 的 conversations.value 只在 refresh() 内被赋值,而 refresh() 无调用方;ShellSidebar.vue:132 的插槽有「由本任务填充」的注释但无人填充。
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-03-app-shell-ai-redesign`](#08-03-app-shell-ai-redesign)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-04-home-conversation/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-04-home-conversation)

## 08-04-settings-ia-primitives

- **标题**：设置页信息架构 + 行式基础组件
- **旧身份**：id `settings-ia-primitives` · 冻结时状态 `in_progress` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-04
- **下一步**（`meta.nextAction`）：Run the visual acceptance against the boards - SettingRow padding [12,16], gap 16, title 13.5, description 12 at line-height 1.5; IdentityCard padding 16, gap 18, radius-lg, $bg with a 1px $border. Also settle two source-level points: the categories table has 11 entries where the criterion says 9, and AC6 names an AppMark component that does not exist under that name - so either the criteria or the code has moved since they were written.
- **阻塞**（`meta.blocker`）：A running app, for the board measurements and the light/dark pass.
- **证据**（`meta.evidence`）：Checked from source 2026-08-11. AC1 met in shape: one route per category driven by categories.ts, and /setting redirects to DEFAULT_SETTING_PATH, which is /setting/overview. AC2 met: LEGACY_SECTION_REDIRECTS maps the old ?section= links, with everything pointing at /setting/file-index. AC9: settings modules and views 122 passed / 21 files, including categories.smoke.test.ts. SettingRow and IdentityCard both exist; AppMark does not.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-03-app-shell-ai-redesign`](#08-03-app-shell-ai-redesign)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-04-settings-ia-primitives/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-04-settings-ia-primitives)

## 08-04-settings-rewrite

- **标题**：18 个 Setting*.vue 按设计稿重写
- **旧身份**：id `settings-rewrite` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-04
- **下一步**（`meta.nextAction`）：Reconcile with 08-04-settings-ia-primitives, which is in progress and already carries the route table and row primitives. This task narrowed its scope on 2026-08-05 by user confirmation, so what is left of it may already be covered there.
- **阻塞**（`meta.blocker`）：None recorded.
- **证据**（`meta.evidence`）：design.md exists, and the prd opens with a scope reduction dated 2026-08-05 marked as user confirmed - so the narrowing is a decision on record rather than drift.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-03-app-shell-ai-redesign`](#08-03-app-shell-ai-redesign)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-04-settings-rewrite/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-04-settings-rewrite)

## 08-04-shell-chrome-resizable-sidebar

- **标题**：Shell chrome platform adaptation and resizable sidebar
- **旧身份**：id `shell-chrome-resizable-sidebar` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-04
- **下一步**（`meta.nextAction`）：Run the manual acceptance. Thirteen of the fifteen criteria are visual or interactive and need the app on the platform in question: traffic-light placement and a draggable top row on macOS, the self-drawn window controls on Windows and Linux, sidebar drag with the 220-360px clamp, the 180px snap to a 64px icon rail and the 110px restore, width persisting across restart, and light/dark/high-contrast. Also settle AC6: ShellTopBar is gone, but ShellBackRow.vue still exists and ShellSidebar.vue imports it, so either the criterion or the component needs updating.
- **阻塞**（`meta.blocker`）：A running app on macOS, Windows and Linux. Nothing here is decidable from source: the criteria are about where the traffic lights land, whether the top row drags the window, and whether contrast holds in three themes.
- **证据**（`meta.evidence`）：Machine-checkable parts, 2026-08-11. AC6 half met: ShellTopBar has zero files and zero references; ShellBackRow.vue is still present and imported by ShellSidebar.vue, which reads as repurposed rather than left behind. AC11 met: no flatNavBar.store key remains under apps/core-app. AC13: typecheck:node clean; typecheck:web reports 154 errors, none of them in a shell component - they are all under packages/tuffex/packages/components.
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-04-shell-chrome-resizable-sidebar/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-04-shell-chrome-resizable-sidebar)

## 08-04-shell-fixed-frame

- **标题**：移除 layout 切换特性 + 固定 shell 骨架
- **旧身份**：id `shell-fixed-frame` · 冻结时状态 `in_progress` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-04
- **下一步**（`meta.nextAction`）：Run the visual acceptance. Six of the thirteen criteria are already met and checkable from source; the rest are measurements against the design boards - sidebar width 260 with a 1px right border, padding 14, gap 10, nav item padding [7,10], TopBar height 52 with padding [0,32], traffic lights unobstructed on macOS and absent on Windows, every existing route still rendering, and contrast in light and dark.
- **阻塞**（`meta.blocker`）：A running app on macOS and Windows. Nothing in the remaining criteria is a source fact.
- **证据**（`meta.evidence`）：Checked from source 2026-08-11, with AppShell as a positive control for the scan. AC1-AC3 met: zero files match LayoutShell, LayoutAtomProvider, FloatingNav, layouts-definition, useDynamicTuffLayout, DynamicLayout or LayoutPreview. LayoutSkeleton survives only as tuffex's TxLayoutSkeleton and two nexus demos, none of them under components/layout. AC5 met: coreBoxCanvasConfig is still reached from CoreBoxCanvasSection.vue, CoreBoxEditorOverlay.vue and useCoreBoxTheme.ts. AC6 met: no read or write of appSettingsData.layout remains in apps/core-app/src. AC13: typecheck:node clean, typecheck:web 154 errors, none of them in a shell or layout file - all under packages/tuffex/packages/components.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-03-app-shell-ai-redesign`](#08-03-app-shell-ai-redesign)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-04-shell-fixed-frame/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-04-shell-fixed-frame)

## 08-05-ai-toolchain-suite

- **标题**：AI 工具链：组件扩容、工具调用与智能基建
- **旧身份**：id `ai-toolchain-suite` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：Release condition: reopen when lanes 1 and 2 close. No bounded child is named yet because the ordering, not the scope, is what is blocking (#309).
- **阻塞**（`meta.blocker`）：Deferred by docs/plan-prd/TODO.md:9 -- remaining independently-owned active tasks continue only after the preceding blocker lane resolves. As of 2026-08-13 lane 1 (release/runtime blockers: #326 OTA, #482 release notes) and lane 2 (search and cross-platform remediation: #334, #351) are both open. TODO.md:37 additionally names AI/Assistant/OmniPanel polish as paused until its execution lane is reached.
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 [`08-05-tuffex-ai-elements-port`](#08-05-tuffex-ai-elements-port)（冻结 · `in_progress`）、`08-05-home-tool-loop`（已归档 · `completed`）、`08-05-skills-mcp-config`（已归档 · `completed`）、`08-05-attachments-to-model`（已归档 · `completed`）、[`08-06-message-read-aloud`](#08-06-message-read-aloud)（冻结 · `in_progress`）、[`08-06-skills-local-dirs`](#08-06-skills-local-dirs)（冻结 · `in_progress`）、[`08-06-interactive-form-tool`](#08-06-interactive-form-tool)（冻结 · `in_progress`）
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-ai-toolchain-suite/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-ai-toolchain-suite)

## 08-05-file-index-data-safety

- **标题**：File index data safety
- **描述**：Reconcile empty-scan protection, search-time wrongful deletion fix, NFC normalization single entry + duplicate-row migration, mtime precision mismatch (audit file high-1/2, mid, engine H8).
- **旧身份**：id `file-index-data-safety` · 冻结时状态 `in_progress` · 优先级 P0
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：Decide what to do about the D4 residual its own check log records: normalizeFsPath stores NFC ids, which resolve only on normalisation-insensitive filesystems. Two candidates are already named there - platform-gate normalizeFsPath, or keep the raw path for filesystem access.
- **阻塞**（`meta.blocker`）：None for the acceptance criteria. The D4 residual is a follow-up rather than a gate: it is recorded as such in check.jsonl and does not affect macOS, where the ids resolve.
- **证据**（`meta.evidence`）：AC3 measured 2026-08-11: addon/files 322 passed / 48 files; packages/utils search + file-scan-utils 477 passed, 1 skipped / 48 files. check.jsonl records R1/R3/R4/R5 verified implemented and a second search-path deletion route found and closed during check - normalizeFileSearchItem -> cleanupStaleFileResult was deleting on an existsSync verdict, false for EACCES and offline volumes, now on the same ENOENT-only gate as cleanupStaleSearchCandidates, with a test.
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-search-audit-remediation`](#08-05-search-audit-remediation)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-file-index-data-safety/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-file-index-data-safety)

## 08-05-full-repo-governance-audit

- **标题**：Full-repo governance audit → GitHub issues
- **描述**：Parent task for a whole-repository governance audit (structure, code, framework, architecture, compatibility, Rust/native, docs & docs site, best practices, potential defects). Owns the verified findings as requirement source; each verified finding is filed as an individual GitHub issue labeled 'audit'. Verification bar: real problems only, no padding; report the true filed count.
- **旧身份**：id `full-repo-governance-audit` · 冻结时状态 `in_progress` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：逐条对照 research/filed.jsonl 与 research/audit-summary.md 核实 prd.md 的 6 条验收标准并回填勾选。
- **阻塞**（`meta.blocker`）：记录中无阻塞项。
- **证据**（`meta.evidence`）：prd.md 的 6 条验收标准均未勾选;目录内留有 research/findings.jsonl、research/filed.jsonl、research/audit-summary.md 与 scripts/audit-file-issues.mjs 等产出物,以及 design.md / implement.md。随 app-shell-v2 收敛带入 converge/all-to-master(合并提交 de14ee9,PR #1743 尚未合入),收敛过程未重跑本任务的任何验证。
- **备注**（`notes`）：Filed 454 verified findings as individual GitHub issues (+#838 exploit-chain tracking) under the `audit` label; range #484-#958; 20 near-dups closed. 10 low-confidence flagged `question`. See research/audit-summary.md. No product code changed.
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：被 .gitignore 忽略 3 个文件
- **关系**：父任务 无；子任务 无
- **记录**：交接 [handoffs/08-05-full-repo-governance-audit/README.md](handoffs/08-05-full-repo-governance-audit/README.md)；基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-full-repo-governance-audit/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-full-repo-governance-audit)

## 08-05-home-chat-tuffex-ai-fusion

- **标题**：主界面聊天融合（HomePage 接入 tuffex/ai 系列）
- **旧身份**：id `home-chat-tuffex-ai-fusion` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：Run the manual acceptance with a real streaming reply: long text with code blocks and a mermaid diagram fading in block by block, the cursor, the diagram closing, and no full-page reflow while scrolling. Then 500 injected history entries for scroll smoothness and a bounded DOM, image paste and drag with preview and delete, the behaviour non-regression checklist item by item, and both themes.
- **阻塞**（`meta.blocker`）：A running app with a live model. Every criterion here is an observation of rendering under a real stream - fade-in, cursor, reflow, scroll smoothness, DOM bounds - none of which a test run can report on.
- **证据**（`meta.evidence`）：The unit half of AC4 measured 2026-08-11: ai modules plus the home views, 559 passed, 1 skipped / 58 files. The rest is unmeasured by design.
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-tuffex-ai-suite`](#08-05-tuffex-ai-suite)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-home-chat-tuffex-ai-fusion/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-home-chat-tuffex-ai-fusion)

## 08-05-realtime-index-freshness

- **标题**：Realtime index freshness with bounded resource usage
- **描述**：Fix the install-to-searchable chain per research/realtime-chain-diagnosis.md: F1 bounded-backoff retry + dead-letter for scan failures (idle zero-polling), F2 400/300ms event coalescing via IndexingWatchDeltaQueueService debounce, F3 trim stability sleeps (1000->250ms), F4 filesystem-aware health check triggering backfill, F5 write lastIndexedAt on app rows, F6 dev mdls gate on >6h not first-scan-only. Target: install an app -> searchable in &lt;=10s (design headroom ~2.5s), zero idle polling. A-M7 same-class fold-in optional.
- **旧身份**：id `realtime-index-freshness` · 冻结时状态 `in_progress` · 优先级 P0
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：Add the two missing F1/F4 unit tests AC1 asks for: the dead-letter sweep lifecycle (including timer release when the set drains) and the health-probe mismatch -> backfill trigger. Both are implemented but no test file references them. Testing F1 in place means reaching private state on app-provider.ts, so extract the sweep scheduling first (see #712).
- **阻塞**（`meta.blocker`）：AC3 is a manual acceptance the task itself assigns to the user post-restart (install an app -> searchable within 10s). It cannot be produced from a test run, so this task cannot reach a terminal state without that session.
- **证据**（`meta.evidence`）：AC2 measured 2026-08-11: addon/apps + search-engine + addon/files 1155 passed / 140 files; typecheck:node 0 errors. F2 coalescing and F5 lastIndexedAt are covered (14 and 15 test files reference them). F1 dead-letter and F4 health probe are implemented in app-provider.ts but have 0 referencing test files, so AC1 is partial. AC3 not run.
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-search-audit-remediation`](#08-05-search-audit-remediation)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-realtime-index-freshness/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-realtime-index-freshness)

## 08-05-reco-behavior-learning

- **标题**：Behavior learning signals
- **描述**：R3e: prev_app co-occurrence table (schema context format already reserved), exposure-CTR negative feedback (uses R2 metric data), session rhythm boost, hashed window-title (default off), wifi place buckets. Depends on R1 identity fix + R2 exposure metrics. Geolocation stays parked (only non-local-ish signal).
- **旧身份**：id `reco-behavior-learning` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：Release condition: reopen when lanes 1 and 2 close. No bounded child is named yet because the ordering, not the scope, is what is blocking (#309).
- **阻塞**（`meta.blocker`）：Deferred by docs/plan-prd/TODO.md:9 -- remaining independently-owned active tasks continue only after the preceding blocker lane resolves. As of 2026-08-13 lane 1 (release/runtime blockers: #326 OTA, #482 release notes) and lane 2 (search and cross-platform remediation: #334, #351) are both open.
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-search-audit-remediation`](#08-05-search-audit-remediation)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-reco-behavior-learning/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-reco-behavior-learning)

## 08-05-reco-calendar-signal

- **标题**：Calendar signal
- **描述**：R3d: EventKit native binding (tuff-native) + calendar permission registry id + imminent-event join-link candidates (Zoom/Meet/Tencent) + post-meeting tools + CN holiday/workday calendar correcting isWorkingHours. After R3a.
- **旧身份**：id `reco-calendar-signal` · 冻结时状态 `planning` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：Release condition: reopen when lanes 1 and 2 close. No bounded child is named yet because the ordering, not the scope, is what is blocking (#309).
- **阻塞**（`meta.blocker`）：Deferred by docs/plan-prd/TODO.md:9 -- remaining independently-owned active tasks continue only after the preceding blocker lane resolves. As of 2026-08-13 lane 1 (release/runtime blockers: #326 OTA, #482 release notes) and lane 2 (search and cross-platform remediation: #334, #351) are both open.
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-search-audit-remediation`](#08-05-search-audit-remediation)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-reco-calendar-signal/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-reco-calendar-signal)

## 08-05-reco-file-activity-signals

- **标题**：File activity signal pack
- **描述**：R3c: recent downloads/new screenshots (reuse file watcher event stream), active project dirs by mtime clustering, clipboard pattern detection (consecutive same-type copies). After R3a; can parallel R3b.
- **旧身份**：id `reco-file-activity-signals` · 冻结时状态 `planning` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：Release condition: reopen when lanes 1 and 2 close. No bounded child is named yet because the ordering, not the scope, is what is blocking (#309).
- **阻塞**（`meta.blocker`）：Deferred by docs/plan-prd/TODO.md:9 -- remaining independently-owned active tasks continue only after the preceding blocker lane resolves. As of 2026-08-13 lane 1 (release/runtime blockers: #326 OTA, #482 release notes) and lane 2 (search and cross-platform remediation: #334, #351) are both open.
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-search-audit-remediation`](#08-05-search-audit-remediation)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-reco-file-activity-signals/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-reco-file-activity-signals)

## 08-05-reco-ranking-stats-fix

- **标题**：Fix recommendation ranking and stats identity
- **描述**：R1: rebuild preserves scoreAndRank order + scoring.final writeback + pinned truncation after sort (P0-1); unify usage sourceId identity across logs/stats/time-stats/trend with idempotent migration (P0-2, P1-3); pre-open foreground app snapshot (P1-4). Source: parent research/reco-signals-audit.md
- **旧身份**：id `reco-ranking-stats-fix` · 冻结时状态 `in_progress` · 优先级 P0
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：Close the four AC1 assertions that have no test: scoring.final populated is asserted in recommendation-engine tests, and scored order across sources plus pinned truncation are covered, but nothing covers the type/id identity regression, the idempotent migration mapping all four known type->id pairs, or the snapshot taken before focus steal and consumed by the context provider. Then archive: AC2 and AC3 already hold.
- **阻塞**（`meta.blocker`）：None. The remaining work is writing tests, not a decision.
- **证据**（`meta.evidence`）：AC2 measured 2026-08-11: recommendation suite 99 passed / 7 files. AC3 met: the digest at .trellis/tasks/08-05-search-audit-remediation/research/audit-findings-digest.md records "R1 fix-reco-ranking-and-stats - FIXED 2026-08-05" and names P0-1, P0-2, P1-3 and P1-4. AC1 is partial - 2 of 6 assertions have matching tests.
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-search-audit-remediation`](#08-05-search-audit-remediation)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-reco-ranking-stats-fix/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-reco-ranking-stats-fix)

## 08-05-reco-signal-substrate

- **标题**：Recommendation signal substrate
- **描述**：R3a: unified signal collector registry (descriptor: id/settingKey/ttl/collect, event-driven + snapshot, unavailable tracking) so 20+ signals stay maintainable; migrate existing 8 signals onto it; replace dead bluetooth with audio-route signal (headphones -> music/meeting). After R2.
- **旧身份**：id `reco-signal-substrate` · 冻结时状态 `planning` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：Release condition: reopen when lanes 1 and 2 close. No bounded child is named yet because the ordering, not the scope, is what is blocking (#309).
- **阻塞**（`meta.blocker`）：Deferred by docs/plan-prd/TODO.md:9 -- remaining independently-owned active tasks continue only after the preceding blocker lane resolves. As of 2026-08-13 lane 1 (release/runtime blockers: #326 OTA, #482 release notes) and lane 2 (search and cross-platform remediation: #334, #351) are both open.
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-search-audit-remediation`](#08-05-search-audit-remediation)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-reco-signal-substrate/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-reco-signal-substrate)

## 08-05-reco-system-state-signals

- **标题**：System state signal pack
- **描述**：R3b: display/dock state, wake/boot/idle-return, charging transitions, external volume mount, IME/input-source — all via Electron powerMonitor/screen + light native cmds, each settings-gated, on-device only. Mic/camera-in-use as stretch. After R3a.
- **旧身份**：id `reco-system-state-signals` · 冻结时状态 `planning` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：Release condition: reopen when lanes 1 and 2 close. No bounded child is named yet because the ordering, not the scope, is what is blocking (#309).
- **阻塞**（`meta.blocker`）：Deferred by docs/plan-prd/TODO.md:9 -- remaining independently-owned active tasks continue only after the preceding blocker lane resolves. As of 2026-08-13 lane 1 (release/runtime blockers: #326 OTA, #482 release notes) and lane 2 (search and cross-platform remediation: #334, #351) are both open.
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-search-audit-remediation`](#08-05-search-audit-remediation)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-reco-system-state-signals/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-reco-system-state-signals)

## 08-05-reco-wire-existing-signals

- **标题**：Wire existing recommendation signals
- **描述**：R2: hourDistribution into scoring; cache-key cardinality reduction (base ranking cache + volatile-context light re-rank); cold-start fallback; incremental/hourly aggregation preserving history; selection-capture ingestion; timezone-change signal; cleanups (dead bluetooth toggle, upsertItemTimeStats, path-form bundleId matching). After R1. Source: parent research/reco-signals-audit.md
- **旧身份**：id `reco-wire-existing-signals` · 冻结时状态 `in_progress` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：Update the digest with what landed. The same file records R1 as "FIXED 2026-08-05" but lists R2 wire-existing-signals only as scope - hourDistribution, cache-key cardinality, cold start, incremental aggregation, selection-capture, timezone-change - with no status, so AC3 is open even though the hour-weighting and cache-key work is tested.
- **阻塞**（`meta.blocker`）：None.
- **证据**（`meta.evidence`）：AC2 measured 2026-08-11: recommendation suite 99 passed / 7 files, shared with the R1 task. AC1 has visible coverage - the hour weighting (current hour against busiest hour, uniform distribution as a full match, untouched score with no history, peak-hour item ranked above one peaking elsewhere) and the cache key including time slot and day type. AC3 not met: the digest carries no status line for R2.
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-search-audit-remediation`](#08-05-search-audit-remediation)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-reco-wire-existing-signals/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-reco-wire-existing-signals)

## 08-05-search-audit-remediation

- **标题**：CoreBox search audit remediation
- **描述**：Parent task for the 2026-08-06 three-way search audit remediation. Owns the audit findings as requirement source and the batch A-C task map; children are independently verifiable deliverables.
- **旧身份**：id `search-audit-remediation` · 冻结时状态 `planning` · 优先级 P0
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：Keep landing the child batches. Its own criterion is that each child lands with its gates green, and R1 is already marked FIXED in the digest while R2 is not.
- **阻塞**（`meta.blocker`）：None. It is a tracking parent, and its progress is its children.
- **证据**（`meta.evidence`）：Four research artefacts, and they are load-bearing rather than notes: research/audit-findings-digest.md is what records R1 fix-reco-ranking-and-stats as FIXED 2026-08-05 with P0-1, P0-2, P1-3 and P1-4 named, and it is the file two child tasks are measured against. Also realtime-chain-diagnosis.md, reco-signal-program.md and reco-signals-audit.md.
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 [`08-05-semantic-catalog-token-boundary`](#08-05-semantic-catalog-token-boundary)（冻结 · `in_progress`）、[`08-05-search-sort-reaches-ui`](#08-05-search-sort-reaches-ui)（冻结 · `in_progress`）、[`08-05-file-index-data-safety`](#08-05-file-index-data-safety)（冻结 · `in_progress`）、`08-05-keyword-charset-unification`（已归档 · `completed`）、[`08-05-reco-ranking-stats-fix`](#08-05-reco-ranking-stats-fix)（冻结 · `in_progress`）、[`08-05-reco-wire-existing-signals`](#08-05-reco-wire-existing-signals)（冻结 · `in_progress`）、[`08-05-reco-signal-substrate`](#08-05-reco-signal-substrate)（冻结 · `planning`）、[`08-05-reco-system-state-signals`](#08-05-reco-system-state-signals)（冻结 · `planning`）、[`08-05-reco-file-activity-signals`](#08-05-reco-file-activity-signals)（冻结 · `planning`）、[`08-05-reco-calendar-signal`](#08-05-reco-calendar-signal)（冻结 · `planning`）、[`08-05-reco-behavior-learning`](#08-05-reco-behavior-learning)（冻结 · `planning`）、[`08-05-realtime-index-freshness`](#08-05-realtime-index-freshness)（冻结 · `in_progress`）、[`08-06-reco-scenario-playbook`](#08-06-reco-scenario-playbook)（冻结 · `planning`）、`08-06-reco-item-freshness`（已归档 · `completed`）、[`08-06-reco-negative-feedback`](#08-06-reco-negative-feedback)（冻结 · `planning`）、[`08-22-08-22-broaden-corebox-recommendations`](#08-22-08-22-broaden-corebox-recommendations)（冻结 · `in_progress`）
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-search-audit-remediation/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-search-audit-remediation)

## 08-05-search-hotpath-quadratic-fix

- **标题**：Search hot path: eliminate O(n^2) token dedup and per-keystroke recompute
- **描述**：CoreBox app-search per-keystroke path does O(n^2) JSON.stringify dedup in addSearchToken and rebuilds semantic aliases + pinyin tokens per candidate per keystroke; replace with O(n) keyed dedup and memoized per-app token construction, behavior-identical.
- **旧身份**：id `search-hotpath-quadratic-fix` · 冻结时状态 `in_progress` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：Archive it, or say what is left. The implementation has landed and both suites AC1 names pass; AC3 needs a check that the published surface of @talex-touch/utils is unchanged, and AC2 is a throwaway benchmark the task itself says is not committed, so it cannot be evidenced after the fact - worth rewording rather than leaving as an open box forever.
- **阻塞**（`meta.blocker`）：None.
- **证据**（`meta.evidence`）：The O(n^2) dedup is gone: addSearchToken in packages/utils/search/search-token-builder.ts now keys off a Set held in a WeakMap per token list, which is the O(n) replacement the goal describes. AC1 measured 2026-08-11: search-processing-service.test.ts 16 passed; packages/utils 1340 passed / 185 files, with one unrelated flake - nexus-provider.test.ts walked a temp directory a concurrent run had just deleted, and passes on its own.
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-search-hotpath-quadratic-fix/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-search-hotpath-quadratic-fix)

## 08-05-search-sort-reaches-ui

- **标题**：Search sort reaches UI
- **描述**：Make backend ranking actually reach the rendered list: score writeback + renderer re-sort with pinned priority, per-source quota for deferred file results, cache stores accumulated results, drop double sort/push (audit engine H1-H4, M6).
- **旧身份**：id `search-sort-reaches-ui` · 冻结时状态 `in_progress` · 优先级 P0
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：Write the two AC1 scenarios that have no test: the completion cache containing deferred items, and a single publish per batch. The other four are covered in useSearch.rank.test.ts (deferred outranks fast, pinned tops, per-source floor above the render cap, selection preserved across a re-rank).
- **阻塞**（`meta.blocker`）：None. The two missing tests need writing, not a decision.
- **证据**（`meta.evidence`）：AC2 measured 2026-08-11: renderer box adapter + main search-engine suites 736 passed / 86 files; typecheck:node 0 errors. typecheck:web reports 154 errors, all under packages/tuffex/packages/components and none touching useSearch or the box adapter, so the AC2 wording "for touched files" holds. AC1 is 4 of 6 scenarios covered; AC3 (D1-D7) not independently verified.
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-search-audit-remediation`](#08-05-search-audit-remediation)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-search-sort-reaches-ui/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-search-sort-reaches-ui)

## 08-05-semantic-catalog-token-boundary

- **标题**：Semantic catalog token-boundary matching
- **描述**：Replace bare substring includes in app semantic/tool-source catalogs with token-boundary matching plus minimum needle length; kills Postgres-matched-as-Telegram class recall+ranking pollution (audit app-H1).
- **旧身份**：id `semantic-catalog-token-boundary` · 冻结时状态 `in_progress` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：Confirm AC3 - that the diff stayed inside the two catalog files, the shared matcher util and the tests - and then archive. AC1 and AC2 are met.
- **阻塞**（`meta.blocker`）：None.
- **证据**（`meta.evidence`）：AC1 met: app-semantic-catalog.test.ts asserts "requires token boundaries so short needles cannot attach through substrings", and carries both fixtures the criterion names - Telegram with aliases im/telegram/tg, and Postgres with bundleId com.postgresapp.Postgres2. It also keeps ambiguous Illustrator away from the AI alias. AC2 measured 2026-08-11: addon/apps 188 passed / 18 files.
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-search-audit-remediation`](#08-05-search-audit-remediation)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-semantic-catalog-token-boundary/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-semantic-catalog-token-boundary)

## 08-05-skeleton-loading-default

- **标题**：Skeleton 骨架屏成为默认加载态
- **描述**：把「骨架屏是默认加载态」确立为项目原则：写进 frontend spec，并改造设置页与其他异步页面的存量加载态
- **旧身份**：id `skeleton-loading-default` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 [`08-05-skeleton-spec-rule`](#08-05-skeleton-spec-rule)（冻结 · `in_progress`）、[`08-05-skeleton-primitives`](#08-05-skeleton-primitives)（冻结 · `in_progress`）、[`08-05-skeleton-settings-pages`](#08-05-skeleton-settings-pages)（冻结 · `in_progress`）、[`08-05-skeleton-other-async-pages`](#08-05-skeleton-other-async-pages)（冻结 · `in_progress`）
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-skeleton-loading-default/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-skeleton-loading-default)

## 08-05-skeleton-other-async-pages

- **标题**：其他异步页面接入骨架加载态
- **旧身份**：id `skeleton-other-async-pages` · 冻结时状态 `in_progress` · 优先级 P3
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：逐项复核 StoreDetailOverlay 与 IntelligenceCapabilitiesPage 的骨架版式贴合度(AC4,唯一未勾选项)。
- **阻塞**（`meta.blocker`）：记录中无阻塞项;AC4 是人工版式复核,需要在可运行的应用上完成。
- **证据**（`meta.evidence`）：prd.md 5 条验收标准已勾选 4 条;AC4 由 prd.md 自述「尚未逐项复核版式贴合度」。目录内有 implement.md。随 app-shell-v2 收敛带入 converge/all-to-master(合并提交 de14ee9,PR #1743 尚未合入),收敛过程未重跑本任务的任何验证。
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-skeleton-loading-default`](#08-05-skeleton-loading-default)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-skeleton-other-async-pages/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-skeleton-other-async-pages)

## 08-05-skeleton-primitives

- **标题**：TuffEx 骨架原语基座与存量收敛
- **旧身份**：id `skeleton-primitives` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：prd.md 的 7 条验收标准已全部勾选而 task.json 仍为 in_progress,由维护者复核后决定归档或补充剩余范围。
- **阻塞**（`meta.blocker`）：记录中无阻塞项。
- **证据**（`meta.evidence`）：prd.md 7 条验收标准全部勾选;目录内有 design.md 与 implement.md。随 app-shell-v2 收敛带入 converge/all-to-master(合并提交 de14ee9,PR #1743 尚未合入),收敛过程未重跑本任务的任何验证。
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-skeleton-loading-default`](#08-05-skeleton-loading-default)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-skeleton-primitives/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-skeleton-primitives)
- **⚠️ 状态存疑**：`prd.md` 的 7 个勾选项全部已勾，但 `status` 仍为 `in_progress`。

## 08-05-skeleton-settings-pages

- **标题**：设置页接入骨架加载态
- **旧身份**：id `skeleton-settings-pages` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：按 prd.md 的 AC1–AC6 逐页核对 13 个设置页的骨架呈现与布局跳变并留下逐页记录,再跑 lint、typecheck 与设置页既有单测。
- **阻塞**（`meta.blocker`）：记录中无阻塞项。
- **证据**（`meta.evidence`）：prd.md 的 AC1–AC6 均未勾选;目录内有 design.md 与 implement.md。随 app-shell-v2 收敛带入 converge/all-to-master(合并提交 de14ee9,PR #1743 尚未合入),收敛过程未重跑本任务的任何验证。
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-skeleton-loading-default`](#08-05-skeleton-loading-default)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-skeleton-settings-pages/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-skeleton-settings-pages)

## 08-05-skeleton-spec-rule

- **标题**：骨架屏加载态规则写入 frontend spec
- **旧身份**：id `skeleton-spec-rule` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：prd.md 的 5 条验收标准已全部勾选而 task.json 仍为 in_progress,由维护者复核后决定归档或补充剩余范围。
- **阻塞**（`meta.blocker`）：记录中无阻塞项。
- **证据**（`meta.evidence`）：prd.md 5 条验收标准全部勾选;目录内只有 prd.md 与两份 jsonl 上下文清单,无 design.md / implement.md。随 app-shell-v2 收敛带入 converge/all-to-master(合并提交 de14ee9,PR #1743 尚未合入),收敛过程未重跑本任务的任何验证。
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-skeleton-loading-default`](#08-05-skeleton-loading-default)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-skeleton-spec-rule/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-skeleton-spec-rule)
- **⚠️ 状态存疑**：`prd.md` 的 5 个勾选项全部已勾，但 `status` 仍为 `in_progress`。

## 08-05-tuffex-ai-attachments-toolcards

- **标题**：附件与工具卡片（TxAttachmentTray + TxToolCallCard + arrow-js Widget 展面）
- **旧身份**：id `tuffex-ai-attachments-toolcards` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：Cover the two criteria with no tests: the composer dispatching attachment-add on paste and drop with the drop highlight and no Enter/IME regression, and TxToolCallCard walking all four states from a mock event sequence with a retry from the error state. The parts model and the attachment tray are already covered.
- **阻塞**（`meta.blocker`）：None for the two open criteria - they need tests written, not a decision. The animation smoothness half of the tool-card criterion needs an eye.
- **证据**（`meta.evidence`）：Measured 2026-08-11: attachment-tray plus ai-elements, 19 passed / 3 files. The parts model is covered - each part type rendered in order, only the last text part marked streaming, the legacy content path kept when parts are absent, parts-only messages with an empty content summary. The tray is covered - images split into thumbs and files into chips, the viewer opening at the clicked image, file chips emitting open, remove replaced by cancel with a progress ring while uploading, and a placeholder when a thumbnail fails.
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-tuffex-ai-suite`](#08-05-tuffex-ai-suite)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-tuffex-ai-attachments-toolcards/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-tuffex-ai-attachments-toolcards)

## 08-05-tuffex-ai-conversation-stream

- **标题**：TxConversationStream 会话流（动态高度虚拟滚动 + 触顶历史加载）
- **旧身份**：id `tuffex-ai-conversation-stream` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：Implement it. TxAiConversation.vue is 91 lines and contains no virtualisation, no stick-to-bottom, no loadOlder and no hasMore, so none of the four criteria has an implementation to test yet.
- **阻塞**（`meta.blocker`）：None. This is unstarted work rather than blocked work.
- **证据**（`meta.evidence`）：Checked 2026-08-11 against the criteria rather than the suite: the ai-elements tests that pass cover message rendering, not the scroller. TxAiConversation.vue has zero occurrences of virtual, windowed, visibleRange, stickToBottom, loadOlder or hasMore.
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-tuffex-ai-suite`](#08-05-tuffex-ai-suite)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-tuffex-ai-conversation-stream/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-tuffex-ai-conversation-stream)

## 08-05-tuffex-ai-elements-port

- **标题**：AI Elements 目录复刻（tuffex ai 系列扩容）
- **旧身份**：id `tuffex-ai-elements-port` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：Confirm the P0 five are all registered and exported with their four-state and streaming behaviour under mock data, then the theme and reduced-motion pass. The ai-elements suite is green, so what is open is the per-component checklist and the visual half.
- **阻塞**（`meta.blocker`）：A running app for themes and reduced-motion.
- **证据**（`meta.evidence`）：Measured 2026-08-11: ai-elements plus stream-markdown, 58 passed / 6 files, which covers the "existing ai-elements tests stay green" half of the parts-type criterion. The component directory carries its own tests (ai-elements.test.ts, ai-message-parts.test.ts) alongside the Vue sources.
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-ai-toolchain-suite`](#08-05-ai-toolchain-suite)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-tuffex-ai-elements-port/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-tuffex-ai-elements-port)

## 08-05-tuffex-ai-stream-markdown

- **标题**：TxStreamMarkdown 流式 Markdown 渲染（块级增量 + 代码高亮 + mermaid）
- **旧身份**：id `tuffex-ai-stream-markdown` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：Only the visual criteria are left: light and dark themes plus reduced-motion, and the zoom overlay behaviour by eye. The streaming, mermaid, code-block and sanitiser criteria all have tests.
- **阻塞**（`meta.blocker`）：A running app for the theme and reduced-motion pass. Nothing else.
- **证据**（`meta.evidence`）：Measured 2026-08-11: ai-elements plus stream-markdown, 58 passed / 6 files. Coverage maps to the criteria directly. Block identity: "keeps settled block DOM nodes across streaming updates", "reuses settled block objects and only assigns fresh ids to new blocks", "keeps the tail id stable while a paragraph grows". Cursor: "marks a paragraph tail for the inline cursor while streaming". Mermaid: skeleton with draft source while open, diagram once the fence closes under strict security, fallback to source with an alert when rendering fails. Sanitiser: nothing rendered before it resolves, sanitised markup once ready, unsanitised only when the flag is off. Code block: highlight after close, bare fences labelled text without asking shiki, stale highlights ignored.
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-tuffex-ai-suite`](#08-05-tuffex-ai-suite)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-tuffex-ai-stream-markdown/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-tuffex-ai-stream-markdown)

## 08-05-tuffex-ai-suite

- **标题**：TuffEx AI 组件系列与主界面聊天融合
- **旧身份**：id `tuffex-ai-suite` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-05
- **下一步**（`meta.nextAction`）：Release condition: reopen when lanes 1 and 2 close. No bounded child is named yet because the ordering, not the scope, is what is blocking (#309).
- **阻塞**（`meta.blocker`）：Deferred by docs/plan-prd/TODO.md:9 -- remaining independently-owned active tasks continue only after the preceding blocker lane resolves. As of 2026-08-13 lane 1 (release/runtime blockers: #326 OTA, #482 release notes) and lane 2 (search and cross-platform remediation: #334, #351) are both open. TODO.md:37 additionally names AI/Assistant/OmniPanel polish as paused until its execution lane is reached.
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 [`08-05-tuffex-ai-stream-markdown`](#08-05-tuffex-ai-stream-markdown)（冻结 · `in_progress`）、[`08-05-tuffex-ai-conversation-stream`](#08-05-tuffex-ai-conversation-stream)（冻结 · `in_progress`）、[`08-05-tuffex-ai-attachments-toolcards`](#08-05-tuffex-ai-attachments-toolcards)（冻结 · `in_progress`）、[`08-05-home-chat-tuffex-ai-fusion`](#08-05-home-chat-tuffex-ai-fusion)（冻结 · `in_progress`）
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-tuffex-ai-suite/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-05-tuffex-ai-suite)

## 08-06-composer-permission-selector

- **标题**：CoreBox composer 权限选择器与 Auto Context 归位
- **旧身份**：id `composer-permission-selector` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-06
- **下一步**（`meta.nextAction`）：逐条验证 prd.md 的 9 条验收标准:权限三档行为、切档不追溯、重启后档位保持、旧 agentTools 用户迁移、中英文案,以及 core-app typecheck 与相关既有单测。
- **阻塞**（`meta.blocker`）：记录中无阻塞项。
- **证据**（`meta.evidence`）：prd.md 的 9 条验收标准均未勾选;目录内有 design.md 与 implement.md。合并提交 de14ee9 的说明记载它在 agentToolsMode 上重新应用了 createRollbackSync,该改动未纳入本任务的验收记录。随 app-shell-v2 收敛带入 converge/all-to-master(合并提交 de14ee9,PR #1743 尚未合入),收敛过程未重跑本任务的任何验证。
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-06-composer-permission-selector/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-06-composer-permission-selector)

## 08-06-home-chat-pipeline-fixes

- **标题**：Home chat pipeline & rendering fixes v2.5
- **旧身份**：id `home-chat-pipeline-fixes` · 冻结时状态 `planning` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-06
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 `08-06-stream-virtual-layout`（已归档 · `completed`）、`08-06-chain-visibility`（已归档 · `completed`）、`08-06-pi-context-adaptation`（已归档 · `completed`）、[`08-06-web-search-tool`](#08-06-web-search-tool)（冻结 · `planning`）、`08-06-send-motion-polish`（已归档 · `completed`）
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-06-home-chat-pipeline-fixes/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-06-home-chat-pipeline-fixes)

## 08-06-interactive-form-tool

- **标题**：交互式表单工具（tuff_render_form）
- **旧身份**：id `interactive-form-tool` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-06
- **下一步**（`meta.nextAction`）：重启应用后做端到端真机验证:模型生成 2 字段表单 → 卡片渲染 → 提交 → 模型基于提交值续答。
- **阻塞**（`meta.blocker`）：待重启应用后的真机验证;prd.md 记明主进程工具需重启才加载。
- **证据**（`meta.evidence`）：prd.md 4 条验收标准已勾选 3 条,未勾选的一条即上述端到端真机项;目录内有 design.md 与 implement.md。随 app-shell-v2 收敛带入 converge/all-to-master(合并提交 de14ee9,PR #1743 尚未合入),收敛过程未重跑本任务的任何验证。
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-ai-toolchain-suite`](#08-05-ai-toolchain-suite)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-06-interactive-form-tool/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-06-interactive-form-tool)

## 08-06-message-read-aloud

- **标题**：消息朗读（ttsSpeak 接操作栏）
- **旧身份**：id `message-read-aloud` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-06
- **下一步**（`meta.nextAction`）：重启后真机验证朗读:点击出声、再点停止、连点两条只响后者。
- **阻塞**（`meta.blocker`）：待重启后的真机验证;prd.md 记明真实声音无法由单测覆盖。
- **证据**（`meta.evidence`）：prd.md 3 条验收标准已勾选 2 条,未勾选的一条即上述真机项;目录内只有 prd.md 与两份 jsonl 上下文清单。随 app-shell-v2 收敛带入 converge/all-to-master(合并提交 de14ee9,PR #1743 尚未合入),收敛过程未重跑本任务的任何验证。
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-ai-toolchain-suite`](#08-05-ai-toolchain-suite)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-06-message-read-aloud/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-06-message-read-aloud)

## 08-06-model-menu-sources

- **标题**：模型菜单接入 pi 目录与应用内提供方模型
- **旧身份**：id `model-menu-sources` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-06
- **下一步**（`meta.nextAction`）：逐条验证 prd.md 的 7 条验收标准:装有与未装 pi 两种机器上的菜单表现、应用内提供方模型合并、apiKey 不泄漏断言、pi 目录损坏时的静默降级、空态分层,以及 typecheck 与新增解析/合并逻辑的 vitest 覆盖。
- **阻塞**（`meta.blocker`）：记录中无阻塞项;其中两条验收标准分别需要装有 pi 与未装 pi 的机器。
- **证据**（`meta.evidence`）：prd.md 的 7 条验收标准均未勾选;目录内有 design.md、implement.md 与 research/。随 app-shell-v2 收敛带入 converge/all-to-master(合并提交 de14ee9,PR #1743 尚未合入),收敛过程未重跑本任务的任何验证。
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-06-model-menu-sources/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-06-model-menu-sources)

## 08-06-reco-negative-feedback

- **标题**：Recommendation negative feedback
- **旧身份**：id `reco-negative-feedback` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-06
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-search-audit-remediation`](#08-05-search-audit-remediation)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-06-reco-negative-feedback/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-06-reco-negative-feedback)

## 08-06-reco-scenario-playbook

- **标题**：Recommendation scenario playbook
- **旧身份**：id `reco-scenario-playbook` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-06
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-search-audit-remediation`](#08-05-search-audit-remediation)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-06-reco-scenario-playbook/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-06-reco-scenario-playbook)

## 08-06-shell-popover-tuffex

- **标题**：首页 shell 弹层迁移 TuffEx 原语
- **旧身份**：id `shell-popover-tuffex` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-06
- **下一步**（`meta.nextAction`）：逐条验证 prd.md 的 6 条验收标准:模型菜单双调用位行为、权限弹层三档与二步确认、键盘巡航、views/base/home/ 无手搓监听残留的 rg 断言、tuffex 与 core-app 两侧构建与测试,以及弹层视觉目验。
- **阻塞**（`meta.blocker`）：记录中无阻塞项;末条为目验,需要在可运行的应用上完成。
- **证据**（`meta.evidence`）：prd.md 的 6 条验收标准均未勾选;目录内有 design.md、implement.md 与 research/。随 app-shell-v2 收敛带入 converge/all-to-master(合并提交 de14ee9,PR #1743 尚未合入),收敛过程未重跑本任务的任何验证。
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-06-shell-popover-tuffex/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-06-shell-popover-tuffex)

## 08-06-skills-local-dirs

- **标题**：技能本地目录源（链接语义，不拷贝）
- **旧身份**：id `skills-local-dirs` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-06
- **下一步**（`meta.nextAction`）：补齐 prd.md 的 3 条验收标准:扫描/解析/越界拒绝等单测、放置 SKILL.md 的手动链路验证,以及两侧 typecheck 与 lint。
- **阻塞**（`meta.blocker`）：记录中无阻塞项;手动链路一条需要在可运行的应用上完成。
- **证据**（`meta.evidence`）：prd.md 的 3 条验收标准均未勾选;目录内有 design.md、implement.md 与 research/。随 app-shell-v2 收敛带入 converge/all-to-master(合并提交 de14ee9,PR #1743 尚未合入),收敛过程未重跑本任务的任何验证。
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-ai-toolchain-suite`](#08-05-ai-toolchain-suite)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-06-skills-local-dirs/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-06-skills-local-dirs)

## 08-06-web-search-tool

- **标题**：Web search tool for home chat
- **旧身份**：id `web-search-tool` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-06
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-06-home-chat-pipeline-fixes`](#08-06-home-chat-pipeline-fixes)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-06-web-search-tool/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-06-web-search-tool)

## 08-07-chat-stream-order-render

- **标题**：对话消息按流顺序渲染
- **描述**：思考块只含 reasoning，工具作为独立卡片按 parts 流顺序穿插渲染
- **旧身份**：id `chat-stream-order-render` · 冻结时状态 `in_progress` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-07
- **下一步**（`meta.nextAction`）：逐条验证 prd.md 的 12 条验收标准:多段 reasoning 分块、工具调用不入思考块、parts 顺序一致、超长回答重载完整、流式态只留在尾段、widget 工具形态,以及 chain-steps.test.ts 更新与 CoreApp typecheck / lint delta。
- **阻塞**（`meta.blocker`）：记录中无阻塞项。
- **证据**（`meta.evidence`）：prd.md 的 12 条验收标准均未勾选;目录内有 design.md 与 implement.md。随 app-shell-v2 收敛带入 converge/all-to-master(合并提交 de14ee9,PR #1743 尚未合入),收敛过程未重跑本任务的任何验证。
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-07-home-chain-and-native-search`](#08-07-home-chain-and-native-search)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-07-chat-stream-order-render/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-07-chat-stream-order-render)

## 08-07-home-chain-and-native-search

- **标题**：首页对话：思考块分段与原生联网搜索
- **描述**：拆分两个可独立验收的交付：消息体按流顺序渲染（工具移出思考块）、接入 provider 原生 server-side 联网搜索
- **旧身份**：id `home-chain-and-native-search` · 冻结时状态 `planning` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-07
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 [`08-07-chat-stream-order-render`](#08-07-chat-stream-order-render)（冻结 · `in_progress`）、[`08-07-native-web-search`](#08-07-native-web-search)（冻结 · `planning`）
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-07-home-chain-and-native-search/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-07-home-chain-and-native-search)

## 08-07-native-web-search

- **标题**：接入 provider 原生联网搜索
- **描述**：让首页对话具备 server-side 联网搜索能力，不再退化为「没有可用的联网搜索工具」
- **旧身份**：id `native-web-search` · 冻结时状态 `planning` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-07
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-07-home-chain-and-native-search`](#08-07-home-chain-and-native-search)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-07-native-web-search/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-07-native-web-search)

## 08-09-home-panel-layering-v2

- **标题**：Home 会话面板与层级重构
- **旧身份**：id `home-panel-layering-v2` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-09
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 [`08-09-send-flight-layering`](#08-09-send-flight-layering)（冻结 · `in_progress`）、[`08-09-home-preview-tabs`](#08-09-home-preview-tabs)（冻结 · `in_progress`）、[`08-09-turn-info-float-panel`](#08-09-turn-info-float-panel)（冻结 · `in_progress`）、[`08-09-widget-frontend-sandbox`](#08-09-widget-frontend-sandbox)（冻结 · `in_progress`）
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-09-home-panel-layering-v2/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-09-home-panel-layering-v2)

## 08-09-home-preview-tabs

- **标题**：右侧 Tabs 预览区
- **旧身份**：id `home-preview-tabs` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-09
- **下一步**（`meta.nextAction`）：按 implement.md 的走查脚本完成人工走查(唯一未勾选项)。
- **阻塞**（`meta.blocker`）：记录中无阻塞项;剩余的人工走查需要在可运行的应用上完成。
- **证据**（`meta.evidence`）：prd.md 10 条验收标准已勾选 9 条,未勾选的一条是人工走查;目录内有 design.md 与 implement.md。随 app-shell-v2 收敛带入 converge/all-to-master(合并提交 de14ee9,PR #1743 尚未合入),收敛过程未重跑本任务的任何验证。
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-09-home-panel-layering-v2`](#08-09-home-panel-layering-v2)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-09-home-preview-tabs/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-09-home-preview-tabs)

## 08-09-send-flight-layering

- **标题**：发送动画层级：输入框恒在消息之上
- **旧身份**：id `send-flight-layering` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-09
- **下一步**（`meta.nextAction`）：完成两条人工走查:空会话与已有会话下气泡自输入框背后升起且全程不遮挡输入框;开启「减少动态效果」后发送仍正常落位。
- **阻塞**（`meta.blocker`）：记录中无阻塞项;两条剩余项都是人工走查,需要在可运行的应用上完成。
- **证据**（`meta.evidence`）：prd.md 7 条验收标准已勾选 5 条,未勾选的两条都是人工走查;目录内只有 prd.md 与两份 jsonl 上下文清单。随 app-shell-v2 收敛带入 converge/all-to-master(合并提交 de14ee9,PR #1743 尚未合入),收敛过程未重跑本任务的任何验证。
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-09-home-panel-layering-v2`](#08-09-home-panel-layering-v2)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-09-send-flight-layering/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-09-send-flight-layering)

## 08-09-stream-markdown-polish

- **标题**：流式 Markdown 渲染细化
- **旧身份**：id `stream-markdown-polish` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-09
- **下一步**（`meta.nextAction`）：完成 prd.md 剩余 4 条:$…$ 与 $$…$$ 公式渲染、表格流式期间不露竖线、外链带 rel=noopener 且走系统浏览器,收尾时重跑 tuffex 与 CoreApp 两侧 lint / typecheck。
- **阻塞**（`meta.blocker`）：记录中无阻塞项。
- **证据**（`meta.evidence`）：prd.md 7 条验收标准已勾选 3 条;prd.md 记载远程图片拦截一节写有 12 条拦截测试与 3 条组件级测试并做过正控,该记载未在本次收敛中复跑。目录内只有 prd.md 与两份 jsonl 上下文清单。随 app-shell-v2 收敛带入 converge/all-to-master(合并提交 de14ee9,PR #1743 尚未合入),收敛过程未重跑本任务的任何验证。
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-09-stream-markdown-polish/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-09-stream-markdown-polish)

## 08-09-turn-info-float-panel

- **标题**：本轮信息移入顶栏 ⋯ 浮层
- **旧身份**：id `turn-info-float-panel` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-09
- **下一步**（`meta.nextAction`）：完成人工走查:点 ⋯ 开浮层、点外部与 Esc 关闭、无回复时显示 noTurn 空状态(唯一未勾选项)。
- **阻塞**（`meta.blocker`）：记录中无阻塞项;剩余的人工走查需要在可运行的应用上完成。
- **证据**（`meta.evidence`）：prd.md 9 条验收标准已勾选 8 条,未勾选的一条是人工走查;目录内有 design.md 与 implement.md。随 app-shell-v2 收敛带入 converge/all-to-master(合并提交 de14ee9,PR #1743 尚未合入),收敛过程未重跑本任务的任何验证。
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-09-home-panel-layering-v2`](#08-09-home-panel-layering-v2)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-09-turn-info-float-panel/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-09-turn-info-float-panel)

## 08-09-widget-frontend-sandbox

- **标题**：AI 自写 widget 的纯前端沙箱方案
- **旧身份**：id `widget-frontend-sandbox` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-09
- **下一步**（`meta.nextAction`）：就 design.md 中仍未决的隔离原语、网络出口、通信契约、工具权限对齐、尺寸协商、崩溃兜底、持久化与降级路径给出结论,并请用户确认方案。
- **阻塞**（`meta.blocker`）：待用户确认方案后才进入实现(prd.md 末条验收标准);另有一条平台能力断言(srcdoc iframe 的死循环是否冻住主线程)按 prd.md 需以阶段 0 实验回答,尚未做。
- **证据**（`meta.evidence`）：prd.md 14 条验收标准已勾选 5 条,勾选的 5 条都是关于 design.md 本身的产出要求,并记明本任务未产出任何实现代码;目录内有 design.md 与 research/。随 app-shell-v2 收敛带入 converge/all-to-master(合并提交 de14ee9,PR #1743 尚未合入),收敛过程未重跑本任务的任何验证。
- **工作区事实**：base `TalexDreamSoul/app-shell-v2` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-09-home-panel-layering-v2`](#08-09-home-panel-layering-v2)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-09-widget-frontend-sandbox/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-09-widget-frontend-sandbox)

## 08-14-corebox-hide-focus

- **标题**：修复 CoreBox 隐藏时窗口唤醒
- **旧身份**：id `corebox-hide-focus` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-14
- **下一步**（`meta.nextAction`）：Implement the macOS external-open close path, then run focused CoreBox tests and the main-process typecheck.
- **阻塞**（`meta.blocker`）：Implementation and runtime verification have not started in this task.
- **证据**（`meta.evidence`）：The PRD records the confirmed focus chain and five unchecked acceptance criteria.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-14-corebox-hide-focus/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-14-corebox-hide-focus)

## 08-14-mobile-tuff-chat-draft

- **标题**：移动端 Tuff 聊天应用草案
- **旧身份**：id `mobile-tuff-chat-draft` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-14
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-14-mobile-tuff-chat-draft/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-14-mobile-tuff-chat-draft)

## 08-15-anchor-delay-service

- **标题**：TuffEx Anchor 延迟服务与组合动画
- **旧身份**：id `anchor-delay-service` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-15
- **下一步**（`meta.nextAction`）：Owning session resumes per this task's prd.md and updates meta with its own blocker/evidence/nextAction.
- **阻塞**（`meta.blocker`）：None known to the merging session — recorded by the BUI-port coordinator while unblocking the master docs:verify gate; owning session should overwrite with its real state.
- **证据**（`meta.evidence`）：Anchor delay service commits landed on master via the 2026-08-16 merge (fe2554c6f tuffex shared delay service, 67e2b9ce2 nexus header menus); tuffex full gate chain green on the merged tip (1803 tests, typecheck, 4 audits).
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-15-anchor-delay-service/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-15-anchor-delay-service)

## 08-18-tuffex-nested-submenu

- **标题**：Tuffex nested submenu support + anchor chain fixes + HeaderUserMenu cleanup
- **旧身份**：id `tuffex-nested-submenu` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-18
- **下一步**（`meta.nextAction`）：Validate the published beta package and archive the task after release evidence is recorded.
- **阻塞**（`meta.blocker`）：none
- **证据**（`meta.evidence`）：Nested submenu implementation is committed on master and covered by focused component validation.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-18-tuffex-nested-submenu/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-18-tuffex-nested-submenu)

## 08-22-08-22-broaden-corebox-recommendations

- **标题**：扩展 CoreBox 推荐候选并排除 Tuff 自身
- **旧身份**：id `08-22-broaden-corebox-recommendations` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-22
- **下一步**（`meta.nextAction`）：Run focused recommendation tests and record acceptance evidence.
- **阻塞**（`meta.blocker`）：Awaiting prioritization and acceptance against the search-audit remediation parent.
- **证据**（`meta.evidence`）：Design and implementation artifacts capture the current recommendation candidate scope.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-05-search-audit-remediation`](#08-05-search-audit-remediation)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-22-08-22-broaden-corebox-recommendations/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-22-08-22-broaden-corebox-recommendations)
- **⚠️ 状态存疑**：`prd.md` 的 5 个勾选项全部已勾，但 `status` 仍为 `in_progress`。

## 08-22-autopaste-plugin-beta-e2e

- **标题**：收敛 AutoPaste 并验收三个插件 Beta
- **旧身份**：id `autopaste-plugin-beta-e2e` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-22
- **下一步**（`meta.nextAction`）：Execute the packaged beta matrix and record the three plugin outcomes.
- **阻塞**（`meta.blocker`）：Requires three official-plugin beta end-to-end acceptance runs.
- **证据**（`meta.evidence`）：The task artifacts define the AutoPaste convergence and plugin acceptance matrix.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`07-27-optimize-core-utility-plugins`](#07-27-optimize-core-utility-plugins)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-22-autopaste-plugin-beta-e2e/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-22-autopaste-plugin-beta-e2e)
- **⚠️ 状态存疑**：`prd.md` 的 9 个勾选项全部已勾，但 `status` 仍为 `in_progress`。

## 08-23-ai-permission-sandbox-acceptance

- **标题**：AI 权限与沙盒全链路验收
- **描述**：验收真实 AI 调用、工具确认、失败路径、权限与沙盒边界。
- **旧身份**：id `ai-permission-sandbox-acceptance` · 冻结时状态 `in_progress` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-23
- **下一步**（`meta.nextAction`）：仅在显式 opt-in 后执行真实 MCP smoke；为 durable orchestrator objective/cwd/output 补 typed Privacy delete 与自动 retention 后，再复验整体终态。
- **阻塞**（`meta.blocker`）：真实 MCP 当前未显式 opt-in；durable orchestrator objective/cwd/output 仍缺 typed Privacy delete 与自动 retention。
- **证据**（`meta.evidence`）：evidence/packaged-ai-evidence-manifest-86cbb6b9-20260826-final.json 将 2.4.14-beta.14 / 86cbb6b9f1da612aa7de30c46f4b153f33a69914e9fcb078d74f5de891186963 的三份报告与六张截图绑定为 packagedEvidenceSet=passed、overallAcceptance=partial/blocked；verifier 21/21、Node typecheck、Prettier、privacy inventory 14/35、git diff --check 均通过。
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-23-full-product-completion`](#08-23-full-product-completion)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-23-ai-permission-sandbox-acceptance/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-23-ai-permission-sandbox-acceptance)

## 08-23-data-telemetry-billing-acceptance

- **标题**：数据链路埋点与计费验收
- **描述**：验收清单、数据链路、埋点、隐私生命周期与计费闭环。
- **旧身份**：id `data-telemetry-billing-acceptance` · 冻结时状态 `planning` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-23
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-23-full-product-completion`](#08-23-full-product-completion)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-23-data-telemetry-billing-acceptance/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-23-data-telemetry-billing-acceptance)

## 08-23-full-product-completion

- **标题**：Tuff 全链路完成与真实验收
- **描述**：以可重复证据收口发布、OTA、AI、数据链路、权限沙盒、官网功能矩阵与插件 SDK，并完成最终集成验收。
- **旧身份**：id `full-product-completion` · 冻结时状态 `planning` · 优先级 P0
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-23
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 `08-23-plugin-install-security-hardening`（已归档 · `completed`）、[`08-23-release-cicd-ota-acceptance`](#08-23-release-cicd-ota-acceptance)（冻结 · `in_progress`）、[`08-23-ai-permission-sandbox-acceptance`](#08-23-ai-permission-sandbox-acceptance)（冻结 · `in_progress`）、[`08-23-data-telemetry-billing-acceptance`](#08-23-data-telemetry-billing-acceptance)（冻结 · `planning`）、[`08-23-product-matrix-plugin-sdk-acceptance`](#08-23-product-matrix-plugin-sdk-acceptance)（冻结 · `planning`）
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-23-full-product-completion/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-23-full-product-completion)

## 08-23-product-matrix-plugin-sdk-acceptance

- **标题**：官网功能矩阵与插件 SDK 升级
- **描述**：对照官网能力建立矩阵，逐插件升级最新 SDK 并完成跨平台烟测。
- **旧身份**：id `product-matrix-plugin-sdk-acceptance` · 冻结时状态 `planning` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-23
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-23-full-product-completion`](#08-23-full-product-completion)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-23-product-matrix-plugin-sdk-acceptance/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-23-product-matrix-plugin-sdk-acceptance)

## 08-23-release-cicd-ota-acceptance

- **标题**：CI/CD 发布与 OTA 真实验收
- **描述**：补齐必需检查、发布依赖、三平台产物与 OTA N/N+1 真机证据。
- **旧身份**：id `release-cicd-ota-acceptance` · 冻结时状态 `in_progress` · 优先级 P0
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-08-23
- **下一步**（`meta.nextAction`）：Validate the published beta artifacts and collect controlled OTA evidence.
- **阻塞**（`meta.blocker`）：Requires current beta artifacts and N/N+1 OTA evidence after release publication.
- **证据**（`meta.evidence`）：The task records local release preflight and prior beta updater evidence.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`08-23-full-product-completion`](#08-23-full-product-completion)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-23-release-cicd-ota-acceptance/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/08-23-release-cicd-ota-acceptance)

## 09-03-remote-app-alias-catalog

- **标题**：Remote application alias catalog
- **描述**：Move application semantic aliases into a signed, offline-safe app-semantic-alias CatalogService pack served by Nexus.
- **旧身份**：id `remote-app-alias-catalog` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-03
- **下一步**（`meta.nextAction`）：Review design.md, then implement the distinct app-semantic-alias pack contract, atomic CoreApp activation/reprojection, and Nexus immutable read routes.
- **阻塞**（`meta.blocker`）：None. Production storage, signing-secret provisioning, and deployment are deliberately out of scope for the first implementation slice.
- **证据**（`meta.evidence`）：未记录
- **备注**（`notes`）：Immediate Ghostty, cmux, and Orca static aliases landed in dba3d4d806ed7ec495f983a642377a51214a9103. This task owns the separate signed remote-catalog cutover.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-03-remote-app-alias-catalog/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-03-remote-app-alias-catalog)
- **⚠️ 状态存疑**：`prd.md` 的 4 个勾选项全部已勾，但 `status` 仍为 `planning`。

## 09-04-corebox-reason-grouping

- **标题**：CoreBox 空态推荐理由分组
- **描述**：把 CoreBox 空态从单一 Recommend 网格改为按推荐来源分组的列表，并补齐推荐证据字段
- **旧身份**：id `corebox-reason-grouping` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-04
- **下一步**（`meta.nextAction`）：Run the live empty state under `pnpm core:dev` and check the four things only a human can: pinned renders first (this reverses the previous order), no group renders empty, no group exceeds 3 items, and every evidence line is true of the item it sits under. Code and automated coverage are complete.
- **阻塞**（`meta.blocker`）：None in the code. The npm advisories endpoint is timing out, so any PR touching this repo currently fails `Production dependency audit` inside PR Quality; that gate has nothing to say about this change, which adds no dependency.
- **证据**（`meta.evidence`）：S1-S7 landed. Focused runs: recommendation/ 125 tests across 7 files, recommendation-evidence 10, recommendation-utils 19, item-rebuilder 10, translation-coverage 4. `npm run typecheck` exit 0; `pnpm lint` exit 0 after `lint:fix` cleared 9 prettier warnings (0 errors). The 4 core-app and 5 packages/test failures in the full-suite run were proved pre-existing by re-running the same files against a stashed clean HEAD -- identical files and counts failed. S1 also closed a real drift the plan only half-anticipated: the IPC-facing `recommendation.source` union in transport/events/types/core-box.ts was still a hand-maintained copy and was missing 'plugin'.
- **工作区事实**：base `master` · branch `release/corebox-reason-grouping-20260904` · worktree 无 · commit 无 · PR `https://github.com/talex-touch/tuff/pull/1865`
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-04-corebox-reason-grouping/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-04-corebox-reason-grouping)

## 09-04-corebox-recommend-platform

- **标题**：CoreBox 推荐层重构:来源注册表、Stream 传输统一与推荐 SDK 开放
- **描述**：把 CoreBox 空态推荐从硬编码 fan-out 改造为可扩展来源注册表;统一 tfile/stream 资源控制面进 transport SDK 并把推荐结果接入 stream 传输;对插件开放 recommend SDK 与内置权重函数;空态改为宫格+列表两段并收敛文案 i18n。
- **旧身份**：id `corebox-recommend-platform` · 冻结时状态 `planning` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-04
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `release/ota-transport-error-classification-20260904` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 [`09-04-reco-source-registry`](#09-04-reco-source-registry)（冻结 · `in_progress`）、[`09-04-transport-resource-unify`](#09-04-transport-resource-unify)（冻结 · `in_progress`）、[`09-04-reco-sdk-weights`](#09-04-reco-sdk-weights)（冻结 · `in_progress`）、[`09-04-empty-state-sections`](#09-04-empty-state-sections)（冻结 · `in_progress`）
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-04-corebox-recommend-platform/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-04-corebox-recommend-platform)

## 09-04-empty-state-sections

- **标题**：空态两段 UI:此刻常用宫格 + 最近案例列表,文案收敛 i18n
- **描述**：buildContainerLayout 由两个 grid 改为宫格+列表两段(此刻常用 / 最近案例);把散落在 item-rebuilder.ts:653、ItemSubtitle.vue:92、BoxGridItem.vue:170 的 badge 文案与配色收敛到单一来源并接入 i18n。
- **旧身份**：id `empty-state-sections` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-04
- **下一步**（`meta.nextAction`）：Launch CoreBox against the v2.5 design, capture the empty-state screenshot, and verify list row height, section spacing, and the Recent picks title before closing the task.
- **阻塞**（`meta.blocker`）：Runtime visual review remains; structural and localization contracts are covered by tests, but no design-comparison screenshot has been recorded.
- **证据**（`meta.evidence`）：prd.md records 250 files / 2029 tests passing, including seven layout cases and translation coverage; implementation uses recommendation-presentation.ts as the shared presentation source.
- **工作区事实**：base `release/ota-transport-error-classification-20260904` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`09-04-corebox-recommend-platform`](#09-04-corebox-recommend-platform)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-04-empty-state-sections/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-04-empty-state-sections)
- **⚠️ 状态存疑**：`prd.md` 的 9 个勾选项全部已勾，但 `status` 仍为 `in_progress`。

## 09-04-reco-sdk-weights

- **标题**：推荐 SDK 与权重函数开放:插件走主排序池
- **描述**：把插件 recommend 从 PluginRecommendCandidate 旁路并入主排序池;对插件开放内置权重函数(公开签名+文档+测试),暴露缓存时效与上下文数据而不泄露 usageStats 原始数据;修复 index-commit 失效触发只对 APP_INDEXED_SOURCE_ID 生效导致新索引文件最长 30 分钟才进推荐的问题。
- **旧身份**：id `reco-sdk-weights` · 冻结时状态 `in_progress` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-04
- **下一步**（`meta.nextAction`）：Close and archive the task after deciding whether plugin usageStats ranking needs a user-visible privacy disclosure; implementation acceptance is otherwise complete.
- **阻塞**（`meta.blocker`）：Product copy and privacy decision Q5 remains open; no implementation or test blocker is recorded.
- **证据**（`meta.evidence`）：prd.md records node and web typecheck, 174 recommendation tests, 13 public-weight tests, and real-file recommendation evidence with thumbnails and badges.
- **工作区事实**：base `release/ota-transport-error-classification-20260904` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`09-04-corebox-recommend-platform`](#09-04-corebox-recommend-platform)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-04-reco-sdk-weights/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-04-reco-sdk-weights)
- **⚠️ 状态存疑**：`prd.md` 的 8 个勾选项全部已勾，但 `status` 仍为 `in_progress`。

## 09-04-reco-source-registry

- **标题**：推荐来源注册表:替换 item-rebuilder 硬编码 fan-out
- **描述**：以可扩展来源注册表替换 item-rebuilder.rebuildItems 的 7 分支硬编码 fan-out 与 normalizeSourceId 别名表,使新索引来源无需改动该文件即可进入推荐池;含第一层 Provider 收敛分析。
- **旧身份**：id `reco-source-registry` · 冻结时状态 `in_progress` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-04
- **下一步**（`meta.nextAction`）：Archive the completed implementation after recording the unrelated Apple Vision OCR timeout as external to this task.
- **阻塞**（`meta.blocker`）：No task-scope blocker; the only reported failure is two Apple Vision OCR timeouts outside the recommendation registry scope.
- **证据**（`meta.evidence`）：prd.md records core-app and utils lint, node and web typecheck, 1436 box-tool tests, 1380 plugin tests, source-registration behavior, ordering, warning isolation, and no-N+1 coverage.
- **工作区事实**：base `release/ota-transport-error-classification-20260904` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`09-04-corebox-recommend-platform`](#09-04-corebox-recommend-platform)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-04-reco-source-registry/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-04-reco-source-registry)
- **⚠️ 状态存疑**：`prd.md` 的 9 个勾选项全部已勾，但 `status` 仍为 `in_progress`。

## 09-04-transport-resource-unify

- **标题**：传输与资源协议统一:port allowlist、推荐 stream 下发、tfile 控制面收敛与 stream: scheme
- **描述**：扩展 port-policy allowlist 并把推荐结果接入已有 stream 运行时;把 tfile 的 descriptor/URL 投影/allowlist 契约收进 transport SDK;从零注册 stream: scheme 并补 owner+URL 契约;修正 native-resource-protocols.md 中过时的 atom/stream 描述。
- **旧身份**：id `transport-resource-unify` · 冻结时状态 `in_progress` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-04
- **下一步**（`meta.nextAction`）：Archive the completed transport and resource unification; create separate tasks only for dead-channel removal or TTS data-URL remediation.
- **阻塞**（`meta.blocker`）：No task-scope blocker; dead-channel deletion and TTS data-URL remediation are explicitly out of scope.
- **证据**（`meta.evidence`）：prd.md records core-app and utils lint, node and web typecheck, 842 renderer and search tests, eleven toTfileUrl cases, and the stream-scheme rejection evidence.
- **工作区事实**：base `release/ota-transport-error-classification-20260904` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`09-04-corebox-recommend-platform`](#09-04-corebox-recommend-platform)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-04-transport-resource-unify/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-04-transport-resource-unify)
- **⚠️ 状态存疑**：`prd.md` 的 8 个勾选项全部已勾，但 `status` 仍为 `in_progress`。

## 09-04-unify-voice-session-rust

- **标题**：Unify Voice Session and Rust Voice Core
- **旧身份**：id `unify-voice-session-rust` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-04
- **下一步**（`meta.nextAction`）：合并 PR #1879 后归档；local Provider（FunASR/Whisper 系）另起任务，本轮不做。
- **阻塞**（`meta.blocker`）：无阻塞。剩余未验的是真机项：macOS 麦克风与 Accessibility 写回、生产质量矩阵（首字延迟/CER/断网取消），协议 smoke 不等同于这些。
- **证据**（`meta.evidence`）：VoiceService 成为唯一会话所有者，Doubao 与 Bailian Paraformer provider 落地（9f5aa9f0d / 21ed67204）；百炼 paraformer-realtime-v2 真实北京 WebSocket 一次性 smoke 走通握手、PCM duplex、partial/final/结束，临时凭据已清理未入库。
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-04-unify-voice-session-rust/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-04-unify-voice-session-rust)

## 09-05-clipboard-history-detail-relayout

- **标题**：剪贴板历史详情页版式重排
- **旧身份**：id `clipboard-history-detail-relayout` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-05
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 [`09-05-layout-shell`](#09-05-layout-shell)（冻结 · `in_progress`）、[`09-05-shape-classifier`](#09-05-shape-classifier)（冻结 · `in_progress`）、[`09-05-color-capability`](#09-05-color-capability)（冻结 · `in_progress`）、[`09-05-more-info-disclosure`](#09-05-more-info-disclosure)（冻结 · `in_progress`）、[`09-05-file-preview`](#09-05-file-preview)（冻结 · `planning`）、[`09-05-record-share`](#09-05-record-share)（冻结 · `planning`）
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-05-clipboard-history-detail-relayout/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-05-clipboard-history-detail-relayout)

## 09-05-color-capability

- **标题**：颜色能力
- **旧身份**：id `color-capability` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-05
- **下一步**（`meta.nextAction`）：合并 PR #1879 后归档。
- **阻塞**（`meta.blocker`）：图片主题色提取只能真机核：量化算法本身有纯函数测试，但 canvas 在 jsdom 里不可用。
- **证据**（`meta.evidence`）：d6355bedb；clipboard-colors.test.ts 20 例覆盖四格式与对比度，插件 112 tests 绿。
- **工作区事实**：base `master` · branch `feature/clipboard-layout-shell` · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`09-05-clipboard-history-detail-relayout`](#09-05-clipboard-history-detail-relayout)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-05-color-capability/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-05-color-capability)

## 09-05-file-preview

- **标题**：文件预览
- **旧身份**：id `file-preview` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-05
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`09-05-clipboard-history-detail-relayout`](#09-05-clipboard-history-detail-relayout)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-05-file-preview/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-05-file-preview)

## 09-05-layout-shell

- **标题**：版式骨架
- **旧身份**：id `layout-shell` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-05
- **下一步**（`meta.nextAction`）：合并 PR #1879 后归档。C5 文件预览接线另起任务 —— ClipboardDetail 的 👁 已 emit previewFile，ClipboardManagerView 尚未监听。
- **阻塞**（`meta.blocker`）：无阻塞。三项只能真机核：分类条 10 项在 720 宽下的实际渲染、window.open 在插件 webview 里是否放行、图片主题色提取（jsdom 无 canvas）。
- **证据**（`meta.evidence`）：b887d59fe / 2cecff0f3；插件 112 tests 绿、vue-tsc 0 错误（2026-09-06 08:05 实测）。
- **工作区事实**：base `master` · branch `feature/clipboard-layout-shell` · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`09-05-clipboard-history-detail-relayout`](#09-05-clipboard-history-detail-relayout)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-05-layout-shell/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-05-layout-shell)

## 09-05-more-info-disclosure

- **标题**：更多信息折叠区
- **旧身份**：id `more-info-disclosure` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-05
- **下一步**（`meta.nextAction`）：合并 PR #1879 后归档。
- **阻塞**（`meta.blocker`）：无阻塞。
- **证据**（`meta.evidence`）：09c92a25f；折叠态持久化经 use-disclosure-state 覆盖，插件 112 tests 绿。
- **工作区事实**：base `master` · branch `feature/clipboard-layout-shell` · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`09-05-clipboard-history-detail-relayout`](#09-05-clipboard-history-detail-relayout)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-05-more-info-disclosure/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-05-more-info-disclosure)

## 09-05-record-share

- **标题**：记录分享
- **旧身份**：id `record-share` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-05
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`09-05-clipboard-history-detail-relayout`](#09-05-clipboard-history-detail-relayout)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-05-record-share/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-05-record-share)

## 09-05-shape-classifier

- **标题**：内容形态分类器与洞察路由
- **旧身份**：id `shape-classifier` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-05
- **下一步**（`meta.nextAction`）：合并 PR #1879 后归档。
- **阻塞**（`meta.blocker`）：无阻塞。
- **证据**（`meta.evidence`）：e4dc92995 / a4f917ee7；clipboard-shapes.test.ts 38 例覆盖前缀表与「高熵但无前缀不误报」的负控制，插件 112 tests 绿。
- **工作区事实**：base `master` · branch `feature/clipboard-layout-shell` · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`09-05-clipboard-history-detail-relayout`](#09-05-clipboard-history-detail-relayout)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-05-shape-classifier/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-05-shape-classifier)

## 09-06-local-cli-model-providers

- **标题**：Local AI CLIs as selectable chat providers
- **旧身份**：id `local-cli-model-providers` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-06
- **下一步**（`meta.nextAction`）：Execute implement.md Step 0: record the AI provider test baseline and refresh sanitized protocol samples before extracting the shared CLI runtime.
- **阻塞**（`meta.blocker`）：No external blocker is recorded; implementation and runtime acceptance have not started.
- **证据**（`meta.evidence`）：prd.md Background and research/cli-protocol-samples.md document the verified pi, pie, omp, codex, and claude CLI contracts; AC1 through AC9 remain open.
- **工作区事实**：base `release/ota-transport-error-classification-20260904` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`09-06-model-menu-redesign`](#09-06-model-menu-redesign)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-06-local-cli-model-providers/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-06-local-cli-model-providers)

## 09-06-model-menu-redesign

- **标题**：Model switch popup redesign and anchored panel max-height fix
- **旧身份**：id `model-menu-redesign` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-06
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `release/ota-transport-error-classification-20260904` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 `09-06-tuffex-anchor-max-height`（已归档 · `completed`）、`09-06-home-model-menu-v2`（已归档 · `completed`）、[`09-06-local-cli-model-providers`](#09-06-local-cli-model-providers)（冻结 · `in_progress`）、`09-06-home-model-menu-channels`（已归档 · `completed`）、`09-06-model-menu-filter-chips`（已归档 · `completed`）
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-06-model-menu-redesign/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-06-model-menu-redesign)
- **⚠️ 状态存疑**：`prd.md` 的 3 个勾选项全部已勾，但 `status` 仍为 `planning`。

## 09-06-voice-hud-orb-fusion

- **标题**：语音 HUD 融合 orb 的形态设计
- **旧身份**：id `voice-hud-orb-fusion` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-06
- **下一步**（`meta.nextAction`）：合并 PR #1879 后归档。后续 #1878：悬浮球的麦克风图标把阿洛和语音混成了一件事。
- **阻塞**（`meta.blocker`）：无阻塞。两项只能真机核：三个形态在 360×64 内不溢出、浅深色下 orb 与波形均可见。
- **证据**（`meta.evidence`）：70d9a778a / b5462e6e0 / 55d1e3904；同域 49 → 146 passed，packages/utils 32 passed，tsc 与 vue-tsc 均 0 错误。负控制已跑：短路 stopSignal 令 3 例中 2 例转红；maxHeight 改回 dock 高度令窗口 limits 用例转红。
- **工作区事实**：base `feature/clipboard-layout-shell` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-06-voice-hud-orb-fusion/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-06-voice-hud-orb-fusion)

## 09-08-nexus-ai-channel-billing

- **标题**：Nexus AI channel billing
- **旧身份**：id `nexus-ai-channel-billing` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-08
- **下一步**（`meta.nextAction`）：等待 PR #1912 的 required CI 与审阅完成；合并并部署 Nexus 后，再配置生产专用 Qwen Provider，并以真实生产 App Token 做一次 final-only Voice Session 验收。
- **阻塞**（`meta.blocker`）：生产 Provider 必须等 PR #1912 合并且新 Qwen adapter 部署后再启用，避免旧 Filetrans 代码接收该路由；本地代码、授权凭据、真实 Provider 调用与安全回归均已完成。
- **证据**（`meta.evidence`）：2026-09-13 本地真实 16 kHz Voice Session 经 CoreApp -> Nexus -> qwen-audio-3.0-asr-flash 得到 ready -> final -> end；D1 请求 asr_64ae95a5-eb3d-484f-8b38-eaeb81f91b8f settled（80 credits / 20s），无密钥、音频或 transcript 入 D1。三轮审阅及 CodeRabbit 复审后的最终回归：Nexus Qwen/存储/结算/限流/API 158 tests、CoreApp/VoicePanel 174 tests、Voice SDK 11 tests、共享 credits 46 tests 均通过；最终只读复核无剩余 runtime/accounting/security finding。CoreApp Node/Web 与 Nexus typecheck、scoped ESLint、两端 production build、docs、privacy、API route、release notes、Drizzle、orphan/module-size 与 diff gates 均通过。真实本地维护 smoke 已删除过期私有 result，并写入 result_deleted_at/credits_released_at。
- **工作区事实**：base `master` · branch `feat/qwen-audio-sync-asr` · worktree 无 · commit 无 · PR `https://github.com/talex-touch/tuff/pull/1912`
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-08-nexus-ai-channel-billing/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-08-nexus-ai-channel-billing)

## 09-08-persist-asr-provider-channels

- **标题**：Persist ASR provider channels
- **旧身份**：id `persist-asr-provider-channels` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-08
- **下一步**（`meta.nextAction`）：在不含 TUFF_VOICE_* 的受控本地应用中，经 Channels 保存一个凭据化 Bailian 配置并重启，人工核验 realtime 与文件转写；未获授权前不调用真实 Provider。
- **阻塞**（`meta.blocker`）：无代码阻塞；持久化配置、重启后的运行时解析和真实 Provider 识别尚无端到端证据，不能以本地 mock/类型检查替代。
- **证据**（`meta.evidence`）：apps/core-app/src/main/modules/voice/voice-provider-runtime.ts 与 voice-provider-runtime.test.ts 覆盖 capability-bound 安全凭据解析和 fail-closed 路由；IntelligenceApiConfig.vue/test 覆盖安全 voiceAsr 元数据与凭据 mutation，父级记录的 440 focused tests 和本地 CoreApp typecheck 已通过。
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-08-persist-asr-provider-channels/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-08-persist-asr-provider-channels)

## 09-08-transfer-internal-scroll-search

- **标题**：TxTransfer 面板内部滚动与双侧搜索
- **旧身份**：id `transfer-internal-scroll-search` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-08
- **下一步**（`meta.nextAction`）：启动 CoreApp，以 249 个模型分别人工核验“模型优先级”和“管理模型”的双侧搜索、内部滚动、排序及 disabled 状态；读回存储链路问题继续按 PRD 既定边界另行处理。
- **阻塞**（`meta.blocker`）：无代码阻塞；尚缺运行中 Electron 的长列表视觉证据。已记录的 bindings→focusedBinding→modelValue 读回异常不在本任务修复范围，不能把写入成功误作读回验收。
- **证据**（`meta.evidence`）：packages/tuffex/packages/components/src/transfer/src/TxTransfer.vue、transfer/__tests__/transfer.test.ts，以及 apps/core-app/src/renderer/src/components/intelligence/capabilities/CapabilityModelTransfer.vue 和 config/IntelligenceModelConfig.vue 落地面板上限、双侧筛选与排序；父级记录的 focused tests、TuffEx/CoreApp 类型检查已通过。
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-08-transfer-internal-scroll-search/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-08-transfer-internal-scroll-search)

## 09-08-tuffex-text-morph-engine

- **标题**：tuffex 文本形变引擎（移植 torph）
- **旧身份**：id `tuffex-text-morph-engine` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-08
- **下一步**（`meta.nextAction`）：在 Nexus 文档开发面实际查看 text-morph、text-transformer、badge、switch，并以 prefers-reduced-motion 复核直接换值；随后完成 TuffEx build/audit 与文档覆盖门禁。
- **阻塞**（`meta.blocker`）：无代码阻塞；尚无 headless Chrome 的形变/版式/降级证据，也未把父级的 focused tests 和类型检查扩大解释为所有 package build/audit 门已完成。
- **证据**（`meta.evidence`）：packages/tuffex/packages/components/src/text-morph/（引擎与 engine/component tests）、text-transformer/src/TxTextTransformer.vue、badge/src/TxBadge.vue 和 apps/nexus/app/components/content/demos/TextMorph*.vue 已提供实现与测试路径；父级记录的 440 focused tests、TuffEx/Nexus typecheck 及本 PR Nexus suite/workspace typecheck 已通过。
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-08-tuffex-text-morph-engine/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-08-tuffex-text-morph-engine)

## 09-08-voice-dock-stream-and-jank

- **标题**：语音条：转写文本跟随、波形随宽度、卡顿探针
- **旧身份**：id `voice-dock-stream-and-jank` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-08
- **下一步**（`meta.nextAction`）：先用已构建原生绑定量测 50/100/200/400 字 typeText 耗时，再据结果完成非阻塞投递策略；随后在真机采集探针间隔统计并复核长句尾随、波形与粘贴后 Fn 停止。
- **阻塞**（`meta.blocker`）：无代码阻塞；R3 的原生投递耗时与策略尚未量测，R5 尚无真机探针样本，因而不能声称 200+ 字不卡顿或真实 Fn 回归已验收。
- **证据**（`meta.evidence`）：apps/core-app/src/renderer/src/views/assistant/VoicePanel.vue 已含动态波形与尾随实现，packages/tuff-native/native-audio/src/function_key_monitor.rs 过滤合成键并在 Fn 抬起清空集合，function_key_monitor_tests.rs 保留失配 KeyUp 回归覆盖；父级记录的 focused tests 与 CoreApp typecheck 已通过。
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-08-voice-dock-stream-and-jank/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-08-voice-dock-stream-and-jank)

## 09-10-nexus-signin-activation

- **标题**：Nexus sign-in activation and capability credit billing
- **描述**：Enable the injected Nexus provider automatically when the user signs in, and meter every capability that can spend provider cost against a capability-level credit price table with a pre-dispatch reservation.
- **旧身份**：id `nexus-signin-activation` · 冻结时状态 `in_progress` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-10
- **下一步**（`meta.nextAction`）：Merge PR #1899 once its required checks pass, then land the convergence PR that brings local master's 31 commits (voice, settings, search, marketing, nexus) onto origin/master; its 10 conflicting files are the voice/i18n ones both sides edited.
- **阻塞**（`meta.blocker`）：No engineering blocker. The scene-path metering hole is closed: apps/nexus/server/utils/sceneOrchestrator.ts computeSceneRunChargeCredits now compares the reported metering against every unit the capability's price row converts (its primary basis and, for the ASR rows, the secondary basis) and, when the row cannot read it, the settlement keeps the whole hold and flags settleFailed instead of zeroing the item and refunding the hold (matching the invoke path's unitMismatch). A partial sum is discarded deliberately: the hold is one amount and an under-charge is unrecoverable from the ledger. The remaining work is administrative, not engineering: local master is 31 ahead / 15 behind origin/master and only master's convergence PR can publish it, since master enforces admins and rejects direct pushes.
- **证据**（`meta.evidence`）：Focused runs on feat/nexus-credits-billing: 10 files / 156 tests pass for the pricing policy, plus sceneOrchestrator.billing.test.ts and its five sibling suites at 16 passed (6 files / 121 tests in the last combined run). The unit guard is pinned by: an unsellable unit keeps the whole hold with no release ledger entry; a partial mismatch still keeps the whole hold; legitimate pairings (second/audio_second, unit/transcript_unit, character/1k_tokens) and the ASR row's secondary basis settle normally; unrecognized units still price as tokens; billable:false items still skip. Negative controls: reverting the guard to raw unit equality fails the secondary-basis test (charged 1, settleFailed true instead of charged 3), and the pre-guard revision fails the hold assertions (charged 0, released 5). Gates: node build/check-typecheck-plugin-resolution.mjs (nexus typecheck) exit 0, docs:verify exit 0.
- **备注**（`notes`）：Four decisions were taken on a timed-out prompt and defaulted to the recommendation: sign-in activates Nexus; billing moves to a capability-level price table; scene runs and vision.ocr are billed too; the Nexus address is user-configurable. The shipped prices reproduce the previous chat (1 credit/token) and ASR (max(transcriptUnits, seconds*4), held at 10 credits/second) amounts exactly. Pricing policy finalised on 2026-09-10 (see design.md > 免费额度与价格锚): the anchor stays 1 credit = 1 chat token, because re-anchoring would rescale every issued balance and the PLUS/PRO/TEAM steps by 1000x after the fact. The free allowance was raised instead of cutting prices: FREE 1,000 -> 20,000 credits per month (~20 x 1K-token chats), profile boost 5,000 -> 40,000 (2x FREE, still strictly below PLUS 100,000), daily check-in 1 -> 500 (a full month, 15,000, stays inside the FREE allowance). The image capabilities were re-priced onto the same anchor, where they had been left at amounts that no longer matched: vision.ocr 10 -> 2,000 per image, image.translate.e2e 10 -> 4,000, and image.translate (registered by sceneOrchestrator.ts:911 and reporting billable image usage, but with no price row at all - it settled silently at 0) is now priced at 3,000. Chat, ASR, the unregistered-capability fallback and the paid tiers are unchanged. upstreamCostUsdPerUnit stays null: Nexus purchase prices are not in this repository, so cost is not guessed at.
- **工作区事实**：base `master` · branch `feat/nexus-credits-billing` · worktree 无 · commit `9855c8f70` · PR `https://github.com/talex-touch/tuff/pull/1899`
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-10-nexus-signin-activation/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-10-nexus-signin-activation)

## 09-10-voice-capture-audio-frontend

- **标题**：语音采集前端链路：抗混叠、自适应静音判定与 VAD 修正
- **描述**：修复 native-audio 采集链路缺陷：48k→16k 无抗混叠低通导致高频折返进语音带；静音判定为硬编码全带 RMS 绝对阈值；DashScope 实时 ASR server_vad 阈值默认 0.0 等同关闭。
- **旧身份**：id `voice-capture-audio-frontend` · 冻结时状态 `in_progress` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-10
- **下一步**（`meta.nextAction`）：补 AC10：同一段带噪人声在 denoise on/off 下各跑一次真实 ASR，把识别文本与字错率写进 evidence.md，再决定 noiseSuppression 的默认值。
- **阻塞**（`meta.blocker`）：AC10 识别率 A/B 未做：需要真实 ASR 凭据跑两次付费请求和一段真实带噪人声录音，本次未调用任何 provider，因此 noiseSuppression 保持默认关闭仅由技术判断支撑。
- **证据**（`meta.evidence`）：AC1-AC9/AC11/AC12 由 Rust 自动化测量、release addon headless 加载与聚焦 Vitest 守住：抗混叠在 12 kHz 折返处 -46.9 dB、50 Hz 高通 -16.4 dB、自适应静音在 42~4 dB SNR 全检出，真机冒烟字节数校验 660 ms x 16000 Hz x 2 B + 44 B = 21164 通过，全部数字见 evidence.md（含负控制与改前/改后对照）。
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-10-voice-capture-audio-frontend/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-10-voice-capture-audio-frontend)

## 09-10-voice-polish-length-gate

- **标题**：Voice polish length gate and content-free telemetry
- **描述**：Gate the dictation tidy-up pass by transcript length, cap mid-length editing to natural, and record content-free polish telemetry for tuning and later anonymous reporting.
- **旧身份**：id `voice-polish-length-gate` · 冻结时状态 `in_progress` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-10
- **下一步**（`meta.nextAction`）：等 PR #1902 通过必需检查并合并 master 后，在真机使用一天，用 summarizePolishTelemetry(30) 核对 skipped-short 计数、light 降级次数与 latency 对齐；数据符合预期则归档本任务，若分布偏离 12/60 边界则据实调整常量。
- **阻塞**（`meta.blocker`）：真人使用分布尚未取得：design.md 的手工验收要求连续使用一天后 summarizePolishTelemetry(30) 出现与门槛相符的非零 skipped-short，且 latencyMs.ran 等于日志中真正调用 provider 的会话数。本机没有真实语音会话样本，提交前无法复现该分布，因此门槛数值仍只有研究与单元测试支撑。
- **证据**（`meta.evidence`）：提交 ac95cfa99 同时落地门槛与遥测，并更新全部六处注册点（drizzle schema、0045_voice_polish_telemetry.sql + journal idx 45、aux 旧 DDL、AUX_COPY_TABLES、storage-usage 目录、clearInsights）；后续 807c18d18 只修 CI 记账，分词改 ICU 后 `vitest run src/main/modules/voice src/main/modules/database/voice-polish-telemetry-schema.test.ts` 为 13 文件/136 测试通过，`tsc --noEmit -p tsconfig.node.json --composite false` 无输出。PR #1902 的 App suites (core-app)、Typecheck (workspace) 与 Integration suite 均通过。
- **备注**（`notes`）：Derived from the 2026-09-10 market research in research.md. Gate: short (&lt;12 units) runs no provider call, light (12-59) is capped to the natural prompt, full (>=60) uses the session strength. Telemetry rows are content-free (sizes, tier, outcome, latency, scope) so they can be reported anonymously later.
- **工作区事实**：base `master` · branch `feat/voice-polish-length-gate` · worktree 无 · commit `ac95cfa99` · PR `https://github.com/talex-touch/tuff/pull/1902`
- **关系**：父任务 `09-09-voice-dictation-polish-mode`（已归档 · `completed`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-10-voice-polish-length-gate/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-10-voice-polish-length-gate)
- **⚠️ 状态存疑**：父任务 `09-09-voice-dictation-polish-mode` 已归档（`completed`），本任务仍为 `in_progress`。

## 09-12-comet-native-migration

- **标题**：Migrate repository workflow from Trellis to Comet Native
- **描述**：Retire the repository-managed Trellis workflow without losing project engineering knowledge, CI contract coverage, or safe multi-session recovery; adopt Comet Native as the default workflow after a controlled pilot.
- **旧身份**：id `comet-native-migration` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-12
- **下一步**（`meta.nextAction`）：After the beta release, review this PRD and approve the first migration preflight; do not install Comet or delete Trellis as part of this planning record.
- **阻塞**（`meta.blocker`）：Migration scope and five product/repository decisions remain unapproved: audit-claim task source, ROADMAP active-task table treatment, spec destination and lint policy, PluginAiSessionsPlatform trellis vocabulary, and whether the cutover is split into pilot/change commits.
- **证据**（`meta.evidence`）：Planning is based on Comet 0.4.0 documentation and npm metadata, plus repository measurements collected on 2026-09-12. Comet oh-my-pi Skill, Rule, and Hook paths were independently probed against omp v18.1.16 in /tmp.
- **备注**（`notes`）：Follow-up PRD only; no migration has been executed. Preferred direction is Comet Native, project artifact root docs, oh-my-pi platform only, and an explicit CI-safe Trellis cutover. Preserve the current voice worktree, untracked build output, and existing stashes.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-12-comet-native-migration/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-12-comet-native-migration)

## 09-13-voice-provider-cloud-pack

- **标题**：Cloud-delivered voice provider pack
- **描述**：Deliver a signed, versioned voice-provider catalog pack from Nexus that CoreApp verifies, imports, activates on login, and uses as the runtime source for Nexus voice routing parameters.
- **旧身份**：id `voice-provider-cloud-pack` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-13
- **下一步**（`meta.nextAction`）：Review and merge feat/voice-provider-cloud-pack, then provision Production signing/storage/key-map settings and run an explicitly authorized real-Provider transcription.
- **阻塞**（`meta.blocker`）：No code blocker. Production provisioning and paid real-Provider evidence remain release operations, not local implementation work.
- **证据**（`meta.evidence`）：implement.md records crypto, persistence, runtime, login, consent, and UI evidence. Signed-out check/sync stop before remote work with CATALOG_AUTH_REQUIRED; fresh/malformed voice input stays off; opt-in markers have focused UI coverage; local Nexus policy API resolves English and Chinese cloud-control agreement content.
- **备注**（`notes`）：Owns the additive Catalog delivery-plane generalization consumed by future typed cloud-control packs. P1-P5 and D3 per-pack AES delivery are implemented. Remote controls are login-gated; packs cannot execute code, carry credentials, or enable the default-off local voice-input switch.
- **工作区事实**：base `master` · branch `feat/voice-provider-cloud-pack` · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-13-voice-provider-cloud-pack/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-13-voice-provider-cloud-pack)
- **⚠️ 状态存疑**：`prd.md` 的 10 个勾选项全部已勾，但 `status` 仍为 `in_progress`。

## 09-23-nexus-admin-console-gaps

- **标题**：Nexus 后台补齐：积分控制台 /admin/credits（原缺页任务收窄）
- **旧身份**：id `nexus-admin-console-gaps` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-23
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：已修改 6 个文件
- **关系**：父任务 [`10-02-nexus-admin-console-overhaul`](#10-02-nexus-admin-console-overhaul)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/09-23-nexus-admin-console-gaps/README.md](handoffs/09-23-nexus-admin-console-gaps/README.md)；基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-23-nexus-admin-console-gaps/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-23-nexus-admin-console-gaps)

## 09-23-nexus-base-gallery-sidebar

- **标题**：Nexus 基础套件画廊整改 + 文档侧栏重设计
- **旧身份**：id `nexus-base-gallery-sidebar` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-23
- **下一步**（`meta.nextAction`）：补完 DocSection 的 page 链接 active 态与分组间距，并完成中英 × 亮暗 × 两个页面的截图与侧栏切换器键盘路径验收。
- **阻塞**（`meta.blocker`）：实现尚未收尾：implement.md 的样式、i18n 追加与截图/键盘验收项仍未勾选，改动停留在计划与部分落地阶段。
- **证据**（`meta.evidence`）：prd.md / design.md / implement.md 三份计划文档与 check.jsonl；工作区中 DocsSidebar.vue、DocSection.vue、DocsSuiteCatalog.vue 与 i18n 的对应改动。
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-23-nexus-base-gallery-sidebar/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-23-nexus-base-gallery-sidebar)

## 09-23-nexus-docs-perf-cms-remediation

- **标题**：Nexus docs 静态交付收尾、画廊瘦身与后台补齐
- **描述**：Parent planning/integration task from the 2026-09-23 audit: docs are already SSG but not edge-cached; suite gallery pages ship 154 CSS + 225 preloads; admin console has orphan APIs and monolithic pages.
- **旧身份**：id `nexus-docs-perf-cms-remediation` · 冻结时状态 `planning` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-23
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：已修改 2 个文件
- **关系**：父任务 无；子任务 `09-23-nexus-docs-static-delivery-closeout`（已归档 · `completed`）、[`09-23-nexus-gallery-css-graph-slimming`](#09-23-nexus-gallery-css-graph-slimming)（冻结 · `planning`）
- **记录**：交接 [handoffs/09-23-nexus-docs-perf-cms-remediation/README.md](handoffs/09-23-nexus-docs-perf-cms-remediation/README.md)；基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-23-nexus-docs-perf-cms-remediation/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-23-nexus-docs-perf-cms-remediation)

## 09-23-nexus-docs-templates-tab

- **标题**：Nexus 组件文档新增「模板 Templates」tab：10 个组件组合模板
- **旧身份**：id `nexus-docs-templates-tab` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-23
- **下一步**（`meta.nextAction`）：补 CMS inspector 与 Inbox 阅读区的暗色截图后收尾；TemplateFrame 若形成稳定约定，再补进 tuffex-docs-sync.md 的 Demos 节。
- **阻塞**（`meta.blocker`）：暗色截图依赖并行会话修复 TuffexDocsHeroBackground.vue 的 .dark 泄漏，在此之前 TxMarkdownView 根节点会被刷上白色径向渐变。
- **证据**（`meta.evidence`）：implement.md 阶段 D 全部勾选：check-demo-registry-orphans / check-mdc-fences / check-doc-translation-parity / check-icon-collections 四道门禁通过，分类脚本 dry-run 输出 would update 0 file(s)，三组 vitest 通过，eslint 与 vue-tsc 对本任务文件无报错，git diff --check 干净。
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-23-nexus-docs-templates-tab/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-23-nexus-docs-templates-tab)
- **⚠️ 状态存疑**：`prd.md` 的 9 个勾选项全部已勾，但 `status` 仍为 `in_progress`。

## 09-23-nexus-gallery-css-graph-slimming

- **标题**：Nexus suite 画廊按格懒挂载与 docs 样式表合并
- **旧身份**：id `nexus-gallery-css-graph-slimming` · 冻结时状态 `planning` · 优先级 P1
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-23
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`09-23-nexus-docs-perf-cms-remediation`](#09-23-nexus-docs-perf-cms-remediation)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-23-nexus-gallery-css-graph-slimming/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-23-nexus-gallery-css-graph-slimming)

## 09-23-nexus-pro-gallery-polish

- **标题**：Nexus Pro 画廊 specimen 整改 + 格子 reset 按钮
- **旧身份**：id `nexus-pro-gallery-polish` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-23
- **下一步**（`meta.nextAction`）：无待办；如需继续，仅剩既有正文 hydration 警告（未改动的 ai-suite 页同样存在）不在本任务范围。
- **阻塞**（`meta.blocker`）：无阻塞。
- **证据**（`meta.evidence`）：prd.md 验收项 R0–R11 全部勾选：每项均在真实浏览器暗色主题下于 pro-suite 页截图确认，亮色抽查无回归，无新增控制台报错，eslint 与 nexus check-* 门禁通过。
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-23-nexus-pro-gallery-polish/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-23-nexus-pro-gallery-polish)
- **⚠️ 状态存疑**：`prd.md` 的 4 个勾选项全部已勾，但 `status` 仍为 `in_progress`。

## 09-24-nexus-docs-templates-batch-2

- **标题**：Nexus 模板第二批：5 个新风格 + 5 个新章节
- **旧身份**：id `nexus-docs-templates-batch-2` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-24
- **下一步**（`meta.nextAction`）：收尾 Files 文件名断行与根节点图标、Release 紧凑表 sha256 折行两处小瑕疵，随后提交。
- **阻塞**（`meta.blocker`）：无阻塞；仅剩上述两处小瑕疵待修（不阻塞门禁）。
- **证据**（`meta.evidence`）：implement.md 阶段 D 记录（2026-09-25）：4 个 check-*、图标名校验 916 处 0 错、分类脚本 dry-run 0、3 组 vitest 28/28、eslint 0 错、vue-tsc 仅 12 个既有错误、已跟踪与未跟踪文件 git diff --check 均干净；trellis-check 复核报告 7 项并已修复。
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-24-nexus-docs-templates-batch-2/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-24-nexus-docs-templates-batch-2)
- **⚠️ 状态存疑**：`prd.md` 的 6 个勾选项全部已勾，但 `status` 仍为 `in_progress`。

## 09-25-docs-edge-blur

- **标题**：Nexus 文档页顶/底边缘渐变模糊修复
- **旧身份**：id `docs-edge-blur` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-25
- **下一步**（`meta.nextAction`）：完成 Nexus 文档页顶/底边缘渐变模糊修复 分批提交与主线合并验证。
- **阻塞**（`meta.blocker`）：无阻塞项。
- **证据**（`meta.evidence`）：Nexus 文档页顶/底边缘渐变模糊修复: - 顶部：正文行停在药丸上方 0–16px / 圆角处的截图；; - 底部：FilterChips + ImageGallery 一行停在视口底边的截图；临时把 `.docs-edge-blur--bottom` 设 `display: none` 再截一张，确认图片同样被模糊（research §8.4-2），`document.elementsFromPoint` 确认缩略图在遮罩条之下；; - CDP Performance 录一次滚动（基线帧时间）。
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`09-25-tuffex-jelly-indicator-polish`](#09-25-tuffex-jelly-indicator-polish)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-25-docs-edge-blur/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-25-docs-edge-blur)

## 09-25-indicator-family-jelly

- **标题**：TabBar / FlatRadio / SidebarNav 接入果冻指示器
- **旧身份**：id `indicator-family-jelly` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-25
- **下一步**（`meta.nextAction`）：完成 TabBar / FlatRadio / SidebarNav 接入果冻指示器 分批提交与主线合并验证。
- **阻塞**（`meta.blocker`）：无阻塞项。
- **证据**（`meta.evidence`）：TabBar / FlatRadio / SidebarNav 接入果冻指示器: - `09-25-jelly-indicator-engine` 已完成且通过其 review gate。; - 读 research/indicator-family.md §2–§4、§7、§9–§10；`component-guidelines.md`（One writer per CSS custom property、State motion）。; - 实现 agent：三个组件接引擎（测量不变、`onFrame` 命令式绘制、模板不再绑定这些属性、晚挂载节点由同步 watcher 补写最近一帧；只有选
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`09-25-tuffex-jelly-indicator-polish`](#09-25-tuffex-jelly-indicator-polish)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-25-indicator-family-jelly/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-25-indicator-family-jelly)

## 09-25-jelly-indicator-engine

- **标题**：tuffex 共享果冻指示器引擎（从 Radio 抽出，Radio 迁移）
- **旧身份**：id `jelly-indicator-engine` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-25
- **下一步**（`meta.nextAction`）：完成 tuffex 共享果冻指示器引擎（从 Radio 抽出，Radio 迁移） 分批提交与主线合并验证。
- **阻塞**（`meta.blocker`）：无阻塞项。
- **证据**（`meta.evidence`）：tuffex 共享果冻指示器引擎（从 Radio 抽出，Radio 迁移）: - 读 `.trellis/spec/frontend/hook-guidelines.md`（composable / 生命周期）、`tuffex-design-rules.md` Motion 节、`quality-guidelines.md`。; - 调研：`../09-25-indicator-family-jelly/research/indicator-family.md` 第 6、7 节（Radio 结构与测试、reduced-motion 契约）。; - `JellyScaleInput.travel
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`09-25-tuffex-jelly-indicator-polish`](#09-25-tuffex-jelly-indicator-polish)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-25-jelly-indicator-engine/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-25-jelly-indicator-engine)

## 09-25-stat-card-glow-badge

- **标题**：TxStatCard 发光图标徽章
- **旧身份**：id `stat-card-glow-badge` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-25
- **下一步**（`meta.nextAction`）：完成 TxStatCard 发光图标徽章 分批提交与主线合并验证。
- **阻塞**（`meta.blocker`）：无阻塞项。
- **证据**（`meta.evidence`）：TxStatCard 发光图标徽章: - 读 `tuffex-design-rules.md`（Borders / Colour / Motion）、`tuffex-docs-sync.md`（Demos、Gallery specimens、Gates）、research/stat-card.md §2–§7。; - 实现 agent：徽章 DOM / 样式、模块级主题观察器（`stat-card/src/theme-change.ts`）、槽位变量、容器查询窄态、progress 跟随取色；测试 12 例；文档中英 + demo（四色调）+ 画廊格子；CSS 较 HEAD +1064 B。;
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`09-25-tuffex-jelly-indicator-polish`](#09-25-tuffex-jelly-indicator-polish)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-25-stat-card-glow-badge/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-25-stat-card-glow-badge)

## 09-25-tabs-indicator-redo

- **标题**：TxTabs 指示器重做 + 画廊变体展示
- **旧身份**：id `tabs-indicator-redo` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-25
- **下一步**（`meta.nextAction`）：完成 TxTabs 指示器重做 + 画廊变体展示 分批提交与主线合并验证。
- **阻塞**（`meta.blocker`）：无阻塞项。
- **证据**（`meta.evidence`）：TxTabs 指示器重做 + 画廊变体展示: - `09-25-jelly-indicator-engine` 已完成且通过其 review gate。; - 读 research/tabs.md（消费方、测试锁定点、文档段落、图标根因、画廊变体写法）与 design.md。; - 接 `useJellyIndicator`（`axis` 随 placement；`onFrame` 命令式写 `.tx-tabs__pointer`；`.is-moving` 控制光晕）；
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`09-25-tuffex-jelly-indicator-polish`](#09-25-tuffex-jelly-indicator-polish)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-25-tabs-indicator-redo/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-25-tabs-indicator-redo)

## 09-25-tuffex-jelly-indicator-polish

- **标题**：tuffex 共享果冻指示器 + Tabs 重做 + 文档页边缘模糊 + StatCard 徽章
- **旧身份**：id `tuffex-jelly-indicator-polish` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-25
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 [`09-25-jelly-indicator-engine`](#09-25-jelly-indicator-engine)（冻结 · `in_progress`）、[`09-25-tabs-indicator-redo`](#09-25-tabs-indicator-redo)（冻结 · `in_progress`）、[`09-25-indicator-family-jelly`](#09-25-indicator-family-jelly)（冻结 · `in_progress`）、[`09-25-docs-edge-blur`](#09-25-docs-edge-blur)（冻结 · `in_progress`）、[`09-25-stat-card-glow-badge`](#09-25-stat-card-glow-badge)（冻结 · `in_progress`）、[`09-26-sortable-list-drag-feel`](#09-26-sortable-list-drag-feel)（冻结 · `in_progress`）、[`09-26-status-badge-chip-lighter`](#09-26-status-badge-chip-lighter)（冻结 · `in_progress`）
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-25-tuffex-jelly-indicator-polish/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-25-tuffex-jelly-indicator-polish)

## 09-26-bound-indexing-memory-icons

- **标题**：Bound Tuff indexing memory and icon storage
- **描述**：Residual Issue 1964 work after beta54: bounded indexing, path-backed icons, content-index defaults, fd enumeration and the admission layers already shipped (b3edffef1, 728d251a0, bd86b0af1). Remaining order: cold-scan icon budget probe, legacy icon conversion campaign, native crash delivery re-confirmation on the current Electron, and the 100k/three-hour isolated acceptance re-baseline. No real-profile writes, commits, pushes, or releases.
- **旧身份**：id `bound-indexing-memory-icons` · 冻结时状态 `in_progress` · 优先级 P0
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-26
- **下一步**（`meta.nextAction`）：Run slice S1 (O1 + O2): isolated cold-scan icon-budget probe plus the legacy conversion campaign (completion, SIGTERM resume, failure preservation, page rate) under /tmp. Contracts, files and probes are in implement.md; expected to require no production edits.
- **阻塞**（`meta.blocker`）：None for S1. O1/O2 need only an isolated profile; O3 needs Sentry receipt access if the transport cannot be observed independently; O4 needs machine time for the three-hour residency.
- **证据**（`meta.evidence`）：research/2026-09-29-master-reconciliation.md: per-capability file/symbol map proving admission, byte budgets, afterBatch credits, icon cutover, migration service, default-off content indexing, fd backend and progress services are landed; invalidated assumptions and the four remaining items with owners. research/verification-2026-09-26.md: prior runtime evidence (icon cutover, crash round-trip, 100k campaign, three-hour residency, R10 A/Bs), all recorded on the pre-beta54 pipeline.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-26-bound-indexing-memory-icons/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-26-bound-indexing-memory-icons)

## 09-26-channel-error-reply-contract

- **标题**：Channel 错误回复被当作数据 resolve（附带插件图标 tfile 403）
- **描述**：IPC 错误回复在渲染层被 resolve 成数据，导致 typed SDK 收到错误对象；附 /tmp↔/private/tmp 白名单错配的取证
- **旧身份**：id `channel-error-reply-contract` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-26
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-26-channel-error-reply-contract/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-26-channel-error-reply-contract)

## 09-26-corebox-app-search-fast-lane

- **标题**：CoreBox 应用搜索优先与索引减负
- **旧身份**：id `corebox-app-search-fast-lane` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-26
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 `09-26-app-search-in-memory-match`（已归档 · `completed`）、`09-26-search-read-fast-lane`（已归档 · `completed`）、`09-26-corebox-pulse-semantics`（已归档 · `completed`）、`09-26-file-index-bloat-control`（已归档 · `completed`）
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-26-corebox-app-search-fast-lane/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-26-corebox-app-search-fast-lane)
- **⚠️ 状态存疑**：`prd.md` 的 5 个勾选项全部已勾，但 `status` 仍为 `planning`。

## 09-26-sortable-list-drag-feel

- **标题**：TxSortableList 拖拽跟手 + 弹性让位 / 落位
- **旧身份**：id `sortable-list-drag-feel` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-26
- **下一步**（`meta.nextAction`）：完成 TxSortableList 拖拽跟手 + 弹性让位 / 落位 分批提交与主线合并验证。
- **阻塞**（`meta.blocker`）：无阻塞项。
- **证据**（`meta.evidence`）：TxSortableList 拖拽跟手 + 弹性让位 / 落位: ## Goal; ## 现状; ## Requirements
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`09-25-tuffex-jelly-indicator-polish`](#09-25-tuffex-jelly-indicator-polish)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-26-sortable-list-drag-feel/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-26-sortable-list-drag-feel)
- **⚠️ 状态存疑**：`prd.md` 的 3 个勾选项全部已勾，但 `status` 仍为 `in_progress`。

## 09-26-status-badge-chip-lighter

- **标题**：TxStatusBadge 亮色主题圆盘色阶提亮
- **旧身份**：id `status-badge-chip-lighter` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-26
- **下一步**（`meta.nextAction`）：完成 TxStatusBadge 亮色主题圆盘色阶提亮 分批提交与主线合并验证。
- **阻塞**（`meta.blocker`）：无阻塞项。
- **证据**（`meta.evidence`）：TxStatusBadge 亮色主题圆盘色阶提亮: ## Goal; ## 现状; ## Requirements
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`09-25-tuffex-jelly-indicator-polish`](#09-25-tuffex-jelly-indicator-polish)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-26-status-badge-chip-lighter/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-26-status-badge-chip-lighter)
- **⚠️ 状态存疑**：`prd.md` 的 3 个勾选项全部已勾，但 `status` 仍为 `in_progress`。

## 09-28-09-28-nexus-provider-scene-unification

- **标题**：Unify Nexus provider registry and scene routing
- **描述**：Retire legacy intelligence providers and make Provider Registry plus Scene the sole AI routing configuration surface, including ASR, credits, simple fallback, and admin configuration.
- **旧身份**：id `09-28-nexus-provider-scene-unification` · 冻结时状态 `in_progress` · 优先级 P0
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-28
- **下一步**（`meta.nextAction`）：Publish PR to master and stage to complete remote integration.
- **阻塞**（`meta.blocker`）：none
- **证据**（`meta.evidence`）：Provider Registry + Scene unification verified with 91 admin routing and reachability tests, live ego-browser verification, and clean exports audit.
- **工作区事实**：base `TalexDreamSoul/nexus` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-28-09-28-nexus-provider-scene-unification/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-28-09-28-nexus-provider-scene-unification)
- **⚠️ 状态存疑**：`prd.md` 的 9 个勾选项全部已勾，但 `status` 仍为 `in_progress`。

## 09-28-macos-watcher-startup-cpu

- **标题**：Fix macOS file watcher startup CPU saturation
- **旧身份**：id `macos-watcher-startup-cpu` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `crosery` · creator `crosery` · 创建于 2026-09-28
- **下一步**（`meta.nextAction`）：Push the cross-platform type, Vitest runner, symlink and Darwin packaging-gate fixes; approve fork workflow runs; merge only after all required GitHub checks pass.
- **阻塞**（`meta.blocker`）：PR #2006 is awaiting required GitHub checks after maintainer integration; signed packaged-app startup and app-level energy acceptance remain unverified.
- **证据**（`meta.evidence`）：Source-built Electron watcher add/delete smoke passed; isolated 3,000-file A/B reduced busy CPU median from 125.05% to 60.7% with no Perf:EventLoop warning. Final review hardening passes 155 focused CoreApp tests with 1 skipped, 18 utils tests with 1 skipped, node typecheck, scoped ESLint, CoreApp Vite build, fsevents source-load and packaged-native positive/negative smoke, docs verification, module-size ratchet and its 28 self-tests.
- **备注**（`notes`）：Issue: https://github.com/talex-touch/tuff/issues/2005. PR: https://github.com/talex-touch/tuff/pull/2006. Source-built runtime acceptance passed; signed packaged-app startup and app-level energy comparison remain explicitly unverified.
- **工作区事实**：base `master` · branch `task/fix/macos-watcher-startup-cpu` · worktree 无 · commit `03572816e` · PR `https://github.com/talex-touch/tuff/pull/2006`
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-28-macos-watcher-startup-cpu/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-28-macos-watcher-startup-cpu)

## 09-29-ai-answer-template

- **标题**：Templates page: AI answer (multi-turn in TxConversationStream)
- **旧身份**：id `ai-answer-template` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-29
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：已修改 4 个文件
- **关系**：父任务 [`09-29-stream-element`](#09-29-stream-element)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/09-29-ai-answer-template/README.md](handoffs/09-29-ai-answer-template/README.md)；基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-29-ai-answer-template/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-29-ai-answer-template)
- **⚠️ 状态存疑**：`prd.md` 的 2 个勾选项全部已勾，但 `status` 仍为 `in_progress`。

## 09-29-bounded-fd-fzf-file-indexing

- **标题**：Bounded file indexing with fd and fzf
- **旧身份**：id `bounded-fd-fzf-file-indexing` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-29
- **下一步**（`meta.nextAction`）：Investigate the renderer/GPU idle CPU baseline before closing strict AC7.
- **阻塞**（`meta.blocker`）：Strict AC7 idle CPU &lt;=5% remains blocked by the renderer/GPU baseline while indexing workers are offline.
- **证据**（`meta.evidence`）：PR #2019; focused tests, typechecks, production build, bundled fd smoke, and packaged arm64 100k scan evidence are recorded in prd.md.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-29-bounded-fd-fzf-file-indexing/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-29-bounded-fd-fzf-file-indexing)

## 09-29-code-stream-live

- **标题**：TxCodeStream content-driven mode + TxStreamCode alias
- **旧身份**：id `code-stream-live` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-29
- **下一步**（`meta.nextAction`）：beta.55 发布后复核内容驱动模式的验收状态并归档。
- **阻塞**（`meta.blocker`）：等待 beta.55 发布验收，无实现阻塞。
- **证据**（`meta.evidence`）：ea4815409 已集成 CodeStream 源码、组件测试及双语示例；CI 36807315835 的 workspace typecheck 通过。
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`09-29-stream-element`](#09-29-stream-element)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-29-code-stream-live/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-29-code-stream-live)
- **⚠️ 状态存疑**：`prd.md` 的 2 个勾选项全部已勾，但 `status` 仍为 `in_progress`。

## 09-29-stream-element

- **标题**：StreamElement: streaming primitives (StreamText, StreamCode) + composer + showcase
- **旧身份**：id `stream-element` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-29
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：已修改 2 个文件
- **关系**：父任务 无；子任务 [`09-29-stream-text-foundation`](#09-29-stream-text-foundation)（冻结 · `in_progress`）、[`09-29-code-stream-live`](#09-29-code-stream-live)（冻结 · `in_progress`）、[`09-29-stream-markdown-motion`](#09-29-stream-markdown-motion)（冻结 · `in_progress`）、[`09-29-stream-element-core`](#09-29-stream-element-core)（冻结 · `in_progress`）、[`09-29-ai-answer-template`](#09-29-ai-answer-template)（冻结 · `in_progress`）
- **记录**：交接 [handoffs/09-29-stream-element/README.md](handoffs/09-29-stream-element/README.md)；基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-29-stream-element/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-29-stream-element)
- **⚠️ 状态存疑**：`prd.md` 的 13 个勾选项全部已勾，但 `status` 仍为 `planning`。

## 09-29-stream-element-core

- **标题**：TxStreamElement: markdown subset, delegation, citations, one clock, slots + hero showcase
- **旧身份**：id `stream-element-core` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-29
- **下一步**（`meta.nextAction`）：beta.55 发布后复核结构化内容与插槽的验收状态并归档。
- **阻塞**（`meta.blocker`）：等待 beta.55 发布验收，无实现阻塞。
- **证据**（`meta.evidence`）：ea4815409 已集成 StreamElement 源码、组件测试及双语示例；CI 36807315835 的 workspace typecheck 通过。
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：已修改 3 个文件
- **关系**：父任务 [`09-29-stream-element`](#09-29-stream-element)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/09-29-stream-element-core/README.md](handoffs/09-29-stream-element-core/README.md)；基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-29-stream-element-core/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-29-stream-element-core)
- **⚠️ 状态存疑**：`prd.md` 的 4 个勾选项全部已勾，但 `status` 仍为 `in_progress`。

## 09-29-stream-markdown-motion

- **标题**：TxStreamMarkdown: shared reveal presets + logo caret + live gallery cell
- **旧身份**：id `stream-markdown-motion` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-29
- **下一步**（`meta.nextAction`）：beta.55 发布后复核流式显示的验收状态并归档。
- **阻塞**（`meta.blocker`）：等待 beta.55 发布验收，无实现阻塞。
- **证据**（`meta.evidence`）：ea4815409 已集成 StreamMarkdown 增量显示、组件测试及双语示例；CI 36807315835 的 workspace typecheck 通过。
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`09-29-stream-element`](#09-29-stream-element)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-29-stream-markdown-motion/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-29-stream-markdown-motion)
- **⚠️ 状态存疑**：`prd.md` 的 3 个勾选项全部已勾，但 `status` 仍为 `in_progress`。

## 09-29-stream-text-foundation

- **标题**：StreamText foundation: presets, tokens, segmenter, pacer, logo caret, TxStreamText
- **旧身份**：id `stream-text-foundation` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-29
- **下一步**（`meta.nextAction`）：beta.55 发布后复核增量文本和插槽的验收状态并归档。
- **阻塞**（`meta.blocker`）：等待 beta.55 发布验收，无实现阻塞。
- **证据**（`meta.evidence`）：ea4815409 已集成 StreamText 源码、节奏控制测试及双语示例；CI 36807315835 的 workspace typecheck 通过。
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 [`09-29-stream-element`](#09-29-stream-element)（冻结 · `planning`）；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-29-stream-text-foundation/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-29-stream-text-foundation)
- **⚠️ 状态存疑**：`prd.md` 的 6 个勾选项全部已勾，但 `status` 仍为 `in_progress`。

## 09-29-tuffex-menu-activation-blink

- **标题**：TuffEx menu activation blink feedback
- **旧身份**：id `tuffex-menu-activation-blink` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-09-29
- **下一步**（`meta.nextAction`）：Merge PR #2019 and archive the task after the integration lands on master.
- **阻塞**（`meta.blocker`）：Awaiting required PR checks and master integration.
- **证据**（`meta.evidence`）：PR #2019; 69 component tests, TuffEx typecheck/build/audits, Nexus docs checks, and real browser evidence are recorded in the task artifacts.
- **工作区事实**：base `master` · branch 无 · worktree 无 · commit 无 · PR 无
- **关系**：父任务 无；子任务 无
- **记录**：基线 [task.json](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-29-tuffex-menu-activation-blink/task.json) · [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/09-29-tuffex-menu-activation-blink)
- **⚠️ 状态存疑**：`prd.md` 的 9 个勾选项全部已勾，但 `status` 仍为 `in_progress`。

## 10-02-nexus-admin-console-kit

- **标题**：后台统一骨架：外壳闸门、区块/筛选/列表/确认组件与格式化（以管理操作审计页试点）
- **旧身份**：id `nexus-admin-console-kit` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-02
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：未跟踪 13 个文件
- **关系**：父任务 [`10-02-nexus-admin-console-overhaul`](#10-02-nexus-admin-console-overhaul)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/10-02-nexus-admin-console-kit/README.md](handoffs/10-02-nexus-admin-console-kit/README.md)

## 10-02-nexus-admin-console-overhaul

- **标题**：Nexus 后台全面重构：统一骨架、逐页迁移、补齐缺页与清理退役代码
- **旧身份**：id `nexus-admin-console-overhaul` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-02
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：未跟踪 10 个文件
- **关系**：父任务 无；子任务 [`09-23-nexus-admin-console-gaps`](#09-23-nexus-admin-console-gaps)（冻结 · `planning`）、[`10-02-nexus-admin-retired-ai-cleanup`](#10-02-nexus-admin-retired-ai-cleanup)（冻结 · `in_progress`）、[`10-02-tuffex-admin-primitives`](#10-02-tuffex-admin-primitives)（冻结 · `in_progress`）、[`10-02-nexus-admin-console-kit`](#10-02-nexus-admin-console-kit)（冻结 · `in_progress`）、[`10-02-nexus-admin-migrate-content`](#10-02-nexus-admin-migrate-content)（冻结 · `in_progress`）、[`10-02-nexus-admin-migrate-accounts`](#10-02-nexus-admin-migrate-accounts)（冻结 · `in_progress`）、[`10-02-nexus-admin-migrate-ai-services`](#10-02-nexus-admin-migrate-ai-services)（冻结 · `planning`）、[`10-02-nexus-admin-migrate-analytics`](#10-02-nexus-admin-migrate-analytics)（冻结 · `planning`）、[`10-02-nexus-admin-migrate-governance`](#10-02-nexus-admin-migrate-governance)（冻结 · `planning`）、[`10-02-nexus-admin-plugin-moderation`](#10-02-nexus-admin-plugin-moderation)（冻结 · `planning`）、[`10-02-nexus-admin-release-evidence`](#10-02-nexus-admin-release-evidence)（冻结 · `planning`）、[`10-02-nexus-admin-risk-console`](#10-02-nexus-admin-risk-console)（冻结 · `planning`）、[`10-02-nexus-admin-emergency-chain`](#10-02-nexus-admin-emergency-chain)（冻结 · `planning`）、[`10-02-nexus-admin-single-root-hotfix`](#10-02-nexus-admin-single-root-hotfix)（冻结 · `planning`）
- **记录**：交接 [handoffs/10-02-nexus-admin-console-overhaul/README.md](handoffs/10-02-nexus-admin-console-overhaul/README.md)

## 10-02-nexus-admin-emergency-chain

- **标题**：应急链路端到端：恢复码、会话列表与吊销
- **旧身份**：id `nexus-admin-emergency-chain` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-02
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：未跟踪 4 个文件
- **关系**：父任务 [`10-02-nexus-admin-console-overhaul`](#10-02-nexus-admin-console-overhaul)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/10-02-nexus-admin-emergency-chain/README.md](handoffs/10-02-nexus-admin-emergency-chain/README.md)

## 10-02-nexus-admin-migrate-accounts

- **标题**：用户与订阅页迁移：用户管理、激活码
- **旧身份**：id `nexus-admin-migrate-accounts` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-02
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：未跟踪 7 个文件
- **关系**：父任务 [`10-02-nexus-admin-console-overhaul`](#10-02-nexus-admin-console-overhaul)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/10-02-nexus-admin-migrate-accounts/README.md](handoffs/10-02-nexus-admin-migrate-accounts/README.md)

## 10-02-nexus-admin-migrate-ai-services

- **标题**：AI 服务页迁移：AI 概览、服务渠道、AI 调用审计
- **旧身份**：id `nexus-admin-migrate-ai-services` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-02
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：未跟踪 5 个文件
- **关系**：父任务 [`10-02-nexus-admin-console-overhaul`](#10-02-nexus-admin-console-overhaul)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/10-02-nexus-admin-migrate-ai-services/README.md](handoffs/10-02-nexus-admin-migrate-ai-services/README.md)

## 10-02-nexus-admin-migrate-analytics

- **标题**：数据分析页拆分迁移
- **旧身份**：id `nexus-admin-migrate-analytics` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-02
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：未跟踪 4 个文件
- **关系**：父任务 [`10-02-nexus-admin-console-overhaul`](#10-02-nexus-admin-console-overhaul)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/10-02-nexus-admin-migrate-analytics/README.md](handoffs/10-02-nexus-admin-migrate-analytics/README.md)

## 10-02-nexus-admin-migrate-content

- **标题**：内容运营页迁移：更新与要闻、资源库（含列表分页）、评论管理
- **旧身份**：id `nexus-admin-migrate-content` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-02
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：未跟踪 12 个文件
- **关系**：父任务 [`10-02-nexus-admin-console-overhaul`](#10-02-nexus-admin-console-overhaul)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/10-02-nexus-admin-migrate-content/README.md](handoffs/10-02-nexus-admin-migrate-content/README.md)

## 10-02-nexus-admin-migrate-governance

- **标题**：数据治理页拆分迁移、补全文案键与遥测保留面板
- **旧身份**：id `nexus-admin-migrate-governance` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-02
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：未跟踪 4 个文件
- **关系**：父任务 [`10-02-nexus-admin-console-overhaul`](#10-02-nexus-admin-console-overhaul)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/10-02-nexus-admin-migrate-governance/README.md](handoffs/10-02-nexus-admin-migrate-governance/README.md)

## 10-02-nexus-admin-plugin-moderation

- **标题**：插件审核搬进后台 /admin/plugins
- **旧身份**：id `nexus-admin-plugin-moderation` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-02
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：未跟踪 4 个文件
- **关系**：父任务 [`10-02-nexus-admin-console-overhaul`](#10-02-nexus-admin-console-overhaul)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/10-02-nexus-admin-plugin-moderation/README.md](handoffs/10-02-nexus-admin-plugin-moderation/README.md)

## 10-02-nexus-admin-release-evidence

- **标题**：发布证据页与 CI 自动写入
- **旧身份**：id `nexus-admin-release-evidence` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-02
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：未跟踪 4 个文件
- **关系**：父任务 [`10-02-nexus-admin-console-overhaul`](#10-02-nexus-admin-console-overhaul)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/10-02-nexus-admin-release-evidence/README.md](handoffs/10-02-nexus-admin-release-evidence/README.md)

## 10-02-nexus-admin-retired-ai-cleanup

- **标题**：清理 10-01 退役的 AI 后台残留代码（含分析页 AI 面板）
- **旧身份**：id `nexus-admin-retired-ai-cleanup` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-02
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：被 .gitignore 忽略 1 个文件、未跟踪 15 个文件
- **关系**：父任务 [`10-02-nexus-admin-console-overhaul`](#10-02-nexus-admin-console-overhaul)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/10-02-nexus-admin-retired-ai-cleanup/README.md](handoffs/10-02-nexus-admin-retired-ai-cleanup/README.md)

## 10-02-nexus-admin-risk-console

- **标题**：风控控制面迁移：IP 封禁列表与解封、手动封禁迁入
- **旧身份**：id `nexus-admin-risk-console` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-02
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：未跟踪 4 个文件
- **关系**：父任务 [`10-02-nexus-admin-console-overhaul`](#10-02-nexus-admin-console-overhaul)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/10-02-nexus-admin-risk-console/README.md](handoffs/10-02-nexus-admin-risk-console/README.md)

## 10-02-nexus-admin-single-root-hotfix

- **标题**：热修：两个后台页面多根节点导致切页后主区域空白
- **旧身份**：id `nexus-admin-single-root-hotfix` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-02
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：未跟踪 6 个文件
- **关系**：父任务 [`10-02-nexus-admin-console-overhaul`](#10-02-nexus-admin-console-overhaul)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/10-02-nexus-admin-single-root-hotfix/README.md](handoffs/10-02-nexus-admin-single-root-hotfix/README.md)

## 10-02-tuffex-admin-primitives

- **标题**：TuffEx 补齐后台通用件：TxDescriptions、TxDataTable 骨架加载态、TxPagination 每页条数
- **旧身份**：id `tuffex-admin-primitives` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-02
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：未跟踪 14 个文件
- **关系**：父任务 [`10-02-nexus-admin-console-overhaul`](#10-02-nexus-admin-console-overhaul)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/10-02-tuffex-admin-primitives/README.md](handoffs/10-02-tuffex-admin-primitives/README.md)

## 10-02-tuffex-select-label-double-toggle

- **标题**：TuffEx：TxSelect 被 &lt;label> 包住时点击箭头会被吞掉（开关切换两次）
- **旧身份**：id `tuffex-select-label-double-toggle` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-02
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：未跟踪 4 个文件
- **关系**：父任务 无；子任务 无
- **记录**：交接 [handoffs/10-02-tuffex-select-label-double-toggle/README.md](handoffs/10-02-tuffex-select-label-double-toggle/README.md)

## 10-03-audit-insights-page

- **标题**：审计洞察页重做
- **描述**：R-D1–R-D10、R-E3、R-B5 界面侧
- **旧身份**：id `audit-insights-page` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-03
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `task/chore/live-work-1003` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：未跟踪 6 个文件
- **关系**：父任务 [`10-03-intelligence-audit-rebuild`](#10-03-intelligence-audit-rebuild)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/10-03-audit-insights-page/README.md](handoffs/10-03-audit-insights-page/README.md)

## 10-03-audit-usage-ledger

- **标题**：用量账本：计数常开、全局本地桶、写入端归属、洞察读接口
- **描述**：R-A1–R-A10
- **旧身份**：id `audit-usage-ledger` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-03
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `task/chore/live-work-1003` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：未跟踪 6 个文件
- **关系**：父任务 [`10-03-intelligence-audit-rebuild`](#10-03-intelligence-audit-rebuild)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/10-03-audit-usage-ledger/README.md](handoffs/10-03-audit-usage-ledger/README.md)

## 10-03-flow-into-metak-drill-in

- **标题**：流转并入 ⌘K 面板做二级页 + 流转页模糊背景
- **旧身份**：id `flow-into-metak-drill-in` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-03
- **下一步**（`meta.nextAction`）：等 trellis-check 的全量审查结果，然后做第 9 步 spec 更新，再向 Orca 协调方报完成。提交由协调方负责。
- **阻塞**（`meta.blocker`）：无代码阻塞。两件事等用户：一是 AC4（插件 UI 模式）真机验证要操作隔离实例，用户正在手动使用；二是 Nexus :3200 要不要重载来看 demo。
- **证据**（`meta.evidence`）：第 1–7 步已完成，门禁全过：tuffex 3131/3131，nexus 1902/1902，core-app vitest 1425 例，两套 typecheck 均为 0。真机已验证 AC1、AC2、AC3、AC5、AC7（模糊部分）、AC8、AC11，以及闪旧页的修复。记录见 implement.md「验收记录」。
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：未跟踪 6 个文件
- **关系**：父任务 无；子任务 无
- **记录**：交接 [handoffs/10-03-flow-into-metak-drill-in/README.md](handoffs/10-03-flow-into-metak-drill-in/README.md)

## 10-03-insights-shell-kit

- **标题**：洞察页共享组件与语音页迁移
- **描述**：R-E1、R-E2
- **旧身份**：id `insights-shell-kit` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-03
- **下一步**（`meta.nextAction`）：Hand the file list to the coordinator for integration; reuse the shared components in the audit insights page task.
- **阻塞**（`meta.blocker`）：None. Implementation finished; commit is handled by the convergence coordinator; formal verification will be re-homed into the Comet change after the trellis-to-comet-native migration is archived.
- **证据**（`meta.evidence`）：Main session re-verified on 2026-10-03 06:07 PDT: vitest 7 files / 58 tests pass (VoiceInsights.test.ts byte-identical to HEAD); eslint --max-warnings 0 exit 0 with a live stdin positive control; implementer pixel-parity evidence in evidence/README.md and region-report.txt. vue-tsc taken from the implementer report, not re-run.
- **工作区事实**：base `task/chore/live-work-1003` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：未跟踪 39 个文件
- **关系**：父任务 [`10-03-intelligence-audit-rebuild`](#10-03-intelligence-audit-rebuild)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/10-03-insights-shell-kit/README.md](handoffs/10-03-insights-shell-kit/README.md)

## 10-03-intelligence-audit-rebuild

- **标题**：智能审计页按洞察页 shell 重做
- **旧身份**：id `intelligence-audit-rebuild` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-03
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：未跟踪 9 个文件
- **关系**：父任务 无；子任务 [`10-03-modelsdev-pricing`](#10-03-modelsdev-pricing)（冻结 · `in_progress`）、[`10-03-audit-usage-ledger`](#10-03-audit-usage-ledger)（冻结 · `planning`）、[`10-03-intelligence-usage-limits`](#10-03-intelligence-usage-limits)（冻结 · `planning`）、[`10-03-insights-shell-kit`](#10-03-insights-shell-kit)（冻结 · `in_progress`）、[`10-03-audit-insights-page`](#10-03-audit-insights-page)（冻结 · `planning`）、[`10-03-intelligence-memory-page`](#10-03-intelligence-memory-page)（冻结 · `in_progress`）
- **记录**：交接 [handoffs/10-03-intelligence-audit-rebuild/README.md](handoffs/10-03-intelligence-audit-rebuild/README.md)

## 10-03-intelligence-memory-page

- **标题**：记忆独立子页
- **描述**：R-F1–R-F7
- **旧身份**：id `intelligence-memory-page` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-03
- **下一步**（`meta.nextAction`）：Build memory list/detail/editor components and memory-scope.ts with tests, then register the memory sub-page after the MCP entry and verify in a dev instance.
- **阻塞**（`meta.blocker`）：None for components; registration (categories.ts, router.ts, uno.config.ts, lang JSON) waits until the sibling MCP page task stops editing those files. Git is handled by the coordinator.
- **证据**（`meta.evidence`）：Plan reviewed by the boss on 2026-10-03; acceptance AC-M1–AC-M6 will record migrated memory tests, smoke/translation tests and dev-instance screenshots under evidence/.
- **工作区事实**：base `task/chore/live-work-1003` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：未跟踪 6 个文件
- **关系**：父任务 [`10-03-intelligence-audit-rebuild`](#10-03-intelligence-audit-rebuild)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/10-03-intelligence-memory-page/README.md](handoffs/10-03-intelligence-memory-page/README.md)

## 10-03-intelligence-settings-revamp

- **标题**：塔芙智能设置区改版 + 本机代理探测修复
- **旧身份**：id `intelligence-settings-revamp` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-03
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：基线后提交 4 个文件
- **关系**：父任务 无；子任务 [`10-03-mcp-settings-page`](#10-03-mcp-settings-page)（冻结 · `in_progress`）、[`10-03-skills-page-revamp`](#10-03-skills-page-revamp)（冻结 · `planning`）、`10-03-nexus-channel-copy`（已归档 · `completed`）、[`10-03-local-agent-detection`](#10-03-local-agent-detection)（冻结 · `planning`）
- **记录**：交接 [handoffs/10-03-intelligence-settings-revamp/README.md](handoffs/10-03-intelligence-settings-revamp/README.md)

## 10-03-intelligence-usage-limits

- **标题**：全局用量上限
- **描述**：R-C1–R-C6、R-G3
- **旧身份**：id `intelligence-usage-limits` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-03
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `task/chore/live-work-1003` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：未跟踪 6 个文件
- **关系**：父任务 [`10-03-intelligence-audit-rebuild`](#10-03-intelligence-audit-rebuild)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/10-03-intelligence-usage-limits/README.md](handoffs/10-03-intelligence-usage-limits/README.md)

## 10-03-local-agent-detection

- **标题**：本机代理 CLI 探测修复与去门槛
- **旧身份**：id `local-agent-detection` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-03
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：基线后提交 7 个文件
- **关系**：父任务 [`10-03-intelligence-settings-revamp`](#10-03-intelligence-settings-revamp)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/10-03-local-agent-detection/README.md](handoffs/10-03-local-agent-detection/README.md)

## 10-03-mcp-settings-page

- **标题**：MCP 独立成页（侧栏技能下方）
- **旧身份**：id `mcp-settings-page` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-03
- **下一步**（`meta.nextAction`）：按 implement.md 第 1–7 步：先拆出 SettingMcpHost / SettingMcpServers，再新建 IntelligenceMcpPage 并接上 categories、router、i18n、uno safelist，然后瘦身 SettingSkillsMcp 并迁移测试，最后做真实应用验收。
- **阻塞**（`meta.blocker`）：无阻塞。要和 10-03-skills-page-revamp 按顺序改 SettingSkillsMcp.vue，本任务先做。语言文件与 components.d.ts 里有他人未提交的改动。
- **证据**（`meta.evidence`）：PRD、design、implement 已经老板确认（2026-10-03）。实现与验证尚未开始。
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：基线后提交 6 个文件、基线后提交且又修改 1 个文件
- **关系**：父任务 [`10-03-intelligence-settings-revamp`](#10-03-intelligence-settings-revamp)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/10-03-mcp-settings-page/README.md](handoffs/10-03-mcp-settings-page/README.md)

## 10-03-modelsdev-pricing

- **标题**：models.dev 定价接入
- **描述**：R-B1–R-B4：定价目录拉取缓存、解析、费用计算，替换 MODEL_COSTS
- **旧身份**：id `modelsdev-pricing` · 冻结时状态 `in_progress` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-03
- **下一步**（`meta.nextAction`）：After trellis-to-comet-native is archived, re-home this plan as a Comet Native change and finish the catalog, resolver, logger wiring and tests there.
- **阻塞**（`meta.blocker`）：Paused by the boss on 2026-10-03: the repo is migrating from Trellis to Comet Native (change trellis-to-comet-native); implementation resumes only as a Comet change after that migration is archived.
- **证据**（`meta.evidence`）：Partial: pricing/pricing-provider-map.ts and pricing/__fixtures__/models-dev-subset.json on disk; full catalog draft preserved in drafts/; no gates run yet.
- **工作区事实**：base `task/chore/live-work-1003` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：未跟踪 10 个文件
- **关系**：父任务 [`10-03-intelligence-audit-rebuild`](#10-03-intelligence-audit-rebuild)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/10-03-modelsdev-pricing/README.md](handoffs/10-03-modelsdev-pricing/README.md)

## 10-03-skills-page-revamp

- **标题**：能力页改版为技能页（通用技能 / 内置技能 / 手动保存）
- **旧身份**：id `skills-page-revamp` · 冻结时状态 `planning` · 优先级 P2
- **归属**：assignee `TalexDreamSoul` · creator `TalexDreamSoul` · 创建于 2026-10-03
- **下一步**（`meta.nextAction`）：未记录
- **阻塞**（`meta.blocker`）：未记录
- **证据**（`meta.evidence`）：未记录
- **工作区事实**：base `stage` · branch 无 · worktree 无 · commit 无 · PR 无 · 迁移时有未保存内容：基线后提交 7 个文件
- **关系**：父任务 [`10-03-intelligence-settings-revamp`](#10-03-intelligence-settings-revamp)（冻结 · `planning`）；子任务 无
- **记录**：交接 [handoffs/10-03-skills-page-revamp/README.md](handoffs/10-03-skills-page-revamp/README.md)

## 旧任务根下的非任务目录

以下目录位于旧任务根下，但没有 `task.json`，不是任务，因此不进入身份登记：

- `.trellis/tasks/07-18-plugin-source-package-audit/`：19 个文件，基线 [目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-18-plugin-source-package-audit)。它是 `plugins:release:audit` 迁移前的默认输出目录（新的默认输出在 `docs/engineering/reports/plugin-source-package-audit/`）；其中 2026-08-27 的 receipt 是 dirty revision 下的失败结果，2026-08-29 至 09-03 的维护审计已注明不得复用，因此没有迁到新位置。
