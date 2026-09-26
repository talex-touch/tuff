# TxStatCard 发光图标徽章

父任务：`09-25-tuffex-jelly-indicator-polish`。与引擎无依赖，可并行。

## Goal

老板（2026-09-25，截图 #4）："这个 icon 被遮挡，而且不够炫酷"。上个任务（`09-23-nexus-base-gallery-sidebar` R6.2，方向 B）把 `iconClass` 做成了右下角裁切的低透明度大水印；本次按老板新选定的方向改为**发光图标徽章**：图标完整显示在右侧、垂直居中的着色徽章里，渐变底 + 内高光 + 同色光晕，占据与 `progress` 变体圆环相同的位置，两个变体成为一家。

## 现状（research/stat-card.md）

- 水印：`.tx-stat-card__icon-layer > i.tx-stat-card__icon`（88px、`right:-12px; bottom:-16px`、opacity 0.16，被卡片圆角裁掉）+ `.tx-stat-card__decoration > .tx-stat-card__glow`（右下角同色柔光）。
- 取色：挂载 / `iconClass` / `variant` 变化时 JS 读 `<i>` 的计算色写到根变量 `--tx-stat-card-icon-color` 并加 `tx-stat-card--tinted`；**切换亮暗主题不重读**（success / warning / danger 两套主题色值不同）；灰色（通道极差 < 24，含 `--tx-color-info` `#909399`）不着色。
- `progress` 变体：72px 圆环 `right:18px`、垂直居中；环色与环心图标色写死 primary，宿主颜色类被 `(0,2,0)` 的 `color` 压掉，Nexus `ComponentsOperationsStatusDemo` 的 success / warning / danger 三张卡实际都画成 primary。
- 内容列不给右侧留空间：窄卡（core-app 插件存储页 4 列，估算每张 120–160px）里 progress 环已经与文字重叠。
- 消费方：core-app 6 处（`i-ri-* text-6xl text-<color>`，含 1 处 progress）、Nexus 10 处（画廊、3 个 demo、运营状态 demo、两个模板 demo、ProviderRegistry 5 列、dashboard overview 4 列）；无人覆写 `.tx-stat-card*` 类或 `--tx-stat-card-*` 变量。

## Requirements

- R1 默认 / insight 变体：`iconClass` 渲染为完整可见的徽章，位于卡片右侧、垂直居中、与 progress 圆环同一槽位；不被卡片边缘裁切（光晕允许在卡片边缘柔和收住，徽章本体完整）。
- R2 徽章材质：同色相的渐变底（左上亮、右下暗，与全局左上光源一致）、1px inset ring、顶部内高光、同色 1:2 投影；徽章背后一团同色光晕渗进卡片。颜色只来自 `--tx-*` token 与对 `currentColor` / token 的 `color-mix`，不写 hex / 裸 rgba / `white`。
- R3 取色：沿用"读图标计算色"的机制（任何图标类都适用，无需拆分类名），并在亮暗主题切换时重新读取；灰色 / 未着色图标得到中性徽章（中性底 + ring + 次要色图标，无光晕），不出现灰雾。
- R4 与 progress 成一家：progress 环与环心图标改为跟随同一取色（宿主颜色类生效，不再固定 primary），几何（槽位、尺寸）与徽章共用同一组变量。
- R5 内容不压徽章 / 圆环：内容列按槽位预留右侧空间；窄卡（容器查询）时徽章缩小并移到右上角空白处、圆环同步缩小，数值与标签不与之重叠；core-app 4 列与 Nexus 5 列场景都成立。
- R6 hover：徽章轻浮起（`transform`）、光晕增强（`opacity`），并有一道高光扫过徽章一次；描边即时变化（不过渡颜色）。挂载时光晕淡入。`prefers-reduced-motion: reduce` 下无浮起、无扫光、无淡入，静止帧完整。
- R7 尺寸仍由组件决定：宿主传的 `text-6xl` / `text-5xl` 等尺寸类继续被忽略，颜色类继续生效；不在组件里新增 `i-*` 类。
- R8 Props / slots / events 不变；`clickable`、insight、`#value` / `#label` / `#meta` 插槽照常。CSS 变量表：`--tx-stat-card-icon-opacity(-hover)` 不再读取（从文档删除并在变更记录注明），新增的徽章变量写入文档。
- R9 文档同步（`stat-card.{zh,en}.mdc`）：重写用法 / 最佳实践 / Props / CSS 变量 / 概述 / 动效降级 / 实测覆盖各节；在"被否决的方案"中记录水印方案（方向 B）被替换的原因，并说明新徽章与当年否决的"右上角小号徽章"的区别；用户可见改动配 demo；画廊 CSS 注释同步。
- R10 画廊 StatCard 格子用真实感数据展示徽章（暗色下"炫"而克制）。

## Acceptance Criteria

- [ ] ego 浏览器（暗 + 亮）：画廊格子、stat-card 文档页各 demo、`ComponentsOperationsStatusDemo`（三色 progress 卡颜色正确）、`TemplateDashboardDemo` / `TemplateShellDemo` 截图；徽章完整不裁切，窄卡不重叠；hover 浮起 + 扫光录帧；`prefers-reduced-motion: reduce` 模拟下静止完整。
- [ ] 切换亮暗主题后徽章与光晕颜色随图标颜色更新（不刷新页面）。
- [ ] core-app 同款传参（`i-ri-* text-6xl text-[var(--tx-color-*)]`，含 progress）无头或 dev 截图正常。
- [ ] `stat-card.test.ts` 更新后通过（徽章存在、progress 不渲染徽章、主题切换重读、灰色中性），两条源码正则契约保留；`shadow-light-source.test.ts` 通过；`pnpm -C packages/tuffex audit:size` 不超限。
- [ ] tuffex eslint（包内）、改动文件类型检查、`git diff --check`、Nexus 三个文档门禁通过。

## Out of Scope

- 新增 props（如 `tone`、`badge`）或改变 `variant` 取值。
- 多色图标集（`i-logos-*` 等）的专门适配（现无调用方；徽章不在 `<i>` 上画背景，因此不会把它们顶掉）。
- 调整数值 / 标签 / insight 胶囊的排版。

## 修订 v3（2026-09-26，老板看过徽章版后）

老板（截图 #5，暗色画廊 StatCard 格子）："这个不要有阴影、outline 和 hover 动效；期望右侧会抽离 icon 的颜色渐变、morph 啥的，高级一点。"

- R2′ 取消徽章本体：不要底板、ring、内高光、投影、光晕；取消 hover 浮起与扫光。
- R2″ 右侧"色光"：从图标颜色抽出的渐变铺在卡片右侧，由图标色、色相偏移的邻近色、提亮浅色三团模糊色斑叠成，缓慢漂移 / 旋转，叠加起来像一片在形变的色场；向文字方向渐隐。只在图标着色时出现，灰色图标没有。
- R6′ hover：卡片不做任何 hover 动效（根上即时的描边提亮可保留，它不是动效）。
- 图标：完整显示在右侧槽位，无框。
- reduced-motion：色斑不动，静止帧是一片完整的渐变。
