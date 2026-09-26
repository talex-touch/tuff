# Research: CoreBox 交互与列表 / 条目过渡动效审计

- **Query**: 「你顺便分析下 corebox 交互 和 列表动画 不同 item 加载过渡动画 都优化下」——先做分析和分优先级的方案，老板评审后再实现
- **Scope**: internal（代码阅读、git 历史、dev 日志、/tmp 下的 jsdom 探针）
- **Date**: 2026-09-26
- **行号基准**: 以 2026-09-26 的工作区为准。`views/box/CoreBox.vue` 里有 09-25-corebox-search-pulse-beam 尚未提交的改动（+20/-5：`SearchPulse` 挂载、`showSearchPulse`、`minDuration: 400`），所以行号按工作区计，和 HEAD 不同。
- **路径简写**: `R/` = `apps/core-app/src/renderer/src/`，`M/` = `apps/core-app/src/main/modules/box-tool/`

---

## 0. 结论速览

1. **默认情况下几乎没有入场动效。** `listItemStagger`、`resultTransition`、`coreBoxResize` 三个开关默认都是 `false`（`packages/utils/common/storage/entity/app-settings.ts:459-464`）。所以用户觉得"跳"，主要原因不是缺动画，而是**布局本身在抖**：
   - 在文件和应用混排的列表里按方向键，预览面板每一步都会开一次、关一次（已用探针验证）；
   - 流式搜索时，快层快照先把文件行删掉，延迟层批次再把它们插回来并重新排序（已用探针验证）；索引建库期间，同一个查询每隔 ≥500ms 就要重复一次这个过程；
   - 打开 CoreBox、清空查询时，结果区先被清空、窗口高度保持不变，推荐网格回来之前那块区域是空白。
2. **默认开启、而且带着问题的动效**：
   - 预览面板打开时从 `opacity: 0` 滑入；
   - 网格 FLIP 不受 reduced-motion 和低电量门控；
   - 历史面板对 `width` 做动画（每帧重新布局）；
   - 预览卡片的彩色描边是主线程重绘的无限动画，并且每按一次键卡片都会重新挂载。
3. **门控有缺口。** CoreBox 窗口从来不会设置 `html[data-low-battery-motion]`，全局低电量开关在 CoreBox 里等于没有；WAAPI 驱动的 FLIP 也不受 `prefers-reduced-motion` 的 CSS 规则影响。
4. **不要走回头路**：`mode="out-in"`、按批次重新 key 列表、带 opacity 的入场、`filter: blur` 入场、宽度过渡、不封顶的 stagger、默认开启窗口动画——这些都是踩过的坑，第 4 节逐条列出。

---

## 1. 现状清单

全局门控先说明，下表的"门控"一列都以此为准：

- **reduced-motion**：`R/styles/accessibility.scss:106-115` 把所有 CSS `animation-duration` / `transition-duration` 压成 `0.01ms !important`。它**不影响** `element.animate()`（WAAPI）。
- **低电量**：`R/styles/index.scss:394-409` 只在 `html[data-low-battery-motion='1']` 存在时生效，这个属性由 `useGlobalBatteryOptimizer`（`R/modules/hooks/useBatteryOptimizer.ts:115-131`）设置。但它只在 `MainWindowRuntimeServices.vue:22` 里被调用，而 `App.vue:14,34-38` 对 CoreBox 这类轻量窗口不挂载这个组件，所以 **CoreBox 窗口永远没有这个属性**。CoreBox 里只有 3 处显式判断了 `lowBatteryMode`：`resultTransitionEnabled`、`.is-new-item` 和 `searchPulseAnimated`。

| # | 表面 | 动什么 | 属性 | 时长 / 缓动 | 门控（设置 / reduce / 低电量） | 位置 |
|---|---|---|---|---|---|---|
| 1 | 结果容器 `.result-layout-motion`（`.item-list` 或 BoxGrid 根节点） | 容器挂载时整体上移 8px→0。只在容器新建时触发一次（list↔grid 切换、结果区从无到有），不是每次结果变化都触发 | transform | 120ms ease-out，fill both | `resultTransition`（默认 false）且非低电量；reduce 时为 none | `R/views/box/CoreBox.vue:114-116,1101,1115,1498-1511,1534-1539` |
| 2 | 列表行交错入场 `.is-new-item` | 新出现的 id 所在行 translateY(10px→0) | transform | 140ms ease-out，延迟 0–180ms（按**绝对行号**计算），fill both | `listItemStagger`（默认 false）且非低电量；reduce 时为 none | `CoreBox.vue:1124-1132,1513-1532`；`R/views/box/stagger-delay.ts:8-19`；簿记逻辑 `CoreBox.vue:552-602`（整批刷新 500ms 后清理，增量 320ms 后清理） |
| 3 | 网格 tile、网格内列表行、分区标题的 FLIP | 预览面板开合或列数变化时，从旧盒子过渡到新盒子 | WAAPI：tile 是 translate+scale，并对 inner 反向缩放（12 个采样点，linear）；行和标题只 translate | 220ms，`cubic-bezier(0.2,0.8,0.2,1)` | **只在 grid 模式下执行，没有任何设置、低电量或 reduce 门控** | `CoreBox.vue:858-871`；`R/modules/box/adapter/hooks/flip-layout.ts:35-36,104-138`；`R/components/render/BoxGrid.vue:171-172,185-186,209-211,237-239` |
| 4 | BoxGridItem 紧凑态形变 | 图标缩到 0.78；标题和徽标淡出并缩小；快捷键从角标变成内联 | transform / opacity | 图标 200ms；标签 opacity 160ms（延迟 60ms）、transform 200ms；紧凑态 120/180ms；角标 140ms；`tile-key-in` 200ms | 无设置；reduce 走全局规则；低电量不生效 | `R/components/render/BoxGridItem.vue:147-156,185-213,215-270` |
| 5 | 列表行（BoxItem）选中和悬停 | 背景色、左侧指示条 | background-color / opacity | 背景 100ms（`transition-colors duration-100`）；指示条 200ms | 无 | `R/components/render/BoxItem.vue:152-160,240-242` |
| 6 | 网格 tile 选中和悬停 | 边框颜色；填充（`fake-background::before` 的 opacity） | border-color / opacity | 边框 125ms；**填充没有过渡，直接切换** | 无 | `BoxGridItem.vue:104-120`；`R/styles/index.scss:70-86` |
| 7 | 主题悬停风格 | background / border / scale(1.01) | background、box-shadow、transform | 无过渡，scale 是瞬切 | 主题 `results.hoverStyle`（默认 `background`，minimal 预设是 `border`） | `CoreBox.vue:821-823,1271-1282`；`R/views/box/theme/presets.ts:8,15,22,29` |
| 8 | 自定义条目外框 `.CoreBoxRender-Custom` | 选中时的边框颜色 | border-color | 200ms | 无 | `R/components/render/CoreBoxRender.vue:92-101` |
| 9 | 预览卡片（计算器、换算等）的 `<gradient-border>` | 彩色描边无限旋转 | 注册的自定义属性 `--angle`，外加 `filter: blur(5px)`：每帧都要在主线程重新计算样式并重绘 | 4s linear infinite | 无设置；低电量不生效；reduce 走全局规则 | `R/components/render/custom/PreviewResultCard.vue:71`；`R/components/base/effect/GradientBorder.vue:93-143` |
| 10 | 推荐网格 intelligence 分区的 `rainbow-border` | 彩虹边框 | background-position（需要重绘） | 4s ease infinite | 同上。目前没有生产者会发 `meta.intelligence`，**大概率走不到** | `BoxGrid.vue:262-309`；`M/search-engine/recommendation/recommendation-engine.test.ts:2836-2843` |
| 11 | AI 回答卡片 CoreIntelligenceAnswer | pending 状态的旋转图标；ready 后对话区挂载，高度直接跳变 | transform: rotate | 0.9s linear infinite | 组件内有 reduce 守卫 | `R/components/render/custom/CoreIntelligenceAnswer.vue:165-174,341-344,409-417`（仓库内没有找到这个渲染器的生产者，touch-intelligence 插件走的是 widget） |
| 12 | 插件 widget（WidgetFrame） | 渲染器没就绪时先显示最小高度 120px 的占位，之后换成真实组件，高度跳变；widget 按 id 作 key，id 变了就重新挂载 | 无动画 | 250ms 后判定为 missing | — | `R/components/render/WidgetFrame.vue:133-148,486-497`；`CoreBox.vue:1073-1084` |
| 13 | 预览面板 TuffItemAddon | 打开时滑入；关闭时直接切掉 | **opacity 0→1** + translateX(16px→0) | 220ms，`cubic-bezier(0.2,0.8,0.2,1)` both | 无设置；低电量不生效；reduce 走全局规则 | `R/components/render/addon/TuffItemAddon.vue:33-62`；触发条件 `CoreBox.vue:731-741,1067-1068` |
| 14 | 预览内容 | 切换到另一个文件时：舞台清空 → （图片）转圈 → 显示图片；"打开方式"的文案会闪一下 | 无过渡 | 转圈 1s infinite | — | `R/components/render/addon/TuffItemPreviewer.vue:135-171,183-210,301-310`；`.../preview/ImagePreview.vue:105-120` |
| 15 | 历史面板 PreviewHistoryPanel | 根节点宽度 0→280px；内层淡入加平移；列表项悬停上浮 | **width（触发布局）**、opacity、transform | 宽度 300ms；opacity/transform 200ms；列表项 150–200ms | 无 | `R/components/render/custom/PreviewHistoryPanel.vue:90-126,178-192` |
| 16 | 底栏 CoreBoxFooter | `display` 去抖 100ms 后上滑；隐藏时直接切掉；索引进度点呼吸；`backdrop-filter` 常驻 | transform；opacity | 120ms ease-out；1.5s infinite | 无 | `R/components/render/CoreBoxFooter.vue:36-37,50-53,180-181,288-320,346-360` |
| 17 | 搜索中（header）SearchPulse | 光带和光束 | translate / scale / opacity | 周期 2.2s；进场 280ms / 离场 420ms；出现前延迟 600ms，至少显示 400ms | reduce 或低电量时改为静态文字 | `R/views/box/SearchPulse.vue`；`CoreBox.vue:106,434-445,959,1012-1019`（姊妹任务，未提交） |
| 18 | 窗口高度 | 渲染层测量 → IPC → 主进程 `setBounds`，动画可选 | 窗口 bounds（主进程每 16ms 轮询一次） | 默认瞬切；开启动画时 `min(220, max(120, 120 + Δh×0.16))`ms，easeOutCubic | `coreBoxResize`（默认 false） | `R/modules/box/adapter/hooks/useResize.ts:145-266`；`M/core-box/index.ts:179-196,301-379`；`M/core-box/window.ts:468-655`；`M/core-box/bounds-controller.ts:156-300` |
| 19 | 键盘导航时滚动 | 把选中行滚进视口（扣掉底栏高度） | scrollTop | 瞬时（native 用 `scrollTo`，BetterScroll 用 `time=0`） | — | `R/modules/box/adapter/hooks/useKeyboard.ts:1056-1113`；`packages/tuffex/packages/components/src/scroll/src/TxScroll.vue:391-400` |
| 20 | header 里激活 provider 的胶囊 | 标签 max-width 0→500→0 | **max-width（触发布局）** | 3s linear，延迟 0.5s | 无 | `R/views/box/ActivatedProviders.vue:147-161` |

stagger 延迟曲线的实测值（单位 ms，第 0–9 行）：

- 共 10 行：`0,25,53,85,124,171,180,180,180,180`
- 共 80 行：`0,25,50,75,100,126,151,177,180,180`

从第 6–8 行起全部卡在 180ms 的上限，所以后面的行会作为一整块一起动。

---

## 2. 问题（按影响排序）

标注说明：**探针** = 已经用 /tmp 下的 jsdom 探针跑过（见第 6 节）；**读码** = 只做了代码阅读；**需帧捕获** = 必须在真实 Electron 里逐帧截图才能确认和量化。

### 2.1 预览面板随选中项反复开合（高；探针）

- **证据**：`addon` 只看当前选中项的 `kind === 'file'`（`CoreBox.vue:731-741`）。它同时驱动三件事：结果列宽的 `compressed` 在 100% 和 40% 之间来回切（`CoreBox.vue:1067-1068,1429-1431`）；面板 `.show` 的开关，每次打开都从 `opacity: 0` 重新播放滑入（`TuffItemAddon.vue:46-62`），关闭时宽度直接变成 0；grid 模式下每次切换还会触发一次 220ms 的 FLIP（`CoreBox.vue:870-871`）。
- **频率**：文件和应用、功能是按分数混排在一起的（`R/modules/box/adapter/hooks/useSearch.ts:546-579`），所以混排列表很常见。
- **症状**：按住方向键从应用行走到文件行，每一步整列宽度在 100% 和 40% 之间翻转，行尾徽标左右跳动，面板反复"淡入—消失"；网格里的 tile 每一步都要重排加形变。
- **探针结果**：焦点按 0→1→2→1→0 移动，`compressed` 依次为 `false/true/false/true/false`，面板依次为 `none/preview/none/preview/none`。
- **历史**：e6d7411aa（09-06）把宽度过渡换成了"一次布局 + FLIP + 滑入"，解决的是"一次开合"卡不卡；"开合太频繁"这个问题没有处理。

### 2.2 流式搜索：快层快照删掉文件行，延迟批次再插回并重排（高；探针 + 读码）

- **证据**：
  - 快层超时 80ms，延迟层还要再等 50ms（`M/search-engine/search-gather.ts:53-64`）。macOS 上文件 provider 都属于延迟层（`M/addon/files/file-provider.ts:310`、`native-file-search-provider.ts:255`）。
  - 第一批结果就是快照（`M/search-engine/search-core.ts:941-947,1535-1560`）。渲染层收到快照后**整体替换**列表（`useSearch.ts:960`）。
  - 之后的 update 再合并进来并按分数重新排序（`useSearch.ts:1120`；排序逻辑 546-579；设计意图见 `search-core.ts:116-119`）。
  - 焦点会跟着 id 走（`useSearch.ts:582-590`）。
- **同一查询也会反复经历**：索引提交会触发刷新，间隔 ≥500ms，而且带 `preserveSelection`（`useSearch.ts:616,1401-1445`）。现有测试 `useSearch.core.test.ts:498-575` 把中间态写成了预期：「The fast snapshot dropped the file, so focus lands on the app row」，然后文件再回来、焦点再回到文件。
- **症状**：输入会命中文件的查询时，文件行先消失再出现、插进中间，下面的行被瞬间推下去；如果当时选中的是文件，预览面板会先关再开（叠加 2.1 的问题）。首次建库期间停着不动也会每 0.5–1s "呼吸"一次。窗口高度不抖，因为有"加载中只增不减"的规则（`useResize.ts:170-183`），但窗口里面的内容在抖。
- **探针结果**：查询细化后的快照只剩 `app-a, app-b`；延迟批次把 `file-x` 加回来时，它又被当成新行（带 `.is-new-item`）。

### 2.3 打开 CoreBox 或清空查询时，结果区先被清空，出现空白（中高；读码，需帧捕获）

- **证据**：推荐路径发请求之前就执行了 `searchResults.value = []` 和 `boxOptions.layout = undefined`（`useSearch.ts:1226-1233`）。结果区因此卸载（`CoreBox.vue:825,1063`）。主进程看到的是 `resultCount === 0 && (loading || recommendationPending)`，走"skip (pending)"分支，窗口高度保持不变（`M/core-box/index.ts:348-360`）。于是出现一块高高的空白（只有 `.CoreBox-Mask` 的底色），直到推荐快照回来。
- **每次打开都会走这条路**：`corebox:shown` 会强制重新搜索（`useSearch.ts:1949-1956`），所以可能出现"上次的旧网格 → 空白 → 新网格"。
- **历史**：文字搜索路径早在 6055f7102（01-07）就改成了不先清空（`useSearch.ts:1318-1319`，理由是会闪），推荐路径一直没跟上。

### 2.4 焦点被非键盘方式改变时，列表不滚动（中；读码）

- **证据**：只有两处会调用 `scrollActiveItemIntoView`：键盘处理结束时（`useKeyboard.ts:1062`）和网格重排后（`CoreBox.vue:801-805`）。而以下几处写 `boxOptions.focus` 时都没有调用它：新查询把焦点重置为 0（`useSearch.ts:1314-1316`）、重排后焦点跟随 id（`useSearch.ts:582-590`）、快照恢复选中（`useSearch.ts:961-966`）。整个结果区也没有任何地方把滚动复位到顶部。
- **症状**：先往下滚几行，再补一个字：新结果保留原来的滚动位置，第 0 行的高亮在视口上方看不见；再按一次方向键，列表会突然跳回去。

### 2.5 流式时 stagger 簿记会打断正在进行的动画（中；只影响打开了 `listItemStagger` 的用户；探针）

- **证据**：每来一批结果，都会清掉旧的计时器，并用"本批新出现的 id"**整体替换** `newItemIds`（`CoreBox.vue:565-599`）。上一批还在延迟或动画中的行会立刻失去 class，从 `translateY(≤10px)` 直接弹回原位。
- 延迟按绝对行号计算（`CoreBox.vue:1130-1132`）：比如第 40 行单独插进来一个新行，也要在偏移 10px 的位置等 180ms（因为 fill both），期间会压在下一行上面。
- "整批刷新"判定（重叠率 < 0.3）会让仍然留在屏幕上的旧行也重新入场一次（`CoreBox.vue:563,570-576`）。
- **探针结果**：快照之后 `app-a, app-b, app-c` 都带着 `.is-new-item`；60ms 后延迟批次到达，只剩 `file-x` 带着，前三行被打断。

### 2.6 动效门控有缺口（中；读码）

- CoreBox 里全局低电量开关失效（见第 1 节）。受影响的有：预览面板滑入、FLIP、底栏、BoxGridItem、历史面板、彩色描边、索引进度点。
- FLIP 用的是 `el.animate()`（`flip-layout.ts:121,124,127`），不受 `accessibility.scss` 的 reduce 规则约束；`captureResultsLayout` 只判断了 `isGridMode`（`CoreBox.vue:859-861`）。
- 预览面板和历史面板都是从 `opacity: 0` 开始的。规范「Ready results must not wait for reveal motion」字面上只约束结果列表和网格，但这两处违背了它的精神。

### 2.7 预览卡片：每按一次键就重新挂载，描边在主线程重绘（中；读码）

- 卡片的 id 是 `preview-provider:sha1(abilityId:queryText)`（`M/addon/preview/preview-provider.ts:138-141`），每按一次键 id 都会变。于是：`CoreBoxRender` 按 id 作 key，整个卡片重新挂载（`CoreBox.vue:1119`）；WidgetFrame 和 PreviewResultCard 重建；彩色描边从 0deg 重新转；如果开了 stagger，卡片每次都会重新入场。
- 彩色描边的 `@property --angle` 动画加上 `filter: blur(5px)`（`GradientBorder.vue:93-143`），恰好在最需要主线程的时候（用户打字时）每帧重绘。
- 按 `.trellis/spec/frontend/hook-guidelines.md:62-64`，窗口隐藏时 `document.hidden` 可能仍然是 `false`，所以这类无限动画在窗口隐藏后可能还在跑。**这一点未验证**。

### 2.8 空结果的中间态（中；读码；属于产品边界）

- 快层返回 0 条、延迟层还没回来时：结果区卸载，窗口保持原高（`index.ts:348-360`），出现空白；之后要么在 complete 时收起（`index.ts:331-346`），要么延迟层带着文件回来、结果区重新挂载（所有行都算新行）。
- 07-15 的 PRD（b80730046）有明确决定：删掉搜索中、预热、索引中这些提示，并且「Do not replace them with another loading/preheating/indexing placeholder」。所以这里**不能**加占位，只能在"保留旧结果多久"上做选择（见决策 D6）。

### 2.9 窗口高度落后于内容（中；有日志证据；多数是架构层面的问题）

- **延迟链路**：渲染层 rAF（≤16ms）+ 节流（距上次发送不足 80ms 时补齐等待，`useResize.ts:212-235`）+ IPC + 主进程 16ms 合并（`index.ts:179-196`）+ `setBounds`。正常是 2–7 帧。
- **主进程卡顿会把这个延迟放大**：`~/Library/Application Support/@talex-touch/core-app/tuff-dev/logs/D.2026-09-25.log` 里当天有 120 条 `Event loop lag`，例如：
  - 23:39:01 `lagMs=505`
  - 23:40:28 `Event loop lag 232ms (context=FileProvider.fullScan 1919s …)`
  - 23:43:29 `243ms`
- 底栏钉在窗口底部（`CoreBox.vue:1476-1482`）。收缩时内容先变短，底栏还停在旧的底边，等窗口追上来才跳上去。
- 入场动画从 DOM 挂载那一刻开始跑，这时窗口还没长高，所以首屏前几行的动画可能被"吃掉"一截。
- 打开 `coreBoxResize` 后，主进程用 16ms 轮询驱动动画（`bounds-controller.ts:245-299`），会直接受上面那种卡顿影响。

### 2.10 历史面板对 width 做动画（低到中；读码）

`transition: width 0.3s`（`PreviewHistoryPanel.vue:99-105`）会让同一行 flex 容器里的结果列在 300ms 内每帧重新布局。这正是 e6d7411aa 在别处移除的写法。另外根节点的 `opacity 0.25s` 永远不会触发（opacity 从来没在根节点上变过）。

### 2.11 选中高亮的时钟不一致（低到中；读码，需帧捕获）

- 列表行背景 100ms、指示条 200ms（`BoxItem.vue:153,241`）：按住方向键连续移动时，会同时看到好几根半透明的指示条拖尾。
- 网格 tile 边框 125ms，填充却是瞬切（`BoxGridItem.vue:110,112-120`）。

### 2.12 悬停和选中打架（低到中；读码）

- `.CoreBoxResultHover-background/border .BoxItem:hover` 带 `!important`，而且选择器权重是 (0,4,0)（`CoreBox.vue:1271-1278`），压过了选中态的 `!bg-[var(--tx-bg-color)]`（权重 (0,1,0)，`BoxItem.vue:156`）。鼠标停在选中行上时，选中底色就没了；`border` 风格下甚至变成透明。
- 鼠标不动、行在下面重排或滚动时，悬停高亮会跟着行跳。
- `scale` 风格没有过渡，是瞬切。

### 2.13 高度测量把容器自身的 transform 也算进去了（低；只在打开 `resultTransition` 时出现；读码）

`measureResultContentHeight` 取的是 `max(getBoundingClientRect().bottom, offsetTop+offsetHeight)`（`useResize.ts:65-68`），在容器正做 `.result-layout-motion` 时会多量 8px，180ms 后稳定测量又少 8px，窗口就在结果出现约 200ms 后缩 8px。之所以用 rect 取底边，是 b37697b1a（06-22）为了"stabilize corebox search layout"加的，不能直接删掉。

### 2.14 其他（低）

- **预览内容切换时的空窗**：`TuffItemPreviewer.vue:143-145` 先把资源清空，然后 `301-310` 在就绪之前什么都不渲染。
- **header 胶囊的 max-width 动画**：3s 内每帧都重新布局（`ActivatedProviders.vue:147-161`）。
- **过时注释**：`useSearch.ts:443-449` 还在说 out-in 会整表重建。
- **设置描述和实际行为不符**：`resultTransition` 的描述是"搜索结果变化时的过渡"（`R/modules/lang/zh-CN.json:1100-1101`），实际只在容器挂载时触发一次。
- **两个开关同时打开会叠加**：容器 8px 加上行 10px。
- **执行应用时可能闪一帧（假设）**：`useSearch.ts:1567-1581,1599-1602` 在发出 hide IPC 之前就先清空了输入和结果，可能会先画出一帧空的 CoreBox 再隐藏。需帧捕获确认。

---

## 3. 优化方案（按优先级）

| 编号 | 方案 | 解决 | 优先级 | 风险 | 需老板决策？ |
|---|---|---|---|---|---|
| A | 预览面板开合加迟滞；入场改为只动 transform | 2.1、2.6 | P0 | 低到中 | **是（D2）**，只动 transform 这部分不需要 |
| B | 同一查询的刷新不丢延迟层的行，等 complete 时再对账 | 2.2 | P0 | 中 | **是（D4，要改 07-15 的约定和测试）** |
| C | 推荐路径（打开 / 清空）不预先清空，由快照一次性替换 | 2.3 | P0 | 低到中 | 否 |
| D | 焦点被非键盘方式改变时，把选中行滚进视口 | 2.4 | P1 | 低 | 否 |
| E | 统一门控：CoreBox 挂上全局低电量开关，FLIP 判断 reduce 和低电量 | 2.6 | P1 | 低 | 否 |
| F | 预览卡片用稳定身份；彩色描边降本 | 2.7 | P1 | 低到中 | 身份部分不需要；描边外观**需要（D7）** |
| G | 列表模式重排时做 FLIP 位移（只动 transform） | 2.2、2.9 | P1 | 中 | **是（D1、D3）** |
| H | 修正 stagger 簿记（合并而不是替换，按批内序号算延迟） | 2.5 | P2 | 低 | 否（仍然由开关控制） |
| I | 历史面板改成一次布局 + transform | 2.10 | P2 | 低 | 否 |
| J | 选中高亮统一成一个时钟 | 2.11 | P2 | 低 | 移动指示条属于新动画，**需要（D8）** |
| K | 悬停处理：不覆盖选中态；键盘操作后到鼠标移动之前不显示悬停 | 2.12 | P2 | 低 | 否 |
| L | 高度测量排除容器自身的 transform | 2.13 | P2 | 低 | 否 |
| M | 预览内容切换时先显示文件图标作占位 | 2.14 | P2 | 低 | 否 |
| N | 杂项（胶囊动画、过时注释、设置描述、执行时闪帧） | 2.14 | P3 | 低 | 胶囊改法可能要设计确认 |

### A. 预览面板开合迟滞（P0）

- **改什么**：
  1. 把 `addon` 从直接的 computed 改成带状态的 `addonType`：选中文件时立即打开；选中移到非文件行后，停留 ≥200ms 才关闭（期间再选中文件就取消关闭）。
  2. `addon-slide-in` 去掉 `opacity: 0`，只保留 translateX（按 8f34ba297 的精神：动效不去挡已经就绪的内容）；在两个面板之间切换时不重播。
  3. 滑入要判断 reduced-motion 和低电量（与方案 E 一起做）。
- **为什么**：从问题上说，混排列表里每按一次键，整列布局就翻转一次，这是目前最明显的"跳"。从机制上说，FLIP 和滑入解决的是"开合一次"是否顺滑，解决不了"开合太频繁"。
- **文件**：`CoreBox.vue:731-741,807-809,846-849,870-871,1067-1068,1150-1157`；`TuffItemAddon.vue:46-62`。
- **风险**：`gridAvailableWidth`、FLIP 的捕获 watcher、`revealActiveItemAfterReflow` 都依赖 `addon`，必须一起改成依赖新的状态。面板停留在非文件行期间显示什么内容需要决策（见 D2）。
- **验证**：
  - 单测：沿用第 6 节探针 3 的形式，使用 fake timers，焦点序列为"应用→文件→应用→文件"，每步间隔 50ms。第一次打开后 `compressed` 一直保持 true；在应用行上停留 250ms 后变为 false；在两个文件之间切换时不重播滑入。
  - 真机：按住方向键扫过混排列表逐帧截图，数一数结果列宽度翻转的次数，每停一次最多翻转 1 次。

### B. 同一查询刷新时，等 complete 再对账（P0，需 D4）

- **改什么**：
  1. 对 `preserveSelection` 的刷新（索引提交刷新、打开时对同一查询的强制刷新）：快照不再整体替换，而是和当前列表合并（`mergeRenderedItems`），同时记录本次会话实际下发过的 id；
  2. 延迟层的 update 照常合并；
  3. `applySearchEnd`（未取消时）把本次会话没有再下发的行删掉；
  4. 如果流失败或被取消，就退回现有逻辑（重置，或保留旧结果）。

  文字细化（查询文本变了）**不在这个方案范围内**，见 D5。
- **为什么**：可以去掉索引建库期间的"呼吸"和预览面板开合；选中行不再先跑到应用行再跳回来。"过时条目最终由后端说了算"这条原则仍然成立，只是时间点推迟到 complete。
- **文件**：`useSearch.ts:938-973,1106-1139,1401-1445,1980-1998`；`useSearch.core.test.ts:498-575`（中间态的断言要改）。
- **风险**：
  - 这是对 07-15 PRD R3「complete fresh search snapshot … stale-item removal stay authoritative」的**时序**修改，需要老板确认；
  - complete 迟迟不来时，已经不存在的文件行会多停留一会儿，需要加一个兜底超时；
  - 会和 09-25-corebox-keyboard-jump 任务改到同一段代码（`restoreFocusedItem`、焦点恢复），需要协调。
- **验证**：
  - 单测：改写 498 号用例，断言刷新快照之后 `res` 里仍然有文件、焦点仍然在文件上；complete 时如果没有再下发这个文件就删掉它；如果刷新再次下发了这个文件，DOM 节点保持不变（在 CoreBox 挂载测试里比较 element 是否是同一个）。
  - 真机：首次建库期间保持一个能命中文件的查询，截帧确认行数不再忽多忽少。

### C. 推荐路径不预先清空（P0，不需要决策）

- **改什么**：推荐路径不再执行 `searchResults.value = []` 和 `boxOptions.layout = undefined`（`useSearch.ts:1228,1231`），改由 `applyRecommendationResult`（987-988）在同一次更新里替换结果和布局。400ms 超时和失败分支（1239-1247、1286-1291）负责清空。
- **为什么**：
  - 打开 CoreBox、清空查询这两个最频繁的动作不再出现空白；
  - 推荐项大多和上次一样，Vue 按 key 原地更新，几乎看不出变化；
  - 这样也和文字路径 6055f7102「不先清空」的做法一致。
- **风险**：
  - 空查询下会短暂看到上一次查询的行，时长等于推荐请求的耗时；
  - **必须同时保留 layout**。如果只保留行而把 layout 置空，旧网格会瞬间变成列表，反而更跳；
  - 主进程这时会看到 `resultCount > 0`，所以不会走 pending 分支，窗口保持原高，等新网格测量完成后再调整。
- **验证**：
  - `useSearch.core.test.ts`：`searchVal = ''` 之后，快照到达之前 `res` 和 `layout` 保持不变；快照到达后一次性替换；超时后清空；
  - `CoreBox.result-switch.test.ts` 的现有 4 个用例必须继续通过；
  - 真机：用快捷键打开，逐帧确认旧网格和新网格之间没有空结果帧。

### D. 焦点被非键盘方式改变时，把选中行滚进视口（P1）

- **改什么**：
  - 在 `res` 变化之后（post-flush）：如果焦点因为新查询被重置为 0，就滚动到顶部；
  - 如果是重排导致焦点跟随 id，只在"重排前这一行本来就在视口里"时才把它滚进视口，避免用户正在看的时候被拽走。
- **文件**：`CoreBox.vue`（新增一个 post-flush watcher，复用 `scrollActiveItemIntoView`）；`useKeyboard.ts:1070-1113` 不需要改。
- **风险**：可能和用户滚轮滚动冲突，所以只在焦点重置时，或者被跟随的行原本就可见时才触发。
- **验证**：给 `scrollbar.scrollTo` 做 spy：替换结果并把焦点重置为 0 时应当调用 `scrollTo(0,0)`；焦点所在行原本不可见时不应当调用。真机：先往下滚，再补一个字，截图应该能看到带高亮的首行。

### E. 统一动效门控（P1，不需要决策）

- **改什么**：
  1. 在 CoreBox 窗口里也调用 `useGlobalBatteryOptimizer()`，放在 App 的轻量窗口分支或者 `CoreBox.vue` 里都可以，让 `index.scss:394-409` 在 CoreBox 里生效；
  2. `captureResultsLayout` 和 `playFlip` 判断 `lowBatteryMode` 以及 `matchMedia('(prefers-reduced-motion: reduce)')`；
  3. 以后新加的 WAAPI 动画也遵守同一个判断（可以抽一个 `shouldAnimate()`）。
- **文件**：`R/App.vue:14,34-38` 或 `CoreBox.vue`；`CoreBox.vue:858-871`；`flip-layout.ts`（可选：让 `playFlip` 接收一个 `enabled` 参数）。
- **风险**：低。全局开关会让 SearchPulse 和各处转圈直接停掉；这些本来就已经有门控，或者静态显示也没问题。
- **验证**：单测：mock reduce 或低电量为 true 时不调用 `playFlip`；低电量时 `document.documentElement` 带上 `data-low-battery-motion`。真机：打开系统的「减少动态效果」后，开合预览面板时 tile 直接到位。

### F. 预览卡片：稳定身份 + 描边降本（P1）

- **改什么**：
  1. **身份（二选一）**：
     - 渲染层：对 `kind === 'preview'` 的条目用 `source.id + meta.preview.abilityId` 作 `:key`，同时让 stagger 簿记把它当作"不是新行"；
     - 主进程：同一个 ability 用固定 id。这会跨层，得先确认使用统计、历史、曝光这些按 id 记账的地方都不受影响。
  2. **描边**：
     - 没有被选中或窗口隐藏时暂停（可以用 `subscribeRendererActivity`，`R/modules/telemetry/renderer-activity.ts:1-17`）；
     - 受低电量和 reduce 门控；
     - 外观要不要改见 D7。如果改，改成只在合成器上执行的实现：在带遮罩的容器里用 `transform: rotate` 旋转一张预先渲染好的 conic-gradient 图层；blur 只作用于静态图层。
- **文件**：`CoreBox.vue:1117-1134` 或 `M/addon/preview/preview-provider.ts:138-141`；`GradientBorder.vue`；`PreviewResultCard.vue:71`。
- **风险**：改 key 之后 WidgetFrame 会复用同一个实例。PreviewResultCard 完全由 props 驱动，所以没问题；自定义 widget 不在范围内。
- **验证**：
  - VTU：连续两个 preview 条目 id 不同但 ability 相同时，DOM 节点不变；
  - DevTools Performance：输入 `123+456` 期间，描边不应该产生每帧的 Paint。

### G. 列表模式重排时做 FLIP 位移（P1，需 D1、D3）

- **改什么**：
  1. 列表行加上 `data-flip-key` 和 `data-flip="move"`；
  2. 列表模式下，`res` 变化时在 pre-flush 阶段用 `captureFlipSnapshot` 记录位置；
  3. 更新完成后用 `playFlip` 只对**已有而且确实移动了**的行做 translate；新出现的行照常走入场逻辑（stagger 或不动）。同一行不会既是新行又在移动，所以两种 transform 不会冲突；
  4. 为了控制成本，只记录视口上下各一屏范围内的行；
  5. 门控用 `resultTransitionEnabled` 加 reduce（方案 E）。
- **为什么**：延迟层插入时，下面的行不再瞬间被推下去；DOM 仍然是一次性更新完成，符合规范「Ready results must not wait for reveal motion」（先完成更新，再用 transform 过渡，行始终不透明）。
- **文件**：`CoreBox.vue:552-602,858-871,1111-1135`；`flip-layout.ts` 可以直接复用。
- **风险**：每来一批都要读一次 rect，会触发一次强制布局，但更新之前布局通常是干净的；滚动中执行 FLIP 时要以滚动容器为坐标参照。这些都需要在真机上跑一次 profile。
- **验证**：CoreBox 挂载测试：发生重排时对移动了的行调用 `playFlip`，对新行不调用。真机：延迟层插入时逐帧截图，下面的行应当是滑下去而不是跳下去。

### H. 修正 stagger 簿记（P2，只影响打开了开关的用户）

- **改什么**：
  - `newItemIds` 改成合并，每个 id 按"入场时间 + 延迟 + 140ms"各自过期，不再整体替换；
  - 延迟按"本批新行里的序号"计算，而不是按绝对行号；
  - 整批刷新时，仍然留在屏幕上的旧行不再重新入场。
- **文件**：`CoreBox.vue:552-602,1124-1132`；`stagger-delay.ts` 和对应测试。
- **验证**：把第 6 节探针 1 反过来写：第二批在 320ms 内到达时，第一批仍然带着 class，直到各自过期；第 40 行单独插入时延迟为 0。

### I. 历史面板（P2）

- **改什么**：宽度一次切换到位，再用 transform 滑入（参照 `TuffItemAddon.vue:30-49` 的注释），或者改成浮层；删掉无效的 `opacity 0.25s`；内层不要从 `opacity: 0` 开始。
- **文件**：`PreviewHistoryPanel.vue:90-126`。
- **验证**：Performance 面板里，打开面板期间没有每帧的 Layout。

### J. 选中高亮统一成一个时钟（P2）

- **改什么**：列表行背景和指示条统一成 ≤80ms，或者键盘移动时直接瞬切；网格 tile 的填充和边框用同一个时钟。另外，"一个跟着移动的选中指示条"（用 transform 平移）属于新增动画，需要老板决定（D8）。
- **文件**：`BoxItem.vue:153,241`；`BoxGridItem.vue:104-120`；`R/styles/index.scss:70-86`（或者只在 BoxGridItem 局部加过渡）。
- **验证**：按住 ArrowDown 逐帧截图，每一帧只有一行处于高亮状态。

### K. 悬停处理（P2）

- **改什么**：
  - 主题的悬停规则改成 `.BoxItem:hover:not(.is-active)`；
  - 在键盘操作或结果变化之后给 wrapper 加上 `data-pointer-idle`，到下一次 `mousemove` 之前不显示悬停样式；
  - `scale` 风格要么加上短暂的 transform 过渡，要么直接移除。
- **文件**：`CoreBox.vue:1271-1282`，加一个很小的事件处理。
- **验证**：jsdom 模拟不了 `:hover`，改为测试 `data-pointer-idle` 的切换逻辑。真机：鼠标停在列表上、同时用方向键移动，截图确认。

### L. 高度测量排除容器自身的 transform（P2）

- **改什么**：底边计算时把子元素当前的 translateY 减掉，或者把 `.CoreBoxRes-ScrollContent` 设为 `position: relative`，让子元素的 `offsetTop` 相对它计算，从而不再需要 rect。两种做法都必须保留 b37697b1a 修过的那个场景。
- **文件**：`useResize.ts:51-82`；`CoreBox.vue:1490-1496`。
- **验证**：`useResize` 单测：子元素的 rect 比它的 offset 盒子大 8px 时，测量结果等于 offset 盒子的高度。

### M. 预览内容占位（P2）

- **改什么**：资源还没就绪时，先显示这个文件的 `DefaultPreview`（图标，可以同步拿到），就绪后再换成富预览；"打开方式"按钮保留固定宽度，或者只对文字做淡入淡出。
- **文件**：`TuffItemPreviewer.vue:183-221,301-310`。
- **验证**：VTU：资源请求 pending 期间渲染的是 `.DefaultPreview`。

### N. 杂项（P3）

- **胶囊动画**：`ActivatedProviders.vue:147-161` 改用 clip-path 或 transform，或者一次展开后就停住。属于 header，可以放到别的任务里做。
- **过时注释**：修掉 `useSearch.ts:443-449`。
- **设置描述**：让 `resultTransition` 的描述和实际行为一致（`zh-CN.json`、`en-US.json:1100-1101`）。
- **执行时闪帧**：把"清空输入和结果"挪到 hide 确认之后（`useSearch.ts:1567-1581,1599-1602`），但要先用帧捕获确认真的会闪。

### 需要老板拍板的决策点

- **D1**：默认动效怎么定。保持三个开关都默认关闭；还是默认开一套最小的"落位"动效（例如方案 G 的列表 FLIP，加 ≤120ms、≤6px 的新行 translate）？我的建议：stagger 继续默认关闭；G 在真机上量过帧率之后再决定要不要默认开启。
- **D2**：焦点停在非文件行时，预览面板怎么办。
  - (a) 延迟 200ms 再关闭，期间继续显示上一个文件；
  - (b) 延迟关闭，期间显示当前条目的通用信息卡（这是新 UI）；
  - (c) 列表模式下改成浮层抽屉，不压缩列宽。这会和 e6d7411aa 的网格重排设计冲突，只适合列表模式。

  我的建议是 (a)。
- **D3**：流式重排时怎么处理行的位置。现在是瞬间跳；可选 FLIP 过渡（方案 G）；或者在流结束之前冻结"选中行和首屏以上"的行，只往下方插入（这会改变 search-core.ts:116-119 定下的重排意图）。
- **D4**：同一查询的刷新改成在 complete 时对账（方案 B），也就是修改 07-15 的中间态约定和它的测试。
- **D5**：查询细化（文本变了）时，要不要沿用上一次延迟层的行？**不建议**：会短暂显示不匹配的行。如果要做，应该由主进程按新查询把上一次延迟层的结果预过滤一遍，放进快照里，改动量很大。
- **D6**：空结果的中间态。按 07-15 维持现状（complete 时收起）；还是保留上一次的结果直到 complete（会看到过时内容）？不能加任何"搜索中"占位。
- **D7**：预览卡片的彩色描边要不要保留动画（外观），或者改成静态描边、只在选中时流动。
- **D8**：选中指示条要不要做成跟着移动的动画（新增动画），还是保持高亮瞬切。

---

## 4. 不要改的，以及原因

| 不要做 | 原因 / 出处 |
|---|---|
| 在结果分支外面包 `<Transition mode="out-in">` | 下一个分支要等上一个的动画帧结束才会挂载，底栏会先显示新条目，看起来就像搜索变慢了。见 8f34ba297（09-10）和规范 `component-guidelines.md:221-240`；回归测试在 `CoreBox.result-switch.test.ts` |
| 按批次或按查询重新 key 列表容器 | 会整表拆掉再从空白重画，这是闪烁的根因。见 5f44512ca（07-22） |
| 入场或过渡关键帧里带 `opacity: 0`，或者用"延迟显示"的 class | 会挡住已经就绪的内容。8f34ba297 已经从 `result-layout-in` 和 `item-stagger-in` 里去掉了 opacity |
| 恢复网格 tile 的入场动画（opacity 0 + scale 0.6 + `blur(8px)`，0.6s 回弹） | 89e1f5963（05-14）专门删掉了它：blur 很贵、会挡内容、而且回弹。规范「compile the spring」也反对用关键帧做回弹 |
| 对结果列宽度、tile 的 padding 或标签高度、面板宽度做过渡 | 每帧都会重新布局并重绘预览图，收起时会卡。见 e6d7411aa（09-06）；方案 I 正是按这个思路改历史面板 |
| 取消 stagger 的延迟上限 | 9610832ec：延迟 180ms 加动画 140ms ≤ 320ms 的清理窗口，超过就会被截断然后弹回原位；不封顶时第 79 行要等约 4.3s |
| 去掉"加载中窗口高度只增不减" | 9610832ec（`useResize.ts:170-183`）：否则每次输入停顿都会先缩再长 |
| 用 `scrollHeight` 测量窗口高度 | TxScroll 会把内容撑满视口，形成反馈循环。见 8487791cd（`useResize.ts:79-80` 的注释） |
| 默认开启 `coreBoxResize` | 主进程用 16ms 轮询驱动动画，会直接受 232–505ms 的主循环卡顿影响（D.2026-09-25.log）；设置页也标着 Beta（`ThemeStyle.vue:852-857`） |
| 在结果区重新加"搜索中 / 预热 / 索引中"的提示或占位 | 07-15 的决定（b80730046）。header 的 SearchPulse 是唯一的搜索中提示 |
| 键盘导航改成平滑滚动 | 按住方向键时平滑滚动会落后于选中行；而且 native 和 BetterScroll 的表现不一致。目前的"瞬时滚到最少需要的位置"是启动器的常规做法 |
| 用 `filter`、`background-position`、自定义属性或尺寸做持续动画 | 搜索期间渲染主线程是瓶颈（记忆 corebox-slow-diagnostics、SearchPulse 的 R5），只允许用 transform 和 opacity |

---

## 5. 与姊妹任务的交界

- **09-25-corebox-search-pulse-beam**：SearchPulse 是唯一的搜索中提示，出现前有 600ms 延迟，至少显示 400ms。流式重排（2.2）发生在光带下面；本任务的所有方案都不在结果区加占位，与它不冲突。它对 `CoreBox.vue` 的改动还没提交，实施本任务前需要先合并或变基。
- **09-25-corebox-keyboard-jump**（下键时选中跳到最后一个文件）：相关代码路径是 `restoreFocusedItem`（`useSearch.ts:582-590`）、索引提交刷新（1401-1445）、焦点边界钳制（`useKeyboard.ts:1056-1060`）、`itemRefs` 重置（`CoreBox.vue:553`），以及快照恢复选中（`useSearch.ts:961-966`）。方案 B 和 D 会改到同一批代码，建议两个任务一起排期，或者先定下谁负责焦点恢复。

---

## 6. 附：/tmp 探针（可复现）

- **文件**：`/tmp/corebox-motion-probe/motion-probe.test.ts`，`node_modules` 通过符号链接指向 `apps/core-app/node_modules`。/tmp 会被清理，下面记下了关键内容以便重建。
- **搭建方式**：mock 全部照抄 `R/views/box/CoreBox.result-switch.test.ts`，改动有四处：
  - `appSetting.animation = { listItemStagger: true, resultTransition: false }`；
  - 相对路径的 mock 换成绝对路径；
  - `TuffItemAddon` 的 stub 输出 `data-type`；
  - `CoreBoxRender` 的 stub 输出 `.row[data-id]`，让 class 透传到这个节点上。
- **运行命令**（在仓库根目录执行；/tmp 在 macOS 上要写成 `/private/tmp`，否则 vite 解析不到文件）：
  ```
  apps/core-app/node_modules/.bin/vitest run --config $PWD/apps/core-app/vitest.config.ts \
    --root /private/tmp/corebox-motion-probe motion-probe.test.ts
  ```
- **结果（3/3 通过，2026-09-26 00:01）**：
  1. 快照 `[app-a,app-b,app-c]` 到达后，三行都带 `.is-new-item`；60ms 后延迟批次 `[app-a,file-x,app-b,app-c]` 到达，只剩 `[file-x]` 带着，前三行被打断（对应 2.5）；
  2. 查询细化后快照只剩 `[app-a,app-b]`；延迟批次把 `file-x` 加回来时，它被当作新行（对应 2.2）；
  3. 焦点按 0→1→2→1→0 移动时，`compressed` 为 `F/T/F/T/F`，面板为 `none/preview/none/preview/none`（对应 2.1）。

---

## 相关文件

| 文件 | 说明 |
|---|---|
| `R/views/box/CoreBox.vue` | 结果区、stagger 簿记、FLIP 捕获、预览面板开合、悬停主题、动效 CSS |
| `R/views/box/stagger-delay.ts` | stagger 延迟曲线和 180ms 上限 |
| `R/modules/box/adapter/hooks/flip-layout.ts` | WAAPI FLIP（220ms） |
| `R/components/render/BoxGrid.vue`、`BoxGridItem.vue` | 网格、分区、FLIP 标记、紧凑态、`rainbow-border` |
| `R/components/render/CoreBoxRender.vue`、`BoxItem.vue`、`WidgetFrame.vue` | 列表行、自定义和 widget 条目 |
| `R/components/render/addon/TuffItemAddon.vue`、`TuffItemPreviewer.vue`、`preview/*.vue` | 预览面板和预览内容 |
| `R/components/render/custom/PreviewResultCard.vue`、`CoreIntelligenceAnswer.vue`、`PreviewHistoryPanel.vue` | 预览卡片、AI 卡片、历史面板 |
| `R/components/base/effect/GradientBorder.vue` | 主线程上的旋转描边 |
| `R/components/render/CoreBoxFooter.vue` | 底栏去抖和上滑、backdrop-filter |
| `R/modules/box/adapter/hooks/useSearch.ts` | 快照替换、合并重排、焦点跟随、推荐路径清空、索引提交刷新 |
| `R/modules/box/adapter/hooks/useKeyboard.ts` | 方向键和瞬时滚动 |
| `R/modules/box/adapter/hooks/useResize.ts` | 高度测量、节流、稳定测量、只增不减 |
| `M/core-box/index.ts`、`window.ts`、`bounds-controller.ts` | 主进程布局更新、setHeight、窗口动画 |
| `M/search-engine/search-gather.ts`、`search-core.ts` | 快层和延迟层、快照和 update |
| `M/addon/preview/preview-provider.ts` | 预览卡片的 id 生成方式 |
| `R/modules/hooks/useBatteryOptimizer.ts`、`R/App.vue`、`R/components/app/MainWindowRuntimeServices.vue` | 低电量门控的挂载点 |
| `R/styles/accessibility.scss`、`R/styles/index.scss` | 全局 reduce 规则和低电量开关 |
| `packages/utils/common/storage/entity/app-settings.ts` | 动效开关的默认值 |

## 相关规范

- `.trellis/spec/frontend/component-guidelines.md`：Loading States（187-219）；Ready results must not wait for reveal motion（221-240）；State motion 与弹簧（153-163）。
- `.trellis/spec/frontend/hook-guidelines.md:62-64`：CoreBox 常驻，隐藏时不能有持续的 RAF 或动画；`document.hidden` 不可信。
- `.trellis/tasks/09-25-corebox-search-pulse-beam/prd.md`：搜索中提示和主线程约束（R5）。
- `b80730046:.trellis/tasks/07-15-progressive-corebox-index-search/prd.md`：不许有过渡提示；刷新用完整快照（R1、R3）。
- 记忆：`corebox-slow-diagnostics.md`、`clipboard-corebox-show-baseline-fix.md`（主线程或主循环阻塞才是"卡"的主因）。
- 真机帧捕获的启动方式：`apps/core-app/scripts/coreapp-visible-release-notes-probe.ts:37-47`（用隔离的 user-data 目录，加 `--remote-debugging-port`）。逐帧截图可以用 CDP 的 `Animation.setPlaybackRate` 放慢动画（记忆 ego-browser quirks）。

## 外部参考（本次没有重新联网核实）

- web.dev《How to create high-performance CSS animations》：动画只用 transform 和 opacity。
- MDN `Element.animate()` 与 `@media (prefers-reduced-motion)`：WAAPI 不受 CSS 媒体查询影响，需要在脚本里自己判断。

## 注意事项 / 未确认的部分

- 2.3（打开和清空时的空白）、2.9（窗口滞后的具体帧数）、2.11（高亮拖尾）、2.14（执行时闪帧）是按代码推断的，**需要在真机上逐帧截图确认和量化**。这次没有启动 Electron：工作区和其他会话共用，dev 服务也是共享资源。
- 2.7 里"隐藏窗口的无限动画是否还在跑"取决于 Chromium 在窗口隐藏后还出不出帧，没有验证。
- `rainbow-border` 和 `CoreIntelligenceAnswer` 目前在仓库里找不到生产者，按"可能走不到"处理。
- 顺带发现一个和动效无关的问题：窗口隐藏时 `document.hidden` 可能仍然是 false，而索引提交刷新的判断依赖 `document.hidden`（`useSearch.ts:1403`），所以窗口隐藏且留着非空查询时，可能每 ≥500ms 还在重新搜索一次。没有验证，不在本任务范围内。
