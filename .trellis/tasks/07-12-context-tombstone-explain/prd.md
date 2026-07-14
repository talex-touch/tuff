# Productize tombstone context explain

## Goal

把已存在的 `memory-tombstoned` package exclusion 从原始机器字符串产品化为可计数、可本地化、metadata-only 的 Intelligence Audit explain 状态，让用户明确知道某条记忆在 package prepare 后被删除并在 provider invoke 前移除。

## Requirements

- `summarizeContextPackageLog()` 必须单独统计 tombstoned memory exclusions，不把它误算成普通 policy block 或 token prune。
- explain item reason 必须通过纯映射函数生成 i18n key；未知 reason 保留安全机器字符串，不丢失审计信息。
- Audit inline summary 和 explain drawer 显示 tombstone count；排除项显示本地化 tombstone reason。
- 新增中英文消息目录，文案只描述 metadata-only 移除事实，不展示 memory/prompt/turn 原文。
- 保持现有 package log、typed transport 和 SQLite schema 不变。

## Acceptance Criteria

- [x] summarizer 对 `memory-tombstoned` 返回独立 `tombstoneCount`，并继续只保留 sourceType/sourceId/reason/tokenEstimate。
- [x] reason mapper 将 `memory-tombstoned` 映射到稳定 i18n key，未知 reason 安全回退。
- [x] Audit inline/drawer 均显示本地化 tombstone 状态，不显示 raw memory content。
- [x] focused summarizer tests、CoreApp web typecheck、focused lint 和 task-slice `git diff --check` 通过。

## Constraints

- 不新增 API/channel/schema，不读取 tombstone 或 MemoryItem 原文。
- 不把 focused UI contract 标成 packaged/real-profile evidence。

## Completion Evidence

- `ContextPackageLogSafeSummary.tombstoneCount` 对 `memory-tombstoned` 独立分类；excluded item normalizer 丢弃 accidental `content`，只保留 sourceType/sourceId/reason/tokenEstimate。
- `getContextExplainReasonI18nKey()` 只映射已知 tombstone reason；unknown reason 返回 `undefined` 并由 UI 显示安全机器字符串。
- Intelligence Audit inline summary 与 explain drawer 显示 tombstone count；排除项和 notice 使用 `en-US` / `zh-CN` 消息目录。
- Focused Vitest 1 file / 9 tests、CoreApp `typecheck:web`、catalog JSON parse、focused ESLint `--quiet` 与 task-slice `git diff --check` passed。
- 未新增 transport/API/schema；未采集 packaged Electron 或 real-profile evidence，相关层级保持 open。
