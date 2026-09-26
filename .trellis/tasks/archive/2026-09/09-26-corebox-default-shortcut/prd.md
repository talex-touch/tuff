# CoreBox 默认快捷键改为 Option+Space

父任务：`09-25-corebox-ux-polish`。

## Goal

CoreBox 的默认呼出快捷键从 `⌘E`（Win/Linux 为 `Ctrl+E`）改为 `⌥Space`，与 Raycast、Alfred 等启动器的习惯一致。界面各处显示的快捷键与实际绑定保持一致；新默认键被别的应用占用时，用户仍然能呼出 CoreBox。

## Background（代码事实）

- 老板原话：「默认快捷键从metae改成 option+空格」（2026-09-26）。
- 注册：`apps/core-app/src/main/modules/box-tool/core-box/index.ts:85-87` 调用 `shortcutModule.registerMainShortcut('core.box.toggle', 'CommandOrControl+E', …)`。
- 迁移机制已有：`registerMainShortcut(id, defaultAccelerator, cb, { legacyDefaultAccelerators })`（`main/modules/global-shortcon.ts:241-280`）。
  - 已存的快捷键如果由系统创建（`author === SYSTEM_SHORTCUT_AUTHOR`），且仍是旧默认值，就改写为新默认值；
  - 用户自己改过的保持不变；
  - 截图模块已经用过同一机制（`screenshot-session/index.ts:30,162`）。
- `registerMainShortcut` 在系统层注册失败（被其他应用占用）时也返回 true，失败只写日志。`⌥Space` 被 Raycast、Alfred 占用时，CoreBox 会失去呼出方式。
- 界面里写死 `⌘E` / `Ctrl+E` 的位置：
  - `main/modules/tray/tray-menu-builder.ts:127`（托盘菜单 accelerator）；
  - `renderer/.../components/shell/ShellSidebar.vue`、`ShellSearchEntry.vue`；
  - `renderer/.../views/base/begin/internal/Done.vue`（新手引导完成页）；
  - `renderer/.../modules/shortcuts/shortcut-chord.ts`、`modules/box/adapter/hooks/useKeyboard.ts`（需要核对是否为同一个快捷键）；
  - nexus：`content/docs/guide/start.{zh,en}.mdc`、`app/components/tuff/landing/TuffLandingNexusHero.vue`、`TemplateDocsDemo.vue`、`chat-composer` / `template-inbox` 文档（需要核对含义）；
  - `CLAUDE.md`。
- macOS 上 `⌥Space` 在文本框里原本输入不换行空格，注册为全局快捷键后会被占用。Raycast、Alfred 的默认键就是它，属于可以接受的惯例。

## Decisions（老板 2026-09-26）

- 全平台默认 `Alt+Space`（macOS 即 ⌥Space，Windows / Linux 与 PowerToys Run 一致，会占用系统的窗口菜单键）。
- 新默认键注册失败（被 Raycast / Alfred 等占用）时，自动退回 `⌘E` / `Ctrl+E`，并提示用户可以去设置里改。
- 开工并补单测。
- macOS 上查不出别的应用占用 ⌥Space（见下文「实测」）：接受现状，在新手引导完成页和文档里加一句提示：如果 ⌥Space 打开的是别的应用，去设置里改（老板 2026-09-26）。
- 顺带修两个小问题（老板 2026-09-26）：托盘里截图快捷键的显示；Windows 上录制 Win 键。

## 最终决定：永远不兜底（老板 2026-09-26）

老板原话：「永远不兜底 都改成 option + space」。这一条取代下文 R3、R3.1、R3.2、R4.1 中与 ⌘E 兜底有关的内容：

- 删除 ⌘E / Ctrl+E 兜底：
  - 运行时兜底注册；
  - 「已临时改用 ⌘E」的通知；
  - 设置页「暂用 ⌘E」的警示状态。
- ⌥Space 用不了时（系统拒绝注册，或在应用内冲突中输掉），只弹一条准确的通知：CoreBox 暂时没有快捷键，请在设置里换一个。每次启动最多一次，不提供任何替代键。
- 与 CoreBox 快捷键相关的地方不再出现 ⌘E。主窗口命令面板的「打开 CoreBox」改为显示 ⌥Space，即实际生效的全局绑定；文档、spec、CLAUDE.md 中关于兜底的说法一并删除。
- 保留：R2 旧默认值迁移、R6 引导页冲突提示、R7–R11、按物理键分组的冲突检测。

## Requirements

- R1：全平台默认 `Alt+Space`（Electron accelerator 写法）。
- R2：迁移：存储里仍是系统创建的旧默认值 `CommandOrControl+E` 的用户，自动迁到新默认；用户自定义过的不动。
- R3：冲突兜底：只有「当前绑定就是新默认、而且由系统创建」时才兜底。`Alt+Space` 在系统层注册失败，就改用 `CommandOrControl+E` 注册，这次兜底只在运行时生效，存储里仍然记新默认，下次启动会再试 `Alt+Space`；同时通过已有的通知渠道提示一次（每次启动最多一次），说明默认键被占用、已退回，并告诉用户可以去设置里改。用户自定义的快捷键注册失败，走现有逻辑，不兜底。
- R3.1：兜底键也不可用时提示：默认键被拒，兜底的 ⌘E / Ctrl+E 又被占用或注册失败，这时 CoreBox 没有任何快捷键。沿用同一个通知渠道提示一次，告诉用户去设置里设置，每次启动最多一次。
- R3.2：默认键输掉应用内冲突时单独提示（老板 2026-09-26：不兜底，只把提示改准确）。
  - 触发场景：截图、本机 AI、听写等内置快捷键在存储里排在 CoreBox 前面，用户把其中一个改成 ⌥Space 后，CoreBox 的默认键在冲突组里输掉。
  - 这时不给 ⌘E 兜底，兜底仍然只在系统拒绝注册时触发。
  - 单独弹一条准确的提示，例如「默认快捷键 {shortcut} 已设给另一个快捷键，CoreBox 暂时不能用快捷键呼出，请在设置里换一个」，每次启动最多一次。
  - R3.1 那条「默认键和 ⌘E 都无法注册」只用于两者真的都被拒绝的情况。
- R4：显示一致：托盘、侧边栏、搜索入口、新手引导都读取实际绑定的快捷键来显示，不再写死。
- R4.1：设置页的快捷键列表里，兜底生效时 CoreBox 那一行显示「暂用 ⌘E」这类说明，不再只显示「注册失败」。
- 保留：主窗口命令面板里「打开 CoreBox」的 ⌘E 是窗口内快捷键，不是全局键，保持不变。
- R6：冲突提示：新手引导完成页在显示快捷键的地方加一句提示：如果按下后打开的是别的应用（例如 Raycast、Alfred、ChatGPT），去设置里改。文案走 i18n。nexus 快速开始同步说明。
- R7：托盘截图项：`tray-menu-builder.ts` 里写死的 `Cmd+Shift+S` 改为读取截图快捷键实际生效的绑定，与 CoreBox 项同一机制；没有可用绑定时不显示。
- R8：`FlatKeyInput.vue` 的平台判断被当成布尔值使用，结果永远为真，导致 Windows 上录制 Win 键存成 `Command+…`。修正判断，并补单测。
- R9：设置页快捷键列表的状态文字（12px）在浅色主题下对比度不足：琥珀 2.19:1、红 2.9:1、灰 3.08:1。三种色调统一按规范的同色系文字配方加深（例如 `color-mix(in srgb, var(--tx-color-warning) 45%, var(--tx-text-color-primary))`），目标 ≥4.5:1；深色主题保持不变（老板 2026-09-26）。
- R10：设置页截图快捷键一行显示原始 id `screenshot.tool.start`，补上 `settingTools.shortcutLabels.screenshot_tool_start` 的中英文名称（老板 2026-09-26）。
- R11：Windows / Linux 上，旧录制器把 Win 键存成了 `Command+…`，启动时迁移成 `Super+…`；`Option` 同理迁移成 `Alt`。只改用户录制的值，macOS 不动（老板 2026-09-26）。
- R5：文档：nexus 快速开始、落地页、CLAUDE.md 同步为新默认键（组件文档里与 CoreBox 无关的 `⌘E` 不改）。

## 实测：macOS 上的冲突检测（2026-09-26）

- Electron 在 macOS 上用 Carbon `RegisterEventHotKey` 注册，不带独占标志。
- 两个 Electron 进程注册同一个 `Alt+Space`，都返回成功（`/tmp/hotkey-probe/*.log`）。
- 用 C 探针（`/tmp/hotkey-probe/carbon-probe*.c`，进程带事件循环）实测跨进程的几种组合：

  | 先注册的一方 | 后注册的一方 | 后者结果 |
  | --- | --- | --- |
  | 普通 | 普通 | 成功（即 Electron 与 Electron 的情形） |
  | 普通 | 独占 | 成功 |
  | 独占 | 普通 | 成功 |
  | 独占 | 独占 | 失败（-9878 `eventHotKeyExistsErr`） |

- 同一进程内，已有独占注册时再做普通注册会失败。
- 结论：
  - macOS 上，别的应用占着 ⌥Space 时，Tuff 的注册仍然成功，R3 的兜底不会触发；
  - 用 tuff-native 做独占探测，也只能发现以独占方式注册的对方，价值有限；
  - Windows 的 `RegisterHotKey` 会拒绝已被占用的键，兜底在 Windows 上有效。
- 老板机器上装有 ChatGPT.app，它的默认快捷键也是 ⌥Space。

## Acceptance Criteria

- [x] 新安装：默认 `⌥Space` 呼出 CoreBox；托盘、侧边栏、引导页显示 `⌥Space`。真机（2026-09-26，dev app 重启后）：侧边栏提示读到主进程生效绑定 `⌥Space`；引导页和托盘已有单测，并在 ego-browser 里截图确认。
- [x] 老用户：存储为旧默认值的，升级后变为 `⌥Space`；自定义过的保持原值。老板自己的 ⌘E 已在真机上迁移为 ⌥Space。
- [x] `⌥Space` 被占用时，按 R3 的规则仍能呼出 CoreBox，并有提示。只在系统拒绝注册时生效，即 Windows 和同进程冲突，已有单测；macOS 查不出其他应用占用，靠 R6 的引导页提示（见「实测」）。
- [x] 引导页在快捷键旁显示冲突提示（R6）。
- [x] 托盘截图项显示实际生效的截图快捷键（R7）；Windows 上录制 Win 键存为 `Super`，不再是 `Command`（R8）。
- [x] 设置页状态文字在浅色主题下对比度 ≥4.5:1（R9：实测 5.49–6.11）；截图快捷键一行显示中文 / 英文名称（R10）；Windows 上旧的 `Command+…` 启动后变成 `Super+…`（R11，单测覆盖；Windows 真机上能否正常注册待验）。
- [x] 相关测试（global-shortcon、core-box index、tray、FlatKeyInput）更新并通过；core-app 类型检查与 eslint 通过。最后一轮聚焦集为 72 个文件、835 条，39 个变异全部被抓到。

## 归档说明（2026-09-26）

- 按老板最终决定（永远不兜底，只用 ⌥Space）完成并检查通过，已提交到本地 master（`dc6c52bdc`、`86e394974`）。契约见 `.trellis/spec/main-process/global-shortcut-contracts.md`。
- 真机：侧边栏、主窗口命令面板读到的生效绑定都是 `Alt+Space`；老板的 ⌘E 已迁移。
- **待真机验证**：Windows 上 R11 迁移后能否正常注册；「⌥Space 用不了」的通知（macOS 上 ⌥Space 总能注册成功，本机无法触发，由单测和变异覆盖）。
- 追加小修 `238aa466d`：设置页保存结果的整行底色，把无效的逗号写法 `rgba(var(--*-rgb), a)` 改为 `rgb(... / a)`，状态格改为不透明底；本机 AI 快捷键补上名称。
