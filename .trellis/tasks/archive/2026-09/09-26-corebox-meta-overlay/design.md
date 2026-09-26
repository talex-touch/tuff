# Design — CoreBox ⌘K 操作面板重构

依据：`research/overlay-audit.md` §5 方案 B；决策见 `prd.md` 的 Decisions。

## 宿主与几何

- 继续用全窗口透明的 overlay `WebContentsView`，这样插件 UI 模式下也能盖住插件视图。主进程的 bounds 逻辑（全窗口）和 ready 握手都不动。
- `MetaOverlay.vue`（`#/meta-overlay`）重写：
  - 根元素铺满整个 overlay，是一层 ~10% 暗色遮罩：`color-mix(in srgb, var(--tx-text-color-primary) 10%, transparent)`，暗色主题下改用 `--tx-bg-color` 调暗。点击遮罩即关闭。去掉 `backdrop-filter`。
  - 面板绝对定位：`right: 12px; bottom: <footer 高度 44px> + 8px`。UI 模式或 footer 隐藏时 `bottom: 12px`。锚点信息由 `ui.show` 请求带过来。
  - 面板宽 340px，`max-height: min(<可用高度> - 24px, 420px)`，列表区内部滚动；不透明底色 `--tx-bg-color`，1px ring，`--tx-elevation-4`。
- **高度策略**：
  - `MetaShowRequest` 追加可选字段 `anchor: 'footer' | 'corner'` 和 `desiredPanelHeight: number`，写在 `packages/utils/transport/events/types/meta-overlay.ts`。
  - 主进程 `ipc.ts` 不再 forceMax 600：只有「当前窗口高度 < 面板高度 + 锚点边距 + 头部」时才增高，上限 600，并记下原高度。`meta-overlay.ts` 的 hide 里还原。面板打开期间冻结 CoreBox 的 layout 更新（`core-box/index.ts` 的保护）。

## 动作模型（`useKeyboard.ts` / `useActionPanel.ts`）

- **统一描述**：每个动作包含 `id`、`group`、`labelKey`（i18n）或 `label`（插件原样）、`icon`、`shortcut`（chord）、`primary` / `secondary`、`applies(item)`。
- **分组顺序**：`primary` → `open` → `copy` → `organize` → `flow` → `plugin`。插件的全局动作放在 `plugin` 组，并用 `applies` 过滤。
- **去重**：合成的主操作与 provider 的 `primary: true` 动作合并成一行，用 provider 的文案。文件的 "Open" 改为 `reveal`：「在 Finder 中显示」，Windows / Linux 分别叫资源管理器 / 文件管理器。
- **文案**：
  - 内置动作用 `corebox.actions.*`，补齐缺的 key，zh-CN 和 en-US 两份都要改；
  - provider 动作在渲染端按 action id / type 映射成 i18n，映射不到时退回原文案；
  - 插件动作原样显示。
- **图标**：按动作类型给固定图标，不再出现空心圆缺省。

## 快捷键（R6.1）

- 用 `shortcut-chord.ts` 的 code 匹配（Mod = ⌘ / Ctrl）。

  | 动作 | 快捷键 |
  | --- | --- |
  | 复制路径 | Mod⇧C |
  | 复制名称 | Mod⌥C |
  | 在 Finder 中显示 | ModO |
  | 固定到推荐 | macOS ⌘.；Windows / Linux Ctrl+Shift+.（Ctrl+. 留给输入法，不绑定也不拦截） |
  | 次要动作 | Mod↵ |

- **生效范围**：面板里有效；CoreBox 结果列表里不开面板也对选中项有效。输入框聚焦时同样生效，因为这些组合键不与文本编辑冲突，而 ⌘C 继续留给文本复制。
- **冲突**：实现前先列出现有绑定的冲突表，至少覆盖 ⌘D 分离、⌘1–0、⌘K、Esc、方向键、↵、⌘A / ⌘V / ⌘X / ⌘Z 等编辑键，还有插件声明的快捷键。发现冲突停下来报告，不擅自改动现有绑定。
- 对当前项不适用的快捷键不响应，也不 `preventDefault`。
- 插件 SDK 的字符串快捷键（如 `'⌘⇧S'`）先用兼容解析器转成 chord。

## 键盘与交互

- ↑↓ 选择，并瞬时滚动到可见；↵ 执行；⌘K 开 / 关；Esc 关闭。
- 有 IME 保护（`isComposing` / keyCode 229）；hover 用 pointermove；组合框用 `aria-activedescendant`。
- 过滤框放在面板底部；有空状态文案。

## 执行反馈

执行成功后，由 CoreBox footer 显示一个 ~1.2s 的即时反馈（「已复制」「已固定」……），不用 toast。overlay 执行动作后回传结果，由 CoreBox 渲染反馈。

## 回滚

改动集中在 `MetaOverlay.vue`、`MetaActionItem.vue`、`useKeyboard.ts` / `useActionPanel.ts`、`ipc.ts`、`meta-overlay.ts`、meta-overlay 事件类型、`CoreBoxFooter.vue`、lang JSON 这几处，可以整体回退。
