# Research: TxTabs 指示器重做 —— 消费方 / 单测契约 / 文档 / 画廊图标 / 规范 / 画廊变体写法

- **Query**：为把 `TxTabs` 指示器（`.tx-tabs__pointer` / `.tx-tabs__pointer-inner`，`applyPointerFor` 定位，`tx-tabs-pointer-{stretch,warp,glide,snap,spring}-{x,y}` 关键帧）迁到共享弹簧 + 果冻引擎做前置调研：①全部消费方及其指示器相关 props / 外部样式覆写；②`tabs.test.ts` 锁定了什么；③Nexus 文档与 demo 需要改的文字；④画廊 `TxTabItem` 图标不显示的具体原因；⑤适用的 tuffex 设计 / 文档规范；⑥画廊现有的「一格多变体」写法。末尾给出 Implications，并在 §7 对照 `prd.md` / `design.md` 中引用本文的判断。
- **Scope**：internal —— 源码、`.trellis/spec`、`git log`；另对正在运行的 Nexus dev（`[::1]:3200`，pid 24280，由另一会话启动；本次只读，未重启）做了实测：`curl` 取 UnoCSS 虚拟样式表，ego TaskSpace 33 量计算样式与 CSS 动画（已 `finish({ keep: [] })`）。
- **Date**：2026-09-26（实测于 2026-09-25 23:40–23:58）
- **基线**：在 `packages/tuffex` 下 `node <vitest 3.2.7> run --project components packages/components/src/tabs/__tests__/tabs.test.ts` → 16/16 通过。`tabs/` 目录无未提交改动，最近一次改动 `5a3a38d3a`（2026-09-12）。Nexus dev 通过 `dist` 解析 tuffex（§「验证注意」），实测到的类名 / 行内样式与源码逻辑一致。

---

## 0. 现状速览（`tabs/src/TxTabs.vue`，1441 行，render 函数组件）

| 位置 | 内容 |
|---|---|
| `:9`, `:11-38` | 默认插槽只收 `type.name ∈ {TxTabItem, TxTabItemGroup, TxTabHeader}` 的 vnode（Fragment 会展开） |
| `:63-82` | props：`offset`(67) `borderless`(72) `autoHeight`(73) `autoWidth`(74) `showIndicator`(75, true) `indicatorVariant`(76, 'line') `indicatorMotion`(77, 'stretch') `indicatorMotionStrength`(78, 1) `animation`(81) |
| `:88` | `indicatorRevealed` ref，决定根类 pending / visible |
| `:97-115` | variant / motion 非法值回落 `line` / `stretch`；strength 取 `Math.max(0, …)` |
| `:151-172` | `animationIndicator` 默认 `{ enabled: true, durationMs: 350, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }` |
| `:197-228`（`:216-217`） | `animation.content.durationRatio` = **指示器** `durationMs × ratio` |
| `:294-304` | `pointerElRef` / `pointerInnerElRef` / `navInnerElRef`、`pointerAnimTimer`、`lastPointerPosition` |
| `:321-328` | 激活项通过 `navInner.querySelector('.tx-tab-item.is-active')` 查找 |
| `:330-376` | ResizeObserver 观察内容根 + nav-inner → rAF → `nextTick` → `syncPointerToActive({ reveal: false, animate: false })` |
| `:378-408` | `playPointerAnim`：给 inner 加 `tx-tabs__pointer--motion-{motion}-{x\|y}`，按方向写 `transform-origin`，强制回流，`setTimeout(Math.max(120, durationMs))` 后移除该类并加 `tx-tabs__pointer--glow` |
| `:410-510` | `applyPointerFor`：读 rect（417-418）→ 揭示（421-434）→ 写 `opacity`（436）→ 清空再写 `width/height`（438 起）→ 各变体几何（445-496）→ 写 `transform: translate3d()`（498）→ 算方向（500-506）→ `animate` 时 `playPointerAnim`（508-509） |
| `:525-573` | 方向键 / Home / End：`setActive` + 聚焦，**不调用** `applyPointerFor` |
| `:584-599` | 点击：`runAutoHeight(setActive)` → `nextTick` → `applyPointerFor(tab, { reveal: true, animate: animationIndicator.enabled })`（593） |
| `:690-709` | `modelValue` watcher：仅当 `activeName !== val` 时 `syncPointerToActive({ reveal: indicatorRevealed, animate: indicatorRevealed && enabled })` |
| `:731-741` | 未揭示时的首次同步（`reveal:false, animate:false`） |
| `:748-762`, `:833` | 指示器 DOM：`div.tx-tabs__pointer > div.tx-tabs__pointer-inner`，放在 nav-inner 里所有 tab 之后；vnode **没有** `style` 绑定（全部命令式写入） |
| `:858-884` | 根类 `tx-tabs--{placement}` / `--indicator-{variant}` / `--motion-{motion}` / `--content-{type}`，以及 `--indicator-hidden/pending/visible/anim`、`--nav-anim`、`--content-anim`；行内变量 `--tx-tabs-indicator-duration/-easing/-strength`、`--tx-tabs-content-*`、`--tx-tabs-nav-*` |

各变体几何（`:445-496`；坐标系 = nav-inner 的 padding box，含 `scrollLeft/Top`）：

| 变体 | 水平（top / bottom） | 竖直（left / right） |
|---|---|---|
| `line`（3px）/ `pill`（6px） | x = L + 0.2W + offset，w = 0.6W；y = bottom ? 0 : navInnerH − 厚度 | x = right ? navInnerW − 厚度 : 0；y = T + 0.2H + offset，h = 0.6H |
| `dot`（8×8） | x = L + W/2 − 4；y = bottom ? 8 : navInnerH − 16 | x = right ? navInnerW − 16 : 8；y = T + H/2 − 4 |
| `block` / `outline` | 项盒子 L/T/W/H | 项盒子 |

画面（CSS）：`:990-1001` 指示器底（默认 `width:3px`、`opacity:0`、`will-change` 含 top/left/…）；`:1003-1015` inner 主色渐变 + `1px 2px 8px` 阴影 + 1px ring；`:1017-1031` `::before` 光晕（有 `--glow` 时 `opacity .42`，1s 过渡）；`:1039-1048` pill（竖向 6px 宽 / 横向 6px 高）；`:1050-1054` dot；`:1056-1062` 与 `:1079-1088` block（后者覆盖前者：18% 主色 + inset ring + `3px 6px 18px`）；`:1064-1071` outline（1.5px **border**）；`:1073-1077` 只有 block / outline 会把激活项的 `--fake-color` 清成透明；`:1090-1148` 十个 motion 类；`:1150-1214` 十个 `@keyframes`；`:1216-1221` `.tx-tabs--indicator-anim .tx-tabs__pointer` 过渡 `opacity/transform/width/height`；`:1267-1271` top/bottom 下指示器默认 `width:auto; height:3px`。整个文件**没有** `prefers-reduced-motion`。

`TxTabItem.vue`（107 行）：`:30-50` `<button class="tx-tab-item fake-background" role="tab" :aria-selected :tabindex="active ? 0 : -1">`；`:40-44` `<span class="tx-tab-item__icon"><slot name="icon"><i :class="iconClass" aria-hidden="true" /></slot></span>`；`:54-80` `display:flex`(57)、`gap:8px`(59)、`margin: 6px 8px`(61)、`padding: 8px 10px`(62)、`border-radius: 10px`(65)、`--fake-color: transparent; --fake-radius: 10px`(74-75)，hover `--fake-color: var(--tx-fill-color-light)`(77-79)；`:82-84` 激活 `--fake-color: var(--tx-fill-color)`；`:92-96` 图标 span 只有 `font-size:18px; line-height:1; color: secondary`，**没有 display**；`:102-106` 名称 13px、`--tx-text-color-primary`。

底色由全局工具类绘制：`packages/components/style/index.scss:7-35` `.fake-background::before { background: var(--fake-color, …); opacity: var(--fake-opacity, 0.75) !important; border-radius: var(--fake-radius, inherit) }`，`> * { position: relative; z-index: 1 }`；`:37-55`（及 `:86-88`）在 `html[data-tx-coloring='true']` / `html.coloring` 下给每个 `.fake-background` 加 `::after` 描边环，也就是每个 tab 项都会带环。

### 0.1 运行时实测（Nexus dev :3200，ego，暗色主题）

1. **双重高亮（已量）**：Tabs 文档页 9 个已挂载实例中，`line` / `pill` / `dot` 的激活项 `::before` 为 `rgb(48,48,48)`、`opacity .75`（暗色 `--tx-fill-color: #303030`，`variables.scss:445`），同时指示器可见；`block` / `outline` 的激活项底色为透明 / 0。画廊 Tabs 格子（line）同样：激活项有底色，下面还有一条 `40.4×3` 的线。
2. **首次落位实际会滑入（已量，与文档 / 注释相反）**：用 `Animation.setPlaybackRate(0.02)` 放慢后刷新页面，不点击时 9 个实例的 `.tx-tabs__pointer` 都在跑 `CSSTransition`：`opacity 0 → 1`，`transform translateZ(0px) → translate3d(目标)`（从 nav-inner 左上角滑到落点）；`block` / `outline` / `dot`（top 放置）还有 `height 3px → 目标`。原因：`reveal` / `animate:false` 只管关键帧类，`.tx-tabs--indicator-anim .tx-tabs__pointer` 的 CSS 过渡（`:1216-1221`）始终生效，过渡起点就是样式表默认值。这与 `TxTabs.vue:424-433` 的注释以及文档 `tabs.{en,zh}.mdc:640`「appears in place rather than sliding in from the nav's edge」不符。
3. **挂载时关键帧也会播（已量，7/9）**：同一次刷新中，7 个 `v-model` 实例的 inner 在跑 `tx-tabs-pointer-stretch-{x|y}`。推断的代码路径：`modelValue` watcher（`:690-709`，immediate）的回调要等 `runAutoHeight().then → nextTick` 之后才读取 `indicatorRevealed`，这时 `:731-741` 已完成揭示，于是 `animate: true`。
4. **同尺寸重测不会重启过渡（已量）**：改动 nav-inner 尺寸触发 ResizeObserver 路径后，CDP 只看到 `animationCreated` 与紧随其后的 `animationCanceled` 成对出现（3 对），没有可见的重播。
5. **键盘切换不播关键帧（代码推断，未实测）**：`handleTablistKeydown` 只调 `setActive`；随后 `modelValue` watcher 因 `activeName === val` 跳过。指示器是靠内容根换 key → `:352-376` 重建 ResizeObserver → `scheduleLayoutRefresh` → `animate:false` 跟过去的：CSS 过渡仍在，所以会滑动，但没有 motion 关键帧。
6. **motion 关键帧被计时器截断（代码）**：CSS 时长分别是 `duration + 170ms`（warp）、`+120`（glide）、`+90`（snap）、`+220`（spring）（`:1102-1148`），而 `:401-407` 在 `max(120, durationMs)` 就移除该类，只有 `stretch`（时长恰为 `duration`）能完整播完。
7. **没有缩放归一化（代码）**：几何直接取 `getBoundingClientRect` 差值（`:417-418`、`:446-447`、`:472-473`）；`packages/utils/use-indicator-box.ts:79-89` 则用 `rect.width / offsetWidth` 做了归一化。在放慢时间轴的那次刷新里，变体 demo 5 个实例的首测目标恰好是稳定值的 2 倍（如 `(43.475, 106)` 对 `(21.7375, 53)`），符合「测量时某个祖先带 transform」；具体是哪个祖先没有定位。

---

## 1. 消费方清单

检索范围：`apps/core-app/src`、`apps/nexus/app`、`apps/nexus/content`、`plugins/`、`packages/*`（排除 node_modules / dist / .nuxt / .output）。PascalCase、kebab-case、`Tabs` / `TabItem` 别名导入都搜过。**plugins/ 零使用**；packages 内除 tabs 自身外没有渲染使用，也没有 tuffex 组件从 `../../tabs` 导入（即无包装组件）；其它耦合见 §1.5。下表由脚本解析多行开标签得到。

图例：plc = placement；var = indicatorVariant（空 = 默认 line）；mot = indicatorMotion（空 = 默认 stretch）。**没有任何消费方传 `indicatorMotionStrength` 或 `offset`**，也没有人传 `autoHeightDurationMs` / `autoHeightEasing`。

### 1.1 core-app（6 处）

| 文件:行 | plc | var | mot | showIndicator | borderless | animation | auto* | nav-right | 图标 / 备注 |
|---|---|---|---|---|---|---|---|---|---|
| `renderer/src/components/base/TuffUserInfo.vue:218` | top | – | – | – | ✓ | `{ indicator: { durationMs: 500 } }` | – | – | `#name` 插槽；`contentScrollable` true |
| `renderer/src/components/download/DownloadCenterView.vue:395` | top | – | – | – | – | – | – | – | 5 项；覆写见 §1.4 |
| `renderer/src/components/plugin/PluginInfo.vue:698` | top | – | – | **false** | ✓ | – | – | – | 7 项都带 `icon-class="i-ri-*"`（705-733） |
| `renderer/src/components/plugin/tabs/PluginFeatureDetailCard.vue:396` | top | – | – | – | ✓ | `{ indicator: { durationMs: 800 } }` | – | ✓（关闭按钮，405-415） | `contentScrollable=false`；nav 覆写多 |
| `renderer/src/views/base/LingPan.vue:693` | top | – | – | – | – | – | – | – | 自己画下划线，见 §1.4 |
| `renderer/src/views/base/home/HomeSidePanel.vue:52` | top | `line`（显式） | – | – | – | `{ size: false, content: true }` | – | – | `#name` 内带计数 |

core-app 的 3 个测试（`components/base/user-identity-presentation.test.ts:150-158`、`components/plugin/PluginInfo.deep-link.test.ts:36-45`、`PluginInfo.uninstall-disposition.test.ts:74-84`）把 `TxTabs` / `TxTabItem` 整个 stub 掉，不锁任何内部结构。

### 1.2 Nexus 页面 / 仪表盘（4 处）

| 文件:行 | plc | var | mot | borderless | animation | 其它 |
|---|---|---|---|---|---|---|
| `components/dashboard/provider-registry/ProviderRegistryAdminPanel.vue:620` | top | – | – | – | – | 4 项 `icon-class="i-carbon-*"`（621/841/1029/1145）；`contentScrollable=false` |
| `pages/dashboard/account.vue:588` | top | – | – | ✓ | – | `class="h-auto"`；`contentScrollable=false` |
| `pages/dashboard/team.vue:673` | top | – | – | – | – | 3 项 `icon-class`（674/751/796）；`contentScrollable=false` |
| `pages/store.vue:589` | top | **`pill`** | – | ✓ | – | `LazyTxTabs` / `LazyTxTabItem`（`defineAsyncComponent`，33-34）；4 项 `icon-class`；见 §1.5「注意」 |

### 1.3 Nexus 文档 demo 与画廊（13 处）

| 文件:行 | plc | var | mot | showInd | borderless | animation | auto* | nav-right | 图标 / 备注 |
|---|---|---|---|---|---|---|---|---|---|
| `demos/TabsTabsDemo.vue:46` | left（默认） | – | – | – | – | – | – | – | `i-carbon-settings/user/information`（47/57/67） |
| `demos/TabsIndicatorVariantsMotionsDemo.vue:140` | top | 循环 5 种 | TuffSelect 选 5 种 | 开关 | – | `{ indicator: { durationMs: 350 }, content: { type, durationRatio: 0.5 } }` | – | – | 5 个 TxTabs 纵向排列 + 工具条（motion / content / indicator on-off / Next） |
| `demos/TabsDynamicContentManualDemo.vue:96` | left | – | – | – | – | `{ size: { enabled, 260, 'ease' } }` | autoWidth | – | `i-carbon-dashboard/list/settings` |
| `demos/TabsPlacementHeaderSlotDemo.vue:56` | top | – | – | – | – | `{ indicator: { durationMs: 220, easing: 'ease' } }` | autoWidth | ✓ | 含 `TxTabHeader` |
| `demos/TabsPlacementHeaderSlotDemo.vue:95` | right | – | – | – | – | – | – | – | `i-carbon-settings/user` |
| `demos/TabsAutoSizeContentScrollableFalseDemo.vue:36` | left | – | – | – | – | `{ size: { enabled, 260, 'ease' } }` | – | – | – |
| `demos/TabsDisableAnimationsDemo.vue:40` | bottom | – | – | – | – | `{ indicator: false, content: false }` | – | – | en 标签名叫 `Left1..3`，placement 却是 bottom |
| `demos/ComponentsNavigationShellDemo.vue:140` | left | **`pill`** | `glide` | – | – | `{ size: { enabled, 220 }, content: true }` | autoHeight | – | `navMinWidth 176`；`i-carbon-dashboard/rocket/security`；嵌在 tabs / drawer / dropdown-menu / popover / tuffex-composition 五个页面（zh+en） |
| `demos/TemplateResearchDemo.vue:1461` | top | – | – | – | ✓ | `tabsAnimation`（905-907：reduced → 全 false，否则 undefined） | – | – | `:key="generation"` |
| `demos/TemplateSettingsDemo.vue:579` | left / 窄屏 top | **`block`** | `glide` | – | ✓ | `tabsAnimation`（563-565：reduced → 全 false） | – | ✓ | `TxTabItemGroup` ×3、`TxTabHeader`；`icon-class` 取自 `PAGE_ICONS`（236-243，含 `i-carbon-settings`） |
| `demos/TemplateShellConsoleDemo.vue:1335` | top | `line`（显式） | – | – | ✓ | `tabsAnimation`（1109-1111：reduced → 全 false，否则 `{ content: { type: 'fade' } }`） | – | ✓ | `TxTabHeader`；`:disabled="!isOwner"` |
| `demos/TemplateStoreDemo.vue:2719` | top | **`pill`** | – | – | ✓ | `tabsAnimation`（2259-2261：reduced → 全 false） | – | – | – |
| `docs/DocsComponentsGallery.vue:2213` | top | – | – | – | – | – | – | – | `icon-class="i-carbon-settings"`（2217）/ `"i-carbon-rocket"`（2222）；`:activation="true"`（注释 2214-2216） |

`TxTabItem` 自带的 `#icon` 插槽没有任何消费方使用（grep 到的 `<template #icon>` 都是面板内容里其它组件的插槽）。

### 1.4 外部样式对 TxTabs 内部的覆写（全部是 scoped `:deep()`）

| 文件:行 | 选择器 → 声明 | 与本次重做的关系 |
|---|---|---|
| `core-app/.../LingPan.vue:1189-1195` | `.debug-tabs :deep(.tx-tabs__nav)`：背景 `#111`、1px 边框、padding | nav 外观 |
| `LingPan.vue:1197-1199` | `:deep(.tx-tabs__nav-bar)` 透明 | – |
| `LingPan.vue:1201-1212` | `:deep(.tx-tab-item)`：`margin:0; border-radius:0; border-bottom: 2px solid transparent; --fake-color: transparent`，等宽字体，`padding: .75rem 1rem` | **自己画激活下划线**（下一行），而 TxTabs 默认的 `line` 指示器仍然开着，于是同时有两条下划线 |
| `LingPan.vue:1214-1225` | `:deep(.tx-tab-item:hover)`；`:deep(.tx-tab-item.is-active)` `border-bottom-color:#fff`；`:deep(.tx-tab-item__name)` `color: inherit` | 依赖 `.tx-tab-item`、`.is-active`、`__name` 类名，以及名称继承颜色 |
| `LingPan.vue:1227-1229`，`DownloadCenterView.vue:582-586`，`HomeSidePanel.vue:196-200` | `__content-wrapper` / `__content-scroll` 的内边距与 flex | 与指示器无关 |
| `core-app/.../PluginFeatureDetailCard.vue:1006-1075` | `.tx-tabs`、`__auto-sizer(> *)`、`__main`、`__select-slot`、`__content-wrapper` 布局；`__nav`（1052-1059：`margin: 0 0 16px`、sticky、`border-bottom: 1px solid var(--tx-border-color-lighter)`）；`__nav-bar`（1061-1064：**`min-height: 64px`**、`space-between`）；`__nav-inner`（1066-1070：`flex: 0 1 auto; padding: 8px 16px`）；`__nav-extra` | nav-bar 比 nav-inner 高时，nav-inner 在 bar 里垂直居中（`TxTabs.vue:946-950`），指示器所在的「nav-inner 底边」就不等于分隔线 |
| `nexus/.../TemplateShellConsoleDemo.css:376-379`, `:381-383` | `.console__tabs :deep(.tx-tabs__nav)` 底边色、背景；`__nav-inner` padding | – |
| `TemplateShellConsoleDemo.css:385-394` | 注释「An underline nav: the line indicator marks the page, so the active tab drops the filled block the component gives it.」→ `:deep(.tx-tab-item)` `margin: 0 2px; padding: 12px 8px`；`:deep(.tx-tab-item.is-active)` **`--fake-color: transparent`** | 这就是消费方在手动消掉双重高亮 |
| `TemplateShellConsoleDemo.css:396-405` | 激活 `__name` 字重 600；`__name` inline-flex | – |
| `TemplateShellConsoleDemo.css:416-447`、`1080-1082`、`1149-1155` | `__nav-extra`、`__content-wrapper/-scroll`、`:deep(.tx-tab-header)` 的 `--fake-color/--fake-opacity` + inset 阴影、各断点下 nav-inner 的 padding | – |
| `TemplateSettingsDemo.vue:995-1017` | `__nav` 背景 + `inset -1px 0 0` 线；`__nav-inner` `padding-top: 6px`；`__group-name`；`:deep(.tx-tab-item)` `margin: 2px 8px; padding: 7px 10px`；`:deep(.tx-tab-item__icon)` **`font-size: 16px`** | 项盒子 / 图标尺寸 |
| `TemplateSettingsDemo.vue:1034-1037` | `:deep(.tx-tab-header)` `--fake-color`、`--fake-opacity: 1` | – |
| `TemplateSettingsDemo.vue:1413-1439`（窄屏容器查询） | 注释「On top, TxTabs draws its own bottom border (the borderless rule only clears the side one)」；`__nav` 底边色、`__group { display: contents }`、隐藏 `__group-name`、`__nav-inner` padding、`.tx-tab-item { flex: none; margin: 4px 2px }` | 证实 `borderless` 在 top 放置下仍保留底边（`TxTabs.vue:910-912` 被后面的 `:1241-1243` 覆盖） |
| `TemplateResearchDemo.vue:1985-2003` | `__nav` inset 底线；`__nav-inner` `padding: 4px 6px`；`.tx-tab-item` `margin: 4px 2px; padding: 6px 10px`；`__name` inline-flex、12.5px | 项盒子 |
| `TemplateResearchDemo.vue:1105`、`TemplateShellConsoleDemo.vue:807` | 脚本里 `closest` / `querySelector('.tx-tabs__content-scroll')` | 类名依赖（与指示器无关） |
| `TemplateStoreDemo.css:825-827` | `.store-detail__tabs :deep(.tx-tabs__nav-inner) { padding: 4px 0 }` | – |

**没有任何**外部样式或脚本命中 `.tx-tabs__pointer`、`.tx-tabs__pointer-inner`、`tx-tabs__pointer--motion-*`、`tx-tabs__pointer--glow`、`.tx-tabs--indicator-*`、`.tx-tabs--motion-*`、`tx-tabs--indicator-anim`（只有 `tabs.test.ts` 断言根类，见 §2）。`tx-tabs--motion-*` 在 `TxTabs.vue` 里也没有任何 CSS 规则读取，只是输出后被测试断言。

### 1.5 变体分布与其它耦合

- **`pill` 使用者**：`pages/store.vue:595`（**线上商店详情页**，top）、`ComponentsNavigationShellDemo.vue:145`（left，嵌在 5 个文档页）、`TemplateStoreDemo.vue:2726`（top）、`TabsIndicatorVariantsMotionsDemo`（循环）。文档代码片段：`drawer/dropdown-menu/popover.{en,zh}.mdc:337/219/212`、`getting-started/tuffex-composition.{en,zh}.mdc:273`（均为 `placement="left"`）、`template-store.{en,zh}.mdc:62`、`tabs.{en,zh}.mdc:500`（NavigationShell 片段）。core-app 没有人用 `pill`。
- **`block`**：只有 `TemplateSettingsDemo` 和变体 demo。**`dot` / `outline`**：只有变体 demo。
- **默认 `line` 且激活底色生效**：core-app 5 处（PluginInfo 除外），Nexus 的 ProviderRegistry / account / team / TemplateResearch / 画廊 / 5 个 Tabs demo；显式 `line`：HomeSidePanel、TemplateShellConsole。
- **`indicatorMotion` 使用者**：`glide` 两处（NavigationShell、TemplateSettings），另加变体 demo。
- **`animation.indicator`**：`durationMs` 500（TuffUserInfo）、800（PluginFeatureDetailCard）、350（变体 demo）、220 + `easing:'ease'`（PlacementHeaderSlot）；`false`：DisableAnimations demo，以及 4 个 Template demo 的 reduced-motion 分支。组件自身不处理 reduced-motion，所以它们自己兜底。
- `TxTabBar`：`tab-bar/src/types.ts:11-19` 注释「The names match `TxTabs`' `indicatorVariant` so the two read as one family」，其中 `pill` 是「raises a surface the way TxFlatRadio's thumb does」；文档 `tab-bar.{en,zh}.mdc:82` 同句。
- `packages/utils/use-indicator-box.ts:26-31` 注释「Mirrors `TxTabs`' `indicatorRevealed`」。
- `scripts/audit-interactive-cursor.mjs:61` 豁免 `'tabs'`（items are TxTabItem）。
- `TxRadioGroup` 也有 `indicatorVariant`，但词表不同：`'solid' | 'outline' | 'glass' | 'blur'`（`radio/src/types.ts:3`），另有 `stiffness` / `damping` / `elastic` props。它的指示器 `radio-group-indicator.ts` 使用 `utils/animation/jelly.ts` 的 `JELLY` / `jellyScale`，rAF 积分，**没有 reduced-motion 处理**。
- **注意（代码推断，未实测）**：`store.vue:34` 的 `LazyTxTabItem` 是 `defineAsyncComponent` 包装，vnode 的 `type.name` 为 `"AsyncComponentWrapper"`（`@vue/runtime-core@3.5.39` 的 cjs 构建 `:2698`），不在 `TxTabs.vue:9` 的白名单里，会被 `normalizeTabSlotNodes` 丢掉。`tabs.test.ts:198-232` 能通过，是因为它手动把包装的 `name` 改成了 `'TxTabItem'`。所以商店详情的 tab 条可能本来就渲染成「No tab selected」，拿它做抽查截图前先看一眼。

---

## 2. `tabs/__tests__/tabs.test.ts`（475 行，16 例）

公共夹具 `mountTabs`（`:36-68`）：`TxTabHeader` + `General`（`iconClass: 'i-general'`, `activation: true`）+ 分组 `Advanced`（`Network` 带图标、`Disabled` 禁用）+ `nav-right`；`TxAutoSizer` 被 stub（`:9-34`）。jsdom 下所有 rect 都是 0×0。

| 行 | 用例 | 与指示器相关的断言 | 改成 rAF 弹簧驱动后 |
|---|---|---|---|
| `:71-104` | renders activation tab, grouped nav items, header, and nav-right slot | 根类 `tx-tabs--indicator-pill`、`tx-tabs--motion-warp`、`tx-tabs--indicator-pending`、非 `-visible`；行内 `--tx-tabs-indicator-duration: 350ms`（88）、`--tx-tabs-indicator-easing: cubic-bezier(0.25, 0.46, 0.45, 0.94)`（89）、`--tx-tabs-indicator-strength: 0`（90，负数夹到 0）；`.tx-tabs__pointer` 存在（100） | 三个 CSS 变量断言只有在继续输出这些变量时才成立；根类与 `.tx-tabs__pointer` 保留原名即可 |
| `:106-133` | switches enabled tabs and blocks disabled tabs | 点击后为 `tx-tabs--indicator-visible`、非 pending（124-125），依赖点击路径的 `reveal: true` | 需要保留「点击即揭示」，否则 jsdom 0×0 下会一直 pending |
| `:135-144` | tablist / tabpanel semantics | 无 | 不变 |
| `:146-165` | controlled modelValue without emitting | 外部改 `modelValue` 后仍 pending、非 visible（163-164） | 需要保留「prop 驱动在还没量到尺寸时不揭示」 |
| `:167-196`、`:198-232`、`:234-268` | fragments / named async / grouped fragments | 无 | 不变 |
| `:270-287` | content animation variants and hidden indicator | `tx-tabs--indicator-hidden`、非 `tx-tabs--indicator-anim`（282）；`--tx-tabs-content-duration: 200ms`（284，= 指示器 400 × ratio 0.5）；没有 `.tx-tabs__pointer`（286） | `durationRatio` 仍要从 `animation.indicator.durationMs` 推导；若 `-anim` 类语义变了需改 |
| `:289-326` | normalizes invalid visual props, exposes AutoSizer | `tx-tabs--indicator-line`（307）、`tx-tabs--motion-stretch`（308）；`animation.indicator: false` 时无 `tx-tabs--indicator-anim`（310） | 同上 |
| `:328-339` | size unwrapped (#460) | 无 | 不变 |
| `:341-354` | one tab stop + aria-controls/labelledby | 无 | 不变 |
| `:356-384`、`:386-401`、`:403-433` | 方向键 / 竖向 Up-Down / 不依赖 `CSS` 全局 | 只断言 `aria-selected`，不看指示器 | 「键盘切换走引擎」需要新增断言 |
| `:441-464` | reveals the indicator on first layout | 打桩 `getBoundingClientRect` 为 80×32 → `.tx-tabs__pointer` 的 **`style.opacity === '1'`**（458），且非 pending（459） | 只要引擎继续在 `.tx-tabs__pointer` 上写行内 `opacity` 就兼容 |
| `:466-474` | keeps the indicator hidden while nothing has been laid out | 0×0 → **`style.opacity === '0'`**（473） | 同上 |

**没有任何测试覆盖**：指示器位置 / 尺寸（transform / width / height）、各变体几何、`offset`、motion 关键帧类与 `--glow`、计时器、首次落位是否有动画、键盘切换时指示器是否移动、reduced-motion、双重高亮、图标尺寸。测试里没有用 fake timers。

测试环境事实：
- `packages/tuffex/vitest.config.ts:9-17`：components 项目 `environment: 'jsdom'`，`setupFiles: ['./vitest.setup.ts']`。
- `vitest.setup.ts:1-19`：`matchMedia` 桩对**所有**查询都返回 `matches: false`。上方注释写的是「`prefers-reduced-motion: reduce` matches by default」，与代码不符。因此组件里读 reduced-motion 时默认是「允许动画」；要测 reduced 分支得自己覆盖这个桩（`slider/__tests__/slider.test.ts:546-548` 有写法）。
- `vitest.setup.ts:22-33`：`ResizeObserver` 桩永远不触发。
- rAF 弹簧的测试先例：`radio/__tests__/radio-group-indicator.test.ts:19-27` 用 `vi.useFakeTimers({ toFake: ['setTimeout','clearTimeout','requestAnimationFrame','cancelAnimationFrame','performance'] })`，给元素的 rect / `clientLeft/Top` 打桩，`advanceTimersByTime(32)` 之后断言行内 `translate3d(55px, 3px, 0)` / `width` / `height`（`:49-58`）。
- 全库守卫同样会扫到 TxTabs：`src/__tests__/shadow-light-source.test.ts`（阴影须 x:y ≈ 1:2，偏移 <2px 豁免；现有的 `1px 2px 8px`、`3px 6px 18px` 都合规）、`unscoped-deep-selectors.test.ts`（非 scoped 样式块里不许用 `:deep()`）。

---

## 3. Nexus 文档

`apps/nexus/content/docs/dev/components/tabs.en.mdc` 与 `tabs.zh.mdc` 各 668 行，下面的行号两边一致。

### 3.1 结构与 demo

| 行 | 小节 | demo | 展示内容 |
|---|---|---|---|
| 14-15 | Tabs | `TabsTabsDemo` | left、默认 line、三个带 `i-carbon-*` 图标的项（图标目前不可见，见 §4） |
| 63-66 | Indicator Showcase / Indicator variants & motions（zh 也是英文标题） | `TabsIndicatorVariantsMotionsDemo` | 5 个 top TxTabs（line / pill / block / dot / outline 各一），工具条切换 motion、内容动效、指示器开关、Next；代码片段 66-188 |
| 189-192 | 动态内容尺寸 | `TabsDynamicContentManualDemo` | left + autoWidth + 带图标 |
| 314-317 | 布局方向 | `TabsPlacementHeaderSlotDemo` | top（`indicator: { 220, 'ease' }`、TxTabHeader、nav-right）+ right（带图标） |
| 383-386 | 高度跟随内容 | `TabsAutoSizeContentScrollableFalseDemo` | left + size 动画 |
| 425-428 | 关闭动画（indicator/content） | `TabsDisableAnimationsDemo` | bottom，`{ indicator: false, content: false }` |
| 465-469 | 后台导航配置组合 | `ComponentsNavigationShellDemo` | left、`pill` + `glide`、autoHeight、带图标 |
| 524-531 | 最佳实践 | – | 没有与指示器相关的条目；528 行「Use `activation` for static uncontrolled examples」 |

Usage 部分没有描述变体 / 动效的正文，只有标题和 demo。

### 3.2 与指示器相关的 API 行（en 原文，zh 行号相同）

- 542 `offset`：「Extra indicator offset along the active-tab axis for `line` / `pill` indicators.」
- 550 `showIndicator`：「Render the animated active-tab pointer. Set to `false` for text-only navigation.」
- 551 `indicatorVariant`：「Indicator style; invalid values fall back to `line`.」
- 552 `indicatorMotion`：「Indicator **transition motion class**; invalid values fall back to `stretch`.」
- 553 `indicatorMotionStrength`：「Non-negative **CSS variable** controlling indicator **scale elasticity**; negative values clamp to `0`.」
- 554 `animation`；557 `animation.indicator`：默认「enabled, `350ms cubic-bezier(...)`」，说明「Enable and configure **pointer position/size transitions**.」
- 558 `animation.content`：「…`durationRatio` derives duration from indicator duration.」
- 590 `iconClass`：「Optional icon class rendered before the nav label.」；606 `icon` 插槽。

### 3.3 概述 / 技术实现 / 自定义

- 639：「`showIndicator=false` removes the pointer DOM and pointer animation work…」
- 640：「The indicator is visible from first paint … held at `opacity: 0` only until the active tab has a non-zero measurement, so it **appears in place rather than sliding in from the nav's edge**, and the root carries `tx-tabs--indicator-pending` for exactly that window.」与 §0.1-2 的实测不符。
- 644-655 技术实现：647 提到 `indicatorMotionStrength`；653 的 Verified coverage 列出了测试覆盖面。
- 657-668 自定义表：663 `--tx-fill-color` / `--tx-fill-color-light`「Active and hover nav item surfaces.」；664 `--tx-color-primary`「Indicator gradient, glow, outline…」；666 `--tx-tabs-indicator-duration/-easing/-strength`「Runtime variables generated from indicator animation props.」

### 3.4 其它提到 TxTabs 的页面

- `filter-chips.{en,zh}.mdc:150`（被否方案）：「porting `TxTabs`' pointer. That is an inline implementation inside a 900-line component covering line/pill/block/dot/outline × stretch/warp/glide/snap/spring plus vertical layout…」。TxTabs 改用共享引擎后这句会失真。
- `tab-bar.{en,zh}.mdc:82`：「The names match `TxTabs`' `indicatorVariant` so the two read as one family」，并把 `pill` 描述为凸起面。`tab-bar.zh.mdc:123` 另说 TxTabs 也用运行时对象声明 props（属实，`TxTabs.vue:63-82`）。
- 只作为代码片段出现、不含行为陈述：`ai-suite:109-117`、`drawer:309/337`、`dropdown-menu:191/219`、`popover:184/212`、`index:86`、`template-research:65`、`template-settings:41-76`、`template-shell:189`、`template-store:62/115`、`getting-started/tuffex-composition:34/254/273`（都是 en / zh 成对）。
- demo 注册：`apps/nexus/app/components/content/demo-registry.ts:100`（NavigationShell）、`:350-355`（6 个 Tabs demo）。

---

## 4. 画廊 TxTabItem 图标不显示的原因（已实测确认）

**结论**：不是 UnoCSS 没生成规则，而是 `<i>` 为 `display: inline`，宽高不生效，盒子是 0×0。

证据链：
1. 渲染：`TxTabItem.vue:40-44` 输出 `<span class="tx-tab-item__icon"><i class="i-carbon-settings" aria-hidden="true" /></span>`。span 是 `display:flex` 的 `.tx-tab-item`（`TxTabItem.vue:57`）的 flex 项，会被块化成 `block`，但它里面的 `<i>` 仍是行内元素；`.tx-tab-item__icon` 的样式（`:92-96`）没有设置 display。
2. 规则确实存在：Nexus 配置 `apps/nexus/uno.config.ts:23-34` 的 pipeline 包含 `.vue`，画廊文件本身就写着 `icon-class="i-carbon-settings"` / `"i-carbon-rocket"`（2217 / 2222），`TabsTabsDemo`、`TemplateSettingsDemo`（`PAGE_ICONS`）等也有。从运行中的 dev 取 `/_nuxt/__uno_icons.css`（图标层在挂载后单独加载，`app/plugins/unocss-icons.client.ts:13-19`），`:where(.i-carbon-settings)`、`:where(.i-carbon-rocket)`、`:where(.i-carbon-home)` 都在。
3. 规则里没有 display：`@unocss/preset-icons@66.7.5`（`dist/core-C6nnhdU8.mjs:258-316`）的 mask 模式只输出 `--un-icon`、`mask`、`mask-size`、`background-color: currentColor`、`color: inherit` 和宽高；`display` 只能通过 `extraProperties` 加，而 Nexus 只传了 `presetIcons({ scale: 1.2 })`（`uno.config.ts:130-132`），预检 `:94` 也只给 `[class^="i-"],[class*=" i-"]` 设宽高。实际生成的规则：`:where(.i-carbon-settings){--un-icon:url(…);-webkit-mask:var(--un-icon) no-repeat;mask:var(--un-icon) no-repeat;-webkit-mask-size:100% 100%;mask-size:100% 100%;background-color:currentColor;color:inherit;width:1.2em;height:1.2em;}`。
4. 计算样式（ego，base-suite 画廊）：`<i class="i-carbon-settings">` 为 `display: inline`，计算值 `width/height: 21.6px`，但 `getBoundingClientRect` 是 **0×0**；`--un-icon` 与 `mask-image` 都已生效。外层 span 为 `display:block`、0×0。临时改成 `display: inline-block` 后是 21.59×21.59。剩下的只有 `.tx-tab-item` 的 `gap: 8px`，也就是标签前那段空位。
5. 对照：同一文件里 `TxTabBar` 的 `i-carbon-home` 能显示，因为 `.tx-tab-bar__icon` 是 `display:flex`（`TxTabBar.vue:293-304`），`<i>` 成为 flex 项被块化，实测 `display:block`、22×24。
6. Tabs 文档页里 3 个带图标的实例（TabsTabsDemo、TabsDynamicContentManualDemo、PlacementHeaderSlot right）同样是 `display:inline`、0×0。

影响面：所有用 `iconClass` 的消费方都走同一条路径。Nexus：画廊、TabsTabsDemo、TabsDynamicContentManualDemo、TabsPlacementHeaderSlotDemo、ComponentsNavigationShellDemo、TemplateSettingsDemo、ProviderRegistryAdminPanel、team.vue、store.vue。core-app：PluginInfo（7 个 `i-ri-*`）——core-app 的 `presetIcons` 同样没有 `extraProperties`（`apps/core-app/uno.config.ts:139-145`），全局样式里也没有给 `<i>` / `i-*` 设 display 的规则；**这一点没有在 Electron 里实测**。

历史：自 `a6ba3b3f2`（2025-12-23 迁入）起，图标就包在块级容器里（当时是 `<div class="tx-tab-item__icon">`，后来改成 `span`）；两份 uno 配置的历史里从没出现过 `extraProperties` / `display`（`git log -S`）。

这和规范里那条「图标看不见」不是同一回事：`tuffex-docs-sync.md:98` 讲的是**图标类名写在 tuffex 内部**时（Nexus dev 走 dist，不扫描），规则根本不会生成，渲染成 `currentColor` 方块；这里类名写在 Nexus 文件里、规则已经生成，是布局导致的 0×0。

---

## 5. 适用规范（摘录）

`.trellis/spec/frontend/tuffex-design-rules.md`
- 颜色（`:101-107`）：「Every colour comes from a `--tx-*` token」；暗色填充只用 `-light-8/-9`。
- 墨色（`:125-127`）：13px 文字的静止色用 `--tx-text-color-regular`；`secondary` 只给图标或不关键的 12px 文字。（`TxTabItem` 现在名称用 primary、图标用 secondary。）
- 用 ring 不用 border（`:73-85`）：「A drop shadow and a border on the same element are mutually exclusive… Use the ring.」（现在的 `outline` 变体用的是 1.5px `border`，`TxTabs.vue:1068-1071`。）
- 同心圆角（`:87-91`）：两个圆角相距 ≤8px 时，`outer = inner + gap`。
- 动效（`:139-145`）：「Hover colour changes are immediate」，`color/background-color/border-color` 不进 hover 过渡。`:147-166`：状态切换可以缓动颜色，但过渡只挂在「正在变化」的类上。`:168-176`：「Every transition has a reduced-motion escape… Non-negotiable for any declared transition or animation. Keyframe animations additionally must keep the *final* state visible when motion is dropped」。
- 结构：`:209-211` 语义控件；`:213-215`「Icons align optically with the first line of text」。
- 验证（`:244-249`）：`audit:vocab`、`audit:cursor`、`shadow-light-source.test.ts`。

`.trellis/spec/frontend/component-guidelines.md`
- `:147-151` 命令式样式的归属：「If a value comes from a layout pass (floating-ui, ResizeObserver, measurement), the imperative side owns it; the template never binds that name.」（现在 `.tx-tabs__pointer` 的 vnode 没有 style 绑定，`TxTabs.vue:748-762`。）
- `:153-163`「State motion: compile the spring, do not keyframe the bounce」：多段 `@keyframes` 每段各带回弹 bezier，会在每个关键帧边界反向，「the structure is the defect」；弹簧用 `liquid/src/spring.ts` 的 `resolveTransition`；目标是「one visible reversal and 2–5 % overshoot」；「Give hover its own shorter, non-overshooting clock」。对照现状：TxTabs 的 `warp`（4 段，`cubic-bezier(0.2, 1.3, 0.2, 1)`）、`spring`（5 段，`cubic-bezier(0.34, 1.56, 0.64, 1)`）、`snap`（3 段，`cubic-bezier(0.3, 1.1, 0.3, 1)`）正是这种结构；`stretch`、`glide` 的 bezier 不越界。

`.trellis/spec/frontend/tuffex-text-motion.md:31-40`：弹簧编译器只有一个（`liquid/src/spring.ts`），「Do not reintroduce a second spring compiler」。（Radio 指示器用的是另一套：rAF 积分 + `utils/animation/jelly.ts` 常量，两者目前并存。）

`.trellis/spec/frontend/bui-component-family.md:26`：BUI 组件「never attach `.tx-card` / `.tx-base-surface` / `.fake-background` (the `data-tx-coloring` layer adds a second ring)」。TxTabItem 不属于 BUI，但它是 `.fake-background`，所以 coloring 模式下每项都带环（§0）。

`.trellis/spec/frontend/tuffex-docs-sync.md`
- `:15-31` 影响半径三步（自身页面、按导入路径找包装组件、按组件名找文档页）；`:37-44` 哪些小节会过时（用户可见改动要有自己的 demo 小节；Overview 管 DOM / 类名 / ARIA；技术实现管测试覆盖；CSS 变量表）；`:54-66` 条目按语义插入，不要追加在末尾；`:70-78` demo 三件套（demo SFC + `demo-registry.ts` 一行 + zh/en 各一个 `TuffDemoWrapper`）。
- `:89-99` 画廊规则（见 §6）。
- `:112-119`：Nexus 通过 `packages/tuffex/dist/` 解析 tuffex，改了源码要先在 `packages/tuffex` 跑 gulp 构建；构建后运行中的 dev 仍可能用旧模块 / 旧 `style-deps.json`，需比对 `data-v-*` 或重启；`:121-129` 是共享 :3200 的重启流程与锁；`:139-146` 渲染验证。

`.trellis/spec/frontend/index.md:84`：组件改动与文档同一提交；`:87`：视觉规则汇总。

---

## 6. 画廊「一格多变体」的现有写法

基础设施：
- `DocsComponentsGallery.vue:38-41`：所有 `<ClientOnly>` 其实是 `DocsGallerySpecimen.vue`——用 `generation` 作 key 的 FunctionalComponent 包住插槽，悬停 / 聚焦时右上角出现重置按钮（`:24-32`，`.docs-gallery__replay`，`i-carbon-renew`）。重置只重新挂载插槽，**画廊自己的 ref（如 `tabsActive`、`navTab`）不变**（`tuffex-docs-sync.md:93-94`）。
- 自驱动的 specimen 放在 `docs/gallery/*.vue`，在自己的 `onMounted` 里起循环：`gallery/use-gallery-loop.ts:20-34`（`useGalleryLoop(step, intervalMs, firstDelayMs)`，reduced-motion 下不运行；`prefersReducedMotion` 同文件导出，`:36`）。

现有模式（按与「Tabs 多变体」的接近程度排列）：
1. **并排 + 小标题**：`docs-gallery__row docs-gallery__row--loose` 里放若干 `docs-gallery__meter`（specimen + 12px 的 `docs-gallery__meter-text` 说明）。例：OutlineBorder `:3067-3112`（4 个变体，注释解释了为什么并排）、TuffLogoStroke `:3166-3185`（`v-for mode in logoModes`）、SignalMeter `:3904-3920`、`gallery/GalleryTransitionLanes.vue:20-30`（3 个 preset 并排并自动循环）。CSS 见 `DocsComponentsGallery.css:136-146`、`:602-612`。
2. **纵向堆叠多个实例**：`docs-gallery__stack docs-gallery__stack--center`。例：Radio `:1228-1256`（button + standard 两组）、FlatRadio `:1593-1628`（三种尺寸 / 带图标 / 多选）、TabBar `:2188-2205`（`docs-gallery__framed docs-gallery__chrome` 框内上下两条 TabBar：默认与 `indicator="line"`）。
3. **自驱动循环**：`GalleryFusion`（`:2942`）、`GalleryTransitionLanes`（`:3158`）、`GalleryLiquidMenu`（`:3059`）。
4. **格内操作按钮**：`GalleryTextMorph`（`:3144`；挂载后自动走一步，之后等格内的「Next」`TxButton`，因为 `aria-live` 不能循环）；ModeChip `:3354-3370`（点击 specimen 本身切换状态）。

**没有先例**：画廊里没有「格内放分段控件去切换 specimen 的 `variant`」的写法（Radio / FlatRadio 格子里它们本身是被展示的对象，不是切换器）。最接近的是 Tabs 文档 demo `TabsIndicatorVariantsMotionsDemo` 的工具条（`TuffSelect` + `TxButton`，`:81-125`），但它不在画廊里。

当前 Tabs 格子与几何约束：
- `:2206-2235`：`<TxTabs v-model="tabsActive" placement="top">`，两项；`tabsActive = ref('')`（`:458`）。注释（`:2214-2216`）说明必须写 `:activation="true"`：TxTabs 从原始 vnode props 读取 `activation`，简写得到空串，被当成 false（`TxTabs.vue:639`）。
- `.docs-gallery__tabs { height: 150px }`（`DocsComponentsGallery.css:306-311`；注释：默认 left + navMinWidth 220 会把面板挤到 20px，所以改成 top）。
- `.docs-gallery__block { width: min(320px, 100%) }`（`:482-490`）；stage 为 `min-height: 236px; padding: 56px 28px 40px`（`:114-120`）；标签绝对定位在左上（`:95-106`，top 16 / left 20）；重置按钮绝对定位在右上、28×28（`:700-723`），悬停 / 聚焦才显示；网格两列，≤640px 变单列（`:79-81`、`:644-646`）。
- ego 当前 profile 下文档站是暗色主题（量到的都是暗色 token），亮色需要单独切换验证。

---

## 7. 对 `prd.md` / `design.md` 的核对

| 引用处 | 核对结果 |
|---|---|
| design `:13`「motion / glow 类名外部是否有依赖，以 research 为准」 | 没有外部依赖（§1.4），可以删 |
| design `:72`「仓库内用 `pill` 的只有 Nexus demo」 | **不准确**：还有线上页面 `pages/store.vue:595`，以及 5 个文档页（zh+en）里 `placement="left"` 的 pill 代码片段和 NavigationShell demo（§1.5） |
| design `:74`「外部若有样式直接改 `.tx-tabs__pointer` 的 transition」 | 没有 |
| PRD R4「根状态类保留，外部样式不失效」 | 外部没有样式使用 `tx-tabs--indicator-*` / `--motion-*`，只有测试断言（§2） |
| PRD R2 / design `:21` 键盘切换走动画 | 现在键盘路径不调用 `applyPointerFor`，`modelValue` watcher 也会因 `activeName === val` 跳过（§0.1-5），需要显式加调用 |
| design `:21` 首次测量不动画 | 现在首次落位实际会从左上角滑入并淡入（§0.1-2），`v-model` 实例挂载时还会播一次关键帧（§0.1-3）；设计里如果只留 `opacity` 过渡，首次仍会淡入 |
| PRD R1 去掉激活底色 | LingPan 仍会有两条下划线（自画的 `border-bottom` + 默认 line 指示器）；ShellConsole 的 `--fake-color: transparent` 会变冗余但无害；PluginInfo（`showIndicator=false`）保留底色 |
| design `:29-30` line / dot 贴 `navH` | 坐标系是 nav-inner。top/bottom 下 nav-inner 在 `.tx-tabs__nav-bar` 里垂直居中（`TxTabs.vue:946-950`）；当 bar 被 nav-right 内容或消费方的 `min-height`（PluginFeatureDetailCard 64px）撑高时，nav-inner 底边就不是分隔线。nav 底边来自 `.tx-tabs__nav` 的 1px border（`:1241-1247`），`borderless` 在 top/bottom 下清不掉 |
| design `:29` 用项的 padding 算线长 | 消费方覆写了项的 margin / padding：LingPan、TemplateResearch、TemplateSettings（含窄屏）、TemplateShellConsole（§1.4）；运行时读 `getComputedStyle` 可以自动跟随 |
| design `:64` 图标改 `inline-flex` | 与 §4 实测到的原因一致（强制块化后为 21.6px = 1.2em × 18px）；TemplateSettings 把图标 `font-size` 覆写成了 16px |
| PRD R4 `durationMs` | 它还被 `animation.content.durationRatio` 使用（`TxTabs.vue:216-217`，测试 `:284`，变体 demo 用的是 0.5） |
| PRD R6 reduced-motion | 组件现在完全没有处理，4 个 Template demo 自己把 `animation` 全关；vitest 的 `matchMedia` 桩恒为 `false`（§2） |
| PRD 验收「core-app 与 Nexus 其它用法抽查」 | 清单见 §1；`store.vue` 的 tab 条可能本来就是空的（§1.5「注意」） |

---

## Implications

### 必须保持兼容的 API / 表面
- Props 与值域：`showIndicator`；`indicatorVariant` 5 个值 + 非法值回落 `line`；`indicatorMotion` 5 个值 + 非法值回落 `stretch`；`indicatorMotionStrength` 负数夹到 0；`offset`（只作用于 line / pill，仓库内没人传）；`animation.indicator` 的 `boolean | { enabled, durationMs, easing }`（仓库内传过 `durationMs` 220/350/500/800、`easing:'ease'`、`false`）。类型由 `tabs/index.ts:25-31` 导出（`TabsProps` 等，`types.ts:14-16`、`:38-41`、`:50-55`）。
- `animation.content.durationRatio` 以指示器的 `durationMs` 为基数（`TxTabs.vue:216-217`）。
- 根类：`tx-tabs--indicator-{line|pill|block|dot|outline}`、`tx-tabs--motion-*`、`tx-tabs--indicator-{hidden|pending|visible|anim}`（测试有断言；pending 还写进了文档第 640 行）。
- DOM：`.tx-tabs__pointer`（测试断言其是否存在以及行内 `style.opacity`）。
- 消费方样式依赖、改名即失效的类名 / 变量：`.tx-tab-item`、`.tx-tab-item.is-active`、`.tx-tab-item__name`、`.tx-tab-item__icon`、`.tx-tab-header`、`--fake-color` / `--fake-opacity`，以及 `.tx-tabs`、`__nav`、`__nav-bar`、`__nav-inner`、`__nav-extra`、`__group`、`__group-name`、`__main`、`__select-slot`、`__auto-sizer`、`__content-wrapper`、`__content-scroll`（§1.4）。指示器相关的内部类（`__pointer-inner`、motion / glow 类、keyframes）没有外部依赖。
- 文档里列出的 CSS 变量：`--tx-tabs-indicator-duration/-easing/-strength`（自定义表第 666 行）。
- 跨组件命名约定：TabBar 声明其变体名与 TxTabs 对齐（`tab-bar/src/types.ts:17`、`tab-bar.*.mdc:82`）。

### 需要改写 / 新增的测试
- 可能随实现改变：`:88-90`（三个指示器 CSS 变量）、`:282` 与 `:310`（`tx-tabs--indicator-anim`）、`:284`（content 时长推导）、`:458` / `:473`（写在 `.tx-tabs__pointer` 上的行内 opacity）。
- 语义需要保持：`:124-125`（点击即揭示）、`:163-164`（prop 驱动不揭示）。
- 目前的空白：首次落位无位移、无关键帧；点击 / 键盘 / 外部 v-model 三条路径都走引擎；reduced-motion 直接落位；各变体几何（含竖向）；双重高亮消失（激活项 `--fake-color`）；图标容器有尺寸。rAF 可参照 radio 的 fake timers 写法；reduced 分支要覆盖 `matchMedia` 桩。

### 需要更新的文档
- `tabs.{en,zh}.mdc`：API 行 542、550-553、557-558（若图标行为有说明，还有 590）；概述 639-640（首帧落位的描述）；技术实现 644-655（覆盖清单在 653）；自定义 663-666（激活项表面、指示器画面、CSS 变量）；demo 小节 63-188（变体 / 动效）与 425-464（关闭动画）；视情况补 reduced-motion 说明。zh 第 63 / 65 行的两个标题目前是英文。
- `TabsIndicatorVariantsMotionsDemo.vue`（及 mdc 里的片段）、`TabsTabsDemo.vue`（图标），画廊 Tabs 格子 + `.docs-gallery__tabs` 高度。
- 会失真的句子：`filter-chips.{en,zh}.mdc:150`。可能相关：`tab-bar.{en,zh}.mdc:82`（若 `pill` 语义与 TabBar 对齐后措辞要变）、`use-indicator-box.ts:29` 的注释。
- 影响半径（docs-sync `:15-31`）：tabs 没有被其它 tuffex 组件包装（已检索 `from '../../tabs…'`，无结果）；但 NavigationShell demo 与 pill 代码片段分布在 drawer / dropdown-menu / popover / tuffex-composition / template-store 页面。

### 验证注意
- Nexus dev 走 `packages/tuffex/dist`（`apps/nexus/build/tuffex-dev-mode.ts:34-53`；设 `NUXT_TUFFEX_SOURCE=true` 才走源码）。改完要构建 tuffex，并按 `tuffex-docs-sync.md:112-129` 判断是否需要重启 :3200。该服务器目前由另一会话持有（pid 24280）。
- 画廊实测路径：`http://localhost:3200/docs/dev/components/base-suite`（Tabs 格子在 base 段，`DocsComponentsGallery.vue:951-2675`）。Tabs 文档页的 demo 是懒挂载的（进入视口前 240px 才挂），测量前要先滚动到位。
- ego 后台窗口的 rAF 约 1 fps，逐帧采样不可靠；用 CDP `Animation.setPlaybackRate` 放慢，再用 `document.getAnimations()` / `getKeyframes()` 能稳定拿到动画的起止值（本次就是这样取证的）。如果引擎用 rAF 而不是 CSS / WAAPI，录帧需要另想办法（例如放慢引擎时钟）。

## Caveats / Not Found

- 未找到：任何插件使用 TxTabs；任何消费方传 `offset` / `indicatorMotionStrength`；任何外部样式命中指示器内部类或指示器根类；画廊里格内切换 specimen 变体的先例。
- 未实测（代码推断）：键盘切换时指示器不播关键帧（§0.1-5）；`store.vue` 的异步包装导致 tab 项被过滤（§1.5）；core-app `PluginInfo` 的图标同样是 0×0（§4）。
- §0.1-7 的「首测为 2 倍」只在放慢时间轴时观察到一次，没有定位是哪个祖先的 transform。
- 实测都在暗色主题下完成，亮色未测。
