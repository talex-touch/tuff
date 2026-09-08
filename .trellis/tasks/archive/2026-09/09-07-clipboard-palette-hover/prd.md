# 剪贴板图片主题色带悬浮交互

## Goal

图片记录右侧的主题色带目前是 16px 宽的竖条，每个色块只有一个原生 `title` 属性。原生 tooltip 有约一秒延迟、样式不可控、位置不可控，所以「这是什么颜色」这个信息实际上拿不到——用户只能看到一条没有标注的色条。

悬浮时应当放大并显示颜色值。

## 背景事实（已核对源码）

- 色带在 `ClipboardDetail.vue:209`，`.palette-rail` 是 `.image-block`（flex row）里的 `flex: 0 0 16px` 项，与 `.image-frame`（`flex: 1 1 auto`）并列。
- 色值来自 `quantizePalette`（`clipboard-colors.ts:220`），格式是 `toHex` 产出的 `#RRGGBB` 大写十六进制。
- `parseColor` 与 `pickReadableForeground`（`clipboard-colors.ts:196`）已在本文件导入，用于色卡预览区。
- `.palette-rail` 当前有 `overflow: hidden`，用于裁圆角。
- 点击色块复制色值（`emit('copyText', color)`），这条行为不变。

## Requirements

### R1 悬浮显示色值

- 悬浮（或键盘聚焦）某个色块时，就地显示该色的十六进制值。
- 文字颜色按底色的对比度算，不写死黑白——深色块上白字、浅色块上黑字，用现成的 `pickReadableForeground`。
- 移除原生 `title`，避免和新的显示叠加成两层提示。

### R2 放大不能挤动图片

- 色带是 flex 行里的固定宽度项。任何改变它布局宽度的做法都会压缩 `.image-frame`，导致鼠标划过时整张图片抖动。
- 因此放大必须**向左溢出**到图片上方，不进入布局计算。

### R3 保留既有行为与可访问性

- 点击复制不变。
- 键盘可达：`:focus-visible` 与悬浮表现一致。
- 每个色块要有可读的无障碍名称（色值），不能因为去掉 `title` 就没有了。
- 遵守 `prefers-reduced-motion`。

## Acceptance Criteria

- [x] AC1 悬浮任一色块，该色块向左展开成药丸并显示 `#RRGGBB`；移开后复原。（产物中已验证 `palette-value` 与 CSS 就位；展开的视觉效果本身未在真实窗口确认）
- [x] AC2 悬浮期间 `.image-frame` 的宽度不变（色带的布局宽度恒为 16px）。（由 `position: absolute` 从结构上保证；jsdom 无布局，无法断言）
- [x] AC3 深色块上的文字是浅色、浅色块上是深色，由 `pickReadableForeground` 决定而非硬编码。（有测试，写死白字会红）
- [x] AC4 键盘 Tab 到色块时表现与悬浮一致，且色块有等同色值的无障碍名称。（`aria-label` 有测试；`:focus-visible` 是 CSS，未验证）
- [x] AC5 `prefers-reduced-motion: reduce` 下没有展开动画（直接切换，仍可读）。（CSS，未验证）
- [x] AC6 点击仍然复制该色值。（有测试）
- [x] AC7 插件 test 与 typecheck 全绿。（133 测试 / typecheck / lint 干净）

### 中途追加的需求（原 PRD 未覆盖）

用户在实现过程中追加了两条，已一并完成：

- **点击回执**：被点的色块标签短暂变成「已复制」再换回色值，只影响被点的那一个；切换记录时清除。有测试，且「点击不设回执」「切记录不清回执」两个负控制都验证过会红。
- **动画**：两段文字用 `<Transition mode="out-in">` 交替淡入淡出，`prefers-reduced-motion` 下关闭。

### 未验证

AC1 的展开视觉、AC2 的不抖动、AC4 的焦点态、AC5 的减弱动态——四条都是纯 CSS 行为，jsdom 没有布局引擎，无法断言。需在真实窗口人工确认。本机插件已同步到 `1.2.0-beta.2`，重启即可查看。

## 非目标

- 不改主题色的提取算法（`quantizePalette`）。
- 不改「更多信息」里的完整调色板那一节。
- 不引入 tooltip 库或 teleport 浮层——一个绝对定位的兄弟元素足够，且不会脱离预览区的裁剪上下文产生新的层级问题。
