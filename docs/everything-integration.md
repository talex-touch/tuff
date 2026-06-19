# Everything Integration

> 状态：当前参考 / 压缩版
> 更新时间：2026-06-20
> 完整快照：`./archive/everything-integration.full-2026-05-14.md`

## TL;DR

Windows 文件搜索优先使用 Everything。Everything 不可用时必须显式降级，不影响其他搜索 provider。当前验收重点是 Windows 真机 evidence：Everything target probe、diagnostic evidence、acceptance manifest 与 search trace 性能样本。

## 当前能力

- Windows Everything provider 支持 SDK/CLI backend fallback。
- Settings Everything 页可展示 backend、health、fallbackChain、backendAttemptErrors、version、esPath，并支持一键安装、手动选择/清除 Everything CLI (`es.exe`) 路径。
- 一键安装会通过 Download Center 下载官方 portable Everything 与 ES CLI ZIP，校验固定 SHA-256 后解压到用户目录，保存 `es.exe` 到 Tuff 配置，并只追加当前用户 `PATH`。
- Everything 搜索结果会经过 File Index watch roots 二次过滤；无可用 watch roots 时 fail-closed，不向 CoreBox 返回未授权路径结果。
- `everything-diagnostic-evidence` 可复制/保存并离线复核。
- Everything 图标预热有背压，避免快速输入时堆积后台 worker。
- Windows capability evidence target probe 负责证明目标查询真实命中。

## 必守验收

- `windows:capability:verify --requireEverythingTargets` 必须证明基础查询成功、目标 probe 命中、matchCount 为正，且至少一条 sample 文本包含目标关键词。
- `everything:diagnostic:verify` 必须复核 verdict/status、backend、health、fallbackChain、backendAttemptErrors、CLI path/version 与 path filtering 计数一致性。
- 不接受仅手工填写的 `found=true` 或空样本。

## CLI 路径策略

- 检测优先级：用户配置的 `cliPath` → PATH 中的 `es.exe` → 默认安装目录。
- 手动配置入口：Settings → Everything Search → Everything CLI Path，可选择或清除自定义 `es.exe`。
- 用户选择的 CLI 文件会先执行 `es.exe -v` 探测；探测失败不会保存到配置。
- 一键安装完成后会把 `%LOCALAPPDATA%\Tuff\EverythingCLI\es.exe` 保存为用户配置路径，并把 CLI 目录写入当前用户 `PATH`；不会修改 Machine PATH，也不申请管理员权限。

## 路径授权过滤

- Everything SDK/CLI 原始结果只作为候选集，最终必须落在 File Index 当前 watch roots 内。
- 过滤状态只导出计数、时间和 reason（如 `outside-file-index-watch-roots`），不把具体 watch root 路径写入 diagnostic evidence。
- 如果 File Index watch roots 为空或不可读，Everything provider 返回空结果并记录 `no-file-index-watch-roots` / `file-index-watch-roots-unavailable`。

## 安装提示

Windows 用户可以在 Settings → Everything Search → 安装与修复中点击一键安装。Tuff 会把两个官方 ZIP 加入 Download Center，下载完成后自动校验、解压、启动 portable Everything 并刷新后端状态。

高级设置展示下载任务 ID、目标目录、下载 URL、SHA-256、当前 `es.exe` 路径、User PATH 写入策略与手动下载入口。下载失败、校验失败、解压失败或 `es.exe -v` 探测失败都会进入 failed 状态，不保存坏路径。

## 关联入口

- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/03-features/search/EVERYTHING-SDK-INTEGRATION-PRD.deep-dive-2026-03.md`
