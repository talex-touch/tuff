# Implement — TxTabs 指示器重做

## 前置

- `09-25-jelly-indicator-engine` 已完成且通过其 review gate。
- 读 research/tabs.md（消费方、测试锁定点、文档段落、图标根因、画廊变体写法）与 design.md。

## 步骤

1. [x] `TxTabItem.vue`：`.tx-tab-item__icon` 改 `inline-flex` 居中（图标尺寸生效）；激活态 / 非激活态墨色（regular / primary，只改颜色不改字重，避免切换时标签变宽挤动邻居）。
2. [x] `TxTabs.vue`：
   - 接 `useJellyIndicator`（`axis` 随 placement；`onFrame` 命令式写 `.tx-tabs__pointer`；`.is-moving` 控制光晕）；
   - `applyPointerFor` 只测量、按变体算目标矩形（design.md 表）、`moveTo(rect, { animate })`；删除 `playPointerAnim`、`lastPointerPosition`、关键帧类切换；
   - `indicatorMotion` / `indicatorMotionStrength` / `animation.indicator` 映射到引擎参数（design.md 表，`jellySpring(durationMs)`）；
   - 激活项在 `showIndicator` 时统一去底色；
   - 删除 `@keyframes tx-tabs-pointer-*` 与 `.tx-tabs__pointer--motion-*` 规则；指示器只保留 `opacity` 过渡 + reduced-motion；按 design.md 重写各变体画面。
3. [x] `__tests__/tabs.test.ts`：按 research/tabs.md 列出的锁定点改写（关键帧类 / 过渡断言 → 引擎落点断言），新增：首次落位不动画、切换经引擎停在目标、reduced-motion 直接落位、所有变体激活项无底色、图标容器 `inline-flex`。
4. [x] 验证（`packages/tuffex` 内）：`node node_modules/vitest/vitest.mjs run packages/components/src/tabs packages/components/src/__tests__/shadow-light-source.test.ts`；eslint 改动文件；`git diff --check`。
5. [x] 重建 dist（锁 + 关 verify-deps），`pnpm audit:size`；核对 :3200 上 tabs 的 `data-v-*`。
6. [x] 调参（ego，TaskSpace 31）：五个变体 × 水平 / 竖直 × 五种 motion 录帧（CDP `Animation.setPlaybackRate`），与 Radio 并排；定 motion 系数、`maxGrowth`、各变体色值，回写 design.md。
7. [x] 画廊 Tabs 格子：格内变体切换 + 带图标的 `TxTabs placement="top"`；格子高度不溢出；暗 / 亮截图。
8. [x] 文档（zh + en）：`tabs.*.mdc` 变体说明（含 `pill` 语义变化）、`indicatorMotion` / `animation.indicator` 新含义、概述 / 技术实现 / 覆盖；demo（`TabsIndicatorVariantsMotionsDemo` 等）按需更新；门禁三件套。
9. [ ] 回归：research/tabs.md 列出的 core-app（HomeSidePanel、PluginInfo、PluginFeatureDetailCard、DownloadCenterView、TuffUserInfo、LingPan）与 Nexus（store、dashboard team / account、ProviderRegistry、模板 demo）用法抽查截图；控制台无新增报错。

## 回滚点

`TxTabs.vue` + `TxTabItem.vue` + 测试为一组；画廊格子与文档各自独立。还原后重建 dist。

## 实现记录（2026-09-26）

- TxTabItem：图标容器 `inline-flex`（实测 0×0 → 21.6×21.6）；墨色改由项上的 `--tx-tab-item-ink` / `--tx-tab-item-icon-ink` 变量切换（LingPan 用单类 `color: inherit` 覆盖名称，在硬编码深色面板上仍生效；直接加高特异度的激活规则会把它压掉，亮色主题下变成深字深底）；非激活 regular、激活 primary，不改字重。
- TxTabs：`useJellyIndicator` + 命令式 `paintPointer`；`MOTION_TUNING` 表（stretch 1/1/1、spring 1/0.72/1、warp 1/1/1.35、glide 1/1.45/0.55、snap 2.25/1.9/0.6）× `jellySpring(durationMs)`；测量做缩放归一化、读项的 padding / 圆角；`line` 2px、最短 16px（单字母标签不再是一粒点）、水平时 nav-inner `align-self: stretch` 让线压在分隔线上；`dot` 6px；box 变体取项圆角；键盘路径显式驱动指示器；新增 watcher：`indicatorVariant` / `placement` / `offset` 变化即重新测量并走弹簧（否则 pill→line 切换后指示器保持盒子尺寸，实测是一整块主色方块）；`maxGrowth` 水平 16、竖直盒子变体 6。关键帧、motion / glow 类全部删除；只剩 opacity 过渡 + reduced-motion。
- 测试 24 例（新增 8：首帧落位、点击行进落位、键盘行进、reduced-motion、盒子几何 + 圆角、单一高亮 / 无几何过渡 / 图标盒三条源码契约）；vue-tsc 0 错误；eslint 通过。
- ego：画廊格子五个变体截图（`/tmp/jelly-baseline/tabs-cell-*.png`），冻结 rAF 抓到行进中 pill `scale(0.814, 1.401)`、line 同形变（`tabs-{pill,line}-f*.png`）；文档页 12 个实例（left / right / top / bottom，TabsTabsDemo 图标可见，NavigationShell 竖向 pill 为凸起面）。

## 检查阶段（2026-09-26）

- 检查 agent 修复 4 个真实缺陷（各带回归测试）：① 带尺寸动画（`autoHeight` / `autoWidth` / `animation.size`）的实例点击后指示器是跳过去的——`TxAutoSizer.flip` 至少等一帧，期间新面板的布局刷新以 `animate: false` 抢先落位；现在切换渲染后的下一个 tick 就发送指示器（点击、父级 `modelValue`、`defaultValue` 三条路径）；② reduced-motion 下光晕淡入没关（选择器少一级特异度）；③ 导航行两端被裁（`pill` + `spring` 冲出 17px，TemplateStoreDemo 行内边距 `4px 0` 默认 motion 也会裁）——Tabs 也接了墙；④ 行进途中隐藏指示器动画循环不停——隐藏时 `moveTo(null)`。另：`is-moving` 从元素读、测量减 `clientLeft/Top`、渲染里的指针 vnode 改名 `pointerNode`。测试 24 → 48。
- 主会话复验：tuffex 全量 254 文件 / 2771 例全绿；vue-tsc 0；dist 重建，`audit:size` 610.5/612、619.3/620 KiB；ego：NavigationShell 竖向 pill 点击后 27 帧行进（`scale(1.06, 0.898)`），画廊 pill 往返画出范围 0.02–285.13 / 318，画廊页控制台 0 错误。
