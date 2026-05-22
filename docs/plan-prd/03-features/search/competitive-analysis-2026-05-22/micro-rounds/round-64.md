# 微审计 64/70

- 审计主题

`touch-quick-actions` 的动态 feature 直达高风险系统动作时，是否仍然经过 `system.shell` 权限、safe-shell、危险确认和 canonical action allowlist；对照 Raycast Window Management / Alfred System Commands / uTools 系统动作时，确认它是“部分落地但 fail-closed”的系统快捷动作底座，而不是可任意执行 shell 的完整自动化面板。

- 读取/核对的文档或源码锚点

1. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/01-basic-capability-alignment.md`
   - System Actions 被标为“部分落地”，缺口是平台差异、typed settings provider 和 evidence。
   - Window Management / System Actions 都要求保留 capability metadata、unsupported reason 和真机样本。
2. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`
   - 第 5.2 节要求系统动作坚持 fail-closed：缺 `system.shell` 时 blocked、Linux unsupported、高风险动作二次确认，不重新开放裸 shell fallback。
3. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/09-cross-platform-local-data.md`
   - System Actions evidence 要覆盖 Windows/macOS 执行前 capability meta、危险操作取消、Linux unsupported、shell permission denied/allowed、blocked 和执行成功。
4. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-28.md`
   - 已确认 `touch-system-actions` / `touch-quick-actions` 不是空壳，但只能定位为 shell/native 混合的部分落地能力。
5. `plugins/touch-quick-actions/manifest.json`
   - 插件声明 `sdkapi: 260428`，required permission 为 `system.shell`，permission reason 是“执行系统快捷动作和打开系统设置”。
   - `quick-actions` feature 只接受 text，平台声明为 Windows/macOS true、Linux false。
6. `plugins/touch-quick-actions/index.js`
   - `resolveShellStatus()` 对非 Windows/macOS 返回 `unsupported` + `platform:${platform}`，safe-shell 不可用返回 `safe-shell-unavailable`。
   - `resolveShellCapabilityState()` 只做 `permission.check()`，展示阶段不会主动弹授权。
   - `buildActionCapability()` 把 pluginName、featureId、actionId、commandKind、requiresConfirmation、requiresAdmin 写进 capability audit。
   - `resolveActions()` 只返回平台内置动作列表；关机 / 重启 `confirmLevel: 2`，锁屏 / 静音 / 设置入口无高风险确认。
   - `registerDynamicFeatures()` 会把每个内置 action 注册为 `quick-action-*` 动态 feature，并带 capability meta。
   - 动态 feature 直达路径 `onFeatureTriggered()` 会把 `dynamicAction` 交给 `runActionWithGuards()`，没有绕开执行守卫。
   - 列表 item action 路径 `onItemAction()` 通过 `resolveActionForExecution()` 按 action id 回查当前平台 allowlist，再调用 `runActionWithGuards()`，不会信任 item payload 里的 command 字符串。
   - `runActionWithGuards()` 依次阻断 invalid / empty / unsafe payload、safe-shell unavailable、permission denied、用户取消确认，并只在执行成功后返回 `started`。
7. `plugins/touch-quick-actions/index.test.cjs`
   - 测试覆盖 capability audit、展示期权限检查不弹窗、safe-shell unavailable 阻断、unsafe payload 阻断、canonical action command 回查、item payload command 注入被忽略、执行失败返回非零 code。

- 结论

主文档对该映射点的判断成立：Tuff 当前具备系统快捷动作的真实底座，但没有把它夸大成完整 Raycast Window Management、Alfred 自动化命令或 uTools 系统插件面板。

已经成立的事实有六点：

1. `touch-quick-actions` 不是任意 shell 输入面；动作来源是 `resolveActions(platform)` 中的固定 allowlist。
2. 动态 feature 直达入口和列表 item action 入口最终都进入 `runActionWithGuards()`，权限、safe-shell、危险确认和执行结果语义一致。
3. 列表 item action 不信任 payload 里的 command，而是用 action id 回查当前平台 canonical action，降低 item payload 被篡改后执行注入命令的风险。
4. 展示阶段只做 permission check，不主动 request；缺权限时输出 `permission-missing` item 和 capability reason，符合“先解释、后执行授权”的体验边界。
5. Linux / safe-shell 缺失 / unsafe payload / 用户取消 / 子进程失败都能返回明确 `blocked`、`cancelled` 或 `failed`，不是静默空结果。
6. 高风险动作使用 `confirmLevel` 串联确认框，且 capability audit 中有 `requiresConfirmation` / `requiresAdmin` 字段，可作为后续 evidence 的数据基础。

仍不能宣传为完整竞品对齐：

1. 当前仍依赖 `system.shell` 和平台命令，缺 typed `platform.settings` provider；系统设置入口不是只读 settings source 合同。
2. 动态 feature 的用户可见来源、启用条件、最近变更和禁用入口仍缺统一 evidence；第 40 轮提到的动态 feature 管理合同还未完成。
3. Window Management 仍应另验 `touch-window-manager` / `touch-window-presets` 的多屏、权限拒绝、Linux unsupported，不应由 quick actions 代替。
4. 发布验收不能只看“搜索结果出现重启 / 锁屏”；必须分别覆盖动态 feature 直达、列表 item action、拒权、取消确认、safe-shell 缺失、Linux unsupported 与执行失败。

因此后续最小 evidence 建议是 `quick-actions-risk-evidence-v1`：固定采样 `lock-screen`、`shutdown`、`focus-settings` 三类动作，分别跑动态 feature 直达和列表 item action 两条路径，记录 `featureId`、`actionId`、`capability.status/reason`、`requiresConfirmation`、`execute.status/reason`，并确保日志不落 shell 原始异常堆栈之外的敏感上下文。

- 是否发现需修正的主文档问题

否。`01`、`04`、`09`、`10`、`11` 以及既有第 28 / 40 轮微审计都没有把 `touch-quick-actions` 写成完整系统自动化或窗口管理能力；它们把当前状态定位为部分落地，并把剩余工作放在 typed provider、平台 reason、危险确认、动态 feature evidence 和真机验收上。源码核对结果与该口径一致。

- 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-64.md`，并更新 `.codexpotter` 进度记录；未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理操作。
