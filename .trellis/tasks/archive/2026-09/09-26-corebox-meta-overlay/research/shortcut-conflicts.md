# 快捷键冲突表：R6.1 新快捷键 vs CoreBox 现有绑定

- 日期：2026-09-26（工作区快照，行号按当前文件）
- 新集合（Mod = macOS ⌘ / 其他平台 Ctrl，按 `KeyboardEvent.code` 匹配）：

  | 动作 | chord | code |
  | --- | --- | --- |
  | 复制路径 | Mod⇧C | `KeyC` + shift |
  | 复制名称 | Mod⌥C | `KeyC` + alt |
  | 在 Finder / 资源管理器 / 文件管理器中显示 | ModO | `KeyO` |
  | 固定到推荐 / 取消固定 | macOS ⌘.；Windows / Linux Ctrl+Shift+.（2026-09-26 改，见 P1） | `Period`；Windows / Linux `Period` + shift |
  | 次要动作 | Mod↵ | `Enter` |

- 结论：**五个新 chord 与 CoreBox 现有显式绑定没有冲突。** 有一处隐式行为按决策改变（Mod↵，见 A7），两处平台层面的注意事项（P1 已按老板决定改键解决，P2），一处既有的声明快捷键与输入框编辑键相撞（D1，按 PRD「⌘C 留给输入框」处理，原本就从未生效）。

## A. CoreBox 渲染进程（`useKeyboard.ts` onKeyDown，document capture）

| # | 现有绑定 | 位置 | 与新集合 | 说明 |
| --- | --- | --- | --- | --- |
| A1 | Mod+K 打开面板（无 ⇧⌥） | `useKeyboard.ts:774-804` | 无冲突 | 面板内 Mod+K 改为开关（R6） |
| A2 | ⌘1–0 快速选择（仅 metaKey、无 ⇧⌥⌃） | `:873-882` | 无冲突 | 数字键不在新集合里 |
| A3 | Mod+D 分离、Mod⇧D 流转 | `:985-1028`；UI 视图侧 `key-event.ts resolveCoreBoxFlowShortcut` | 无冲突 | 流转 Mod⇧D 在面板里保留原 chord |
| A4 | Esc（面板 → 附件 → provider → 查询 → 隐藏） | `:1029-1054` | 无冲突 | |
| A5 | ↑↓←→、Tab、Mod←/→ 计算历史 | `:892-984` | 无冲突 | |
| A6 | Mod+V 粘贴；输入框编辑键 Mod+A/C/V/X/Z/Y 不转发 | `:858-866`、`:567-571`、`:612-615` | 无冲突 | 新 chord 都带 ⇧ 或 ⌥，或键位不同；Mod+C 仍归输入框 |
| A7 | ↵ 执行当前项（**不检查修饰键**，所以 Mod↵ 目前等同 ↵） | `:884-891` | **隐式行为改变（按决策）** | 有次要动作时 Mod↵ 改为执行次要动作；没有时不拦截，仍落到原 ↵ 路径。Spotlight / Alfred / Raycast 的 ⌘↵ 都是「在 Finder 中显示」或次要动作 |
| A8 | UI 模式 / DivisionBox：Enter、Mod↵ 等转发给插件视图 | `:825-843`；测试 `useKeyboard.test.ts:510-526` | 不受影响 | 新的结果列表快捷键只在非 UI 模式、非 DivisionBox 下生效，并排在转发之后 |
| A9 | 自定义 widget 项：Enter（含修饰键）转发给 widget；widget feature + 有查询时 Enter 提交 | `:715-725`、`:846-856` | 不受影响 | 新逻辑排在这两者之后 |
| A10 | F1–F24 屏蔽 | `:762-766`；main `window.ts:218-234` | 无冲突 | |
| A11 | 计算历史面板（可见时 Esc/↑↓/↵） | `usePreviewHistory.ts:123-160` | 无冲突 | 面板可见时（`__coreboxHistoryVisible`）新快捷键不响应 |
| A12 | FlowSelector（可见时 ↑↓/↵/Esc） | `FlowSelector.vue:183-212` | 无冲突 | |

## B. 旧 MetaOverlay 面板内的绑定（被本任务替换）

| # | 旧绑定 | 位置 | 处理 |
| --- | --- | --- | --- |
| B1 | 复制名称 ⌘C / Ctrl+C | `useKeyboard.ts:334` | 按 R6.1 改为 Mod⌥C；⌘C 还给输入框 |
| B2 | 在 Finder 中显示 ⌘⇧F / Ctrl+Shift+F | `useKeyboard.ts:352` | 按 R6.1 改为 ModO |
| B3 | 流转 ⌘⇧D、翻译图片 ⌘⇧T、翻译并置顶 ⌘⌥T | `useKeyboard.ts:369, 383, 400` | 保留原 chord（修好了 Win/Linux 与 ⌘⌥T 永远匹配不上的问题） |
| B4 | 字符串拼接匹配 | `MetaOverlay.vue:168-203` | 改为 `shortcut-chord.ts` 的 code 匹配 |

## C. 主进程与系统层

| # | 绑定 | 位置 | 与新集合 |
| --- | --- | --- | --- |
| C1 | 全局快捷键：⌘E CoreBox、⌘⇧A 截图（旧默认 ⌘⇧S）、⌘⇧P OmniPanel、⌘⇧L Local AI CLI、⌘⇧U 听写、⌘⇧E 快速编辑 | `core-box/index.ts:86`、`screenshot-session/index.ts:29-30`、`omni-panel/index.ts:659`、`local-ai-cli/index.ts:272`、`voice/global-dictation.ts:26-27` | 无冲突（用户自定义的全局快捷键可能占用任意组合，那是用户配置） |
| C2 | macOS 应用菜单 role 快捷键：⌘Q ⌘H ⌥⌘H ⌘W ⌘Z ⇧⌘Z ⌘X ⌘C ⌘V ⌥⇧⌘V ⌘A ⌘R ⇧⌘R ⌥⌘I ⌘0 ⌘+ ⌘- ⌃⌘F ⌘M | `core/application-menu.ts`（未提交，与 Electron 默认菜单同一组 role） | 无冲突 |
| C3 | CoreBox 窗口 / 插件视图 before-input-event：F 键、Mod+R、插件视图里的 Mod+D / Mod⇧D、Esc | `window.ts:218-234`、`plugin-view-controller.ts:305-330` | 无冲突 |
| C4 | 面板 Esc | `meta-overlay.ts:143-149` | 无冲突；本任务补上组字保护（`input.isComposing`） |

## D. 声明式快捷键（provider / 插件）

| # | 声明 | 位置 | 与新集合 | 处理 |
| --- | --- | --- | --- | --- |
| D1 | 剪贴板项 `copy`、推荐 URL `copy-url`：`CmdOrCtrl+C` | `clipboard-recommendation-source.ts:104`、`item-rebuilder.ts:194` | 与新集合无关；与输入框 Mod+C 相撞 | 旧逻辑把它归一化成 `cmdormeta+c`，从来没匹配上过，只显示成 "CmdOrCtrl+C"。现在按 PRD「⌘C 留给输入框」：保留字 chord 不绑定、不显示 |
| D2 | `paste` / `open-url` / 插件推荐 / DivisionBox 命令：`Enter` | `clipboard-recommendation-source.ts:103`、`item-rebuilder.ts:188, 202`、`division-box/command-provider.ts:122` | 无冲突 | 视为「声明自己是主操作」，并入 ↵ 主操作行（去重） |
| D3 | 插件全局动作（quick-actions SDK） | 仓库内插件没有注册任何全局动作（`rg registerAction plugins` 为空）；SDK 文档示例 `⌘M` `⌘K` `⌘⇧S` `⌘A` `⌘S`（`packages/utils/plugin/sdk/meta/README.md:21, 65, 190, 263, 276`） | 无冲突 | 解析后若撞上保留键（Mod+K、编辑键、Mod+D、数字键等）或宿主 chord，一律宿主优先：插件的 chord 不绑定、不显示。插件动作只在面板里响应快捷键 |
| D4 | 插件 UI 视图自己用的 Mod↵（clipboard-history、json-formatter） | `ClipboardManagerView.vue:420`、`json.vue:219` | 不受影响 | UI 模式下按键照旧转发 |

## P. 平台注意事项（不是 CoreBox 绑定冲突，需要老板知悉）

- **P1 Ctrl+.（Windows / Linux 的「固定」）→ 已改为 Ctrl+Shift+.**（老板 2026-09-26 决定）：微软拼音、搜狗、fcitx 默认用 Ctrl+. 切换中英文标点，输入法开着时这个键被输入法吃掉，页面收不到。Windows / Linux 上「固定」因此改为 Ctrl+Shift+.，面板角标与结果列表直达键同步（同一行 chord，`meta-action-model.ts` 的 `toggle-pin`）；Ctrl+. 不再绑定，也不拦截，留给输入法。macOS 仍是 ⌘.。
  - 复查 Ctrl+Shift+.：与 A1–A12、C1（全局快捷键都是字母键）、C3 及保留 chord 表（`RESERVED_CHORDS`）都不冲突；Windows 的表情面板是 Win+.，不相撞。
  - 声明式快捷键（D3）：⌘. 与 ⌘⇧. 在所有平台都算宿主保留，插件声明任一个都不绑定、不显示，一个键不会因平台不同而含义不同。
- **P2 Ctrl+Alt+C（Windows 的「复制名称」）**：Windows 上 AltGr = Ctrl+Alt，一些键盘布局（如波兰语 AltGr+C = ć）会用它输入字符。实现里对 `getModifierState('AltGraph')` 为真的事件不响应，避免吞掉输入。
- **P3**（既有，非新增）：Ubuntu/GNOME 的 Ctrl+Alt+T 是系统「打开终端」，会拦截既有的「翻译并置顶」chord。
- **P4**（既有，非新增）：非 macOS 上 footer 写的是 Alt+1-0 快速选择，但 `useKeyboard.ts:873` 只认 metaKey（Win / Super 键）。与新集合无关，未改动。
