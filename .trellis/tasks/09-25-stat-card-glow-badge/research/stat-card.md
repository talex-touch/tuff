# Research: TxStatCard 发光图标徽章 —— 改造前调研

- **Query**：把 `TxStatCard` 右下角裁切的淡色水印（`.tx-stat-card__icon-layer / __icon`）+ 同色柔光（`.tx-stat-card__decoration / __glow`）改成"发光图标徽章"：图标完整显示在右侧、垂直居中的着色圆角徽章里（渐变填充 + 内高光 + 同色光晕，位置仿 `progress` 变体的环：`right:18px`、垂直居中、72px），hover 徽章轻浮起 + 光晕增强，带 reduced-motion 兜底。梳理：①全部消费方 ②单测锁定的契约 ③需改写的文档段落 ④适用设计规则 ⑤可复用原语与图标渲染（渐变墨色可行性）⑥progress 环几何；末尾给出对重设计的影响。
- **Scope**：internal（源码 + spec + 用仓库里安装的 UnoCSS 66.7.5 实际生成的 CSS）。外部链接仅作参考，本次会话未抓取。
- **Date**：2026-09-25
- **基线**：`packages/tuffex` 下 `stat-card.test.ts`（11 例）与 `src/__tests__/shadow-light-source.test.ts`（3 例）2026-09-25 23:45 实跑全绿（vitest 3.2.7）。组件目录在 git 中无未提交改动；最近一次改动 `e164a3dfc`（含上一任务的 R6/R9）。

---

## 0. 现状速览（`packages/tuffex/packages/components/src/stat-card/src/TxStatCard.vue`，584 行）

| 位置 | 内容 |
|---|---|
| `:9-13` | `withDefaults`：`iconClass: ''`、`clickable: false`、`variant: 'default'`（props 见 `types.ts:14-29`） |
| `:21-25` | `isProgressVariant`：`variant === 'progress'` **或** 传了 `progress` 数字 |
| `:121-159` | `glowTinted`；`parseChannels` 认 `rgb()/rgba()` 与 `color(srgb …)`；`isNeutralColor` = RGB 通道极差 `< 24`；`updateGlowVars` 读 `getComputedStyle(iconRef).color`，着色时 `cardRef.style.setProperty('--tx-stat-card-icon-color', <计算色>)` 并置 `glowTinted=true`，灰色时 `removeProperty` |
| `:161-168` | `triggerGlow`：rAF 后加 `tx-stat-card--glow-in`（柔光 0.6s 淡入的开关） |
| `:186-214` | 只在 onMounted、`iconClass` 变化、`variant` 变化时重算；**主题切换不重算**（写进去的是解析后的 `rgb()` 字面量） |
| `:218-231` | 根 `div.tx-stat-card.fake-background`；类：`--clickable / --glow-in / --tinted / --insight / --progress`；`role="group"` + `aria-labelledby`（或 `ariaLabel`） |
| `:232-234` | `v-if="iconClass && !isProgressVariant"`：`.tx-stat-card__decoration > span.tx-stat-card__glow`（aria-hidden） |
| `:236-238` | 同条件：`.tx-stat-card__icon-layer > i.tx-stat-card__icon`（`ref="iconRef"`，`:class="iconClass"`，aria-hidden） |
| `:240-250` | progress：`.tx-stat-card__progress`（行内 `--tx-stat-card-progress: N%`）> `__progress-ring` + `__progress-inner > i.__progress-icon`（同样 `ref="iconRef"`） |
| `:302-331` | 根样式：`min-height:112px; padding:16px; border-radius:16px; overflow:hidden`；`--tx-stat-card-icon-color` 默认 `var(--tx-color-primary)`；`--tx-stat-card-glow-color(-soft)` = icon-color 的 34% / 12% `color-mix`；`--tx-stat-card-icon-opacity: .16`、`-hover: .26`；`border: 1px solid var(--tx-border-color-lighter)`；`backdrop-filter: blur(16px) saturate(140%)`；flex 列、`justify-content: flex-end`（默认变体内容贴底） |
| `:333-369` | insight / progress 变体：内容列顶对齐，`label--top`，value `margin-top:8px`，insight/meta `margin-top:auto` |
| `:379-391` | hover：`--fake-opacity:.75` + `border-color: var(--tx-border-color)`（根上无 transition，即时）；图标 `opacity .26` + `translate(-4px,-4px)`；着色时柔光 `.6 → .85` |
| `:393-396` | `.tx-stat-card__content { position: relative; z-index: 1 }`——**不给右侧留任何空间** |
| `:463-510` | progress 几何（§6） |
| `:512-571` | 水印 + 柔光 CSS（水印 `right:-12px; bottom:-16px; font-size:88px`；柔光 220px 圆 `right:-56px; bottom:-72px`，`radial-gradient(closest-side, …)`） |
| `:573-583` | reduced-motion：`__icon, __glow, __progress-ring { transition:none }`；hover 不位移 |

与徽章相关的隐含事实：

- 根带全局类 `fake-background`（`:220`）。tuffex 全局规则 `.fake-background > * { position: relative; z-index: 1 }`（`packages/tuffex/packages/components/style/index.scss:13-16`，(0,1,0)）作用于每个直接子元素；现有 `__icon-layer / __decoration` 靠 (0,2,0) 的 scoped 规则改回 `absolute; z-index:0`。新徽章节点同样要自己声明 `position`（否则默认 `relative; z-index:1`）。
- 根 `overflow: hidden` + `border-radius: 16px`（`:307-309`）：徽章光晕越出卡片边缘会被裁掉（见 §6 的余量）。
- 编译产物 `dist/es/stat-card/style.css` 5459 B（2026-09-25 23:04 构建）；其中水印 + 柔光相关规则（icon-layer / icon / decoration / glow / tinted / 两条 hover / reduced-motion 中对应部分）合计约 1.4 KB。构建会剥掉非 legal 注释（`style-comment-stripper.test.ts`），注释不占体积。

---

## 1. 消费方清单（运行时实例）

`git grep` 覆盖全部已跟踪文件；未跟踪文件中无 StatCard 用法；`plugins/` 与其他 package 无用法；tuffex 内部没有任何组件包装 TxStatCard（`tuffex-docs-sync` 的 blast radius 第 2 步为空，仅 `components.ts:128`、`base/index.ts:83` 两个 barrel 导出）。

### 1.1 core-app（`@talex-touch/tuffex/stat-card` 显式导入：`PluginFeatures.vue:7`、`PluginStorage.vue:8`）

| # | 位置 | variant | `icon-class`（尺寸 / 颜色类） | 其他 props / slots | 容器 |
|---|---|---|---|---|---|
| C1 | `apps/core-app/src/renderer/src/components/plugin/tabs/PluginFeatures.vue:778-782` | default | `i-ri-function-line text-6xl text-blue-500` | `:value="plugin.features?.length \|\| 0"`、`:label`；无 insight/clickable/slot | `grid grid-cols-2 gap-4`（`:777`） |
| C2 | `PluginFeatures.vue:783-787` | default | `i-ri-terminal-box-line text-6xl text-[var(--tx-color-success)]` | `:value="totalCommands"` | 同上 |
| C3 | `apps/core-app/src/renderer/src/components/plugin/tabs/PluginStorage.vue:367-375` | default | `i-ri-database-2-line text-6xl text-[var(--tx-color-primary)]` | `#value` 插槽（`<span>`，loading 时 `--`） | `grid grid-cols-1 md:grid-cols-4 gap-4`（`:366`） |
| C4 | `PluginStorage.vue:377-385` | default | `i-ri-file-2-line text-6xl text-[var(--tx-color-success)]` | `#value` 插槽 | 同上 |
| C5 | `PluginStorage.vue:387-395` | default | `i-ri-folder-2-line text-6xl text-[var(--tx-color-warning)]` | `#value` 插槽 | 同上 |
| C6 | `PluginStorage.vue:397-415` | **progress** | `i-ri-pie-chart-2-line text-[var(--tx-color-primary)]`（无尺寸类） | `:progress="storageStats.usagePercent"`、`:meta`（`plugin.storage.footer.space`）、`#value` 插槽里 `<span :class="usageColorClass">`（≥90 danger / ≥70 warning / 否则 success，`:84-89`） | 同上 |

- core-app 用 `presetUno` + `presetIcons`（collections: `ri` / `simple-icons` / `carbon`，默认 scale 1 → 图标盒 1em），见 `apps/core-app/uno.config.ts:131-145`。
- core-app dev 直接编译 tuffex **源码**（`apps/core-app/electron.vite.config.ts:56-69`：非生产时 `@talex-touch/tuffex/<dir>` → `packages/components/src/<dir>/index.ts`），所以 core-app dev 不需要重建 dist 就能看到改动；生产走包导出（dist）。
- **宽度（估算，未在运行中的应用里实测）**：主窗口最小/默认宽 1100（`src/main/config/default.ts:22,25`），壳侧栏展开默认 260（`modules/layout/shell-sidebar-state.ts:19`；折叠 rail 84 / mac 104，`:26,34`），插件页 aside `w-76` = 304px（`components/tuff/template/TuffAsideTemplate.vue:41`）。主区 ≈ 1100 − 260 − 304 = 536px（未扣 PluginInfo 内边距）→ PluginStorage 四列、间距 16 时每卡 ≈ 122px；侧栏折叠为 rail 时 ≈ 161px。PluginFeatures 两列 ≈ 260–338px。四列那一排在默认窗口下**非常窄**，现在第 4 张 progress 卡的 72px 环已经与文字同处一行。

### 1.2 nexus

| # | 位置 | variant | `icon-class` | 其他 props / slots | 容器 / 宽度 |
|---|---|---|---|---|---|
| N1 | 画廊 `apps/nexus/app/components/docs/DocsComponentsGallery.vue:2580-2599`（`<TxStatCard>` 在 `:2587-2592`） | default + insight | `i-carbon-analytics docs-gallery__stat-icon`（颜色由画廊 CSS 类给） | `:value="1284"`、`:label="copy.online"`（'在线' / 'Online'，`:104`/`:205`）、`:insight="{ from: 1100, to: 1284, type: 'percent' }"` | `<ClientOnly>`（即 `DocsGallerySpecimen`）内 `.docs-gallery__block`：`width: min(320px, 100%)`（`DocsComponentsGallery.css:482-490`） |
| — | 画廊 CSS `DocsComponentsGallery.css:294-298` | — | `.docs-gallery__stat-icon { color: var(--tx-color-primary); }`，注释："StatCard's decorative icon takes its colour from the icon class; this is the tint the card's glow is derived from." | — | 注释措辞需随改造更新 |
| N2 | `apps/nexus/app/components/content/demos/StatCardDefaultVariantDemo.vue:6-11` | default | `i-carbon-download text-[var(--tx-color-primary)]` | `:value="2847"`、**`clickable`** | 文档列全宽 |
| N3 | `StatCardInsightVariantDemo.vue:53-58` | insight | `i-carbon-task text-[var(--tx-color-success)]` | `insight` delta / success | `repeat(auto-fit, minmax(220px, 1fr))`（`:52`） |
| N4 | `StatCardInsightVariantDemo.vue:59-71` | insight | `i-carbon-chip text-[var(--tx-color-warning)]` | `insight` percent / danger / `iconClass: 'i-carbon-arrow-up-right'`；`#value` 插槽（`TxTextMorph` + 16px `%`） | 同上 |
| N5 | `StatCardProgressVariantDemo.vue:36-50` | progress | `i-carbon-cloud text-[var(--tx-color-primary)]` | `:progress`、`:meta`、`#value` 插槽 | 全宽 |
| N6 | `ComponentsOperationsStatusDemo.vue:110-119`（v-for，数据 `:53-78`） | progress ×3 | `i-carbon-cloud-monitoring text-[var(--tx-color-success)]` / `i-carbon-queued text-[var(--tx-color-warning)]` / `i-carbon-warning-alt text-[var(--tx-color-danger)]` | `:progress` 99/64/22、`:meta` | 三列（`:228-232`），窄屏一列（`:258-260`）；被 stat-card / status-badge / progress-bar / tuffex-composition 四个文档页（中英）引用 |
| N7 | `TemplateDashboardDemo.vue:907-921`（数据 `:493-541`） | insight ×4/5 | `i-carbon-user-multiple text-[var(--tx-color-primary)]`、`i-carbon-search text-[var(--tx-chart-categorical-5)]`、`i-carbon-machine-learning-model text-[var(--tx-chart-categorical-4)]`、`i-carbon-download text-[var(--tx-color-success)]`、`i-carbon-debug text-[var(--tx-color-warning)]` | `insight`（显式 `iconClass` 箭头，`:489`）；`#value` 插槽（`TxTextMorph` + 单位） | 默认 4 列（`:1319-1323`）；容器 < 640px 2 列（`:1760` 起）；≥ 960px 5 列（`:1800` 起） |
| N8 | `TemplateShellDemo.vue:802-833` | insight ×3 + progress ×1 | `i-carbon-rocket …primary`、`i-carbon-plug …success`、`i-carbon-meter …warning`；progress 卡 `i-carbon-data-base`（**无颜色类**） | insight（`:364-381`）；第一张 `#value` 插槽；宿主类 `.shell__stat` 覆写 `--fake-opacity:1; min-height:104px; padding:14px; border-radius:14px`（`:1357-1363`） | 3 列 / ≥960 4 列（`:1350-1355`、`:1717` 起）；< 640 横向滚动条、每卡 `flex: 0 0 72%`（`:1840-1850`） |
| N9 | `apps/nexus/app/components/dashboard/provider-registry/ProviderRegistryAdminPanel.vue:547-616`（显式导入 `:19`） | default ×5 | `i-carbon-cloud-service-management` / `catalog` / `flow` / `data-check` / `pulse`，均 `text-6xl text-[var(--tx-color-{primary,success,warning,info,danger})]`（`:550,564,578,592,606`） | 每张都有 `#label` 插槽（两行：标题 + `text-xs` 说明） | `grid gap-4 md:grid-cols-5`（`:546`），挂在 `/admin/provider-registry`（`app/pages/admin/provider-registry.vue:17`） |
| N10 | `apps/nexus/app/pages/dashboard/overview.vue:482-540` | default ×4 | `i-carbon-{search,meter,security,devices} text-5xl text-[var(--tx-color-{primary,success,warning,info})] sm:text-6xl`（`:485,500,515,530`） | 每张都有 `#label` 插槽（两行，第二行 11px） | `grid grid-cols-2 gap-3 lg:grid-cols-4`（`:481`） |

- 不是消费方：`apps/nexus/app/pages/admin/analytics.vue:493-520` 的 `realtimeStatCards` / `overviewStatCards` 是普通 `div`。
- 仅出现在 mdc 代码片段里（不渲染组件本身）：`stat-card.{zh,en}.mdc`（`:22-27,89-107,150-164,179-202`）、`status-badge.{zh,en}.mdc:45-47`、`template-dashboard.{zh,en}.mdc:53/55`、`template-shell.{zh,en}.mdc:69`、`getting-started/tuffex-composition.{zh,en}.mdc:127`——都没有对水印/柔光的行为性描述。
- 所有调用方都没有覆写 `.tx-stat-card*` 类或 `--tx-stat-card-*` 变量（`git grep` 只在组件与其文档里命中）。

### 1.3 用法归纳

- `iconClass` 实际出现的形态只有两种图标集：core-app `i-ri-*-line`，nexus `i-carbon-*`——都是单色（mask 模式，见 §5.3）。
- 尺寸类：core-app 5 张 + ProviderRegistry 5 张带 `text-6xl`；overview 带 `text-5xl … sm:text-6xl`；这些现在都被组件 (0,2,0) 选择器压住、不生效（文档 `:215` 已写"不必再传"）。
- 颜色类：`text-blue-500`（非 token 的 Tailwind 蓝）、`text-[var(--tx-color-*)]`、`text-[var(--tx-chart-categorical-4/5)]`、画廊自定义类；**`--tx-color-info` 在普通亮/暗主题都是 `#909399`（`variables.scss:202`，暗色块没有重定义）→ 通道极差 9 → 被判为灰色**，所以 N9 的 Usage 卡、N10 的 Active devices 卡现在没有柔光；N8 的 progress 卡没有颜色类。
- `clickable` 只有 N2 一处；`insight` 在 N1、N3/N4、N7、N8；`progress` 在 C6、N5、N6、N8；`#value` 插槽 C3–C6、N4、N5、N7、N8；`#label` 插槽 N9、N10（两行标签使卡片变高）。
- progress 变体里颜色类**不生效**：`.tx-stat-card__progress-icon { color: var(--tx-stat-card-progress-color) }`（`:507-510`，(0,2,0)）压过宿主颜色类，环色 `--tx-stat-card-progress-color` 固定为 primary（`:470`）。N6 的 success/warning/danger 三张卡实际都画成 primary。

---

## 2. 单测锁定的契约（`packages/tuffex/packages/components/src/stat-card/__tests__/stat-card.test.ts`，229 行）

全局：`:5` 以 `?raw` 导入 SFC 源码做源码断言；`:7-10` 把 `requestAnimationFrame` 桩成同步；`:12-18` fake timers。vitest 不编译 `<style>`，样式层只能靠源码正则。

| 测试 | 行 | 锁定内容 | 徽章改造的影响 |
|---|---|---|---|
| renders default value, label, icon decoration, and clickable state | `:27-50` | `role="group"`、无 `aria-label`、`aria-labelledby` 指向文本为 Status 的节点；`tx-stat-card--clickable`；`.tx-stat-card__value` / `__label` 文本；**`.tx-stat-card__icon-layer` 存在（`:47`）**、**`.tx-stat-card__decoration` 存在（`:48`）**、**`.tx-stat-card__icon` 带 `i-carbon-checkmark`（`:49`）** | 去掉 icon-layer / decoration 必须改 `:47-48`；若 `<i>` 换类名要改 `:49` |
| signals click affordance only on clickable cards | `:52-59` | 源码正则 `/\.tx-stat-card:hover\s*\{([\s\S]*?)\}/` 必须命中（取**第一个** `.tx-stat-card:hover {` 规则，现为 `:379`），且其中不含 `cursor: pointer`；源码含 `.tx-stat-card--clickable {` | 必须保留一条字面量为 `.tx-stat-card:hover {` 的规则（`.tx-stat-card:hover .xxx {` 不匹配此正则）；删掉它测试会因 `hoverRule` 为 null 失败 |
| custom value and label slots | `:61-75` | 插槽不替换外壳 | 无影响 |
| percent insight | `:77-105` | `--insight`、`label--top`、胶囊颜色、内联 SVG 趋势图标、`+20%` 整体 | 无影响（徽章不应改动 insight 结构） |
| delta insight | `:107-131` | warning 色、显式 `insight.iconClass`、无 `+`、`pts` 后缀 | 无影响 |
| glows only behind a tinted icon | `:133-158` | mock `getComputedStyle`：**带 `tint-rgb/tint-srgb/tint-grey` 类的元素**返回 `rgb(64,158,255)` / `color(srgb 0.25 0.62 1)` / `rgb(144,147,153)`（这些类随 `iconClass` 落在 `<i>` 上）；断言根有 `tx-stat-card--tinted` 且根 style 含 `--tx-stat-card-icon-color: rgb(64, 158, 255)`；灰色无 `--tinted`、无该变量 | 若保留"读图标计算色 → 根变量 + `--tinted`"机制则不动；若改名或把颜色类挪到别的元素（见 §7 选项 b），`:140-155` 要跟着改 |
| progress variant from explicit progress | `:160-180` | `--progress`；`.tx-stat-card__progress` 的 style 含 `--tx-stat-card-progress: 100%`（夹紧）；`.tx-stat-card__progress-icon` 带图标类；meta 文本；**progress 变体下 `.tx-stat-card__icon-layer` 不存在（`:179`）** | 类名消失后 `:179` 变成空断言，应改为断言"progress 变体不渲染徽章" |
| ring reads the percentage bound on its parent | `:182-191` | 源码正则：`@property --tx-stat-card-progress { … inherits: true; }`（`:187`）；`/@media \(prefers-reduced-motion: reduce\) \{[^}]*\.tx-stat-card__progress-ring \{\s*transition: none;/`（`:188-190`） | **陷阱**：`[^}]*` 要求 `__progress-ring` 位于某个 reduced-motion 块**第一条规则**的选择器列表里、且是列表**最后一项**，紧跟 `{` 和 `transition: none;`。在该列表里把徽章选择器写在 `__progress-ring` 之后、或把 `__progress-ring` 挪到第二条规则，这条测试就会失败 |
| numeric value ≤ 100 → progress | `:193-203` | 省略 `progress` 时用数值推断 `64%` | 无影响 |
| custom meta slot | `:205-218` | progress 的 meta 插槽 | 无影响 |
| explicit ariaLabel | `:220-228` | `aria-label` 覆盖、去掉 `aria-labelledby` | 无影响 |

没有被任何测试断言的：水印/徽章尺寸与位置、hover 视觉、`--glow-in` 类、柔光/水印的 reduced-motion 规则（文档 `stat-card.*.mdc:279` 也这样写明）。仓库里现成的"编译后样式契约"写法是 `mode-chip/__tests__/mode-chip-motion.test.ts:1-60`：`sass.compileString` 编译 SFC 的 `<style>` 块再逐条解析规则/媒体查询（设计规则 `tuffex-design-rules.md:166` 点名此法）。其他测试（core-app、nexus、`apps/nexus/build/*`）都不引用 stat-card。`shadow-light-source.test.ts` 会扫描所有 SFC 的阴影（见 §4）。

---

## 3. 文档页（`apps/nexus/content/docs/dev/components/stat-card.{zh,en}.mdc`，各 282 行，中英行号一致）

frontmatter：`category: Data`、`status: beta`、`syncStatus: reviewed`、`verified: true`。

| 行 | 所在节 | 现在的说法 | 改造后状态 |
|---|---|---|---|
| `:16` | 用法 › 默认样式 | `iconClass` 渲染为右下角裁切的大号淡色水印，颜色类着色并在角落铺同色柔光 | 失效，需重写 |
| `:215` | 最佳实践（最后一条） | 颜色类"同时给水印和柔光着色"；无颜色类不出柔光、适合安静的那张；不必传 `text-6xl` | 前半失效；"不必传尺寸类"仍成立 |
| `:225` | Props › `iconClass` | 默认与 insight 布局中为右下角 88px 水印、尺寸组件决定、颜色类着色并点亮柔光；progress 中在环中心 | 失效 |
| `:226` | Props › `clickable` | 只加指针光标，hover 反馈对所有卡片生效 | 仍成立（hover 现在是徽章浮起） |
| `:252-258` | API › CSS 变量表 | `--tx-stat-card-icon-opacity`（0.16）/ `-hover`（0.26）/ `--tx-stat-card-icon-color`（柔光 34%/12% 由它混出，组件独占） | 若不再读取 opacity 两个变量须删行（公开覆写点消失，属于对外契约变化；仓库内无人覆写）；icon-color 行需改写成徽章用法 |
| `:262` | 概述 › 装饰图标 | 88px、无模糊、0.16、右下角溢出被圆角裁掉；progress 中 22px 画在环中心、不渲染水印与柔光；尺寸类不生效、颜色类生效、未着色继承次要色 | 失效 |
| `:263` | 概述 › 柔光 | 只跟随着色图标，挂载 / `iconClass` / `variant` 变化时读计算色，灰色（极差 < 24）不出柔光 | 若机制保留需改成徽章措辞 |
| `:264` | 概述 › hover | 描边即时变 `--tx-border-color`，角落图标内移 4px 提亮到 0.26，柔光增强 | 失效 |
| `:271` | 技术实现 › 视觉契约变更（2026-09-23） | 历史记录 | 保留；新增一条带日期的变更（新增/删除的类名、变量） |
| `:272` | 技术实现 › **被否决的方案** | "把图标收进**右上角的小号**着色徽章"被否决：CoreApp 插件页依赖大号彩色图标气质，因此保留大图标改成裁切水印；旧 hover（2.05 倍放大 + 模糊 + 旋转 10°）移除 | **与新方向直接冲突**，必须重写：记录水印方案（方向 B）为何被替换（老板：被裁切、不够酷），并说明新徽章（72px、右侧垂直居中）与当年否决的"右上角小徽章"的区别 |
| `:275` | 技术实现 › 动效降级 | 柔光挂载 0.6s 淡入，hover 位移/提亮 0.35s，进度弧 0.6s；reduced-motion 全关、不位移、提亮/描边/柔光即时 | 需按徽章动效重写 |
| `:279` | 技术实现 › 实测覆盖 | 列出单测覆盖范围，并说明水印尺寸、hover、水印与柔光 reduced-motion 只在样式层、无单测 | 测试改动后同步改写 |

Demo 登记（`apps/nexus/app/components/content/demo-registry.ts`，按字母序）：`StatCardDefaultVariantDemo`（`:333`）、`StatCardInsightVariantDemo`（`:334`）、`StatCardProgressVariantDemo`（`:335`）；另有 `ComponentsOperationsStatusDemo`（`:101`）、`TemplateDashboardDemo`（`:369`）、`TemplateShellDemo`（`:382`）。新增 demo 需插在字母序位置（如 `StatCardBadge…Demo` 会排在 `StatCardDefaultVariantDemo` 之前），并在中英 mdc 各加一个 `::TuffDemoWrapper` 块。

其他页（`status-badge`、`progress-bar`、`template-dashboard`、`template-shell`、`tuffex-composition`、组件索引页 `index.{zh,en}.mdc:197`）只把 StatCard 当组合素材，无行为性描述，改造后无需改写（按 `tuffex-docs-sync.md:31` 的要求逐页确认过）。tuffex `CHANGELOG.md` 的 `[Unreleased]` 目前为空。

同步规则要点（`.trellis/spec/frontend/tuffex-docs-sync.md`）：用户可见改动配 demo（`:72-78`）；被否决的设计记在 `## 技术实现 / Technologies`（`:50`）；新条目按语义就位，不追加到末尾（`:54-66`）；中英节数一致（`:48`）；门禁 `check-demo-registry-orphans` / `check-mdc-fences` / `check-doc-translation-parity`（`:103-110`）。

---

## 4. 适用的设计规则（摘录）

来源：`.trellis/spec/frontend/tuffex-design-rules.md`（下称 DR）、`frontend/index.md`（下称 IDX）、`component-guidelines.md`（下称 CG）、`bui-component-family.md`（下称 BUI）、`packages/tuffex/packages/components/style/variables.scss`（下称 VAR）。

**阴影 / 光源**
- VAR `:267-270`："One light source for the whole system: high and to the left of the screen, casting down and to the right. Every drop layer keeps x:y at 1:2"；`--tx-elevation-1..5` = `1px 2px 4px` … `6px 14px 40px`（亮 `:275-279`，暗 `:474-478`，暗色只加密度）。
- VAR `:283-284`："-light and -lighter used to be 0 0 — omnidirectional glows, which is the absence of a light source rather than a soft one."
- `src/__tests__/shadow-light-source.test.ts:76-111`：扫描所有 SFC 的 `box-shadow:` 与名字含 `shadow` 的自定义属性；非 `inset` 层中 **`x === 0 && |y| ≥ 2`** 即失败；豁免 `< 2px` 偏移与 TxDrawer。`0 0 Npx <色>` 的纯光晕（x=0, y=0）**不会**被该测试拦下；`inset` 层全部跳过；`filter: drop-shadow()`、径向渐变不在扫描范围。
- 记忆 `shadow-one-light-source`：页面级审计口径是"每个非 inset、非 ring 层 `x > 0 && y > 0`"——按这个口径，`0 0` 光晕会被记为不合规。
- CG `:128`：`box-shadow` 跟随所在元素的 `border-radius`，要把阴影加在真正有形状的元素上。

**ring vs border / 圆角**
- DR `:73-85`："A ring, not a border, when the element has a shadow or a fixed height" … "A drop shadow and a border on the same element are mutually exclusive … Use the ring."（徽章固定 72px 且带光晕 → 边缘用 `inset 0 0 0 1px …`。）
- DR `:87-91`："When two rounded edges sit ≤8px apart, the outer radius equals the inner radius plus the gap."（徽章距卡片右缘 18px，与卡片圆角无同心约束；徽章内部若再有内板/内高光圈，需同心。）
- DR `:217-219`："Never stack one card inside another … Two nested elevated surfaces produce a border-on-border seam and an ambiguous shadow direction."（徽章若同时有投影 + 描边，接近"卡中卡"，需注意光源方向一致。）

**颜色**
- DR `:101-105`："Every colour comes from a `--tx-*` token. A hex literal or bare `rgba()` in a component is a bug"；`var(--tx-token, #fallback)` 为约定写法。
- DR `:107`：暗色填充只用 `-light-8/-9` 或 `color-mix(in srgb, var(--tx-color-<hue>) 14%, transparent)`，不要用 `-light-3/5/7`。
- DR `:113-123`："White ink on a solid semantic fill is not a supported pairing"（TxStep 1.74:1 等）；同色相墨色要实测。
- DR `:125-127`：`--tx-text-color-secondary` 对 13px 文字不够，但"stays fine for icon-only glyphs, which need 3:1"（未着色图标沿用 secondary 墨色可接受；图标本身 aria-hidden，属装饰）。
- `--tx-color-white` token 存在（VAR `:326`、`:487`），高光的既有写法：`inset 0 1px 0 color-mix(in srgb, var(--tx-color-white, #fff) 10%, transparent)`（`dialog/src/TxBlowDialog.vue:258`）、`--tx-slider-surface-highlight: color-mix(in srgb, var(--tx-color-white, #fff) 17%, transparent)`（`slider/src/TxSlider.vue:669`）。
- CG `:131-134`（One writer per CSS custom property）：`:style` 绑定与 `setProperty()` 不能共用同一个自定义属性（`undefined` 会在每次重渲染时删掉命令式写入）。`--tx-stat-card-icon-color` 目前只有 `setProperty` 一个写入方，根节点没有 `:style` 绑定。

**动效**
- DR `:139-145`："Never put `color`, `background-color` or `border-color` in a `transition` that fires on `:hover` … Transitioning `opacity`, `transform` or `box-shadow` geometry on hover is fine"（"光晕增强"用光晕层的 `opacity` 最稳；改 box-shadow 的颜色/透明度不属于 geometry）。
- DR `:147-166`：状态变化（非 hover）可以过渡颜色，但要把 transition 挂在只在变化期间存在的类上。
- DR `:168-176`："Every transition has a reduced-motion escape … Non-negotiable"；关键帧动画在降级时必须保留终态可见。
- VAR `:294`（`--tx-ease-out-strong`）、`:296-301`（`--tx-ease-spring` 会过冲，"Reserve it for elements that arrive at the user … on a layout transition the overshoot reads as a glitch"）；`TxSlider.vue` 注释："hover in and out must never bounce"。

**字号 / 字重**
- DR `:11-19`：内容文字 13–14px，次要 12px。卡片自身：label 13px、meta/insight 12px。
- DR `:35-37`：`font-weight: 700` 只允许在 ≤11px 大写微标签或"≥28px display number (`TxStatCard`)"——数值 28px/700 已获许可；DR `:29-33` 数值 `-0.01em` 字距属"Display numerals ≥20px"。徽章本身没有文字，图标是字形不受字号规则约束。

**图标类**
- `tuffex-docs-sync.md:98`：tuffex 内部写死的图标类 nexus dev 看不到（UnoCSS 不扫 dist）；组件内需要的图标要么内联 SVG（如现在的涨幅箭头），要么导出 `.ts` 表并 safelist。徽章若要给"无 iconClass"准备默认图标，不能直接写 `i-*` 类。

**BUI 家族边界**
- BUI `:9`：`--tx-bui-*` 色值刻意不对齐 `--tx-*`；`:26`（规则 3）BUI 组件"never attach `.tx-card` / `.tx-base-surface` / `.fake-background`"。

**尺寸门禁**（`packages/tuffex/scripts/audit-package-size.mjs`）
- `fullCssBytes: 612 KiB`（`:160`，实测 610.1，余量约 1.9 KiB）；`onDemandCssBytes: 620 KiB`（`:205`，实测 618.9，余量约 1.1 KiB）；`componentCssBytes: 56 KiB`（`:210`）。超限需要带日期说明地重设基线。

---

## 5. 可复用原语与图标渲染

### 5.1 tuffex 候选原语

| 原语 | 视觉做法（源码） | 与徽章的契合度 |
|---|---|---|
| `TxIconChip`（`icon-chip/src/TxIconChip.vue`，BUI） | `size` px 方块，圆角默认 `size/4`（72 → 18px），`solid`（白字实底，`:87-116`）/ `soft`（色调底 + 同色墨 + 30% ring，`:121-157`）；色调限定 `neutral/ink/accent/green/orange/red`，取 `--tx-bui-*` 调色板；内容走 slot，只给 `> svg` 定尺寸（62%）；`bui-scope` 重置 + 700 字重 | 低：无法接收宿主颜色类/任意色相（StatCard 的颜色来自 `iconClass`），调色板是另一套体系（BUI `:9`），solid 形态正是"实底白墨"（DR `:113`）；无渐变、无光晕、无 hover |
| `TxGradientBorder`（`gradient-border/src/TxGradientBorder.vue`） | 固定彩虹 `linear-gradient(#0894ff→#c959dd→#ff2e54→#ff9004)` ring，`@property --tx-gradient-angle` 无限旋转（`:77-91`），外层 `filter: blur(borderWidth)` 做发光；reduced-motion 停旋转 | 低：颜色写死为 hex 彩虹、持续旋转；可借鉴"blur 放在父层、mask 放在子层"的分层（`:56-66`） |
| `TxBorderBeam`（`border-beam/src/TxBorderBeam.vue`） | 上游 React 库的移植，每实例注入 `<style>`，`pulse-driver` 共享 rAF，IntersectionObserver 暂停；`styles.ts` 2163 行，JS 在尺寸门禁里有 80 KiB 的单独豁免（`audit-package-size.mjs` `componentJsOverrides`） | 低：一页 4–5 张卡各带一套 beam 成本高，语义是"动态描边" |
| `TxThinkingOrb`（`thinking-orb/src/TxThinkingOrb.vue`） | canvas 逐帧绘制，`role="img"`，标签是 Working…/Thinking… 等 AI 思考态，reduced-motion 画静帧 | 不适用：语义是 AI 思考中 |
| `TxGlowText`（`glow-text/src/TxGlowText.vue`） | 扫光带（`linear-gradient` 带 + `mask-image` + `mix-blend-mode: plus-lighter` + `backdrop-filter`），根 `overflow:hidden`，默认无限循环 | 不适用：是"扫过文字的光带"，不是静态光晕 |
| `TxModeChip`（`mode-chip/src/TxModeChip.vue`） | `button`，色调底 `-light-9`、hover 深一档 20% mix；墨色 = 色相向 `--tx-text-color-primary` 混合并实测对比度（`:175-194`, `:263-287`）；颜色过渡只挂 `.is-morphing` | 组件不适用（是按钮）；可借鉴其"色调底 + 同色相墨"与"颜色过渡门控"写法 |

结论性事实：上述原语都不能直接接收"宿主颜色类决定的任意色相"，且各自带额外语义/成本；仓库里已有的相近视觉配方都是组件内的普通 scoped CSS（见 5.2）。

### 5.2 库内可参照的视觉配方（组件内 CSS）

- **渐变填充 + 同色 1:2 投影 + 1px ring + 模糊光晕**：`tabs/src/TxTabs.vue:1003-1033`——`.tx-tabs__pointer-inner { background: linear-gradient(180deg, var(--tx-color-primary), color-mix(in srgb, var(--tx-color-primary) 72%, white)); box-shadow: 1px 2px 8px color-mix(in srgb, var(--tx-color-primary) 36%, transparent), 0 0 0 1px color-mix(… 12%, transparent); }`，`::before` 是 `radial-gradient(ellipse, color-mix(… 28%, transparent) 0%, transparent 70%)` + `filter: blur(10px)`，靠 `--glow` 类把 opacity 从 0 调到 0.42。（注意：该文件正被并行任务 `09-25-tabs-indicator-redo` 重做，引用以 2026-09-25 状态为准；`white` 关键字属于非 token 颜色。）
- **内高光**：`TxBlowDialog.vue:258` 的 `inset 0 1px 0 color-mix(in srgb, var(--tx-color-white, #fff) 10%, transparent)`。
- **hover 轻抬起**：`avatar/src/TxAvatar.vue:250-262`——`transition: transform .2s, box-shadow .2s`，hover `scale(1.05)` + `inset 0 0 0 1px …` rim + `2px 4px 12px` 投影（1:2）。
- **同色 1:2 发光阴影**：`progress-bar/src/TxProgressBar.vue:1052-1055`——`0 0 0 1px color-mix(<色> 35%)` + `9px 18px 48px color-mix(<色> 30%)`；`:1058-1059` 用 `filter: drop-shadow(0 0 10px color-mix(… 45%))`。
- **本组件自己的色调配方**：进度环中心盘 `color-mix(in srgb, <环色> 16%, transparent)`（`:501`）；涨幅胶囊 `color-mix(in srgb, currentColor 12%, transparent)`（`:434`）；现有柔光 34%/12%（`:317-318`）、径向渐变 `closest-side`（`:558-564`）。`color-mix(in srgb, currentColor N%, transparent)` 在 tuffex 里是通行写法（StatusBadge `:192`、EmptyState、CodeEditorToolbar 等）。
- 圆角参照：TxIconChip `size/4`（72 → 18px）；TxCardItem 方形头像 12px；TxOutlineBorder `squircle` = 24%。

### 5.3 UnoCSS 图标类怎么渲染（用仓库安装的 UnoCSS 66.7.5 实际生成）

生成逻辑：`node_modules/.pnpm/@unocss+preset-icons@66.7.5/.../dist/core-C6nnhdU8.mjs:306-321`——`mode: 'auto'` 时 SVG 含 `currentColor` 走 **mask**，否则走 **bg**。

core-app（`presetIcons({ collections: { ri, 'simple-icons', carbon } })`，默认 scale 1，与颜色类同处一个 `uno.css`，`src/renderer/src/main.ts:36`）：

```css
/* layer: icons */
.i-ri-function-line{--un-icon:url("data:image/svg+xml;…");-webkit-mask:var(--un-icon) no-repeat;mask:var(--un-icon) no-repeat;-webkit-mask-size:100% 100%;mask-size:100% 100%;background-color:currentColor;color:inherit;width:1em;height:1em;}
/* layer: default */
.text-6xl{font-size:3.75rem;line-height:1;}
.text-\[var\(--tx-color-success\)\]{color:var(--tx-color-success);}
.text-blue-500{--un-text-opacity:1;color:rgb(59 130 246 / var(--un-text-opacity));}
```

nexus（`presetIcons({ scale: 1.2 })` + `postprocess` 把图标规则包成 `:where()`，`apps/nexus/uno.config.ts:119-126,130-132`）：

```css
:where(.i-carbon-analytics){--un-icon:url(…);-webkit-mask:var(--un-icon) no-repeat;mask:var(--un-icon) no-repeat;-webkit-mask-size:100% 100%;mask-size:100% 100%;background-color:currentColor;color:inherit;width:1.2em;height:1.2em;}
:where(.i-logos-vue){background:url(…) no-repeat;background-size:100% 100%;background-color:transparent;width:1.4em;height:1.2em;}   /* 多色集 → bg 模式 */
```

要点：
- 字形 = `background-color: currentColor` 被 `mask` 裁出的形状；`color: inherit` 让它默认继承父元素颜色，宿主颜色类（同元素、同/更高优先级）覆盖它。
- 尺寸 = `font-size` × 1em（core-app）/ 1.2em（nexus）。组件 (0,2,0) 的 `font-size` 压过宿主 `text-6xl`（(0,1,0)）；若组件在 `<i>` 上写 `color` 也会压过宿主颜色类（progress 图标就是这样丢了宿主颜色，`:507-510`）。现有水印因此把兜底墨色写在父层（`.tx-stat-card__icon-layer { color: secondary }`，`:525`），不写在 `<i>` 上。
- UnoCSS 66 的图标规则**不设 `display`**，全仓也没有全局 `display` 规则（仅 nexus 预置 `[class^="i-"],[class*=" i-"]{width:1.2em;height:1.2em}`，`uno.config.ts:94`）。`<i>` 必须被上下文块级化（绝对定位 / flex 项 / 显式 display），否则 inline 盒不吃宽高。现有两个 `<i>` 分别是绝对定位（`:528-538`）与 flex 项（`:494-510`）。
- **nexus 的图标层在 `app:mounted` 之后才异步加载**（`apps/nexus/app/plugins/unocss-icons.client.ts`，动态 `import('uno:icons.css')`），此前 `i-*` 盒只有预置的 1.2em 尺寸、没有 mask 也没有 `background-color`，即什么都不画。画廊格与文档 demo 都在客户端挂载（`<ClientOnly>` / 懒挂载的 `TuffDemoWrapper`）；dashboard / admin 页面生产开启 SSR（`nuxt.config.ts:96,203`），但这两页的卡片在数据加载后才出现，是否会 SSR 出卡片未核实。
- nexus 只装 `carbon / cib / logos / twemoji`，**不装 `ri`**（`tuffex-docs-sync.md:98`）；core-app 的 `i-ri-*` 只在 core-app 里有字形。

### 5.4 渐变墨色（mask 下的 `background-image`）可行性

- **mask 模式图标（全部现有调用方：`i-ri-*`、`i-carbon-*`）可行**：mask 同时裁剪元素的 `background-color` 与 `background-image`，在 `<i>` 上加 `background-image: linear-gradient(…)` 即得渐变字形；UnoCSS 图标规则不写 `background-image`，没有冲突。色标可以用 `currentColor` 推导（如 `color-mix(in srgb, currentColor 60%, var(--tx-color-white, #fff))` → `currentColor`），这样宿主颜色类仍决定色相，且随主题切换即时变化。仓库内未找到"给 mask 图标上渐变墨色"的先例；本结论基于标准 CSS 遮罩语义 + 上面的生成产物，**未做像素级渲染验证**。
- **bg 模式图标（`i-logos-*`、`i-twemoji-*` 等多色集）不可行**：它们的字形本身就是 `background` 图片；组件 (0,2,0) 的 `background-image` 会顶掉它，图标变成一块渐变矩形。当前没有调用方传多色集，但 API 上没有限制。
- **nexus 首帧**：图标层异步到达前 `<i>` 没有 mask；如果组件在 `<i>` 上画了 `background-image`（或 `background-color`），在 mask 到达前会显示成 1.2em（或组件给定尺寸）的实心方块（与 `tuffex-docs-sync.md:98` 描述的"`currentColor` 方块"同类现象）。现有实现不在 `<i>` 上画背景，所以没有这个问题。可行的规避思路（未验证）：`mask-image: var(--un-icon, linear-gradient(transparent 0 0))` 让缺少 `--un-icon` 时整块透明；或只在检测到 `--un-icon` 后加一个开启渐变的类。
- core-app 的颜色类与图标规则同处一个样式表、`icons` 层排在 `default` 层之前，颜色类（同优先级、后出现）胜出；nexus 图标规则零优先级，颜色类永远胜出——两边的 `currentColor` 都等于宿主颜色类给的颜色。

---

## 6. `progress` 变体几何（徽章要"仿照"的对象）

| 部件 | 规则（`TxStatCard.vue`） | 推导出的几何 |
|---|---|---|
| 容器 `.tx-stat-card__progress` | `:463-472`：`position:absolute; right:18px; top:50%; width:72px; height:72px; transform: translateY(-50%)`；`--tx-stat-card-progress-color: var(--tx-color-primary)`；轨道色 `color-mix(<环色> 22%, transparent)`（`:474-478`，回退 `rgba(64,158,255,.24)`） | 占据卡片右侧 18→90px；卡片 `min-height:112` 时上下各留 20px（TemplateShell 覆写为 104 → 16px） |
| 环 `.tx-stat-card__progress-ring` | `:480-492`：`inset:0; border-radius:999px`；`conic-gradient(环色 0 p, 轨道 p 100%)`；`mask: radial-gradient(circle, transparent 56%, #000 58%)`；`transition: --tx-stat-card-progress .6s cubic-bezier(0.22,1,0.36,1)` | `circle` 未写尺寸 → 默认 `farthest-corner` = 36√2 ≈ 50.9px：r < 28.5px 透明、r ≥ 29.5px 不透明，被圆角裁到 r = 36px → 可见环宽约 6.5–7px |
| 中心盘 `.tx-stat-card__progress-inner` | `:494-505`：`inset:10px; border-radius:999px; background: color-mix(in srgb, <环色> 16%, transparent)`；flex 居中 | 直径 52px（r = 26），与环内沿之间约 3px 透明缝 |
| 图标 `.tx-stat-card__progress-icon` | `:507-510`：`font-size:22px; color: var(--tx-stat-card-progress-color)` | core-app 22px 盒、nexus 26.4px 盒（scale 1.2）；颜色固定为环色（压过宿主颜色类） |
| 内容列 | `:347-351`、`:393-396` | **不预留右侧空间**，窄卡里 label/value/meta 会与环重叠（内容 z-index 1 在环上方） |

其他：`@property --tx-stat-card-progress { inherits: true }`（`:296-300`，单测 `:187` 锁定）；环色与图标色都不跟随 `iconClass` 的颜色类（§1.3）。

---

## 7. 对重设计的影响（Implications）

1. **单测需要改的地方**：`stat-card.test.ts:47-49`（icon-layer / decoration 存在、`__icon` 类）、`:179`（progress 下不渲染装饰，改断言对象）、`:133-158`（若改动"读图标计算色 → 根变量 `--tx-stat-card-icon-color` + `tx-stat-card--tinted`"的机制或颜色类落点）。两个源码正则的限制：必须保留字面量 `.tx-stat-card:hover {` 规则（`:53`）；reduced-motion 块第一条规则的选择器列表必须以 `.tx-stat-card__progress-ring` 结尾并紧跟 `transition: none;`（`:188-190`）。徽章的 hover / reduced-motion 目前无测试兜底，如需锁定可仿 `mode-chip-motion.test.ts` 编译 SCSS 后断言。
2. **徽章是实体内容，不再是水印**：默认/insight 变体的内容列没有右侧留白（`:393-396`），默认变体内容还是贴底的（`:330`），而徽章垂直居中——需要决定内容区右侧预留（约 18 + 72 + 间距 ≈ 100px）以及窄卡策略。窄卡真实存在：core-app PluginStorage 四列（估算每卡约 120–160px）、ProviderRegistry `md:grid-cols-5`、TemplateDashboard ≥960 容器 5 列、overview 移动端 2 列；progress 环在这些位置已经与文字重叠。卡片数值是 28px/700。
3. **徽章颜色从哪来**：现有机制是 JS 读 `<i>` 的计算色写到根变量（仅挂载后；SSR/首帧是默认 primary；**主题切换后不刷新**——success/warning/danger 在亮/暗主题下是不同色值，VAR `:199-201` vs `:420-422`，徽章填充/光晕会与字形颜色不一致）。可选思路（未验证）：把 `iconClass` 里非 `i-*` 的工具类放到徽章容器上，借 UnoCSS mask 规则的 `color: inherit` 让 `<i>` 继承，徽章用 `currentColor` 画填充/光晕/渐变墨——纯 CSS、随主题即时、SSR 正确；代价是按前缀拆分类名属于启发式，且单测 `:140-143` 的 mock 按类名找元素，需要随之调整。
4. **灰色/未着色图标**：`--tx-color-info`（`#909399`）、无颜色类的图标会被判为灰（N8 progress、N9 Usage、N10 Active devices）。沿用"灰色没有色相可发光"的既有原则，需要一个中性徽章样式（无光晕）；secondary 墨色对纯图标字形可接受（DR `:127`）。
5. **尺寸类继续忽略、颜色类继续生效**：徽章内字形尺寸用 (0,2,0) 选择器控制（`text-6xl` / `text-5xl sm:text-6xl` 无需调用方改代码）；不要在 `<i>` 上写 `color`，兜底墨色写在父层；`<i>` 要被块级化（flex 项或 `display:block`）。不要在组件里新增 `i-*` 类（nexus 看不到），需要内置字形就用内联 SVG。
6. **渐变墨色**：对全部现有调用方（mask 模式）可行；对多色集（bg 模式）会把图标本身顶掉；nexus 图标层异步到达前会画出实心方块——需要守卫（§5.4）。
7. **光晕与裁剪/光源**：卡片 `overflow:hidden`，徽章右侧只有 18px、上下 20px（TemplateShell 16px）余量，超出即被卡片边缘硬切。`0 0 Npx` 纯色光晕能过 `shadow-light-source.test.ts`，但与 VAR `:283-284` 记录的取向（`0 0` 全向辉光 = 没有光源）和页面级审计口径（x>0 && y>0）相悖；库内先例是 1:2 的同色投影（TxTabs、TxProgressBar）或独立的径向渐变/模糊层（现有 `__glow`、TxTabs `::before`），后者不属于 box-shadow。
8. **hover 与降级**：浮起用 `transform`，光晕增强用光晕层 `opacity`；hover 不过渡 `color/background-color/border-color`（根上的 `border-color` 保持即时）；不用 `--tx-ease-spring`（过冲只给"到达"类元素）；reduced-motion 下关闭过渡、取消浮起，光晕增强可即时生效；若有挂载淡入动画，降级时保留终态。
9. **材质细节的规则约束**：徽章边缘用 inset ring 而非 border（固定尺寸 + 有光晕）；内高光可用 `inset 0 1px 0 color-mix(in srgb, var(--tx-color-white, #fff) N%, transparent)`；所有颜色来自 token 或对 token/`currentColor` 的 `color-mix`（不写 hex / 裸 rgba / `white` 关键字）；"实底语义色 + 白色字形"是库内不支持的组合（DR `:113-123`），色调底 + 同色相（或渐变）字形与现有配方一致；内部若有内板需同心圆角。
10. **progress 变体**：继续由环承载图标、不渲染徽章；环色与环心图标色固定 primary、忽略宿主颜色类（`:470`、`:507-510`）——若希望徽章与环"同一视觉家族"，环的取色是一个相关但独立的问题（N6 的三色卡现在都是 primary）。几何可直接复用 `right:18px / 72px / top:50% + translateY(-50%)`（目前是字面量，分散在 `:465-468`）。
11. **文档同步清单**：中英 `stat-card.mdc` 的 `:16`、`:215`、`:225`、`:252-258`（CSS 变量表，`--tx-stat-card-icon-opacity(-hover)` 若不再读取需删除并在变更记录里注明）、`:262-264`、`:272`（被否决方案一条与新方向冲突，需重写并记录水印方案被替换的理由）、`:275`、`:279`，外加一条带日期的"视觉契约变更"；画廊 CSS 注释 `DocsComponentsGallery.css:294-295`；用户可见改动按规则配 demo（demo-registry 字母序 + 中英 wrapper 块）。
12. **体积门禁**：整包 CSS 余量约 1.9 KiB、按需 CSS 余量约 1.1 KiB；stat-card 现有水印 + 柔光规则约 1.4 KB，替换而非叠加可基本持平。并行任务（jelly indicator、tabs 重做、未跟踪的 `fusion-surface` 新组件）会争用同一余量。
13. **验证路径**：nexus（:3200）经 `packages/tuffex/dist` 解析，需在 `/tmp/tuffex-build.lock` 锁内、关闭 verify-deps 重建 dist（`tuffex-docs-sync.md:114-129`），必要时重启 dev 并核对 `data-v-*`；core-app dev 直接读源码。上一任务的验收口径：core-app 同款传参（`i-ri-* text-6xl text-[var(--tx-color-*)]`）的渲染抽查、亮暗主题截图。
14. **历史约束**：上一任务 R6.2 要求"core-app 6 处卡片保持大号彩色图标的气质"（`09-23-nexus-base-gallery-sidebar/prd.md:62`），R6.3 要求 props / slots / events 不变、progress 与 core-app 6 处照常渲染（`:63`）；设计稿当时把"右上角小号着色徽章"记为被否决方案（`design.md` §4.1 / 文档 `:272`）。新方向是 72px 右侧居中的大徽章，需要在文档里说明它与被否决方案的区别。

---

## Files Found

| File Path | Description |
|---|---|
| `packages/tuffex/packages/components/src/stat-card/src/TxStatCard.vue` | 组件本体（模板 / 取色脚本 / 全部样式） |
| `packages/tuffex/packages/components/src/stat-card/src/types.ts` | `StatCardProps` / `StatCardInsight` / `StatCardVariant` |
| `packages/tuffex/packages/components/src/stat-card/__tests__/stat-card.test.ts` | 11 个单测，含 3 条源码正则契约 |
| `packages/tuffex/dist/es/stat-card/style.css` | 编译产物 5459 B |
| `apps/core-app/src/renderer/src/components/plugin/tabs/PluginFeatures.vue` | C1–C2 |
| `apps/core-app/src/renderer/src/components/plugin/tabs/PluginStorage.vue` | C3–C6 |
| `apps/nexus/app/components/docs/DocsComponentsGallery.vue` / `.css` | 画廊格 N1 与 `.docs-gallery__stat-icon` |
| `apps/nexus/app/components/content/demos/StatCard{Default,Insight,Progress}VariantDemo.vue` | 文档 demo N2–N5 |
| `apps/nexus/app/components/content/demos/{ComponentsOperationsStatusDemo,TemplateDashboardDemo,TemplateShellDemo}.vue` | N6–N8 |
| `apps/nexus/app/components/dashboard/provider-registry/ProviderRegistryAdminPanel.vue` | N9 |
| `apps/nexus/app/pages/dashboard/overview.vue` | N10 |
| `apps/nexus/content/docs/dev/components/stat-card.{zh,en}.mdc` | 需改写的文档页 |
| `apps/nexus/app/components/content/demo-registry.ts` | demo 登记 |
| `apps/core-app/uno.config.ts`、`apps/nexus/uno.config.ts`、`apps/nexus/app/plugins/unocss-icons.client.ts` | 图标类生成与加载方式 |
| `packages/tuffex/packages/components/style/variables.scss`、`style/index.scss` | 光源/阴影/缓动/颜色 token；`.fake-background` |
| `packages/tuffex/packages/components/src/__tests__/shadow-light-source.test.ts` | 阴影光源守卫 |
| `packages/tuffex/scripts/audit-package-size.mjs` | CSS 体积门禁 |
| `packages/tuffex/packages/components/src/{icon-chip,gradient-border,border-beam,thinking-orb,glow-text,mode-chip,tabs,avatar,dialog,progress-bar,slider}/src/*.vue` | §5 引用的原语与配方 |

## Related Specs

- `.trellis/spec/frontend/tuffex-design-rules.md` —— 字号/字重、ring vs border、同心圆角、token 颜色、白字实底禁用、hover 不过渡颜色、reduced-motion、卡中卡。
- `.trellis/spec/frontend/tuffex-docs-sync.md` —— 文档改写范围、否决方案记录位置、demo 三件套、图标类在 nexus 不可见、dist 重建与 :3200 陷阱。
- `.trellis/spec/frontend/index.md` —— 硬规则汇总（`:84`、`:87`）。
- `.trellis/spec/frontend/component-guidelines.md` —— One writer per CSS custom property（`:131`）、暗色语义色（`:165`）、阴影跟随圆角（`:128`）。
- `.trellis/spec/frontend/bui-component-family.md` —— BUI 调色板独立、BUI 组件不挂 `.fake-background`。
- `.trellis/tasks/09-23-nexus-base-gallery-sidebar/{prd,design,implement}.md` —— R6/R9 的决定与验收口径。

## External References（未在本次会话抓取，仅供查阅）

- UnoCSS Icons preset —— https://unocss.dev/presets/icons （`mode: auto/mask/bg`、`scale`、`extraProperties`；本地以 66.7.5 源码与实际生成产物为准）
- MDN `mask` —— https://developer.mozilla.org/en-US/docs/Web/CSS/mask
- MDN `radial-gradient()`（未写尺寸时默认 `farthest-corner`）—— https://developer.mozilla.org/en-US/docs/Web/CSS/gradient/radial-gradient

## Caveats / Not Found

- core-app 卡片宽度是按常量推算的（窗口 1100、侧栏 260/84/104、aside 304），未扣 PluginInfo 内边距、未在运行中的应用里实测。
- 渐变墨色、`mask-image` 回退守卫、nexus 首帧方块都是基于 CSS 语义与生成产物的推断，未做像素级渲染验证。
- nexus dashboard / admin 页的 StatCard 是否会在 SSR 阶段渲染（从而受图标层延迟加载影响）未核实。
- `TxTabs` 指示器配方引用的是 2026-09-25 的文件状态，并行任务 `09-25-tabs-indicator-redo` 可能改动它。
- 兄弟任务（`09-25-tuffex-jelly-indicator-polish` 及其子任务）的 PRD 目前均为模板占位（TBD），没有与本任务相关的约束。
