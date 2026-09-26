# CoreBox 操作面板（meta overlay）居中、背景模糊与展示形式重构

父任务：`09-25-corebox-ux-polish`。调研：`research/overlay-audit.md`。

## Goal

⌘K 操作面板改成紧凑、就近、看得见上下文的形态：不再在启动器正中压一块大卡片，不再模糊整个窗口，面板位置和尺寸在任何窗口高度下都正确。动作列表文案统一、不重复，分组清楚，键盘操作顺手，执行后有反馈。

## Background（调研结论）

- 老板原话：「1. meta 没有居中 2. 背景的那个模糊也有问题 3. meta这个展示形式也需要重构」（2026-09-26，附截图）。
- **架构**：⌘K 面板是挂在 CoreBox 窗口上、铺满整个窗口的透明 `WebContentsView`（路由 `#/meta-overlay`）。插件 UI 本身也是一个 WebContentsView（y=56 到窗口底部），CoreBox 自己的 DOM 永远在它下面，所以插件模式下必须靠这层 overlay 才能盖住插件视图，这一层至少要保留。ready 握手与 `ui.show` / `ui.hide` 的请求-应答契约（`channel-transport-contracts.md` §3）不变。
- **没居中**：
  - CSS 写死了顶对齐：顶部留 100px，卡片最高 500px；
  - 打开时主进程又把窗口强制撑到 600（`main/.../core-box/ipc.ts:627`）；
  - 100 + 500 = 600，卡片底边正好贴住窗口底，与截图吻合。
- **模糊**：
  - 面板上的 `backdrop-filter: blur(4px)` 在 macOS 上模糊不到下面的视图（Electron #45206）；
  - 看到的"模糊"其实是 CoreBox 窗口自带的毛玻璃（vibrancy），模糊的是窗口背后的桌面；
  - 窗口被撑到 600 后，结果下方多出一条空白，透出背后的终端和红条，上面再盖一层 40% 黑。
- **内容问题**：
  - 内置动作文案是硬编码中文，文件 / 应用动作是硬编码英文，已有的 `corebox.actions.*` 翻译没人用；
  - 「打开」与 "Open" 重复，而文件的 "Open" 实际是"在 Finder 中显示"；
  - 空心圆是缺省图标，所有动作挤在同一个「操作」组里；
  - Windows / Linux 上内置快捷键失效，⌘C 抢走了搜索框的复制；
  - 没有 IME 保护，方向键不会把选中行滚进视口；
  - 执行后没有反馈（CoreBox 里的 toast 是被刻意关掉的）。
- 可以复用：
  - `MainWindowCommandPalette.vue`（分组、34px 行、`TxKbd`、pointermove hover、`max-height: min(52vh, 420px)`）；
  - `shortcut-chord.ts`（chord 匹配与显示）；
  - `TxCommandPalette` 的 IME 保护和组合框无障碍写法。`TxCommandPalette` 本身是全屏模态，形态不适合直接用。

## Decisions（老板 2026-09-26）

- **形态**：Raycast 式右下角锚定面板（方案 B）。
- **背景**：轻度压暗（约 10% 暗色遮罩），不做模糊。
- **窗口高度**：只在放不下时增高（上限 600），关闭面板后还原。
- **快捷键**：对齐 Raycast，而且不打开面板也能对选中项直接使用。
- 其余项（过滤框放底部、单行、分组与顺序、去重、文案来源、footer 反馈）按下文推荐默认值执行，老板评审时未提异议。

## Requirements

- **R1 形态**：方案 B，Raycast 式锚定面板。
  - 宽约 320–360px，锚在右下角、footer「⌘K 操作」提示上方；UI 模式或 footer 隐藏时锚在窗口右下角；
  - 面板底色不透明（`--tx-bg-color`），1px ring，阴影 `--tx-elevation-4/5`；
  - 不用 glass / blur 材质。
- **R2 背景**：面板背后加一层轻度暗色遮罩（约 10%，颜色取 token），不做任何模糊；点击面板外部即关闭。遮罩由 overlay 文档自己绘制，不依赖 `backdrop-filter`。
- **R3 窗口高度**：只有放不下时才增高（上限 600），关闭面板后还原；面板打开期间冻结结果 layout 更新。
  - renderer 在 `ui.show` 里带上期望高度与锚点：`MetaShowRequest` 只追加可选字段。
- **R4 结构**：
  - 顶部一行显示当前项的图标和标题，行内不再重复 `打开 "x"`；
  - 分组依次为：主操作 / 打开 / 复制 / 整理 / 流转 / 插件；插件的全局动作排在当前项动作之后，只显示对当前项适用的；
  - 单行，32–34px 高，16px 图标 + 标签 + 右侧 `TxKbd`，副标题只在确实需要区分时出现；
  - 过滤框放底部（Raycast 做法）；
  - 有空状态文案。
- **R5 去重与文案**：
  - 合成的主操作与 provider 的 `primary: true` 动作合并为一行，用 provider 的文案；
  - 文件那个 "Open" 改名为「在 Finder 中显示」（Windows / Linux 分别是资源管理器 / 文件管理器）；
  - 内置动作走 `corebox.actions.*`；provider 动作在渲染端按 action id / type 映射成 i18n 文案；插件动作的文案原样显示。
- **R6 键盘**：
  - ↑↓ 切换，并把选中行滚进视口（瞬时）；↵ 执行；⌘K 开 / 关；Esc 关闭；
  - 有 IME 保护；hover 改用 pointermove；
  - 快捷键用 `shortcut-chord.ts` 的 code 匹配，三个平台都生效（Mod = macOS ⌘ / 其他 Ctrl）。
- **R6.1 快捷键集合**：对齐 Raycast，并且在 CoreBox 结果列表里不打开面板也能对选中项直接用：
  - 复制路径 ⌘⇧C；复制名称 ⌘⌥C；在 Finder 中显示 ⌘O；固定到推荐 ⌘.（Windows / Linux 为 Ctrl+Shift+.，因为 Ctrl+. 被中文输入法用来切换全半角标点，老板 2026-09-26 决定）；⌘↵ 执行次要动作；
  - ⌘C 继续留给输入框复制；
  - 不得与现有快捷键冲突（⌘D 分离、⌘1–0 快速选择、⌘K、Esc、方向键、↵），实现前先列出冲突表；
  - 面板每行右侧显示对应快捷键；快捷键对当前项不适用时不响应，也不吞掉按键。
- **R7 执行反馈**：执行成功后在 footer 给一个即时反馈（例如「已复制」），持续约 1.2s；不用 toast。
- **R8 范围**：CoreBox 主窗口；插件 UI 模式下同样可用。DivisionBox 里的 ⌘K 不在本次范围内。

## Acceptance Criteria（草案）

- [ ] 任意窗口高度（56 / 300 / 600）下打开 ⌘K：面板完整显示在锚点位置，不被裁切，也不超出窗口；关闭后窗口高度还原。
- [ ] macOS 上面板背后没有模糊、没有桌面内容透出；插件 UI 模式下面板盖在插件视图之上。
- [ ] 文件项的动作列表没有重复项；所有文案跟随界面语言；分组与顺序符合 R4；没有空心圆占位图标。
- [ ] 键盘：↑↓ 选中行始终可见；输入法组字期间方向键和回车不误触；快捷键在 macOS / Windows / Linux 都生效。
- [ ] 执行复制类动作后，footer 显示反馈。
- [ ] 相关测试与门禁通过（core-app eslint、`vue-tsc -p tsconfig.web.json`、meta-overlay / useActionPanel / useKeyboard 测试）。

## Out of Scope

- 方案 C（缩小 overlay 视图的 bounds），作为后续升级。
- DivisionBox 的 ⌘K。
- 插件 SDK 的快捷键数据结构改动：先写一个字符串到 chord 的兼容解析器。
