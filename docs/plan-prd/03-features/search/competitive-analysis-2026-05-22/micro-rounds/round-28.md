# 微审计 28/70

- 审计主题：Raycast Window Management / Alfred System Commands / uTools 系统动作，映射到 Tuff 当前 `touch-window-presets`、`touch-system-actions`、`touch-quick-actions` 时，是否应被视为完整窗口管理能力，还是只能定位为 shell/native 混合的部分落地能力。

- 读取/核对的文档或源码锚点：
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/01-basic-capability-alignment.md`：System Actions 与 Window Management 均标为“部分落地”，缺口是平台差异、typed settings provider、多屏/权限/真机 evidence。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/02-raycast-smooth-interactions.md`：Window Management 行要求保持 capability metadata，在 Action Panel 展示 unsupported reason，而不是复制完整 Raycast 窗口管理面板。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`：系统动作与窗口管理被放入 fail-closed 口径；Linux 不支持时应展示 `unsupported`，不应重新开放裸 shell fallback。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/09-cross-platform-local-data.md`：把 Window Management / System Actions 的最小 evidence 定为 Windows/macOS/Linux 平台矩阵、权限拒绝、执行失败和危险确认样本。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`：第 10/11 条已记录 System Actions 需要 typed provider、Window Management 存在平台证据风险。
  - `plugins/touch-window-presets/manifest.json`：feature 只声明 `win32: true`，`darwin/linux: false`，required permission 为 `system.shell`。
  - `plugins/touch-window-presets/index.js`：非 Windows 直接推送“当前平台暂不支持窗口预设”；Windows 通过 PowerShell / user32 枚举窗口和执行 snap/topmost；缺权限时展示 `permission-missing`，列表失败时展示 `degraded`。
  - `plugins/touch-system-actions/manifest.json`：系统动作支持 win32/darwin，linux false；required permission 为 `system.shell`。
  - `plugins/touch-system-actions/index.js`：系统动作同时包含 shell action 与 `open-main-window` native-window action，shell 能力会输出 `unsupported` / `permission-missing` capability metadata。
  - `plugins/touch-quick-actions/index.js`：Windows/macOS 提供重启、关机、锁屏、静音、设置打开；Linux 返回 `platform:${platform}` unsupported；高风险动作通过 `confirmLevel` 做二次确认，执行前拒绝空命令和换行/空字节 payload。

- 结论：
  - 主文档对这个映射点的边界判断成立。Tuff 当前有真实系统动作和窗口预设代码路径，不是纯规划：`touch-window-presets` 能在 Windows 下列出可见窗口、双列平铺、开发工作台、取消置顶；`touch-system-actions` / `touch-quick-actions` 能提供关机、重启、锁屏、音量、显示/通知设置与主窗口控制入口。
  - 但它们还不能宣称为 Raycast Window Management 或 Alfred System Commands 的完整 parity。核心原因是能力仍依赖 shell / PowerShell / AppleScript / user32，平台覆盖明显不对称；`touch-window-presets` 当前明确 Windows-only，Linux 对窗口和系统动作均应 `unsupported`，macOS 窗口管理也没有同等 preset 实现。
  - 当前实现值得保留的方向是 fail-closed 与 evidence：缺 `system.shell` 时显示 `permission-missing`，非支持平台显示 `unsupported`，窗口列表失败显示 `degraded`，危险关机/重启动作要求确认。这些字段正好能支撑主文档要求的 capability metadata / unsupported reason / 真机 evidence。
  - 后续最小下一步不应是扩大裸 shell 动作集合，而是把系统设置做成只读 typed provider，把窗口预设补 Windows 多屏 smoke、macOS permission denied / best-effort reason、Linux unsupported 样本，并把 Action Panel 的 capability/evidence 展示统一起来。

- 是否发现需修正的主文档问题：否。`01`、`02`、`04`、`09`、`11` 没有把当前 shell-backed System Actions / Window Management 夸大成完整竞品对齐；它们把当前状态写为部分落地，并把剩余工作放在平台 reason、权限、危险确认、typed provider 与真机 evidence 上，与源码一致。

- 本轮未改业务代码、未提交 git 的说明：本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-28.md` 作为微审计输出；未修改业务代码，未执行 git commit / push / 分支 / reset / checkout。
