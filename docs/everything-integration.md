# Everything Integration

> 状态：当前参考 / 压缩版
> 更新时间：2026-05-14
> 完整快照：`./archive/everything-integration.full-2026-05-14.md`

## TL;DR

Windows 文件搜索优先使用 Everything。Everything 不可用时必须显式降级，不影响其他搜索 provider。当前验收重点是 Windows 真机 evidence：Everything target probe、diagnostic evidence、acceptance manifest 与 search trace 性能样本。

## 当前能力

- Windows Everything provider 支持 SDK/CLI backend fallback。
- Settings Everything 页可展示 backend、health、fallbackChain、backendAttemptErrors、version、esPath。
- `everything-diagnostic-evidence` 可复制/保存并离线复核。
- Everything 图标预热有背压，避免快速输入时堆积后台 worker。
- Windows capability evidence target probe 负责证明目标查询真实命中。

## 必守验收

- `windows:capability:verify --requireEverythingTargets` 必须证明基础查询成功、目标 probe 命中、matchCount 为正，且至少一条 sample 文本包含目标关键词。
- `everything:diagnostic:verify` 必须复核 verdict/status、backend、health、fallbackChain、backendAttemptErrors、CLI path/version。
- 不接受仅手工填写的 `found=true` 或空样本。

## 安装提示

Windows 用户需要安装 Everything 与 Everything CLI（`es.exe`），并确保 Everything 服务运行、CLI 位于 PATH 或默认安装目录。

## 关联入口

- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/03-features/search/EVERYTHING-SDK-INTEGRATION-PRD.deep-dive-2026-03.md`
