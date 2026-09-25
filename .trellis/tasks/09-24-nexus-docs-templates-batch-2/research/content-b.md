# Research: 第二批内容运营新章节 B（Store 插件商店 / Docs 知识库阅读器）

- **Query**: 为 Templates tab 的两个新章节（Store 插件商店、Docs 知识库阅读器）调研尚未覆盖的 tuffex 组件（源码 / 文档页 / demo），给出三档容器宽度下的组合方案、交互、自动演示、双语 mock 数据与风险；TxMarkdownView 重点查标题 id、代码高亮、链接拦截。
- **Scope**: internal 为主（tuffex 源码、Nexus 模板 / demo / 文档页源码、`plugins/*/manifest.json`、权限注册表与 i18n、core-app 商店文案）。外部核对：用仓库内 marked 17.0.6 + DOMPurify 3.4.13 + jsdom 26.1.0 跑了 3 个探针；在 ego（Chromium 152）里跑了 2 个 DOM 移动探针。未做网页检索。
- **Date**: 2026-09-24
- **基线**: tuffex 源码与 Nexus 源码读于 2026-09-24。工作树里有并行会话的未提交改动，本文涉及两处：`TuffexDocsHeroBackground.vue` 的 `.dark` 泄漏修复（未提交，见 R9）；PRD / spec 若干文件。组件 API 与 batch 1 调研时一致（`TxImageGallery`、`TxTree`、`TxMarkdownView` 近期提交均不改 API）。
- **与兄弟调研的关系**: batch 1 的 `research/content.md`、`app-shells.md`、`data-flow.md`、`ai.md` 已覆盖的组件只引用、不重抄；本文只补新组件、补深 TxTree / TxMarkdownView，并记录新发现的冲突。

---

## 结论速览

1. **商店的真实数据在仓库里现成**：
   - 插件：`plugins/*/manifest.json` 有 id、版本、描述、功能与触发词（如翻译的 `fy`）、`permissions.required/optional`、逐项 `permissionReasons`。
   - 权限：`packages/utils/permission/registry.ts` 给出风险等级，`packages/utils/i18n/locales/{zh,en}.json` 有中英名称。
   - 安装流程：core-app `store.installation.*` 有完整状态文案 queued → downloading → verifying → awaitingConfirm → installing → completed / failed / cancelled，以及「始终允许 / 仅本次会话 / 拒绝安装」。
   - 模板可以用真 id、真权限、真文案。评分、安装量、评价是示例数据，页面上要标出来。
2. **禁价格**：`apps/nexus/AGENTS.md:31-35` 禁止 mock checkout、伪成功购买入口、固定假价格；`FREE/PRO/…` 只能作权限层级占位。商店不出现价格、「Pro」角标或付费标签，只有安装 / 更新 / 卸载 / 停用。
3. **详情不要用 TxDrawer**（源码核实）。TxDrawer 在 document 上处理 Tab 和 Esc（`TxDrawer.vue:162-173,209`），既不看 `defaultPrevented`，也不看自己是否在最上层；焦点在上层 TxModal 里时，Tab 会被拽回抽屉，一次 Esc 同时关掉 modal 和抽屉（`:131-159`）。详情里的截图灯箱（TxImageGallery 自带 TxModal）和权限确认都是 modal，所以详情做成**模板内视图 / 右侧栏**，modal 只用于确认和灯箱。
4. **TxMarkdownView 三问（已实测）**：
   - **标题 id**：没有。marked 17 不生成 id；DOMPurify 会保留手写 id，但会删掉会覆盖 DOM 属性的名字（如 `location`）。
   - **不要给文章标题加 id**：docs 页的 `DocsOutline` 在 window 上听 `hashchange`，拿 `getElementById(hash)` 去 `window.scrollTo`（`DocsOutline.vue:200-205,257-263,285`）。大纲请用「源码解析 + DOM 按序号对应」。
   - **代码高亮**：没有，输出是 `<pre><code class="language-ts">`。要高亮就换 TxStreamMarkdown（非流式），它内部用 TxCodeBlock + Shiki。
   - **链接**：是真 `<a>`，必须在外层 `@click` / `@auxclick` 里委托拦截。内部链接用 `#kb:<id>` 这类 DOMPurify 会保留的 href；`kb:` 这类自定义协议会被删掉。
5. **docs 页会碰模板里的 `<code>`（新发现）**：
   - 常驻问题：`[...slug].vue:1908` 在 document 上挂了 click 监听，只要点到 `.docs-prose` 下的行内 `code` 就 `preventDefault + stopPropagation`，写真实剪贴板，并弹 **Nexus 站点 toast**（`:1374-1446`）。模板在栏内时就在 `.docs-prose` 里，`not-prose` 挡不住。
   - 时序问题：`enhanceCodeBlocks` 会给行内 code 加 `role=button tabindex=0`、往 `pre` 里插 `.docs-code-header`（`:1449-1468,1790-1818`）；`plugins/highlight.client.ts` 会对当时存在的 `pre code` 跑 hljs。这两件只有模板比这些处理先挂载时才会发生。
   - Docs 模板在文章容器上对行内 code 的点击 `stopPropagation`，并在 ego 冷启动时验一次。
6. **展开 / 收起会把模板内滚动位置清零（ego 实测）**：Vue Teleport 切 `disabled` 时用 `insertBefore` 移动节点。Chromium 152 里滚动区从 600 变 0，而且**不派发 scroll 事件**；`moveBefore()` 能保留，但 Vue 不用它。大纲跟随和商店浏览区都会跳回顶部。对策：scroll 监听里缓存 `lastScrollTop`，`expanded` 变化后在 `nextTick` 写回。
7. **TxTree 适合做知识库导航，但点击语义要宿主接**：整行点击走 `toggleSelect`，只有 caret 才展开（`TxTree.vue:249-254,387-398`）。用受控 `:model-value`（当前文章）+ `v-model:expanded-keys` + `@select`：分组节点切换展开，叶子节点打开文章。`filter-text` 会自动展开命中项的祖先；行 14px，空态和 caret 的 aria 是写死的英文。
8. **TxVersionCapsule 的面板不 teleport**：面板 `position:absolute`、宽 394px（`TxVersionCapsule.vue:232,352-359`）。只在打开时挂 document 级 `pointerdown` / `keydown`，Esc 不 `preventDefault`，焦点在面板里时会连 TemplateFrame 展开层一起关。用法：放在详情头部上方留足空间、外包 `@keydown.esc` 先 `preventDefault`，或不填面板插槽只当触发器。条目别给 `href`（会渲染真 `<a>`，现有 demo 就用了 `#b18`）。
9. **TxSearchSelect 是「带建议的搜索」最接近的真组件**：组合框 + teleport 面板，`remote` 模式下由宿主算建议，Esc 已 `preventDefault`。
   - 选项只有 `{ value, label, disabled }`，没有图标或插槽。
   - 空态写死英文 `No results`（`TxSearchSelect.vue:340`）：无匹配时塞一个 disabled 的本地化选项就能避开。
10. **TxCard 不要开 `clickable`**：卡片会变成 `role=button`，里面再放安装按钮就是嵌套交互。根节点始终带 `transform` + `will-change`（`TxCard.vue:543-545`）；`inertial` 的 rAF 弹簧不理会减弱动效，也不要开。TxCardItem 适合列表行（已安装、建议、相关文章、上下篇）。
11. **大纲跟随**：root 用模板自己的滚动区（原生 `overflow:auto` 的 div，别用默认 BetterScroll 的 TxScroll）。点大纲用 `scroller.scrollTo`，禁止 `scrollIntoView`。滑动指示条用 `@talex-touch/tuffex/sidebar-nav` 导出的 `useIndicatorBox`（纯函数、无模块状态）。
12. **本文查找**：优先用 CSS Custom Highlight API，不改 v-html 的 DOM。ego 实测 Chromium 152 支持（`'highlights' in CSS` 为 true）；Safari 17.2+ / Firefox 140+ 支持来自记忆、**未在本地核实**，一律做特性检测。
13. **图标**：本文提到的 `i-carbon-*` 全部对 `@iconify-json/carbon` 核过。不存在的：`command` `clipboard` `view-all` `hot` `verified-filled` `shield-check` `lightbulb` `enter` `rating`。真实商店页 `useStoreCategories.ts` 里就用了不存在的 `i-carbon-view-all`，别照抄。
14. **注册名**：`TuffProgress`（不是 TxProgress）、`TxCodeBlock`、`TxCornerOverlay`、`TxCollapse` / `TxCollapseItem`、`TxVersionDownloadPanel` / `TxVersionHistoryPanel` 都在 `.nuxt/components.d.ts` 自动注册。`@talex-touch/tuff-business` 的 `TxPluginMetaHeader`（真实商店卡片在用）不是 tuffex 组件、不会自动注册，模板别用。

---

## Reused from batch 1

以下组件 batch 1 已有 cheat sheet，按「位置」查；本表只写第二批两章的**额外**要点。

| 组件 | batch 1 位置 | 本批用途与额外要点 |
|---|---|---|
| TxFilterChips | content.md:289-333；app-shells.md:439-453 | 商店「发现 / 已安装」（`role="tablist"`）与分类筛选（计数由数据推导）。单选；溢出时横向滚动 |
| TxSearchInput | content.md:401-409；app-shells.md:184-194 | 知识库「筛选目录」「本文查找」。没有 suffix 插槽，n/m 计数写在输入框外；class 落在无 scope 的外层，宽度要在包装上用 `:deep` 设 |
| TxSearchPanel | app-shells.md:363-390 | 不推荐：默认 288px、行高 32px、列表不限高、不上报高亮 |
| TxCommandPalette | app-shells.md:156-182 | 知识库 ⌘K：文章 + 各章节标题 + 快捷操作。整页遮罩；不恢复焦点，`close` 后要把焦点还给触发按钮（`preventScroll`）。先例 `TemplateShellDemo.vue:653-661,1027-1042` |
| TxBreadcrumb | app-shells.md:141-154 | 知识库面包屑。**不要给 `href`**（渲染真 `<a>`）；非末项无 href 时发 `click(item, index)`；不省略 |
| TxRating | content.md:758-767 | 卡片与评价列表只读，详情「写评价」可交互。只读的读屏问题见下方新 cheat sheet |
| TxTag / TxBadge / TxStatusBadge | content.md:335-350,822-825；app-shells.md:214-230 | 渠道 BETA / RELEASE、分类、风险等级。StatusBadge 的 warning 默认图标是时钟（design.md §6.11），「可更新」要显式传 `icon="i-carbon-upgrade"`；不要用 `os`（缺 simple-icons） |
| TxAvatar / TxAvatarGroup | content.md:352-373；app-shells.md:202-212 | 评价作者、文章贡献者，只用首字母，不外链头像 |
| TxImageGallery | content.md:675-686 | 商店截图。不能程序化打开；灯箱是 TxModal；6 个文案 prop 要本地化。16:10 覆盖见下方新 cheat sheet |
| TxModal | content.md:800-810；app-shells.md:618-625 | 权限确认、更新确认、卸载确认。Esc / Tab 绑在自己的遮罩上，可以嵌套，不和 TemplateFrame 冲突 |
| TxDrawer | content.md:476-515 | 本批**不用**，原因见下方新 cheat sheet 与 R3 |
| TxTabs / TxTabItem | content.md:747-756；app-shells.md:478-497 | 商店详情「概览 / 权限 / 版本 / 评价」。真实先例 `apps/nexus/app/pages/store.vue:589-670`：`placement="top" borderless :content-padding="0" :content-scrollable="false" indicator-variant="pill"`，`TxTabItem name="overview" icon-class=…` 加 `#name` 插槽。只渲染当前面板；减弱动效时传 `animation` 全关 |
| TxTimeline | app-shells.md:277-288；data-flow.md:259-263 | 版本历史。暗色白环仍在（`TxTimelineItem.vue:103`），用 `:deep(.tx-timeline-item__dot){border-color:var(--tx-bg-color)}` 覆盖 |
| TxProgressBar | data-flow.md:173-177 | 安装进度与评分分布条。安装专用要点见下方新 cheat sheet |
| TxSteps / TxStep | data-flow.md:279-284 | 可选：宽档详情显示安装阶段。没有 v-model，子项要 `:clickable="false"` |
| TxButton / TxIconButton | content.md:417-440；app-shells.md:341-350 | 安装 / 更新 / 打开；轮播上一张 / 下一张 / 暂停（`pressed`） |
| TxDropdownMenu | content.md:442-474；app-shells.md:320-339 | 「⋯」菜单（停用 / 卸载 / 复制 ID）、排序、知识库栏内的「本页目录」。Esc 由触发器的 `aria-expanded` 让 TemplateFrame 放行 |
| TxTooltip / TxPopover | content.md:827-838；app-shells.md:352-361 | 官方认证说明、图标按钮提示 |
| TxToastPanel | app-shells.md:306-318；content.md:651 | 两章全部反馈（已安装、已卸载、感谢反馈、宿主会打开外链）。受控 `open`，就地渲染 |
| TxEmptyState / TxSearchEmpty | content.md:653-665；app-shells.md:460-469 | 搜索无结果、全部卸载、目录筛选为空。插画无限动画没有减弱动效，用静态 `#icon` 插槽 |
| TxSkeleton / useDeferredLoading | content.md:667-673 | 切分类 / 切文章的模拟加载；`useDeferredLoading` 从 `skeleton/index.ts:24` 导出 |
| TxEdgeFadeMask | content.md:788-798 | 商店浏览区（纵向）、「编辑精选」横向行。视口类名 `.tx-edge-fade-mask__viewport`（先例 `TemplateGalleryDemo.vue:816-820` 用 querySelector 取视口复位） |
| TxGlassSurface | content.md:769-786；app-shells.md:410-425 | 可选：轮播说明条（背后正好是 SVG 彩图），全模板至多 1–2 个 |
| TxSidebarNav | content.md:868-905 | 商店宽档左栏（浏览 / 分类分组 + 计数 badge）。**不传 `search-hint`**；`--tx-bui-sidebar-nav-width:100%`、`--tx-bui-shadow-raised:none` |
| TxIconChip | app-shells.md:392-399 | 插件图标（色调按分类）。6 个 tone，`<i class="i-carbon-…">` 按字号放大 |
| TxKbd | app-shells.md:196-200 | ⌘K、`/`、面板底栏按键提示 |
| TxFlatRadio | content.md:739-745 | 商店排序（热门 / 最新 / 评分）、知识库「有帮助 / 没帮助」 |
| TxSwitch / TxCheckbox / TxTextarea | content.md:544-549,605-609；app-shells.md:596-599 | 已安装页启用开关、反馈原因、评价正文 |
| TxSuggestionChips | ai.md:431-434 | 可选：「热门搜索」「相关问题」。暗色下底色透明 |
| TxStagger | content.md:840-850 | 可选：切分类时卡片入场。无减弱动效规则，减弱动效时不播 |
| 模板共用约定 | `.trellis/spec/frontend/nexus-docs-templates.md` §2-§9；content.md:1009-1046 | 接入链路、TemplateFrame 行为矩阵、StageSize 中继（`TemplateGalleryDemo.vue:67-80`）、mode 计算（`:709-716`）、toast 面板（`:1315-1325`）、详情 modal（`:1392-1497`） |

batch 1 已知缺陷总表见 `09-23-nexus-docs-templates-tab/design.md:272-288`（§6.11）。其中与本批相关的：`TxMarkdownView` / `TxStreamMarkdown` 正文固定 16px、StatusBadge warning 图标是时钟、`TxModal` / `TxStagger` / `TxDrawer` 不理会减弱动效，以及一批写死的英文。

---

## New component cheat sheets

「源码」= `packages/tuffex/packages/components/src/<slug>/`。「浮层」一栏写的是：是否 teleport、怎么定位、z-index 从哪来。

### TxCard（`card`）— 商店卡片 / 详情分区面

**导出**：`TxCard` / `Card`；类型 `TxCardProps`、`TxCardVariant`、`TxCardBackground`、`TxCardShadow`、`TxCardSize`、`TxCardRefractionTone`（`card/index.ts:12-14`）。

**Props**（默认值见 `TxCard.vue:8-40`）

| Prop | 默认值 | 说明 |
|---|---|---|
| `variant` | `'solid'` | 可选 `'dashed'`；`'plain'` 为无边框 |
| `background` | `'pure'` | 可选 `'mask'`、`'blur'`、`'glass'`、`'refraction'` |
| `shadow` | `'none'` | 可选 `'soft'`、`'medium'` |
| `size` | `'medium'` | padding 小 10 / 中 12 / 大 16 |
| `radius` | 18 | 数字 |
| `padding` | — | 数字，覆盖 `size` 的内边距 |
| `clickable` | `false` | |
| `loading` | `false` | |
| `disabled` | `false` | |
| `inertial` | `false` | 另有 `inertialMaxOffset` / `inertialRebound` |
| glass / refraction 参数 | — | `glassBlur`、`glassBlurAmount=22`、`refractionStrength`…，本批不用 |

**Events / 插槽 / Expose**

- Events：`click(ev)`，只在 `clickable` 且未禁用时发出（`:433-452`）。键盘 Enter / Space 只认卡片自身，slot 内控件的回车不触发。
- 插槽：`cover`（负 margin 铺满，圆角裁切）、`header`、default、`footer`（`:505-519`）。
- 无 expose。

**外观**

- `pure` 面：`var(--tx-surface-color, var(--tx-fill-color-lighter))`（`base-surface/src/style/index.scss:7-9`）。亮色是浅灰 #fafafa，暗色跟随 token。
- 边框：1px `--tx-border-color-light` 72%；hover 时混入 36% 主色。
- 阴影：`soft` 为 `5px 10px 26px`，符合单一左上光源（x:y = 1:2）。

**必须知道**

- 根节点**始终**带 `transform: translate3d(var(--tx-card-dx), …)` 和 `will-change: transform`（`:543-545`）。所以它是 fixed 后代的包含块，每张卡是一个合成层。卡里的浮层一律用会 teleport 的组件。
- `clickable` 时根节点变成 `role="button" tabindex=0`（`:477`）。卡里再放「安装」按钮就是嵌套交互，a11y 不合格。
  - 做法：不开 `clickable`；标题做成 `<button>` 打开详情，安装按钮独立。
  - 需要整卡可点时，用「伸展链接」手写（标题按钮 `::after` 覆盖整卡），安装按钮 `position:relative; z-index:1` 压在上面。
- `inertial` 的 rAF 弹簧（`:222-255`）不检查 `prefers-reduced-motion`；样式里的减弱动效块只关了 transition（`:612-617`）。不要开。
- 按下反馈 `scale: 0.985` 只对 clickable 生效。

**借鉴**：`CardCardCompositionsDemo.vue`、`CardHeaderFooterActionsDemo.vue`。真实商店卡片 `apps/nexus/app/components/store/StoreItem.vue` 可作字段参考：分类 Tag、更新日期、版本、渠道 StatusBadge、安装量、badges；但它用的 `TxPluginMetaHeader` 来自 `@talex-touch/tuff-business`，模板不用。

### TxCardItem（`card-item`）— 已安装行 / 搜索建议 / 相关文章 / 上下篇

**导出**：`TxCardItem` / `CardItem`；类型 `CardItemProps`、`CardItemAvatarShape`。

**Props**（`TxCardItem.vue:9-26`）

| Prop | 默认值 | 说明 |
|---|---|---|
| `title` / `subtitle` / `description` | — | |
| `iconClass` | — | 渲染 `<i>`，18px |
| `avatarText` / `avatarUrl` | — | `avatarUrl` 可以是 data URI |
| `avatarSize` | 36 | |
| `avatarShape` | `'circle'` | `'rounded'` 为 12px 圆角 |
| `clickable` / `active` / `disabled` | — | |
| `tabindex` | — | 覆盖自动的 tab stop |
| `align` | `'start'` | 单行行用 `'center'` |
| `role` | — | 见下方注意 |

**插槽**：`avatar`、`title`、`subtitle`、`right`（flex 右对齐，gap 8）、`description`。**Events**：`click`。

**尺寸**

- padding 10/12，圆角 12。
- 标题 13px/600，**单行省略**；副标题 12px 单行省略；描述 12px 可换行（`:251-280`）。

**注意**

- **`role` 在源码里无条件绑定**（`:72`），文档页说只在 clickable 时生效（`card-item.zh.mdc:79`），两者不一致。只在 clickable 时传 `role`。
- clickable 行要自己给 `role="button"` 或 `role="link"`，组件没有默认 role。
- 右侧有按钮时整行不要 clickable，文档页最佳实践第 87、92 行也这么写。
- 暗色半透明面上 hover 看不见，改 `--tx-card-item-hover-bg`（文档页第 88 行）。

### TxVersionCapsule / TxVersionDownloadPanel / TxVersionHistoryPanel（`version-capsule`）— 详情版本 / 渠道

**导出**：三个组件 + 类型 `TxVersionCapsuleProps`、`TxVersionChannelTone`（stable / preview / nightly / neutral）、`TxVersionBuild`、`TxVersionNotice`、`TxVersionHistoryEntry` 等（`version-capsule/index.ts`）。

**TxVersionCapsule**（`TxVersionCapsule.vue:7-16`）

- **Props**：`version`（必填）、`channel?`、`tone='preview'`、`historyLabel='History'`、`downloadLabel='Download this build'`、`panel?`（`v-model:panel`，`undefined` 为非受控，`null` 为受控关闭）、`disabled`、`closeOnClickOutside=true`、`closeOnEsc=true`。
- **Events**：`update:panel`、`download`、`history`。
- **插槽**：`download { close }`、`history { close }`。
- **Expose**：`close`、`downloadRef`、`historyRef`。
- 形态：左段是「点 + 渠道 + 版本 + 下载图标」，右段是「历史 + 箭头」，高 44、14px。色调：stable 绿、preview 主色、nightly 橙、neutral 灰。
- **面板不 teleport**：`position:absolute; top:calc(100% + 10px); width:394px; max-width:min(394px, calc(100vw - 32px))`，`z-index: var(--tx-index-popper, 2000)`（`:232,352-367`）。
  - `max-width` 看的是视口，不是容器。
  - 在 `overflow:auto` 的详情滚动区里，面板会撑大可滚动区域；在 `overflow:hidden` 祖先里会被裁掉（TemplateFrame body 就是 hidden）。
- **监听**：打开时才在 document 上挂捕获阶段的 `pointerdown` 和 `keydown`（`:81-110`）。
  - Esc 直接 `close()`，**不 `preventDefault`**。
  - `close()` 把焦点还给分段按钮，不带 `preventScroll`（`:72-79`）。
- **与 TemplateFrame 展开层的交互**
  - 焦点在分段按钮上时：按钮有 `aria-expanded="true" aria-haspopup="dialog"`（`:145-147,176-178`），展开层按矩阵放行。
  - 焦点在面板里时（构建项 / 历史行）：展开层看不到 `aria-expanded`，会被一起关掉。
  - 对策：外包 `<span @keydown.esc="panel && $event.preventDefault()">`，配受控 `v-model:panel`。
- **只当触发器**：不填面板插槽时，分段仍发出 `download` / `history`，但不打开任何东西（`:48-69`）。按钮上的 `aria-haspopup="dialog"` 仍在，读屏语义略有偏差。
- **减弱动效**：有（`:382-391`）。

**TxVersionDownloadPanel**

- **Props**：`notice?: { tone?: 'warning'|'success'; title; description?; points?[] }`、`builds?: { id; name; meta?; href?; recommended?; icon? }[]`、`buildsLabel='Choose a build'`、`downloadLabel='Download'`、`emptyText`。
- **Events**：`select(id)`。
- 带 `href` 的项渲染成 `<a download>`（`TxVersionDownloadPanel.vue:78-87`），模板里**不要给 href**。

**TxVersionHistoryPanel**

- **Props**：`title='Version history'`、`latest?`、`entries?: { id; tag; channel?; tone?; date?; note?; href? }[]`、`latestLabel='LATEST'`、`countLabel?`、`notesLabel="What's new"`、`emptyText`。
- **Events**：`select(entry)`。**插槽**：`footer`。
- 有 `href` 的项同样渲染成 `<a>`。现有 demo `VersionCapsuleVersionCapsuleDemo.vue` 就给了 `href: '#b18'`，**别照抄**，否则会改 docs 页的 hash。
- 列表不限高、不滚动。
- 阴影 `var(--tx-box-shadow-dark, 0 24px 60px rgb(0 0 0/40%))` 不是 1:2 光源，属组件问题，模板不改。

**商店里的用法**：把渠道当成「构建」。

- `builds` 两项：
  - 稳定版 RELEASE 1.1.3 · 2.1 MB，`recommended`，图标 `i-carbon-checkmark-outline`。
  - 测试版 BETA 1.2.0-beta.6 · 2.3 MB，图标 `i-carbon-version`。
- `notice`：warning 色调「测试版可能不稳定」，points 取自现有 demo 的中文三条。
- `select(id)` → 切换渠道并走安装 / 更新流程。
- 历史面板列最近 4 版；`select` → 切到详情「版本」页，并高亮对应的 TxTimeline 项。

### TxTree（`tree`）— 知识库左侧目录（补全 content.md:907-915）

**Props**（运行时对象，`TxTree.vue:21-34`）

| Prop | 默认值 | 说明 |
|---|---|---|
| `nodes` | `[]` | `TreeNode { key; label; children?; leaf?; disabled?; icon? }` |
| `modelValue` | `undefined` | 受控选中；`undefined` 表示宿主不驱动 |
| `defaultSelectedKeys` | — | 非受控种子 |
| `expandedKeys` | `undefined` | 受控展开；配 `v-model:expanded-keys` |
| `defaultExpandedKeys` | `[]` | 按值 watch，不按引用 |
| `multiple` / `selectable=true` / `checkable` / `disabled` | — | |
| `indent` | 16 | |
| `filterText` / `filterMethod` | — | 见下方行为 |

**Events**：`update:modelValue`、`select({ key, node })`、`toggle({ key, expanded })`、`update:expandedKeys`（`types.ts:38-43`）。

**插槽**

- `item { node, level, expanded, hasChildren, selected, toggleExpand, toggleSelect, indent }`：只替换行的**视觉**，外层 `role="treeitem"` 与 aria 保留。
- `empty`：默认文案是英文 `No results`（`:348-351`）。

**Expose**：无。

**行为（知识库关心的）**

- **点整行 = 选择**：外层 `@click="handleItemClick"` → `toggleSelect`（`:249-254`）；展开只能点 caret（`@click.stop`，`:387-398`）。
  - 分组节点点击也会发 `select`：宿主在 `@select` 里判断 `node.children?.length`，对分组切换 `expandedKeys`、不改 `modelValue`，对叶子设当前文章。
  - 受控 `modelValue` 下分组永远 `aria-selected=false`，语义正确。
  - `#item` 插槽里自绘的 caret 同样要 `@click.stop="toggleExpand"`。
- **键盘**（`:284-339`）：完整 ARIA tree——↑ / ↓ / Home / End 移焦，→ 展开或进入子项，← 收起或回父项，Enter / Space 选择（Space 必 `preventDefault`）。
  - 移焦用 `.focus()`，**不带 `preventScroll`**（`:256-262`）；由读者按键触发，属于可接受的滚动。
- **过滤**：`filterText` 非空时，命中节点的祖先通过 `effectiveExpanded` 临时展开，不改写 `expandedKeys`；默认按 label 小写包含匹配。
- **外观**：
  - 行 `padding: 6px 10px`、圆角 10、项间距 4，label 14px（`:445-497`）。
  - 选中底色是主色 12%，hover 用 `--tx-fill-color`。
  - caret 是内联 SVG（不依赖图标集），靠内联 `transform` 旋转、**没有过渡**，所以不涉及减弱动效；行背景有 150ms transition。
- **无障碍文案**：caret 的 aria 写死 `Collapse` / `Expand`（`:392`），勾选框写死 `Select`。
- **根节点**：`role="tree"`，未关闭 inheritAttrs，所以 `aria-label` 会透传到根节点。

**知识库用法**：`<TxTree :nodes :model-value="articleId" v-model:expanded-keys="open" :filter-text="navQuery" aria-label="帮助中心目录" @select="onNavSelect">`。

- 行用 `#item`：13px、标题单行省略加 `title`、「新」「已更新」用 TxBadge。
- `#empty` 放 `TxSearchEmpty size="small"`，用静态 icon 插槽。

**替代**：TxSidebarNav 只有一层分组（`groups` + `items`），分组标题由 CSS 转大写，默认宽 240、卡片面、不内滚动（content.md:868-905）。适合扁平目录，不适合可折叠的多级章节。

### TxMarkdownView（`markdown-view`）— 文章正文（补全 content.md:934-943，已实测）

**实现**（`TxMarkdownView.vue`）

- 每个实例一个 `new Marked({ gfm: true, breaks: true })`（`:18-21`）。
- `sanitize=true` 时异步 `import('dompurify')`；就绪前 `safeHtml` 为空串（`:136-142`）。
- 根节点 `<div class="tx-md tx-markdown-view {light|dark}" :data-theme>`，内层 `.markdown-body` 用 `v-html`（`:152-153`）。
- `theme="auto"` 用 MutationObserver 看 html / body 的 class 和 data-theme，Nexus 的 `html.dark` 能被识别。

**依赖版本**：`packages/tuffex/node_modules/marked` → marked@17.0.6；dompurify@3.4.13。

**探针**：`/tmp/kb-probe/probe*.mjs`，marked + DOMPurify + jsdom，与组件同配置。结果：

| 问题 | 结论 |
|---|---|
| 标题有 id 吗 | **没有**：`## 安装插件` → `<h2>安装插件</h2>`。marked 8 起移除了 `headerIds` |
| 手写 `<h2 id="x">` | 保留；但会覆盖 DOM 属性的名字被 DOMPurify 删除（`id="location"` → 无 id） |
| 代码块高亮 | **没有**：` ```ts ` → `<pre><code class="language-ts">`，纯文本 |
| GFM 提示块 `> [!NOTE]` | **不转换**：渲染成含字面量 `[!NOTE]` 的 blockquote |
| 原始 HTML 提示块 | 保留 class / `data-*`。`<div class="markdown-alert markdown-alert-warning">` 后**空一行**再写 markdown，内部 markdown 会被解析并嵌套在 div 里 |
| href 形态 | `#kb:perm`、`#/kb/perm`、`?kb=perm`、相对 `kb-perm`、`mailto:` 保留；`kb:perm`（未知协议）和 `javascript:` 被删成无 href 的 `<a>` |
| `target` | `target="_blank"` 被删 |
| 其他元素 / 属性 | `role`、`tabindex`、`aria-*`、`data-*`、`class`、内联 `<svg>`、`data:image/svg+xml` 图片、`<details>`、`<kbd>`、`<mark>`、任务列表勾选框都保留 |
| `breaks: true` | 段内单个换行变成 `<br>`，mock 正文**每段写成一行** |

**样式事实**

- 陈列的 GitHub 样式表作用域是 `:where(.tx-md) .markdown-body`，`font-size: 16px`（`github-markdown.css:310-320`），所以正文是 16px。组件自己的 `.tx-markdown-view { font-size: 14px }` 只作用在根节点。
- batch 1 统一用 `:deep(.markdown-body)` 改到 13–14px（先例 `TemplateLauncherDemo.vue:1075-1105`）。
- `.tx-markdown-view .markdown-body h2 { 1.5em }` / `h3 { 1.25em }`，优先级 (0,2,1) 高于样式表。
- 表格：样式表给 `display:block; width:max-content; min-width:100%; max-width:100%; overflow:auto`（`:505-513`），组件再覆盖 `width:100%`，宽表会自带横向滚动。
- 样式表带提示块样式：`.markdown-alert` 与 `-note/-tip/-important/-warning/-caution`（`:1346-1400`）。
- 样式表也带 `.pl-*` 语法色类，但没有东西会生成它们。
- 暗色：根节点 `class="dark" data-theme="dark"`，会被 `TuffexDocsHeroBackground` 的 `.dark` 泄漏命中（修复在工作树、未提交，见 R9）。

**给大纲用的标题定位（推荐）**

1. **大纲数据从 markdown 源码来**：用 `^(##|###) (.+)$` 抽取，mock 的标题里不写行内标记。这样文章 HTML 还没渲染出来，大纲、⌘K 就能用；未打开的文章也能进 ⌘K。
2. **DOM 元素按序号对应**：`articleRef.querySelectorAll('.markdown-body :is(h2, h3)')` 的第 i 个对应源码第 i 个标题。
   - 前提：mock 不在原始 HTML 里写 h2 / h3，提示块里也不放标题。
   - 数量对不上时，退回用 DOM 的 `textContent` 重建大纲。
3. **什么时候重建**：用 MutationObserver 观察包装元素的 `childList + subtree`，rAF 去抖后重建元素列表和偏移缓存。sanitizer 异步就绪、切文章、切语言都会触发它，不需要猜时机。
4. **不要给标题写 id**：
   - docs 页 `DocsOutline.vue` 在 window 上听 `hashchange`，对 `getElementById(hash)` 做 `window.scrollTo`（`:200-205,257-263,285`）。
   - `[...slug].vue:660-673 collectDomToc()` 会收集 `.docs-prose` 里**带 id** 的 h1–h4。
   - id 是全局的，会和页面、其他 demo 冲突。
   - 需要标记时用 `data-*`；在 v-html 输出上写 dataset 可以，但下次重渲染会丢，所以放在 MutationObserver 回调里补。

**链接拦截（安全写法）**

```ts
// 包在 TxMarkdownView 外层：<div ref="articleRef" @click="onArticleClick" @auxclick="onArticleAuxClick">
function onArticleClick(event: MouseEvent) {
  const target = event.target as Element | null
  // 行内 code：挡住 docs 页 document 级的「点击复制 + 站点 toast」（R4）
  if (target?.closest('code') && !target.closest('pre'))
    event.stopPropagation()
  const anchor = target?.closest('a')
  if (!anchor || !articleRef.value?.contains(anchor))
    return
  // 覆盖左键、⌘/Ctrl/Shift 点击，以及聚焦链接后按 Enter（会派发 click）
  event.preventDefault()
  const href = anchor.getAttribute('href') ?? ''
  if (href.startsWith('#kb:'))
    openArticle(href.slice(4))             // 站内文章
  else if (href.startsWith('#h:'))
    scrollToHeading(Number(href.slice(3))) // 本文章节：只滚模板自己的滚动区
  else
    notify(copy.value.external(href))      // 外链：TxToastPanel「宿主会在浏览器中打开 …」
}
function onArticleAuxClick(event: MouseEvent) {
  if ((event.target as Element | null)?.closest('a'))
    event.preventDefault()                 // 中键：不在新标签页打开
}
```

- 右键「在新标签页打开」拦不住。href 要保持无害：`#kb:perm` 在新标签页里是「当前 docs 页 + 不存在的 hash」，`getElementById` 取不到元素，不会滚动。
- 不拦截的后果：
  - 原生片段导航会改 `location.hash`，带动 `DocsOutline` 的 `hashchange` 逻辑；Vue Router 可能把它当一次导航。
  - 外链会直接离开文档站。

**替代与组合**

- 先例 TxStreamMarkdown 同样不拦链接（ai.md:387-398，`harden-html.ts:127-134` 只加 `rel`）。
- 只保留**一个**实例、只换 `content`（batch 1 建议，app-shells.md:430），避免每次重挂载都等 sanitizer、闪白。

### TxStreamMarkdown + TxCodeBlock（`stream-markdown`）— 需要代码高亮时的正文渲染器

**TxStreamMarkdown**（`streaming=false` 当静态渲染器用）

- 静态用法下没有入场动画：`.is-streaming` 才播；`--last` 块的遮罩终值 ink=1，看不出来。
- 围栏代码交给 `TxCodeBlock`（`TxStreamMarkdown.vue:188-200,287-299`）。
- 表格外包滚动容器和「Copy CSV」按钮：`copyTableText` 可本地化，默认英文。
- markup 块仍是 `v-html`，所以标题定位、链接拦截与上一节完全相同。
- 字号：根 14px，但 `.markdown-body` 同样被样式表设成 16px；h2 1.35em、h3 1.15em。

**TxCodeBlock**（自动注册，`.nuxt/components.d.ts:353`）

- **Props**：`lang`、`code`、`closed=true`、`streaming=false`、**`theme='light'`**（宿主必须传，模板可用 `useColorMode()`，先例 `BorderBeamPulseDemo.vue:4-5`）、`previewable=true`、`previewLabel='Preview'`、`codeLabel='Code'`（`TxCodeBlock.vue:8-31`）。
- **高亮**：`shiki-runtime.ts` 懒加载 `shiki` 与 JS 正则引擎，主题固定 `github-light` / `github-dark`；失败退回纯文本。
- **复制按钮**：内部 `TxCopyButton` 没透传文案，写死英文 `Copy` / `Copied`，并写**真实剪贴板**。
- **预览开关**：html / svg / xml 围栏会出现英文「Preview」开关（沙箱 iframe）。
- **结论**：
  - 知识库默认用 TxMarkdownView（轻、batch 1 已验证、`.markdown-body` 覆盖已有先例），接受代码不高亮。
  - 设计要求高亮时整篇换成 TxStreamMarkdown；只用 bash / json / ts 围栏，避开英文 Preview。
  - 不建议「分段混排 TxMarkdownView + TxCodeBlock」：多实例、多个 sanitizer 等待、标题序号更难对。

### TxSearchSelect（`search-select`）— 商店「搜索 + 建议」

**导出与类型**：导出 `TxSearchSelect` / `SearchSelect`；类型 `TxSearchSelectOption { value; label; disabled? }`、`TxSearchSelectProps`、`TxSearchSelectEmits`。

**Props**（`TxSearchSelect.vue:12-31`）

| Prop | 默认值 | 说明 |
|---|---|---|
| `modelValue` | `''` | |
| `placeholder` | `'Search'` | |
| `disabled` / `clearable=true` | — | |
| `options` | `[]` | |
| `loading` | — | 后缀转圈 |
| `remote` | `false` | |
| `searchDebounce` | 200 | |
| `dropdownMaxHeight` | 280 | |
| `dropdownOffset` | 6 | |
| `panelVariant` / `panelBackground` / `panelShadow` / `panelRadius` / `panelPadding` | `'solid'` / `'refraction'` / `'soft'` / 18 / 6 | 面板外观 |

**Events**：`update:modelValue`、`change`、`search(q)`、`select(opt)`、`open`、`close`。**Expose**（文档页）：`open`、`close` 等。

**结构**

- 引用区是 `TuffInput`，自身带 `role="combobox" aria-expanded aria-controls aria-activedescendant`（attrs 落在原生 input 上）。
- 面板是 `TxPopover`（teleport、分配器 z-index、宽度对齐输入框）。
- 列表每项是 `TxCardItem role="option"`，只渲染 label，**不能放图标、描述**。

**键盘**（`:185-230`）

- ↑ / ↓ 打开并移动虚拟焦点。
- Enter：有高亮就选中，否则在 `remote` 下发 `search`；非 remote 时回车不发任何事件。
- Esc：面板开着时 `preventDefault` 并关闭，与 TemplateFrame 的 Esc 矩阵一致。

**过滤**

- 非 remote：按 label 小写包含过滤 `options`。
- remote：原样显示宿主给的 `options`，输入防抖后发 `search`。

**坑**

- 空态写死 `No results`（`:340`）：无匹配时让 `options` 只含一项 `{ value: '__none', label: '没有匹配的插件', disabled: true }`，英文空态就不会出现。
- `TxInput` 的清除按钮 aria 写死 `Clear input`（design.md §6.11）。
- 选中后输入框回填 label。当成搜索框用时，在 `@select` 里打开详情；`modelValue` 保持 `''`，输入框会留着 label，宿主可以接受。
- 根节点宽 100%，外层给宽度。

**替代**：`TxSearchInput` + `trigger="manual"` 的 `TxPopover` + 手写 listbox，行里可以放图标。代价是 ARIA 和键盘要自己写，参考 Launcher 的做法（design.md:199）。

### TxCornerOverlay（`corner-overlay`）— 图标角标（官方认证）

- **Props**：`placement='bottom-right'`（另有 top-left / top-right / bottom-left）、`offsetX` / `offsetY`（数字转 px）、`overlayPointerEvents='none'|'auto'`。
- **插槽**：default（主体）、`overlay`（角标）。
- 根 `inline-block; position:relative`；角标 `position:absolute`。
- **角标默认 `aria-hidden="true"`**（`TxCornerOverlay.vue:56`）。「官方认证」要在名字旁再放视觉隐藏文本，或给名字旁的 `i-carbon-certificate-check` 配 `TxTooltip` + `aria-label`。
- 文档页：适合小标记，不适合弹层（`corner-overlay.zh.mdc:103`）。

### TxCollapse / TxCollapseItem（`collapse`）— 可选：权限说明 / 常见问题

- **TxCollapse Props**：`accordion`、`modelValue: string | string[]`。**Events**：`update:modelValue`、`change`。
- **TxCollapseItem Props**：`title`、`name`、`disabled`、`arrowIcon='chevron-down'`（TxIcon 内置名，不依赖图标集）。**插槽**：`title`、default。
- 标题是原生 `<button aria-expanded aria-controls>`，**没有** `aria-haspopup`，所以 Esc 不会被 TemplateFrame 当成弹层。
- 高度由 JS 在 0 和 scrollHeight 之间过渡，0.32s；有减弱动效规则（`TxCollapseItem.vue:240-246`）。
- 源码与文档不一致：手风琴模式收起时源码发 `''`（`TxCollapse.vue` setActiveNames），文档页（`collapse.zh.mdc:81`）写的是 `[]`。

### 安装进度：TxProgressBar / TuffProgress / TxButton `loading` / TxSteps

- **TxProgressBar**（全表见 data-flow.md:173-177；类型见 `progress-bar/src/types.ts`）。安装相关的：
  - 进度与状态：`percentage`、`indeterminate` + `indeterminateVariant='sweep'|'classic'|'bounce'|'elastic'|'split'`、`status='success'|'error'|'warning'|''`、`success` / `error`。
  - 文字：`message`、`detail`（配 `textPlacement="top"`）、`showText`、`format(p)`、`ariaLabel`。
  - 外观与动效：`height='5px'`、`flowEffect`（none / shimmer / wave / stardust）。
  - 有减弱动效守卫；`complete` 事件在满 100 时发出。
- **TuffProgress**（`progress` 目录，**注册名是 `TuffProgress`**，不是 TxProgress）：TxProgressBar 的薄包装（`percentage`、`status`、`strokeWidth=6`、`showText=true`、`indeterminate`、`format`，文字在外侧），直接用 TxProgressBar 即可。
- **TxButton `loading`**：默认转圈；`loadingVariant='bar'` 只在 `block` 按钮上生效（`button.vue:136-138`），而且是不确定进度。确定进度要另放 TxProgressBar。
- **TxSteps**：data-flow.md:279-284。当前步有 2.8s 无限「呼吸」动画，带减弱动效守卫；子项要 `:clickable="false"`。
- **先例**：`ProgressBarUploadDemo.vue` 每 100ms 不均匀推进（`setInterval` + `defineExpose({ replayDemo })`）。

### TxRating（只读展示的读屏问题，补充 content.md:758-767）

- 结构：`role="radiogroup"`，每颗星是 `<button role="radio">`；`readonly` 时按钮 `disabled`（`TxRating.vue:255-270`）。
- 默认 `aria-label` 是 `Rate N star(s)`（`:150`）：只读卡片上读屏会念「Rate 1 star… Rate 5 stars」这组禁用单选。
- 做法：
  - 展示用的只读评分外包 `aria-hidden="true"`，另写「4.8 分，1,240 条评价」文本（先例 `TemplateGalleryDemo.vue:1244-1246` 放在 aria-hidden 的遮罩里）。
  - 可交互的传本地化 `star-label`。
- 有减弱动效规则（`:420`）；`size` / `gap` 接受数字或字符串。

### TxImageGallery（商店截图，补充 content.md:675-686）

- 缩略图类名 `.tx-image-gallery__thumb`：`aspect-ratio: 1`、`object-fit: cover`、圆角 14；网格 `.tx-image-gallery__grid` 为 `repeat(auto-fill, minmax(92px, 1fr))`（`TxImageGallery.vue:126-147`）。
- 截图是横图，改成：`:deep(.tx-image-gallery__thumb){aspect-ratio:16/10}`、`:deep(.tx-image-gallery__grid){grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}`。
- 灯箱是 `TxModal`（`width="min(92vw, 880px)"`，大图 max-height 70vh）。它 teleport 到 body，叠在 TemplateFrame 展开层（1900）之上，与模板内详情不冲突。
- 灯箱没有方向键；上一张 / 下一张按钮的底色是 `--tx-fill-color-blank`，暗色下透明。
- 6 个文案 prop 的本地化写法见 `TemplateGalleryDemo.vue:1484-1493`。

### TxDrawer 与嵌套 TxModal（新发现的冲突 → 本批不用 TxDrawer 做详情）

- `TxDrawer` 在 `onMounted` 时把 `handleKeydown` 挂到 document（`TxDrawer.vue:207-211`）。只要可见：
  - `Tab` → `trapFocus`：焦点不在抽屉里就 `preventDefault` 并聚焦抽屉的第一个 / 最后一个元素（`:131-159`）。
  - `Escape` → `handleClose()`（`:170-172`）。
  - 两者都不检查 `defaultPrevented`，也不检查是否有更上层的弹层。
- `TxModal` 的 Esc / Tab 绑在自己 teleport 出去的遮罩上（`TxModal.vue:119-120`），事件冒泡到 document 时抽屉仍会处理。结果：
  - 在抽屉里打开的灯箱或确认框中按 Tab，焦点被拽回抽屉。
  - 按 Esc，modal 和抽屉一起关闭。
- modal 套 modal 没有这个问题：各自的监听绑在各自的遮罩上，互不冒泡。所以详情要么是模板内视图，要么是 TxModal（Gallery 的做法）。

### useIndicatorBox（非组件 helper，`@talex-touch/tuffex/sidebar-nav`）

- 签名：`useIndicatorBox({ container: Ref<HTMLElement|null>, target: () => HTMLElement|null })`，返回 `{ box: Ref<{top,left,width,height}|null>, revealed, measure }`（`packages/tuffex/packages/utils/use-indicator-box.ts`）。
  - 用 `getBoundingClientRect` 做分数像素测量、换算到内边距盒、归一化缩放。
  - 用 ResizeObserver 跟踪容器与目标；`revealed` 首次为 false，可借此抑制首帧滑入。
- TxSidebarNav / TxFlatRadio / TxTabBar 内部都用它。
- 没有模块状态，所以不受「生产环境双份 tuffex」（content.md R1）影响，可以显式 import。
- 知识库「本页目录」的滑动指示条用它：`box.top` / `box.height` 驱动绝对定位的竖条，`transition: transform 0.2s`，减弱动效时去掉。

### 真实数据来源（两章共用）

| 数据 | 位置 | 用法 |
|---|---|---|
| 插件 id / 版本 / 描述 / 功能 / 触发词 | `plugins/*/manifest.json` | 如 `com.tuffex.translation` 1.0.18-beta.4，功能「翻译 / 多源翻译 / 截图翻译」，触发词 `fy` `翻译` `translate`。`touch-code-snippets` / `touch-text-snippets` 是 legacy 占位，跳过；`touch-music` 没有 manifest |
| 必需 / 可选权限与理由 | 同上 `permissions`、`permissionReasons` | 例：翻译的 `clipboard.write`：「将翻译结果复制到剪贴板」 |
| 权限风险等级 | `packages/utils/permission/registry.ts:16-254` | 高：fs.write / fs.execute / system.shell / intelligence.admin / intelligence.agents / window.capture / search.root-results。中：fs.read / fs.tfile / fs.index / clipboard.read / network.internet / network.download / system.tray / voice.dictation / storage.shared / storage.sqlite / media.read / lexicon.register。低：clipboard.write / network.local / system.applications / system.notification / intelligence.basic / storage.plugin / window.create / i18n.read / lexicon.read |
| 权限中英名 | `packages/utils/i18n/locales/{zh,en}.json` → `permission.<id>.name/desc`、`permission.risk.low/medium/high`（低 / 中 / 高风险；Low / Medium / High Risk） | 例：读取剪贴板 / Read Clipboard、执行命令 / Execute Commands、推送根搜索结果 / Push Root Search Results（键名 `search.rootResults`） |
| 安装 / 更新 / 卸载文案 | `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json` → `store.installation.*`、`store.upgradeDialog.*`、`store.updates.*`、`plugin.uninstall.*` | 状态：排队中 / 下载中 / 校验中 / 等待确认 / 安装中 / 已安装 / 安装失败 / 已取消。确认按钮：始终允许 / 仅本次会话 / 拒绝安装。非官方来源：「插件「{name}」来自非官方来源，确定继续安装吗？」。更新会「停止当前运行的插件、删除旧版本并安装新版本、更新完成后自动重新启用」。卸载会「删除插件文件及其缓存数据」 |
| 商店 UI 文案 | `apps/nexus/i18n/locales/{zh,en}.ts` → `store.*` | 「发现精选插件」「搜索官方插件」「评论审核通过后公开展示」「官方」；详情页签：概览 / 版本 / 内容包 / 评论 |
| 分类 | `apps/nexus/app/utils/plugin-categories.ts` + `i18n … plugins.categories.*` | 效率 / 工具 / 开发 / 写作 / 创意 / AI·模型 / 自动化 / 沟通 / 分析 / 设计 / 教育 / 金融。**金融**不用，避免联想价格 |
| 渠道 | `apps/nexus/app/types/store.ts:8` `PluginChannel = 'SNAPSHOT'|'BETA'|'RELEASE'` | 版本胶囊、时间线的渠道标签 |
| 插件 CLI | `packages/tuff-cli`（bin `tuff`）子命令：create / build / dev / validate / scan / publish / login / doctor / setup | 知识库代码块用真命令 |
| 文档反馈先例 | `apps/nexus/app/components/docs/DocsFeedback.vue` | 「Was this helpful?」+ 有帮助 / 没帮助计数 |

---

## Template proposals

### 两章共用约定（在 spec §6 基础上的补充）

- **接入**：slug 为 `template-store` / `template-docs`，demo 为 `TemplateStoreDemo` / `TemplateDocsDemo`，category `TemplateContent`。链路 5 步照 spec §2。frontmatter 的英文 description 不要出现未加引号的 `: `。
- **舞台**：`<TemplateFrame :height="580">`，与 Gallery / Shell 一致。
- **mode**：用 StageSize 中继拿 `width`，`narrow < 640 ≤ column < 960 ≤ wide`，wide 内再加 `≥ 1200` 一档。显隐大的区块用 `v-if`（照 Gallery `:709-716`），纯排版用 `@container template`。
- **滚动区**：模板自己的原生 `overflow:auto` div，用 `scrollTo` / `scrollTop`，禁止 `scrollIntoView`。滚动监听里记 `lastScrollTop`；`expanded` 变化后在 `nextTick` 写回（R2）。
- **根节点**：root 上挂 `@keydown` 和 `@pointerdown`（停自动演示），不挂 document / window。
- **重置与语言**：`defineExpose({ resetDemo })` 复位数据、视图、计时器、滚动、modal；`watch(locale, resetDemo)`。
- **反馈**：只用 `TxToastPanel`，绝对定位在模板内。
- **时间**：`NOW = Date.UTC(2026, 8, 24, 2, 0)`，用 `Intl.RelativeTimeFormat` / `DateTimeFormat`；安装量用 `Intl.NumberFormat(..., { notation: 'compact' })`。
- **示例数据**：评分、安装量、评价都是示例数据。商店在底部或轮播角落放一行 `示例数据 · 插件与权限取自仓库 plugins/`，页面「场景」段也要写明。
- **图标**：插件图标用 `TxIconChip` + `i-carbon-*`，大图块用 CSS 渐变块 + 白色 carbon 字形。轮播背景和截图用代码生成的 SVG data URI（可参考 `TemplateGalleryDemo.vue:127-393` 的 `random` / `drawOrbs` / `drawCorebox` / `drawGlyph`，在本模板内写一个精简版），不外链。

### Store 插件商店 — 「Tuff 插件商店」

**设定**：Tuff 客户端内的插件商店，浏览、搜索、查看详情，完成安装、更新、卸载、停用。全部插件免费，没有价格、结算或套餐入口。

**栏内（column，约 782×580）**

```
┌─────────────────────────────────────────────────────────────────────────── 782 ─┐
│ ▣ 插件商店   (发现)(已安装 5)                  [⌕ 搜索插件、功能或触发词…   ]    │ 48  TxFilterChips role=tablist ＋ TxSearchSelect remote（≈300w）
│ (全部 22)(效率 6)(AI 5)(开发 5)(工具 6)→                  [热门|最新|评分]       │ 40  TxFilterChips 分类（计数由数据推导）＋ TxFlatRadio sm
│ ┌ 浏览滚动区 ───────────────────────────────────────────────────────────────┐ │
│ │ ┌ 精选轮播 176h（SVG 光斑背景）─────────────────────────────── [⏸][‹][›] ┐ │ │ 手写轮播，4 张
│ │ │  ▣72  翻译  ✓官方 · 编辑精选                                            │ │ │
│ │ │       截图翻译上线：框选屏幕文字，直接出译文                              │ │ │
│ │ │       [安装] [了解详情]                                     ● ○ ○ ○     │ │ │
│ │ └────────────────────────────────────────────────────────────────────────┘ │ │
│ │ 2 个插件可更新 · 查看更新 ›                                                  │ │ 有可更新时显示的一行横幅
│ │ 热门插件 · 22                                                                │ │
│ │ ┌TxCard──────────────┐┌TxCard──────────────┐┌TxCard──────────────┐           │ │ 3 列
│ │ │▣ 剪贴板历史  ✓      ││▣ 片段库  ✓          ││▣ Color Picker       │           │ │
│ │ │TalexTouch Team      ││TalexTouch Team      ││Léa Martin · 社区     │           │ │
│ │ │全平台剪贴板历史…     ││统一片段库：搜索…     ││屏幕取色，复制 HEX…   │           │ │ 描述 2 行截断
│ │ │★ 4.8 · 3.8万 次安装  ││★ 4.7 · 1.2万 次安装  ││★ 4.5 · 2,600 次安装   │           │ │ TxRating 只读外包 aria-hidden
│ │ │[效率][BETA]   [更新]││[效率]     已安装 ✓  ││[设计]       [安装]  │           │ │ 操作位固定宽度 ≈104px
│ │ └────────────────────┘└────────────────────┘└────────────────────┘           │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
│                     ┄ TxToastPanel（底部居中，绝对定位）┄                        │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**栏内详情**：替换浏览区，头部保留。

```
┌─────────────────────────────────────────────────────────────────────────── 782 ─┐
│ [‹ 返回]  插件商店 › 效率 › 剪贴板历史                          [⌕ …]           │
│ ┌ 详情滚动区 ─────────────────────────────────────────────────────────────────┐ │
│ │ ▣64  剪贴板历史   ✓ 官方 · TalexTouch Team · 效率                             │ │ 大图块 ＋ TxCornerOverlay 认证角标
│ │      一款全平台剪贴板历史记录插件…                                           │ │
│ │      ★★★★★ 4.8（1,240 条）· 3.8 万次安装                                     │ │
│ │      [● BETA v1.2.0-beta.6 ⤓ │ 历史 ▾]        [更新到 1.2.0-beta.6] [⋯]      │ │ TxVersionCapsule（面板向下展开，需 ≈320px 空间）
│ │      ░░░░░░░░░░░░░ 下载中 42% · 0.9 / 2.3 MB  [×]                             │ │ 安装中：TxProgressBar 取代按钮
│ │ (概览)(权限 6)(版本 5)(评价 1,240)                                             │ │ TxTabs top pill
│ │ ▭▭▭ 截图（TxImageGallery 16:10）                                               │ │
│ │ 简介 · 功能与触发词：[剪贴板历史记录]  打开方式 clipboard-history / 剪贴板      │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**展开（wide，约 1440×812）**

```
┌ TxSidebarNav 220 ─┬──────────── 浏览 ───────────────────────────────┬─ 详情 420 ──────────────────┐
│ 浏览               │ 发现 · [⌕ 搜索插件…（360w）]        [热门|最新|评分] │ 选中插件（默认=轮播当前项）   │
│  发现              │ 精选轮播 220h                                     │ 头部 / 版本胶囊 / 操作        │
│  已安装      5     │ 编辑精选 →（TxEdgeFadeMask horizontal，4 张卡）    │ TxTabs：概览/权限/版本/评价    │
│  可更新      2     │ 热门插件 grid 3 列（≥1200 4 列）                   │ 独立滚动                      │
│ 分类               │                                                   │                              │
│  效率 6 · AI 5 …   │                                                   │                              │
└───────────────────┴───────────────────────────────────────────────────┴──────────────────────────────┘
```

**窄（narrow，< 640，例如 560px 视口下约 500）**

```
┌───────────────────────────── ≈500 ─┐
│ ▣ 插件商店        [⌕] (已安装 5)    │ 搜索收成图标，点开后盖住标题行
│ (全部)(效率)(AI)(开发)→ 横向滚动     │
│ ┌ 轮播 132h：图标＋名称＋[安装] ────┐ │ 隐藏描述；圆点保留
│ └──────────────────────────────────┘ │
│ ┌ TxCard 单列（横排：图标|文字|操作）┐ │
│ └──────────────────────────────────┘ │
└─────────────────────────────────────┘
详情整栏替换；TxTabs 仍 placement="top"（导航宽度是内联样式，只能在 JS 里定，这里不用改）
```

**组件与角色**

| 区域 | 组件 | 角色 / 要点 |
|---|---|---|
| 视图切换 | `TxFilterChips role="tablist"` | 发现 / 已安装（count = 已安装数）。wide 改由 `TxSidebarNav` 承担（分组「浏览」「分类」，badge 由数据推导，不传 search-hint） |
| 搜索 | `TxSearchSelect remote` | 按名称、功能名、触发词给建议：输入 `fy` 建议「翻译」。`@select` 打开详情；`@search`（回车）过滤网格，显示「搜索「fy」· 3 个结果 [清除]」。无匹配时给一项 disabled 本地化选项 |
| 分类 / 排序 | `TxFilterChips`、`TxFlatRadio size="sm"` | 排序：热门（安装量）/ 最新（发布时间）/ 评分；宿主先排序再渲染 |
| 精选轮播 | 手写 + `TxIconButton`（上一张 / 下一张 / 暂停 `pressed`）+ `TxTag` + `TxButton` | tuffex 没有轮播组件。可选 `TxGlassSurface` 做说明条 |
| 卡片 | `TxCard`（solid / pure / small，radius 14，**不开 clickable**）+ `TxIconChip` + `TxRating` 只读（aria-hidden）+ `TxTag soft` + 操作位 | 标题 `<button>` 打开详情；官方加 `i-carbon-certificate-check` + `TxTooltip`「官方插件 · TalexTouch Team」 |
| 可更新横幅 | `TxStatusBadge status="info" icon="i-carbon-upgrade"` + 链接样式 `<button>` | 文案「{count} 个插件可更新 · 查看更新」（core-app `store.updates.*`） |
| 详情头 | 渐变图块 + `TxCornerOverlay` + `TxVersionCapsule`（渠道下载面板 + 历史面板）+ 操作位 + `TxDropdownMenu`（停用 / 卸载 / 复制插件 ID） | 胶囊外包 `@keydown.esc` 先 `preventDefault`；面板条目不给 href |
| 详情分页 | `TxTabs placement="top" borderless :content-padding="0" :content-scrollable="false" indicator-variant="pill"` | 照 `store.vue:589-670`；稳定英文 `name` + `#name` 插槽本地化；减弱动效时 `:animation` 全关 |
| 概览 | `TxImageGallery`（16:10 覆盖）+ `TxMarkdownView`（13–14px，无链接）+ 功能列表（`TxTag` 显示触发词） | 截图用 SVG data URI：CoreBox 窗口，按插件着色 |
| 权限 | 行列表：`i-carbon-*` 分类图标 + 中英名 + `permissionReasons` + 风险 `TxStatusBadge`（低 success / 中 warning 传图标 / 高 danger）+ `TxTag`「必需 / 可选」 | 可选权限注明「使用时再询问」 |
| 版本 | `TxTimeline`（渠道 `TxTag` + 更新说明 + 日期；最新一项 `active`） | `:deep` 修暗色白环 |
| 评价 | 汇总（大号均分 + `TxRating` 只读 + 5 行 `TxProgressBar height="6px"` 分布）+ 列表（`TxAvatar` 首字母 + `TxRating` + 相对时间 + 正文 + `TxButton size="sm"`「有帮助 12」）+ 写评价（`TxRating` 可交互、本地化 `star-label` + `TxTextarea :max-length="500" show-count` + `TxButton`） | 提交后插入一条带「待审核」`TxTag` 的评价，并提示「评论审核通过后公开展示」（Nexus 真实文案） |
| 安装流程 | `TxModal`（权限确认 / 更新确认 / 卸载确认）+ `TxProgressBar` + `TxButton loading` +（wide，可选）`TxSteps` | 见下方状态机 |
| 已安装页 | `TxCardItem` 行（`#avatar` = `TxIconChip`；副标题 `v1.2.0-beta.5 · 官方`；`#right` = 更新按钮 / `TxSwitch` 启用 / 「⋯」菜单）+ 顶部 `TxButton`「检查更新」（loading 800ms）与「全部更新（2）」 | 全部卸载后显示 `TxEmptyState variant="blank-slate"`（静态 icon） |
| 加载 / 空态 | `TxSkeleton`（切分类 300ms，`useDeferredLoading`）、`TxSearchEmpty`（静态 icon，主操作「清除搜索」） | |
| 反馈 | `TxToastPanel` | 「「翻译」已准备就绪」「{name} 已卸载」（带「重新安装」）「宿主会在 CoreBox 中打开「翻译」」 |

**安装流程状态机**（读者触发，时序是模拟的）

```
idle ──[安装]──▶ confirm（TxModal「插件权限确认」，无限等待，不自动允许）
  confirm ─ 拒绝安装 ──▶ idle（toast：已取消安装）
  confirm ─ 仅本次会话 / 始终允许 ──▶ queued(300ms, indeterminate)
  ▶ downloading（0→100%，约 1.4s，detail「0.9 / 2.3 MB」，可点 × 取消 → cancelled → idle）
  ▶ verifying（500ms，indeterminate「校验签名」）▶ installing（500ms）▶ installed（按钮变「打开」＋「⋯」）
失败分支（可选，固定落在某个社区示例插件上）：verifying ▶ failed（TxProgressBar status="error"，文案「当前插件缺少可用的安装源。」＋ [重试]）
installed + 有新版 ──[更新]──▶ TxModal「确认更新」（真实三条说明；新版多出权限时单列「新增权限」）▶ downloading ▶ … ▶ installed
installed ──⋯/卸载──▶ TxModal「卸载插件」（真实文案）▶ uninstalling（400ms，TxButton loading）▶ idle ＋ toast（「重新安装」）
installed ──TxSwitch──▶ 停用 / 启用（toast）
```

- **确认前置**：真实客户端先下载、校验签名，再进入 `awaitingConfirm`（core-app 状态顺序）。模板把权限确认**提前到点击时**，免得读者滚走后才弹出整页 modal。这个差异要写进页面的「交互要点」。
- **非官方来源**：社区插件的确认框顶部加一块警示，文案用 core-app 的「来自非官方来源，确定继续安装吗？」。用普通提示块，**不用** `TxAlert`：`role="alert"` 在 modal 打开时会重复播报。
- **状态收在一处**：所有状态放在按插件 id 索引的 `reactive` 表里。卡片、轮播、详情、已安装页读同一份，安装进度在各处同步显示。
- **计时器**：统一登记，`resetDemo` 和卸载时清理。

**交互要点**

- 键盘：
  - 轮播获得焦点时 ←/→ 切换（挂在轮播根上）。
  - 栏内详情里按 Esc（焦点不在输入框、没有弹层打开时）返回浏览，并 `preventDefault`。
  - 搜索框 Esc 由 TxSearchSelect 自己处理。
- 详情默认在「概览」。
  - wide：详情栏跟随「当前选中卡片」，没有选中时跟随轮播当前项；卡片上的安装不切换详情。
  - column：点标题进入详情，「返回」回到之前的滚动位置（用 `lastScrollTop`）。
- 「了解详情」「查看更新」都在模板内切换视图，不导航。
- 「打开」只弹 toast（宿主行为）。
- 轮播无障碍：
  - 根 `role="region" aria-roledescription="carousel" aria-label="编辑精选"`；每张 `role="group" aria-roledescription="slide" aria-label="2 / 4"`。
  - 非当前页 `inert`；自动播放期间 `aria-live="off"`，读者手动切换时改 `polite`。
  - 叠放的页只做 opacity 过渡，不用 transform，避免包含块问题。

**自动演示（从 `@enter` 起算，有限、可重播）**

| 时间 | 动作 |
|---|---|
| T+0 | 轮播开始自动播放：每 5s 一张，跑满一圈（4 张）停。悬停或 focus-within 时暂停；读者碰过轮播就停。WCAG 2.2.2 要求的暂停按钮一直可见 |
| T+1.5s | 模拟「检查更新」结束：「已安装」chip / SidebarNav badge 出现「2 个可更新」（`TxBadge` 数字变化）；`TxToastPanel`「2 个插件可更新 · 查看更新」显示 4s |

- 不自动安装、不自动更新、不自动打开任何弹层，保持「安全闸门等待」原则。
- 减弱动效：不播轮播，停在第 1 张；可更新提示直接就位；不弹 toast；没有计时器。
- `resetDemo`：复位插件状态表、视图、搜索、分类、排序、详情、轮播页码、modal、计时器、滚动。

**Mock 数据（双语，插件取自 `plugins/`；分类为模板指派——manifest 里几乎都是 `utilities`）**

| id | 中文名 / English | 模板分类 | 最新版（manifest） | 渠道 | 图标 | 必需权限（manifest） | 可选 |
|---|---|---|---|---|---|---|---|
| com.tuffex.clipboard-history | 剪贴板历史 / Clipboard History | 效率 | 1.2.0-beta.6 | BETA | `i-carbon-paste` | clipboard.read, clipboard.write, fs.tfile, search.root-results, system.applications | system.shell |
| com.tuffex.translation | 翻译 / Translate | AI | 1.0.18-beta.4 | BETA | `i-carbon-translate` | network.internet, intelligence.basic, storage.plugin, search.root-results | clipboard.write |
| com.tuffex.intelligence | 智能问答 / Tuff Intelligence | AI | 1.2.0 | RELEASE | `i-carbon-ai` | intelligence.basic, search.root-results, storage.plugin | clipboard.write |
| com.tuffex.snippets | 片段库 / Snippets | 效率 | 1.0.0 | RELEASE | `i-carbon-code` | clipboard.write, search.root-results, storage.plugin | clipboard.read, network.internet |
| com.tuffex.window-presets | 窗口预设 / Window Presets | 效率 | 1.0.0 | RELEASE | `i-carbon-screen` | system.shell, search.root-results | — |
| com.tuffex.quick-actions | 系统快捷动作 / Quick Actions | 效率 | 1.0.0 | RELEASE | `i-carbon-flash` | system.shell, search.root-results | — |
| com.tuffex.system-actions | 系统操作 / System Actions | 工具 | 1.0.1 | RELEASE | `i-carbon-power` | search.root-results | system.shell |
| com.tuffex.browser-open | 浏览器打开 / Browser Open | 工具 | 1.0.4 | RELEASE | `i-carbon-launch` | system.shell, search.root-results, storage.plugin | clipboard.write, network.internet |
| com.tuffex.json-formatter | JSON 格式化 / JSON Formatter | 开发 | 1.0.9-beta.4 | BETA | `i-carbon-code` | clipboard.read, network.internet | clipboard.write |
| com.tuffex.dev-utils | 程序员工具 / Dev Utils | 开发 | 1.0.0 | RELEASE | `i-carbon-tools` | clipboard.write, search.root-results | — |
| com.tuffex.workspace-scripts | 工作区脚本 / Workspace Scripts | 开发 | 1.0.0 | RELEASE | `i-carbon-terminal` | system.shell, fs.read, search.root-results | — |
| com.tuffex.vscode-projects | VS Code 项目 / VS Code Projects | 开发 | 1.0.0 | RELEASE | `i-carbon-folder` | search.root-results | fs.read, fs.index, system.shell |
| com.tuffex.image-tools | 图片转换与压缩 / Image Tools | 工具 | 1.0.0 | RELEASE | `i-carbon-image` | search.root-results, fs.read, fs.write | — |
| com.tuffex.batch-rename | 批量重命名 / Batch Rename | 工具 | 1.0.0 | RELEASE | `i-carbon-document` | fs.read, fs.write, search.root-results, storage.plugin | — |
| com.tuffex.emoji-symbols | Emoji 与符号 / Emoji & Symbols | 工具 | 1.0.0 | RELEASE | `i-carbon-tag` | clipboard.write, search.root-results | — |
| com.tuffex.dictation | 语音听写 / Dictation | AI | 1.0.0 | RELEASE | `i-carbon-microphone` | voice.dictation, search.root-results | clipboard.read |
| com.tuffex.ai-sessions | AI 会话 / AI Sessions | AI | 1.0.0 | RELEASE | `i-carbon-chat` | search.root-results | intelligence.basic, fs.read, clipboard.write |
| com.tuffex.hosts | Hosts 配置 / Hosts | 开发 | 0.1.0 | SNAPSHOT | `i-carbon-data-base` | search.root-results, fs.read | fs.write, system.shell |

- 数量：官方 18 个，加 3 个**虚构社区示例**，作者沿用 batch 1 的人名：
  - 番茄钟 / Pomodoro（周屿，效率，0.9.2，system.notification + storage.plugin）
  - Color Picker 取色器（Léa Martin，设计，2.1.0，**window.capture 高风险** + clipboard.write）：用来演示非官方来源确认和高风险权限。
  - 单位换算 / Unit Converter（Omar Farouk，工具，1.3.0，clipboard.write + search.root-results）
- 权限理由：中文取 manifest 的 `permissionReasons`，英文由实现者翻译；社区示例自拟。
- 功能 / 触发词取 manifest：翻译 `fy` / 截图翻译 `s-fy`、智能问答 `ai` `@ai`、片段库 `snippet` `片段`、窗口预设 `window` `layout` `分屏`、程序员工具 `uuid` `jwt`……
- 已安装初始集合：
  - 剪贴板历史 1.2.0-beta.5 → 可更新 beta.6
  - 翻译 1.0.18-beta.3 → 可更新 beta.4
  - 智能问答 1.2.0
  - 片段库 1.0.0
  - 系统快捷动作 1.0.0（已停用）
  - 合计：5 个已安装、2 个可更新。
- 评分 / 安装量（示例）：剪贴板历史 4.8 / 3.8 万（1,240 条评价）、翻译 4.7 / 2.7 万、智能问答 4.6 / 2.1 万、片段库 4.7 / 1.2 万、系统快捷动作 4.4 / 1.6 万……其余在 0.1 万–1.1 万之间；社区示例在 0.1 万–0.3 万之间。
- 版本历史（示例）：
  - 剪贴板历史：1.2.0-beta.6 BETA（9 月 18 日，图片条目原图预览）、beta.5（9 月 9 日）、1.1.3 RELEASE（9 月 2 日）、1.1.2（8 月 20 日）、1.1.0（7 月 30 日）。
  - 翻译：1.0.18-beta.4（截图翻译）、beta.3、1.0.17 RELEASE……
- 精选轮播 4 张：翻译（截图翻译上线）、剪贴板历史（固定条目与图片预览）、智能问答（改写 / 摘要 / 解释）、窗口预设（一键布局）。
- 评价（示例，每个插件 4–5 条，中英各一份），作者与 batch 1 一致：林乔、Mara Okafor、佐藤健二 / Kenji Sato、Ava Chen、Noor Haddad。

**手写 CSS**

- 布局：头部两行的 flex、浏览区与详情区的 grid、容器查询、卡片内部排版（2 行截断、操作位固定宽）。
- 轮播：叠放、淡入淡出、圆点、减弱动效。
- 图块：渐变图块（大小两档）。
- 详情：头部排版、权限行、评分分布条排版、评价行。
- TemplateFrame 与组件覆盖：`:deep` 覆盖 TxImageGallery 比例和列、TxTimeline 暗色圆点、TxSearchSelect 外宽、SidebarNav 变量。

**风险与兜底**：见 R1、R2、R3、R5、R6、R7、R10–R12。

- TxVersionCapsule 面板在窄档空间不够时，窄档只用触发器模式：「历史」切到版本页，「下载」触发更新。
- TxSearchSelect 只能显示纯文本建议；设计要图标时，按 cheat sheet 里的替代方案手写。

### Docs 知识库阅读器 — 「Tuff 帮助中心」

**设定**：Tuff 的帮助中心 / 知识库。左侧目录树，中间文章，右侧「本页目录」跟随滚动；支持 ⌘K 全文检索、本文查找、面包屑、上下篇、「这篇有帮助吗」、相关文章、更新时间与贡献者。主推文章「插件权限说明」，用的是真实权限数据，与 Store 章节呼应。

**栏内（column，约 782×580）**

```
┌──────────────────────────────────────────────────────────────────────────── 782 ─┐
│ ◧ Tuff 帮助中心                            [⌕ 搜索文档…                  ⌘K]      │ 48  按钮样式的搜索框 → TxCommandPalette
├─────────────── 200 ─┬───────────────────────────────────────────────────────────┤
│ [⌕ 筛选目录       ]  │ 帮助中心 › 插件 › 插件权限说明        [≡ 风险等级 ▾]  [⌕]  │ 40  sticky 工具行：TxBreadcrumb ＋ 本页目录 TxDropdownMenu（显示当前节）＋ 本文查找开关
│ ▾ 快速上手          │ ┌ 文章滚动区（原生 overflow:auto）─────────────────────────┐ │
│    欢迎使用 Tuff     │ │ 插件权限说明                                              │ │ 标题由模板渲染（不在 markdown 里）
│    认识 CoreBox      │ │ (林)(M)(佐)  林乔等 3 人编辑 · 更新于 9月20日 · 6 分钟      │ │ TxAvatarGroup ＋ Intl
│    快捷键速查        │ │ 导语 …                                                    │ │
│ ▾ 插件              │ │ ## 权限从哪里来        ```json manifest 片段```            │ │ TxMarkdownView（14px）
│    从插件商店安装     │ │ ## 风险等级            表格：权限 | 名称 | 风险             │ │
│  ● 插件权限说明      │ │ ▌注意：system.shell 属高风险…（markdown-alert）            │ │
│    管理与更新插件     │ │ ## 安装时的授权选择 / ### 非官方来源 / ## 撤销与审计 …      │ │
│    开发第一个插件     │ │ ─────────                                                 │ │
│ ▸ 剪贴板            │ │ 这篇文章有帮助吗？ [👍 有帮助 | 👎 没帮助]                   │ │ TxFlatRadio size=sm
│ ▸ AI 与智能         │ │ [‹ 上一篇 从插件商店安装] [管理与更新插件 下一篇 ›]           │ │ TxCardItem ×2
│ ▸ 账户与同步         │ │ 相关文章：TxCardItem ×3                                    │ │
│ ▸ 故障排查          │ └──────────────────────────────────────────────────────────┘ │
└─────────────────────┴───────────────────────────────────────────────────────────┘
```

**展开（wide，约 1440×812；≥ 1200 时文章 max-width 720 居中）**

```
┌ ◧ Tuff 帮助中心 · [⌕ 搜索文档…  ⌘K（480w）] · 最近更新 3 篇 ▾ ──────────────────────────────────────────┐
├ 目录 248 ─────┬─────────────── 文章 ─────────────────────────────────────────┬─ 本页目录 220 ───────────┐
│ 筛选 + TxTree  │ 面包屑                    [⌕ 在本文中查找（220w）  2/7 ↑↓]     │ 本页目录                  │
│               │ 标题 / 元信息 / 阅读进度（TxProgressBar 2px）                  │ ▍权限从哪里来  ← 滑动指示条 │
│               │ 正文 …                                                        │   风险等级                 │
│               │                                                               │     高风险权限             │
│               │ 反馈 / 上下篇 / 相关文章                                        │   安装时的授权选择          │
│               │                                                               │ ──                        │
│               │                                                               │ 6 分钟 · 更新于 9月20日     │
│               │                                                               │ [编辑此页] [复制链接]       │
└───────────────┴───────────────────────────────────────────────────────────────┴───────────────────────────┘
```

**窄（narrow，< 640）**

```
┌──────────────────────────── ≈500 ─┐
│ [☰] 帮助中心               [⌕]      │ ☰ 打开模板内滑出目录（absolute，不用 TxDrawer）
│ … › 插件权限说明    [≡ 风险等级 ▾]   │ 面包屑只留最后两级
│ 文章单栏                             │
└────────────────────────────────────┘
```

**组件与角色**

| 区域 | 组件 | 角色 / 要点 |
|---|---|---|
| 目录 | `TxTree`（受控选中 + `v-model:expanded-keys` + `filter-text` + `#item` + `#empty`）+ `TxSearchInput`（筛选） | 见 TxTree cheat sheet。窄档放进模板内滑出面板（Esc 关闭并 `preventDefault`，点遮罩关闭） |
| 面包屑 | `TxBreadcrumb`（无 href） | 点「插件」→ 展开该组并打开组内第一篇；点「帮助中心」→「欢迎使用 Tuff」 |
| ⌘K | `TxCommandPalette` + `#footer`（TxKbd ↑↓ ↵ Esc） | 命令：全部文章（`i-carbon-document`，描述 = 分组）、主推 4 篇的各章节（`i-carbon-text-link`，描述 = 「文章 › 章节」）、「跳到反馈」「复制本页链接」。选中 → 打开文章并 `scrollTo` 对应标题；关闭后焦点回到触发按钮 |
| 正文 | `TxMarkdownView`（单实例，`.markdown-body` 14px / 1.7，h2 18px，h3 15px） | 外层包装负责链接拦截、行内 code 冒泡拦截、MutationObserver 重建标题 |
| 提示块 | markdown 里的原始 HTML `markdown-alert markdown-alert-{tip,warning,note}` | 标题放 `<span class="i-carbon-idea|warning-alt|information" aria-hidden="true">`（字面量在 .vue 的字符串里，Uno 会抽取）。**不用** `TxAlert`：`role="alert"` 会在文章加载时播报每一块 |
| 代码 | TxMarkdownView 原生 `pre`（不高亮） | 需要高亮时整篇换 TxStreamMarkdown（见 cheat sheet） |
| 本页目录（wide） | 手写 `<nav aria-label="本页目录"><ul>` + `useIndicatorBox` | 当前项 `aria-current="true"`；h3 缩进 12px |
| 本页目录（column / narrow） | `TxDropdownMenu`：触发器显示当前节名，菜单列出全部标题，当前项 `#right` 放圆点 | Esc 由触发器 `aria-expanded` 让展开层放行 |
| 本文查找 | `TxSearchInput` + n/m 计数 + ↑↓ `TxIconButton` | 见下方算法 |
| 元信息 | `TxAvatarGroup :max="3"` + `TxAvatar` 首字母 + `Intl` | 「林乔等 3 人编辑 · 更新于 9月20日 · 6 分钟阅读」 |
| 阅读进度（wide） | `TxProgressBar height="2px"`（percentage = 滚动比例，`aria-hidden`） | |
| 反馈 | `TxFlatRadio size="sm"`（`i-carbon-thumbs-up` 有帮助 / `i-carbon-thumbs-down` 没帮助）→ 没帮助时展开 `TxCheckbox` ×3（内容过时 / 缺少示例 / 步骤有误）+ `TxTextarea :max-length="280" show-count` + `TxButton` 提交 | `TxToastPanel`「谢谢，反馈已记录（示例）」；计数文案「86% 的读者觉得有帮助（示例数据）」 |
| 上下篇 / 相关 | `TxCardItem clickable role="link"` + `iconClass` + `#right` 箭头 | 打开文章 |
| 加载 | `TxSkeleton`（切文章 250ms，`useDeferredLoading`） | 保留单个 TxMarkdownView，只换 content |
| 反馈面板 | `TxToastPanel` | 外链「宿主会在浏览器中打开：…」、复制链接、提交反馈 |

**大纲跟随算法**（模板自己的滚动区）

```ts
// headings: HTMLElement[]，由 MutationObserver 回调重建；offsets 在同一时机和 ResizeObserver 回调里缓存
function offsetWithin(el: HTMLElement) {
  return el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
}
function activeFor(scrollTop: number) {
  const probe = scrollTop + 28                       // 落在 sticky 工具行下方一点
  let active = 0
  for (let i = 0; i < offsets.length && offsets[i]! <= probe; i++) active = i
  if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2)
    active = offsets.length - 1                      // 到底部时最后一节生效
  return active
}
// scroll 监听：passive，rAF 节流；同时记录 lastScrollTop（展开 / 收起后写回，R2）
// 点击大纲：lock = i；scroller.scrollTo({ top: offsets[i] - 12, behavior: reduced ? 'auto' : 'smooth' })
//           lock 在 'scrollend' 时解除；没有 scrollend 的浏览器用 600ms 兜底计时器（要登记清理）
```

- 也可以用 `IntersectionObserver({ root: scroller, rootMargin: '0px 0px -70% 0px' })`。`root` 必须是滚动区，不能是视口，否则会跟随 docs 页的滚动。
- 切文章：`scroller.scrollTop = 0`（直接赋值），大纲回到第一项。

**本文查找**

- 输入防抖 150ms。
- 用 `TreeWalker` 遍历 `.markdown-body` 的文本节点，建立不区分大小写的 `Range` 列表，写入 `CSS.highlights.set('tpl-docs-find', new Highlight(...ranges))`；当前项另放 `tpl-docs-find-current`。
- 定位：用 `range.getBoundingClientRect()` 算出位置，再 `scroller.scrollTo`。
- 按键：Enter / Shift+Enter 下一个 / 上一个；有查询时 Esc 清空并 `preventDefault`，查询为空时放行（交给展开层收起）。
- 清理：切文章、清空、卸载时 `CSS.highlights.delete(...)`。
- 样式写成 `:global(::highlight(tpl-docs-find)) { background-color: color-mix(in srgb, var(--tx-color-warning) 35%, transparent) }`，名字带模板前缀，不会影响别处。
- 不支持时（`!('highlights' in CSS)`）：只显示 n/m 并跳转，不上色。不要往 v-html 里插 `<mark>`，它会和重渲染打架。

**键盘**（全部挂在模板根上）

- ⌘/Ctrl+K：`preventDefault` 并打开面板（先例 Shell）。
- `/`：焦点不在可编辑元素时，`preventDefault` 并聚焦本文查找，用 `focus({ preventScroll: true })`。
- ←/→ 不占用。
- TxTree 的方向键由组件处理。

**自动演示（从 `@enter` 起算，有限；读者 pointerdown / keydown / wheel / touchstart 进入模板即取消）**

| 时间 | 动作 |
|---|---|
| T+1.2s | 文章滚动区平滑滚到第 2 个 h2「风险等级」，大纲指示条滑过去；column 模式下拉触发器文字更新 |
| T+3.4s | 滚到第 3 个 h2「安装时的授权选择」 |
| 结束 | 停止，不再动 |

- 减弱动效：不设计时器，直接 `scrollTop = offsets[第 3 节]`，大纲定在第 3 节，即「终态」。
- 自动演示只滚模板内部，不聚焦、不开弹层。
- `resetDemo`：回到「插件权限说明」顶部，清空查找、面板、反馈、筛选，展开状态复位。

**Mock 数据（双语）**

目录（`TreeNode`，key 用稳定英文）：

| 分组 | 文章 |
|---|---|
| 快速上手 / Getting started | 欢迎使用 Tuff / Welcome to Tuff；认识 CoreBox / Meet CoreBox；快捷键速查 / Keyboard shortcuts |
| 插件 / Plugins | 从插件商店安装 / Install from the store；**插件权限说明 / Plugin permissions**；管理与更新插件 / Manage and update plugins；开发第一个插件 / Build your first plugin |
| 剪贴板 / Clipboard | 剪贴板历史 / Clipboard history；敏感内容与隐私 / Sensitive content and privacy |
| AI 与智能 / Intelligence | 接入自己的 AI 服务 / Bring your own AI provider；截图 OCR 与翻译 / Screenshot OCR and translation |
| 账户与同步 / Account & sync | 登录与设备管理 / Sign-in and devices；处理同步冲突 / Resolving sync conflicts |
| 故障排查 / Troubleshooting | CoreBox 打不开 / CoreBox won't open；搜索变慢 / Search feels slow |

主推文章「插件权限说明 / Plugin permissions」的结构：

- 导语一段：权限在 manifest 里声明，安装时授权，随时可撤销。
- `## 权限从哪里来 / Where permissions come from`
  - 正文说明 `permissions.required` / `optional` 与 `permissionReasons`。
  - ` ```json ` 代码块直接用 `plugins/touch-translation/manifest.json` 的真实片段：id、required 四项、optional `clipboard.write`、一条 reason。
- `## 风险等级 / Risk levels`
  - 表格 3 列：权限 id | 名称 | 风险。取注册表与 i18n：clipboard.read 读取剪贴板 中；clipboard.write 写入剪贴板 低；fs.read 读取文件 中；fs.write 写入文件 高；network.internet 互联网访问 中；system.shell 执行命令 高；search.root-results 推送根搜索结果 高；storage.plugin 插件存储 低。
  - `### 高风险权限 / High-risk permissions`：warning 提示块「带 `system.shell` 或 `fs.write` 的插件可以执行命令、改写文件，只从可信来源安装。」
- `## 安装时的授权选择 / Choosing at install time`
  - 始终允许 / 仅本次会话 / 拒绝安装（真实文案）。
  - tip 提示块：「临时试用选『仅本次会话』。」
  - `### 非官方来源 / Unofficial sources`：真实确认文案。
- `## 撤销与审计 / Revoking and auditing`：在插件详情「权限」页随时撤销。
- `## 开发者须知 / For developers`
  - ` ```bash ` `tuff validate` / `tuff scan`（真实子命令）。
  - 站内链接 `[开发第一个插件](#kb:first-plugin)`；外链 `[Nexus 开发者文档](https://tuff.tagzxia.com/docs/dev)`，被拦截后弹 toast。

其他文章：

- 「从插件商店安装」「开发第一个插件」（`tuff create my-plugin` → `tuff dev` → `tuff publish`）「快捷键速查」（`<kbd>` 表格）写成完整文章，每篇 3–4 个 h2。
- 其余文章写 2 个 h2 的短文。
- 每篇带 `updatedAt`、`contributors`（2–4 人）、`readMinutes`、`related[]`、`prev` / `next`（按目录顺序推导）。

写作约束：

- 每段写成一行（`breaks: true`）。
- 标题里不放行内标记（大纲取自源码）。
- 链接只用 `#kb:` 形式或外链。
- 行内 code 要常见（R4 的拦截会用到）。

**手写 CSS**

- 布局：三栏 grid 与容器查询、sticky 工具行、窄档滑出目录与遮罩。
- 大纲：大纲列表与指示条（减弱动效时去掉 transition）。
- 覆盖：`.markdown-body` 字号与标题尺寸、提示块图标对齐。
- 细节：反馈区排版、查找高亮（`:global(::highlight())`）、TxTree `#item` 行样式。

**风险与兜底**：见 R1、R2、R4、R8、R9、R13。

- TxMarkdownView 首帧为空（sanitizer 异步）：大纲先用源码数据显示，元素列表等 MutationObserver 回调再建。

---

## Risks

按严重度排列。与 batch 1 的 R1（生产环境双份 tuffex）、R3（浮层层级）、R6（图标集）、R7（prose 外泄）是同一类的，只写对本批的新影响。

**R1（高，Store）价格与购买**

- `apps/nexus/AGENTS.md:31-35`：只承诺 Pioneer 0 元；`FREE/PRO/PLUS/TEAM/ENTERPRISE` 只是权限层级占位；禁止 mock checkout、伪成功购买、固定假价格。
- 商店不出现：价格、「免费」价签（会暗示存在付费）、「Pro 专享」、订阅、购买、结算、`finance` 分类、带 `i-carbon-currency` / `wallet` / `shopping-cart` 的操作。
- 现成反例：batch 1 Launcher 的一条 mock 剪贴板写了「插件市场开放付费插件的内测」（`TemplateLauncherDemo.vue:176`），属于存量内容，本批别再写类似文案。

**R2（高，两章，已实测）展开 / 收起清零内部滚动**

- 现象：
  - TemplateFrame 用 `<Teleport :disabled>` 移动同一实例（`TemplateFrame.vue:212`）。
  - Vue 移动节点用 `insertBefore`。ego 里 Chromium 152 实测：滚动区 600 → 0，**不派发 scroll 事件**。
  - `Element.moveBefore()` 能保留（700 → 700），但 Vue 不用它。
- 影响：
  - 知识库读到一半点「展开」会回到文章顶部；大纲高亮停在旧节，直到下一次滚动。
  - 商店浏览区和详情区同样回顶。
  - batch 1 的收件箱、画廊、CMS 等同样受影响，没有模板处理过；不在本批范围。
- 对策：scroll 监听里记 `lastScrollTop`（移动不会触发事件覆盖它）；`expanded` 通过 StageSize 中继变化后，在 `nextTick` 写回 `scroller.scrollTop`。写回会派发一次 scroll，大纲随之校正。

**R3（高，Store）TxDrawer 与嵌套 modal 冲突**

- 依据：`TxDrawer.vue:131-173,207-211`（见 cheat sheet）。
- 详情里的截图灯箱和确认框都是 TxModal；详情若做成抽屉，Tab 会被拽回抽屉，Esc 会同时关两层。
- 对策：详情用模板内视图 / 右侧栏，或 TxModal。

**R4（高，Docs；Store 无行内 code，不受影响）docs 页对 `.docs-prose` 里 `<code>` / `<pre>` 的全局处理**

- 常驻：`[...slug].vue:1908` 在 document 上挂 click（`:1909` 挂 keydown）监听。点中 `.docs-prose` 下的行内 code，就 `preventDefault + stopPropagation`、写真实剪贴板、弹 Nexus 站点 toast，还会发 `docs:action` 埋点（`:1374-1446`）。
  - 栏内模板在 `.docs-prose` 里，`not-prose` 挡不住。
  - 展开后在 body 下，不受影响。
  - 对策：文章包装的 click 里，对「在 code 内且不在 pre 内」的目标 `event.stopPropagation()`。
- 时序相关：
  - `enhanceCodeBlocks` 在文档就绪后 260ms / 80ms 执行（`:1790-1818,1920-1970`）：给行内 code 加 `role=button tabindex=0 title` 和 `.docs-inline-code-copyable`（这组样式没有 not-prose 守卫，`:2707-2721`），往 `pre` 插 `.docs-code-header`（绝对定位样式同样无守卫，`:2748`）。
  - `plugins/highlight.client.ts` 在 `app:mounted` / `page:finish` 对所有 `pre code` 跑 hljs。
  - 只有模板在这些处理之前挂载才会中招。模板是页面第一个 demo、离顶部近，有可能发生。
  - 对策：实现后在 ego 里**冷加载**模板页（顶部可见）看一次。中招的话，挂载后切一次 content 让 v-html 重建，处理过的节点就会被替换。

**R5（中，Store）TxVersionCapsule 面板不 teleport，Esc 会双关**

- 依据见 cheat sheet：面板宽 394、`max-width` 看视口；document 级 Esc 不 `preventDefault`；焦点在面板里时 TemplateFrame 会一起收起。
- 对策：
  - 放在详情头部、下方留约 320px。
  - 外包 `@keydown.esc` 先 `preventDefault`（配受控 `panel`）。
  - 面板条目不给 `href`。
  - 窄档只用触发器模式。

**R6（中，Store）轮播与自动演示**

- tuffex 没有轮播组件，手写部分需要：
  - WCAG 2.2.2：可见的暂停控件；自动播放有限次。
  - 非当前页 `inert`。
  - 只做 opacity 过渡；减弱动效时静止。
- 安装、更新、权限确认一律不由计时器触发，属安全闸门，照 spec §6。

**R7（中，Store）TxSearchSelect 的限制**

- 选项只有文本，没有图标、描述、分组。
- 空态和清除按钮的英文写死：前者用 disabled 本地化选项顶替，后者只能记录。
- 非 remote 时回车不发事件，所以用 remote。
- 选中会回填 label。

**R8（中，Docs）链接与标题 id**

- 所有 `<a>` 必须在包装上用 `@click` + `@auxclick` 拦截。不拦截会改 docs 页 hash，触发 `DocsOutline` 的 `hashchange` → `window.scrollTo`，或直接离站。
- 标题不写 id：会被 `collectDomToc()` 收集（`[...slug].vue:660-673`），也会被 hash 逻辑命中。
- 右键「新标签打开」拦不住，href 要保持无害。

**R9（中，两章暗色验收）`.dark` 泄漏**

- `TuffexDocsHeroBackground.vue` 的 `:global(.dark) .x` → 裸 `.dark{}` 泄漏（content.md R2），目前在工作树里改成了普通后代选择器（`git diff` 可见，**未提交**）。
- 受影响：TxMarkdownView / TxStreamMarkdown 根节点（`class="dark" data-theme="dark"`）。
- 暗色截图要等这项修复落地。

**R10（中，两章）减弱动效缺口**

| 组件 | 情况 | 对策 |
|---|---|---|
| `TxModal`（确认框、灯箱） | 没有减弱动效规则 | 接受；batch 1 已记录 |
| `TxTabs` | 没有规则 | 传 `animation` 全关 |
| `TxCard inertial` | rAF 弹簧不理会 | 不开 |
| `TxStagger`、`TxEmptyState` 插画 | 没有规则 | 不播 / 用静态 icon |
| `TxSteps` | 有守卫 | — |
| `TxProgressBar` | 有守卫 | — |
| `TxCollapse`、`TxVersionCapsule` | 有规则 | — |
| `TxTree` | 只有 150ms 背景过渡 | 可忽略 |
| 模板自写动效 | 轮播淡入淡出、大纲指示条、平滑滚动 | 各自判断 `prefers-reduced-motion` |

**R11（中，两章）写死的英文**

- 本批新增：
  - TxTree：`No results` / `Collapse` / `Expand` / `Select`
  - TxSearchSelect：`No results`
  - TxVersionCapsule 与两个面板：各默认文案（都有 prop，必须传）
  - TxCodeBlock：`Copy` / `Copied` / `Preview` / `Code`（前两个没有 prop）
  - TxRating：`Rate N stars`（有 `starLabel`）
- 加上 batch 1 清单：TxModal `Close`、TxInput `Clear input`、TxBreadcrumb `Breadcrumb` 等（design.md:288）。

**R12（中，两章）示例数据的真实性**

- 真实插件 id、版本、权限配上虚构的评分、安装量、评价，界面和页面都要标「示例数据」。
- 社区插件是虚构的，作者名沿用 batch 1。
- 分类由模板指派，manifest 大多是 `utilities`：页面「改造建议」里写明「换成商店 API 的 `category`」。

**R13（低，Docs）CSS Custom Highlight API 的支持面**

- ego / Chromium 152 实测可用。
- Safari 17.2+、Firefox 140+ 来自记忆，未在本地核实。
- 必须做特性检测并准备降级；高亮名全局唯一（`tpl-docs-find*`），卸载时删除。

**R14（低，两章）图标**

- 本文所列 `i-carbon-*` 已全部核过。
- 不存在的名字：`command` `clipboard` `view-all` `hot` `verified-filled` `shield-check` `lightbulb` `enter` `rating`（替代：`mac-command` / `paste` / `grid` / `fire` / `certificate-check` / `security` / `idea` / `return` / `star`）。
- class 字面量要写在 `.vue` 里。markdown 字符串里的 `i-carbon-*` 也在 .vue 文件中，会被 Uno 抽取，但要跑图标名门禁确认（`tuffex-docs-sync.md:129` 的命令）。

---

## 附：关键文件与实测记录

| 路径 | 说明 |
|---|---|
| `packages/tuffex/packages/components/src/card/src/TxCard.vue:8-40,477,505-519,543-545,612-617,433-452` | props、role、插槽、transform / will-change、减弱动效、点击 / 键盘 |
| `…/card-item/src/TxCardItem.vue:9-26,72-73,251-280` | props、无条件 role、单行省略 |
| `…/version-capsule/src/TxVersionCapsule.vue:48-129,145-178,232,352-391` | 触发器模式、document 监听、aria、面板定位、减弱动效 |
| `…/version-capsule/src/TxVersionDownloadPanel.vue:78-87` | `href` → `<a download>` |
| `…/tree/src/TxTree.vue:21-34,249-262,284-339,348-351,387-398,445-497` | props、点击即选择、`focus()`、键盘、英文空态、caret、样式 |
| `…/markdown-view/src/TxMarkdownView.vue:18-21,136-153` | marked 配置、sanitizer 门、根节点 |
| `…/markdown-view/src/github-markdown.css:310-320,505-513,1346-1400` | 16px、表格、提示块 |
| `…/stream-markdown/src/{TxStreamMarkdown.vue:188-200,TxCodeBlock.vue:8-31,145,shiki-runtime.ts,harden-html.ts:127-134}` | 渲染器分发、主题默认 light、复制按钮、Shiki 懒加载、链接 rel |
| `…/search-select/src/TxSearchSelect.vue:12-31,68,185-230,340` | props、remote 过滤、键盘、英文空态 |
| `…/corner-overlay/src/TxCornerOverlay.vue:56`、`…/collapse/src/TxCollapseItem.vue:16,240` | aria-hidden 角标、箭头与减弱动效 |
| `…/drawer/src/TxDrawer.vue:131-173,207-211`、`…/modal/src/TxModal.vue:119-120` | 抽屉的 document 级 Tab / Esc 与 modal 的遮罩级监听 |
| `…/rating/src/TxRating.vue:150,255-270`、`…/image-gallery/src/TxImageGallery.vue:88-147` | 默认星标 aria、缩略图样式 |
| `packages/tuffex/packages/utils/use-indicator-box.ts` | 指示条测量 helper（经 `sidebar-nav/index.ts:34` 导出） |
| `apps/nexus/app/components/content/demos/TemplateFrame.vue:67,134-147,212,362-372` | 1900 层级、Esc 矩阵、Teleport、容器 |
| `apps/nexus/app/components/content/demos/TemplateGalleryDemo.vue:67-80,127-393,709-716,1315-1325,1392-1497` | StageSize 中继、SVG 生成、mode、toast、详情 modal + TxImageGallery |
| `apps/nexus/app/components/content/demos/TemplateShellDemo.vue:653-661,1027-1042,1838-1850` | 根节点 ⌘K、命令面板 + 底栏、scroll-snap 横排 |
| `apps/nexus/app/components/content/demos/TemplateLauncherDemo.vue:158-205,1075-1105` | 预览不放链接的约定、`.markdown-body` 字号覆盖 |
| `apps/nexus/app/pages/store.vue:589-670`、`components/store/{StoreItem,StoreSearch}.vue`、`types/store.ts`、`utils/plugin-categories.ts` | 真实商店的 Tabs 配置、卡片字段、搜索 + 分类、数据类型、分类 |
| `apps/nexus/app/pages/docs/[...slug].vue:660-673,1374-1468,1790-1818,1908-1970,2707-2760` | TOC 收集、行内 code 复制与增强、pre 头部注入、调度、无守卫样式 |
| `apps/nexus/app/components/DocsOutline.vue:200-205,257-285` | `hashchange` → `window.scrollTo` |
| `apps/nexus/app/plugins/highlight.client.ts` | 全局 hljs |
| `apps/nexus/app/components/docs/DocsFeedback.vue` | 有帮助 / 没帮助先例 |
| `apps/nexus/AGENTS.md:31-35` | 价格 / 结算禁令 |
| `plugins/*/manifest.json`、`packages/utils/permission/registry.ts`、`packages/utils/i18n/locales/{zh,en}.json`、`apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json` | 插件、权限、风险、安装流程文案 |

**实测记录**

- `/tmp/kb-probe/probe.mjs`、`probe2.mjs`、`probe3.mjs`：marked 17.0.6 + DOMPurify 3.4.13 + jsdom 26.1.0，与 TxMarkdownView 同配置（`gfm + breaks`、默认 sanitize）。结论见 TxMarkdownView 一节的表格。
- ego（Chromium 152，TaskSpace 12、13 已 `finish({ keep: [] })`）：
  - 对滚动过的元素做 `insertBefore` 移动：scrollTop 600 → 0，移动过程 0 次 scroll 事件；`moveBefore` 保留 700。
  - `'highlights' in CSS` 为 true。
- 图标：两轮对 `@iconify-json/carbon/icons.json` 的名字核对，结果见 R14。
