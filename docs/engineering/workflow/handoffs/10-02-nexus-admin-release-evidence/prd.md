# 发布证据页与 CI 自动写入

父任务：`10-02-nexus-admin-console-overhaul`（D8）；承接 `09-23-nexus-admin-console-gaps` 原 R3。依赖：`10-02-nexus-admin-console-kit` 合入且组合件 API 已冻结。`design.md` / `implement.md` 在开工前补写。

## Goal

发布证据有完整的读写接口（`server/api/admin/release-evidence/**`）和矩阵语义，但仓库里没有任何写入方（除测试外零调用），也没有界面。做一个后台页面查看各版本、各平台的阻塞矩阵与运行记录，并在发版流水线里自动写入证据，让页面有真实数据。

## Background

- 接口统一 `requireAdminOrApiKey(event, ['release:evidence'])`（`release:` 为管理员专用 scope，`server/utils/auth.ts:195-198`）。矩阵 `GET …/matrix` 必须传 `version`（`releaseEvidenceStore.ts:590`）；`GET …/runs` 支持 `version / platform / scope / status / page / limit`（无 totalPages）；`GET …/runs/:runId` 返回 `{ run, items }`；写接口 `POST runs`、`POST runs/:runId/items`（按 `(run_id, case_id)` upsert，`evidence` ≤ 128 KB）、`POST doc-guard`（默认版本写死 `'2.5.0'`，`doc-guard.post.ts:34`）。
- 运行创建后**没有任何更新状态的路径**（store 中无 `UPDATE release_evidence_runs`）。矩阵按 `platform:scope:caseId` 取该版本最新一条，`required` 且 `failed / blocked / pending / skipped` 计为阻塞（`:564-584,647`）。
- 流水线：`.github/workflows/build-and-release.yml` 的 `build-and-release` 矩阵三条腿（`os: windows-2022 / macos-latest / ubuntu-latest`，`:105-117`）含原生模块构建与加载、打包、打包后启动冒烟、macOS 签名校验、产物校验、Windows 安装包断言等步骤；`sync-nexus-release` 作业已经用 `NEXUS_API_KEY` 与 Cloudflare Access 凭据调用 Nexus（`:1504-1515`），可作写入方式的先例。

## Requirements

- **R1 后端补齐**：
  - `GET /api/admin/release-evidence/versions`：返回有证据的版本列表（按版本号降序，含每个版本最近一次运行时间与阻塞数）；
  - `PATCH /api/admin/release-evidence/runs/:runId`：更新运行状态（`running → passed / failed / partial`）与备注，写审计 `release.evidence.run.update`（`/admin/audits` 补标签）；
  - `runs.get` 返回 `totalPages`；`doc-guard.post` 的默认版本改为必须显式传入（或取最新发布版本），不再写死 `2.5.0`。
- **R2 页面 `/admin/release-evidence`**（「系统治理」组新增「发布证据」，`dashboard.sections.menu.releaseEvidence`）：
  - 版本选择（来自 R1 版本列表，默认最新）；
  - 矩阵：四个平台（windows / macos / linux / all）的状态与计数，阻塞项清单，文档门禁状态；
  - 运行列表：`AdminTable`，按平台 / 范围 / 状态过滤，筛选进 URL；
  - 运行详情抽屉：运行信息（`TxDescriptions`）+ 条目表（类别、caseId、状态、是否发版必需、备注；`evidence` JSON 以代码块展开）。
  - 只读页面，不提供手动写入按钮（D8 选择 CI 写入）。
- **R3 CI 写入**（`build-and-release.yml`）：
  - 每条矩阵腿给相关步骤加 `id`，在腿的末尾加一个 `if: always()` 的步骤：创建运行（`version` = 本次发版版本，`platform` 由 `matrix.os` 映射为 windows / macos / linux，`scope: core-app`），按步骤结果写入条目（native-addons、build、smoke-launch、artifacts、installer〔Windows〕、signing〔macOS〕、everything-evidence〔Windows〕），最后用 R1 的 PATCH 写入运行状态；
  - 凭据沿用 `sync-nexus-release` 的方式：`secrets.NEXUS_API_KEY`（需带 `release:evidence` scope）+ 可选 Cloudflare Access 头；`NEXUS_BASE_URL` 同 `vars.NEXUS_SYNC_BASE_URL`；
  - 写入步骤失败**不得阻断发版**：仅这一步 `continue-on-error: true`，并以 `::warning::` 与 Job Summary 显式报出失败原因（避免「永远成功」的静默信号）；凭据缺失时跳过并给出 warning；不在日志里打印任何凭据或请求头。
  - 写入逻辑放在一个仓库脚本里（如 `scripts/release-evidence/record.mjs`），工作流只负责传参，便于本地用假服务端测试。
- **R4 老板操作项**：确认 `NEXUS_API_KEY` 对应的 API key 带 `release:evidence` scope（或新建一把并更新 secret）。本任务在 PR 描述中写清操作步骤；未配置前 CI 写入步骤只产生 warning。

## Acceptance Criteria

- [ ] 页面逐条满足父任务 design §4；ego 截图存 `research/`（用本地脚本写入的样例数据）。
- [ ] 写入脚本对本地 Nexus（管理员 API key）跑通：创建运行、写入条目、更新状态后，页面矩阵与列表正确反映；脚本有单测（假服务端，覆盖成功、401、网络失败三种情况）。
- [ ] 工作流改动通过 `actionlint`（或仓库现有的工作流校验）；用 `workflow_dispatch` 或下一次发版实测一次写入（需老板配合配置 secret；未能实测时如实记录）。
- [ ] 写入失败时发版作业结论不变，日志与 Job Summary 有明确 warning。
- [ ] 全量 vitest、typecheck、改动文件 eslint、`git diff --check`。

## Out of Scope

- `release-quality` 作业与 Nexus / docs 范围的证据写入（可作为后续扩展）；矩阵语义调整；删除运行。
