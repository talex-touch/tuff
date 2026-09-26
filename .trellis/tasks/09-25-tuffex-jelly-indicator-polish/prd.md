# tuffex 共享果冻指示器 + Tabs 重做 + 文档页边缘模糊 + StatCard 徽章

## Goal

老板在暗色主题下审阅 Nexus 基础套件画廊（`/docs/dev/components/base-suite`，2026-09-25，截图 #1–#4），指出：

1. basics 里看不出 Tabs——TabBar 格子能看到，Tabs 格子只有一个默认样式，而且 Radio 那种果冻指示器动效"没从 radio 提出来"，别的组件都用不上。
2. Tabs 有问题：指示器要重做；画廊里没有展示变体。
3. 文档页的顶 / 底渐变模糊有问题：顶栏上方透出滚上去的内容，底部内容被糊成半透明。
4. StatCard 的图标被卡片裁切，而且不够炫酷。

目标：把 Radio 的果冻指示器做成 tuffex 的共享能力，让同一族的指示器（Radio / Tabs / TabBar / FlatRadio / SidebarNav）按同一种材质移动；Tabs 指示器重做并在画廊展示变体；修好文档页边缘模糊；StatCard 改成发光图标徽章。

## 老板已拍板的决定（2026-09-25）

- 建 Trellis 父任务 + 子任务，先规划后实现。
- StatCard 方向：**发光图标徽章**——图标完整放进右侧、垂直居中的着色圆角徽章，渐变填充 + 内高光 + 同色光晕，位置与 `progress` 变体的圆环一致；hover 时徽章轻浮、光晕增强。不再裁切。
- 共享果冻指示器接入范围：**Tabs、TabBar、FlatRadio、SidebarNav**（Radio 先迁到共享引擎上，手感不变）。

## 已核实的现状（代码 + ego 浏览器，TaskSpace 31）

- 画廊 Tabs 格子存在（`apps/nexus/app/components/docs/DocsComponentsGallery.vue:2206–2233`），但只渲染默认 `line`；`TxTabItem` 的 `icon-class="i-carbon-settings"` / `i-carbon-rocket` 在 Nexus 不出图标，留下一块空白；激活项自带灰底（`TxTabItem.vue` `fake-background` + `--fake-color`），下面又有一条线，双重高亮。
- `TxTabs` 已有 `indicatorVariant: line | pill | block | dot | outline` 与 `indicatorMotion: stretch | warp | glide | snap | spring`，动效是 CSS 关键帧硬拉伸，不是弹簧。
- 果冻"材质"（`packages/tuffex/packages/utils/animation/jelly.ts` 的 `jellyScale` + `JELLY`）已与 Slider 共享；但弹簧追踪、越过目标时的冲击、emerge / sink、拖拽等**运动引擎**仍写死在 `radio/src/radio-group-indicator.ts`（选择器写死为 `.tx-radio`）。TabBar / FlatRadio / SidebarNav 用各自的 CSS transition。
- 文档页边缘模糊：`apps/nexus/app/layouts/docs.vue:421–422` + `:646–680`，两条 64px 固定条，`backdrop-filter: blur(0.55rem)` 叠 `opacity: 0.72`，无底色渐隐。
- StatCard：上个任务（`09-23-nexus-base-gallery-sidebar` R6，方向 B）把图标做成右下角裁切的低透明度大水印，本次按老板新决定推翻。

## Task Map

| 子任务 | 交付 | 依赖 |
| --- | --- | --- |
| `09-25-jelly-indicator-engine` | 从 Radio 抽出共享果冻指示器引擎；Radio 迁移到引擎上，手感与现有测试不变 | — |
| `09-25-tabs-indicator-redo` | TxTabs 指示器在引擎上重做（各变体重新设计、去掉双重高亮），画廊 Tabs 格子展示变体、图标正常，文档同步 | engine |
| `09-25-indicator-family-jelly` | TxTabBar / TxFlatRadio / TxSidebarNav 指示器改由引擎驱动，画廊与文档同步 | engine |
| `09-25-docs-edge-blur` | Nexus 文档布局顶 / 底边缘渐变模糊重做 | — |
| `09-25-stat-card-glow-badge` | TxStatCard 发光图标徽章，文档与画廊同步（2026-09-26 修订 v3：右侧色光） | — |
| `09-26-sortable-list-drag-feel` | TxSortableList 指针驱动拖拽：跟手、弹性让位、回弹落位；`dragMode` 保留原生拖放 | — |
| `09-26-status-badge-chip-lighter` | TxStatusBadge 亮色主题圆盘色阶提亮一档 | — |

`docs-edge-blur` 与 `stat-card-glow-badge` 与引擎无关，可以与引擎并行；`tabs-indicator-redo` 与 `indicator-family-jelly` 必须在引擎落地后开始。

## 跨子任务约束

- 设计遵循 `.trellis/spec/frontend/tuffex-design-rules.md`：颜色只来自 `--tx-*` token；阴影统一左上光源（x:y = 1:2，`--tx-elevation-*`）；有阴影或固定高度的元素用 inset ring；嵌套圆角同心；hover 不过渡颜色；所有动效有 reduced-motion 兜底且静止帧完整。
- 改 tuffex 组件按 `.trellis/spec/frontend/tuffex-docs-sync.md` 同步 Nexus 文档（zh + en，用户可见改动配 demo）。
- Nexus 通过 `packages/tuffex/dist/` 解析 tuffex：改 tuffex 源码后要重建 dist 才能在 :3200 看到；重建前 `mkdir /tmp/tuffex-build.lock`（成功才构建，结束 `rmdir`），重建后按需重启 :3200 并告知并行会话。
- 共享工作树：其它会话同时在改 core-app（CoreBox / voice / sentry）与 Nexus 其它区域；本任务只动下列文件范围，不 stash / checkout / restore，不 commit（除非老板要求）。
- 公共 API 向后兼容：已发布的 prop 取值（如 `indicatorVariant`、`indicatorMotion`）运行时继续接受；core-app 与 Nexus 现有用法照常渲染。

## Acceptance Criteria（跨子任务）

- [ ] 五个子任务各自的验收标准全部通过。
- [ ] 同一页面上 Radio、Tabs、TabBar、FlatRadio、SidebarNav 的指示器切换时呈现同一种果冻材质（ego 浏览器录帧确认：移动中拉伸、落点挤压、回弹后静止），且各自在 `prefers-reduced-motion: reduce` 下直接跳到目标、无形变。
- [ ] base-suite 画廊暗色下截图：Tabs 格子能看到变体切换与图标；TabBar / StatCard 格子符合新设计；页面顶 / 底边缘不再透出或糊掉内容；亮色抽查无回归。
- [ ] 画廊页、相关文档页无新增控制台报错。
- [ ] core-app 中 TxTabs / TxStatCard / TxFlatRadio 等现有用法渲染正常（无头截图或 core-app dev 抽查）。

## Out of Scope

- 给 Tabs / TabBar / FlatRadio / SidebarNav 增加拖拽选择（Radio 已有；引擎支持，但本次不接入）。
- TxSegmentedSlider、Slider 拇指的果冻逻辑（Slider 已通过 `jellyScale` 共享材质）。
- Pro / AI / Data / Flow 套件画廊的其它格子。
- 提交代码。

## 集成验收记录（2026-09-26）

- 五个子任务均实现 + 检查完成；规范更新：`component-guidelines.md`（滑动指示器统一走 `useJellyIndicator` 的契约与墙；图标容器 / 状态墨色变量 / 计算色快照）、新增 `nexus-docs-layout.md`（文档布局层叠与渐进模糊边缘）、`tuffex-text-motion.md`（TxSlider 已不用 liquid 曲线）。
- 同页一致性（ego，base-suite 画廊，暗色）：Radio / Tabs / TabBar / FlatRadio / SidebarNav 行进中都呈同一材质（冻结 rAF 抓帧：沿行进变窄 0.814、垂直鼓起，落点挤压，静止 1.0），reduced-motion 下都只写端点、`scale(1, 1)`；StatCard 徽章与文档页顶 / 底边缘见各子任务记录；画廊页控制台 0 错误。截图：`/tmp/jelly-baseline/final-gallery.png`。
- 全量：tuffex 254 文件 / 2771 例全绿，vue-tsc 0，dist 在锁内重建、`audit:size` 在限额内；Nexus 三个文档门禁通过。
- 未完成：core-app 现有用法（TxTabs 6 处、TxStatCard 6 处、FlatRadio 设置页 / 商店头部）没有在运行中的 Electron 里抽查（core-app dev 属于另一会话）。可见变化预告：PluginInfo 的 7 个 tab 图标会第一次显示出来（原来 0×0）；存储页指标卡变徽章，4 列窄卡进入角落布局；FlatRadio 滑块改为果冻弹簧。
- 未提交：老板未要求 commit；共享工作树里 `DocsComponentsGallery.vue` / `.css` 等文件混有其它会话的改动，提交需按记忆"parallel-session-shared-worktree"的锚点法只暂存本任务的部分。

## 追加反馈与记录（2026-09-26 稍后）

- 老板："tabs 这些动效还是怪怪的，不够丝滑、简单" → 引擎新增 `glide` 材质（两端各一根弹簧、领先端先走、落后端追上、从不缩放），Tabs / TabBar / FlatRadio / SidebarNav 改用 glide，Radio 保留果冻；测试、文档、规范随之改写（tuffex 全量 258 文件 / 2862 例全绿）。上面"同一种果冻材质"的跨子任务验收因此改为：家族四个指示器同为 glide，Radio 为果冻。
- 老板（截图 #5）：StatCard 不要阴影、描边、hover 动效，右侧抽离图标颜色渐变 → v3 色光（见子任务 design / implement）。
- 老板（截图 #6）：SortableList "不跟手、不 Q 弹" → 子任务 `09-26-sortable-list-drag-feel`。
- 老板（截图 #7）：状态徽章 checkmark 下的绿色偏深 → 子任务 `09-26-status-badge-chip-lighter`。
- `audit:size` 目前在共享树里不过（Full 615.2 / 612 KiB，按需 624.0 / 620 KiB）：按 SFC 压缩 CSS 对比 HEAD，本任务未提交改动合计 −4.2 KB（TxTabs −5.1 KB），另一会话未跟踪的 `prism-glow` +4.8 KB；HEAD 本身约 614.6 KiB，已超 612（09-26 凌晨提交的新组件未重设基线，当时被本任务未提交的 Tabs 缩减掩盖）。已告知 talex-touch-40。
