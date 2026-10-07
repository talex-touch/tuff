# 迁移前任务交接（Handoffs）

> 2026-10-03 项目工作流从 Trellis 切换到 Comet Native。本目录保存切换时仍有未保存内容的旧任务文档与证据，只作只读证据，不是活动任务，也不承担任务状态。

## 规则

- 只为迁移时存在未保存内容（相对基线 `cfda0a6cd` 已修改、未跟踪、被忽略或基线之后才提交）的旧任务建立交接目录；其余旧任务从已公开且任务目录内容相同的 `0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e` 链接恢复。
- 原始文件逐字节复制，不改写；每个目录的 `README.md` 列出原路径、迁移时状态与 sha256，并给出未复制文件的基线链接。
- 原本就被 `.gitignore` 忽略的证据（例如 `*.log`）也复制到本地交接目录，但按原规则仍不进入版本控制。原本刻意本机排除的 `07-26-install-launch-v2-4-13-beta-23` 整个交接目录也继续保持本机边界。
- 冻结任务的归属、下一步、阻塞与证据见 [backlog.md](../backlog.md)；全部旧任务的身份登记见 [retired-task-index.json](../retired-task-index.json)。
- 恢复任何一项工作：读交接与证据，与用户确认范围和验收，核对现有 PRD、工程规格与真实运行证据，再与当前负责人确认交接。这里的历史副本保持只读。

## 交接目录

| 任务 | 处置 | 冻结时状态 | 复制文件数 | 交接 |
| --- | --- | --- | --- | --- |
| `07-22-ota-one-click-background-update` | 冻结 | `in_progress` | 3 | [README](07-22-ota-one-click-background-update/README.md) |
| `07-26-install-launch-v2-4-13-beta-23` | 冻结 | `in_progress` | 4 | 本机交接，原有忽略边界保留 |
| `08-05-full-repo-governance-audit` | 冻结 | `in_progress` | 3 | [README](08-05-full-repo-governance-audit/README.md) |
| `09-23-nexus-admin-console-gaps` | 冻结 | `planning` | 6 | [README](09-23-nexus-admin-console-gaps/README.md) |
| `09-23-nexus-docs-perf-cms-remediation` | 冻结 | `planning` | 2 | [README](09-23-nexus-docs-perf-cms-remediation/README.md) |
| `09-29-ai-answer-template` | 冻结 | `in_progress` | 4 | [README](09-29-ai-answer-template/README.md) |
| `09-29-stream-element` | 冻结 | `planning` | 2 | [README](09-29-stream-element/README.md) |
| `09-29-stream-element-core` | 冻结 | `in_progress` | 3 | [README](09-29-stream-element-core/README.md) |
| `10-02-nexus-admin-console-kit` | 冻结 | `in_progress` | 13 | [README](10-02-nexus-admin-console-kit/README.md) |
| `10-02-nexus-admin-console-overhaul` | 冻结 | `planning` | 10 | [README](10-02-nexus-admin-console-overhaul/README.md) |
| `10-02-nexus-admin-emergency-chain` | 冻结 | `planning` | 4 | [README](10-02-nexus-admin-emergency-chain/README.md) |
| `10-02-nexus-admin-migrate-accounts` | 冻结 | `in_progress` | 7 | [README](10-02-nexus-admin-migrate-accounts/README.md) |
| `10-02-nexus-admin-migrate-ai-services` | 冻结 | `planning` | 5 | [README](10-02-nexus-admin-migrate-ai-services/README.md) |
| `10-02-nexus-admin-migrate-analytics` | 冻结 | `planning` | 4 | [README](10-02-nexus-admin-migrate-analytics/README.md) |
| `10-02-nexus-admin-migrate-content` | 冻结 | `in_progress` | 12 | [README](10-02-nexus-admin-migrate-content/README.md) |
| `10-02-nexus-admin-migrate-governance` | 冻结 | `planning` | 4 | [README](10-02-nexus-admin-migrate-governance/README.md) |
| `10-02-nexus-admin-plugin-moderation` | 冻结 | `planning` | 4 | [README](10-02-nexus-admin-plugin-moderation/README.md) |
| `10-02-nexus-admin-release-evidence` | 冻结 | `planning` | 4 | [README](10-02-nexus-admin-release-evidence/README.md) |
| `10-02-nexus-admin-retired-ai-cleanup` | 冻结 | `in_progress` | 16 | [README](10-02-nexus-admin-retired-ai-cleanup/README.md) |
| `10-02-nexus-admin-risk-console` | 冻结 | `planning` | 4 | [README](10-02-nexus-admin-risk-console/README.md) |
| `10-02-nexus-admin-single-root-hotfix` | 冻结 | `planning` | 6 | [README](10-02-nexus-admin-single-root-hotfix/README.md) |
| `10-02-tuffex-admin-primitives` | 冻结 | `in_progress` | 14 | [README](10-02-tuffex-admin-primitives/README.md) |
| `10-02-tuffex-select-label-double-toggle` | 冻结 | `planning` | 4 | [README](10-02-tuffex-select-label-double-toggle/README.md) |
| `10-03-audit-insights-page` | 冻结 | `planning` | 6 | [README](10-03-audit-insights-page/README.md) |
| `10-03-audit-usage-ledger` | 冻结 | `planning` | 6 | [README](10-03-audit-usage-ledger/README.md) |
| `10-03-flow-into-metak-drill-in` | 冻结 | `in_progress` | 6 | [README](10-03-flow-into-metak-drill-in/README.md) |
| `10-03-insights-shell-kit` | 冻结 | `in_progress` | 39 | [README](10-03-insights-shell-kit/README.md) |
| `10-03-intelligence-audit-rebuild` | 冻结 | `planning` | 9 | [README](10-03-intelligence-audit-rebuild/README.md) |
| `10-03-intelligence-memory-page` | 冻结 | `in_progress` | 6 | [README](10-03-intelligence-memory-page/README.md) |
| `10-03-intelligence-settings-revamp` | 冻结 | `planning` | 4 | [README](10-03-intelligence-settings-revamp/README.md) |
| `10-03-intelligence-usage-limits` | 冻结 | `planning` | 6 | [README](10-03-intelligence-usage-limits/README.md) |
| `10-03-local-agent-detection` | 冻结 | `planning` | 7 | [README](10-03-local-agent-detection/README.md) |
| `10-03-mcp-settings-page` | 冻结 | `in_progress` | 7 | [README](10-03-mcp-settings-page/README.md) |
| `10-03-modelsdev-pricing` | 冻结 | `in_progress` | 10 | [README](10-03-modelsdev-pricing/README.md) |
| `10-03-skills-page-revamp` | 冻结 | `planning` | 7 | [README](10-03-skills-page-revamp/README.md) |
| `09-01-progress-bar-redesign` | 历史（已归档） | `completed` | 3 | [README](09-01-progress-bar-redesign/README.md) |
| `09-01-slider-pill-thumb` | 历史（已归档） | `completed` | 22 | [README](09-01-slider-pill-thumb/README.md) |
| `10-03-nexus-channel-copy` | 历史（已归档） | `completed` | 4 | [README](10-03-nexus-channel-copy/README.md) |
