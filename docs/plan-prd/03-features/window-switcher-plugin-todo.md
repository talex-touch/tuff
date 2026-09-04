# 窗口切换插件开发 TODO

> 状态：规划；未开始实现。
>
> 目标：在 CoreBox 中按窗口标题或应用名召回**已打开的窗口**，用户选择结果后切换到该窗口。标题只是召回字段；交付承诺是准确切换，不是启动应用、打开文件或恢复历史会话。
>
> 优先级：在现有 Search / Cross-Platform remediation 之后排期。Linux 的会话模型是本功能的架构约束，不是收尾兼容项。

## 已有基础与缺口

- 宿主已有受控 capability：`system.window-manager`，仅授权给 `touch-window-manager`，并且要求 `system.shell`。
- capability 返回受限 DTO 与短时、单次有效 token；插件不接触 PID、原生窗口 ID、应用路径或 shell。
- Windows 已能按原生窗口枚举与动作。
- macOS 当前一应用只投影第一个非空标题，且 `activate` 以应用进程为单位，不能保证切到同一应用内匹配标题的准确窗口。
- Linux 当前被 capability 标记为 unsupported；不能把它与 Windows/macOS 共用同一“shell 后备”实现。
- 仓库注册了 `touch-window-manager` 的特权 capability，但没有对应 bundled plugin 目录；开发应以新的官方插件与宿主窗口级契约为完整交付单位。

## 不变边界

- 仅检索当前桌面会话、非后台应用的已打开窗口；不搜索浏览器 tab、文件内容、窗口历史或其他设备。
- 不持久化、上报或建立窗口标题索引；CoreBox 展开时按需枚举，关闭/替换结果后立即丢弃。
- 不向 Prelude 暴露 Electron、raw IPC、原生 ID、可执行路径、AppleScript、PowerShell、X11/Wayland socket 或任意 shell。
- token 只绑定本次枚举结果、当前 activation 和宿主 generation；重列、过期、权限撤销、插件 reload 后一律不可重放。
- 未找到窗口不启动应用；“启动应用”若有需求，必须由独立 capability / feature 承担。
- `unsupported`、`permission-required`、`degraded` 与 `failed` 必须区分；禁止把无法精准切换显示成“未找到”或“切换成功”。

## 统一宿主契约

### [ ] 1. 定义真实窗口级 DTO

将 `system.window-manager` 的列表结果收敛为每个实际可切换窗口一项：

```ts
type WindowSearchItem = Readonly<{
  kind: 'window'
  token: string
  appName: string
  title: string
  workspace?: string
  isFront: boolean
  actions: readonly ['activate']
}>
```

- `token` 是唯一动作入参；不增加可由插件构造的 `pid`、window handle、bundle ID、DBus object path 或 X11 ID。
- 结果数量仍由宿主上限控制；标题/应用名在宿主侧作长度与字节上限处理。
- 搜索、排序和 UI 在插件 Prelude/Surface 内完成；宿主不接收用户输入的标题来执行匹配，避免标题注入到系统脚本。
- `list` 返回 capability 可用性及稳定原因；`act` 返回 `completed | blocked | failed`，并保留 token 失效、原生窗口已变更、权限失效与平台不支持的可区分原因。

**验收**：同一应用的两个不同标题窗口有两条互异 DTO 和 token；对任意列表外 token、已消费 token、旧 epoch token 均不能执行动作。

### [ ] 2. 定义平台 backend 边界

在主进程保留显式 native backend，不把 platform branching 继续散落在插件或 capability 编排中：

```ts
interface WindowSearchBackend {
  availability(): Promise<WindowSearchAvailability>
  list(signal: AbortSignal): Promise<readonly NativeWindowTarget[]>
  activate(target: NativeWindowTarget, signal: AbortSignal): Promise<void>
}
```

- `availability()` 明确表达 `available`、`permission-required`、`unsupported`、`degraded` 与其恢复建议。
- `NativeWindowTarget` 仅停留在主进程；从 backend 到 capability 的唯一出口是脱敏、冻结 DTO。
- 不用 `withOSAdapter<T | undefined>` 表达本能力；它没有状态/reason，无法承载本功能的可观测降级契约。

**验收**：平台 backend 选择只有一处；任一不可用 backend 不产生空列表假阳性。

## 平台实施顺序

### [ ] 3. Windows：作为窗口级基线

- 保持现有 Win32 / EWMH 式“先列举受管窗口，再以固定原生 ID 激活”的模型。
- Windows 后端必须返回每个顶层窗口，而不是每进程一个主窗口；同标题窗口通过 token 消歧。
- 切换隐藏或位于其他 virtual desktop 的窗口时，结果必须是实际聚焦或明确失败，不能只返回进程启动成功。

**验收**：多窗口浏览器、两个同标题编辑器和跨桌面窗口均能从 CoreBox 指定结果准确切换。

### [ ] 4. macOS：Accessibility 窗口级实现

- 将现有 `System Events` 的“取每进程第一个 title”替换为可枚举的 AX 窗口列表，并把 token 绑定到该 AX 窗口的宿主私有身份。
- 动作必须聚焦指定 AX 窗口；仅 `NSRunningApplication.activate` 不算完成。
- 未取得辅助功能权限时返回 `permission-required`，提供系统设置引导；不得降级为按应用激活。
- 标题读取失败、无标题窗口、窗口在选择前关闭等情形必须有受控处理。

**验收**：同一 Chrome/VS Code/Terminal 实例内至少两个不同窗口能分别被列出并切换；撤销辅助功能权限后旧 token 失效且 UI 显示授权状态。

### [ ] 5. Linux X11 与 XWayland：首个 Linux 支持目标

- 仅在 `XDG_SESSION_TYPE=x11` 或确认可访问的 XWayland 环境启用 X11 backend。
- 使用 EWMH/Xlib 枚举 `_NET_CLIENT_LIST`、窗口标题、`WM_CLASS`、桌面与活动窗口；以 X11 window ID 在宿主内激活。
- 不依赖用户手动安装 `wmctrl` 或 `xdotool`；发行版依赖由应用的受控 native helper / 打包策略承担。
- 不兼容 EWMH 的窗口管理器返回 `unsupported` 或明确的 `degraded`，而非部分列表。

**验收**：在至少一个 EWMH 兼容 X11 desktop 上，结果包含窗口标题和应用名；选中后能切换到指定窗口及其所在 workspace。

### [ ] 6. Linux Wayland：按 compositor 适配，不提供伪通用模式

- Wayland 标准 `xdg_activation_v1` 只支持带用户交互 token 的 surface activation，不授予普通应用枚举或控制其他应用窗口的权限；不能作为通用窗口搜索 backend。
- 首批只支持存在稳定、可审计 compositor 专有接口的环境：KDE Plasma / KWin、Sway、Hyprland 分别设计 adapter 和真机验证；每个 adapter 都是单独交付项。
- GNOME Wayland 默认 `unsupported`。未来如需支持，只能通过用户明确安装并授权的 GNOME Shell Extension；扩展版本、权限、协议和卸载后的状态必须单独设计。
- 未知 compositor、portal-only 环境及 sandboxed desktop 默认 `unsupported`；不尝试 shell 注入、辅助工具扫描 socket 或从 `/proc` 猜测窗口。

**验收**：每个被声明支持的 compositor 具备真实枚举→选择→准确切换 smoke；其他 Wayland 环境在 UI 中明确不可用原因，不产生误导性搜索结果。

## 官方插件与搜索体验

### [ ] 7. 创建 `touch-window-search` 官方插件

- Manifest 声明 `system.shell`、平台支持范围、`search.root-results` 及明确 permission reason；特权 capability holder 同步纳入单一授权表。
- Prelude 仅通过 `plugin.windowManager.list()` / `activate(token)` facade 工作，所有跨进程调用都 `await`。
- 功能关键词覆盖“窗口、切换窗口、窗口标题、window、switch window、应用名”；没有查询时不枚举或最多展示前台窗口的最小提示，避免每次打开 CoreBox 都泄露桌面标题。
- 搜索排名固定为：标题规范化前缀匹配 > 标题子串匹配 > 应用名匹配；同分时前台窗口优先，再按稳定原始顺序。不要为小集合引入语义搜索、学习排序或持久化。
- 结果文案为 `标题 — 应用名 · 工作区`；同标题结果必须保留应用名与 workspace 消歧。无标题窗口只以应用名显示。

**验收**：用户输入标题片段后得到稳定排序；选择任何结果只调用该结果 token 的 `activate`；插件不可直接访问原生窗口身份或系统脚本。

### [ ] 8. 授权、状态与可访问性体验

- `permission-required` 显示一次明确的授权动作和原因；不可执行结果不伪装成可选项。
- `unsupported` 显示当前 session / compositor 与支持原因，不提示用户安装不受支持的任意命令。
- `failed` 可重试列表，但不自动重试或后台轮询。
- 搜索列表支持键盘上下选择、回车激活、Esc 返回；激活完成后按 CoreBox 现有策略关闭面板。

**验收**：权限撤销、token 过期、目标窗口已关闭、Unsupported Linux Wayland 四种路径分别可见、可理解、无误激活。

## 验证与发布门禁

### [ ] 9. 共享 capability 回归

- 覆盖 DTO 上限与脱敏、epoch 置换、token 单次消费、TTL、activation/generation rotation、permission revoke、窗口已替换和 AbortSignal 取消。
- 覆盖每个平台的 `available | permission-required | unsupported | degraded | failed` 投影，确保没有空列表替代不可用状态。
- 保持现有固定脚本/固定 argv 信任边界：插件输入不得进入 shell / AppleScript / X11 command 字符串。

### [ ] 10. 插件回归与真实 surface smoke

- 覆盖 manifest capability / permission 声明、启用/禁用、permission deny/revoke、第二代 activation、根搜索 provider 结果和 token 动作。
- 运行 `pnpm plugins:validate` 与插件 suite；涉及官方 bundle 时追加 CoreApp production build 和 Electron isolation smoke。
- 每个宣称支持的平台必须使用真实桌面会话验证“枚举 → 选中 → 指定窗口获得焦点”；单元测试不替代 compositor / Accessibility / X11 真机证据。
- Linux 发布 matrix 应至少区分 X11、KDE Wayland、GNOME Wayland unsupported；不要以单个 Linux CI runner 代替桌面会话验收。

## 明确不做

- 浏览器标签、IDE editor tab、终端 pane、远程桌面、窗口历史、窗口内容全文搜索。
- 任意 AppleScript、任意 shell、用户自定义窗口动作、窗口关闭/隐藏/置顶/布局预设。
- Linux Wayland 的“万能兼容层”、GNOME Wayland 隐式绕过、后台标题索引。
- 把窗口搜索合并到文件索引、应用扫描或既有 SearchIndex SQLite。

## 开始实施前的决策门

1. 首版是否仅承诺 Windows + macOS + Linux X11，Wayland adapters 后置？建议是。
2. macOS Accessibility 采用应用内原生 helper 还是签名的最小 sidecar？必须先确认打包、签名与撤销路径。
3. KDE Wayland、Sway、Hyprland 的支持优先级应由目标用户桌面分布决定；没有真实用户环境证据时不预先承诺。
4. 新插件是否进入 bundled official plugins，还是先作为开发态内部插件验证？建议先 bundled，但仅在 capability 窗口级契约和最小三平台证据成立后。

## 参考依据

- `apps/core-app/src/main/modules/plugin/host/plugin-window-manager-capabilities.ts`：现有受控 window-manager capability、token、Windows/macOS 固定脚本与 Linux unsupported 行为。
- `apps/core-app/src/main/modules/plugin/privileged-plugins.ts`：`windowManager` 现仅授权给 `touch-window-manager`。
- `docs/engineering/plugin-prelude-isolation-migration.zh-CN.md`：插件隔离、capability、permission、opaque token 与 lifecycle 不变量。
- `docs/plan-prd/02-architecture/platform-capabilities-prd.md`：能力必须表达 unsupported/degraded reason，禁止伪成功。
- [wmctrl(1)](https://linux.die.net/man/1/wmctrl)：X11/EWMH 受管窗口列举与按窗口 ID 激活语义参考。
- [XDG activation protocol](https://wayland.app/protocols/xdg-activation-v1)：Wayland activation 的 token / compositor 决策边界，不能视为全局窗口管理 API。
