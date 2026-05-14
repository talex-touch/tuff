# Everything SDK 集成 PRD（Deep Dive）

> 状态：历史参考 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/EVERYTHING-SDK-INTEGRATION-PRD.deep-dive.full-2026-05-14.md`
> 当前入口：`../../TODO.md`、`../../docs/PRD-QUALITY-BASELINE.md`、`../../01-project/CHANGES.md`

## TL;DR

本文保留 Everything SDK 集成的历史深度方案。当前 Windows 文件搜索与应用搜索验收以 Everything diagnostic evidence、Windows capability evidence、App Index diagnostic 与 acceptance manifest 为准。

## 历史有效结论

- Windows 应优先使用 Everything 获取快速文件搜索结果。
- Everything 不可用时必须显式 fallback，不影响其他 provider。
- 设置页需要展示 backend、health、version、fallback chain 与错误原因。
- 结果图标/上下文提取必须有背压，避免搜索输入期间堆积后台任务。

## 当前项目口径

- `windows:capability:verify --requireEverythingTargets` 必须复核基础 Everything 查询、目标 probe 命中、matchCount 与样本文本。
- `everything-diagnostic-evidence` 必须校验 verdict/status、backend、health、fallbackChain、backendAttemptErrors 与 CLI path/version。
- Everything 真实目标命中仍需 Windows 真机 evidence。

## 关联入口

- `docs/everything-integration.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
