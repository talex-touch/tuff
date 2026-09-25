# Research: 第二批内容运营模板 A（CMS 看板排期 / Inbox 通知中心 / Files 文件管理）

- **Query**: 为第二批三个模板（CMS 第二风格「看板排期」、Inbox 第二风格「通知中心」、新章节 Files「文件管理」）收集第一批未覆盖的 tuffex 组件 API 与坑点，回答「TxSortableList 能否跨列拖拽」，并给出三档尺寸布局、组件分工、交互、自动演示、双语 mock 与风险。
- **Scope**: internal（tuffex 源码、Nexus demo / 文档页 / 已上线的第一批模板、core-app 的插件存储常量）。未做外部检索；唯一涉及浏览器行为的推断（`dragend` 与源节点移除）在 Risks 里标为「待实测」。
- **Date**: 2026-09-24
- **基线**：源码读于 2026-09-24 上午。工作树里有并行会话的**未提交**改动，和本批相关的有：
  - `TxFlipOverlay.vue` 已改为 `<Teleport to="body">`（`:652-717`），dist（07:31 构建）也已带上；但 HEAD 没有。
  - `TuffexDocsHeroBackground.vue` 的 `.dark` 泄漏修复（`:195` 注释），即第一批 R2。
  - `TxEmptyState.vue`（新 error 插画）、`TxStatusBadge.vue`（图标盒 `0.62em → 1em`）、`TxMarkdownEditor.vue` + 新文件 `toolbar-icons.ts`（ri 图标改 safelist）。API 均未变。
- **与第一批的关系**：第一批调研 `.trellis/tasks/09-23-nexus-docs-templates-tab/research/content.md`（下称 **B1-content**）、`app-shells.md`（**B1-shells**）、`data-flow.md`（**B1-data**）已写过的组件不重复推导，只写对本批三个模板有影响的增量。第一批已知缺陷与绕法见该任务 `design.md` §6.11。

---

## 结论速览

1. **TxSortableList 不能跨列拖拽。** 它没有 `group` 一类的 prop，拖拽状态 `draggingId` 是实例私有的。另一个列表的 `dragover` 在 `if (!fromId) return` 处提前返回，不会 `preventDefault()`（`TxSortableList.vue:172-177`），所以另一列根本不接受放下。
   - **推荐做法（组合，约 40 行宿主代码）**：每列一个 `TxSortableList`，负责列内排序、键盘拿起 / 移动 / 放下和读屏播报。跨列由宿主在**列容器**上补原生 DnD：`dragover` 放行，`drop` 记下目标，**在看板根节点冒泡阶段的 `dragend` 里再改数组**。
   - **键盘路径**：卡片上的「移到 ▸」菜单，加上 ←/→ 键；列表本身不处理左右键（`:292`）。
   - **窄屏**：原生 DnD 在触屏上不可用，只靠菜单。
   - 代码骨架见模板 A。
2. **TxSortableList 会吞掉卡片内部控件的 Enter / Space。** 它的 `keydown` 挂在整项上且不判断 target（`:269-290`），项内按钮的 Enter/Space 会变成「拿起」，并被 `preventDefault`。项内每个按钮都要加 `@keydown.enter.stop @keydown.space.stop`。
3. **TxContextMenu 会 teleport。** 它内部是 TxPopover → TxTooltip → TxBaseAnchor：
   - 面板 `<Teleport to="body">`（`TxBaseAnchor.vue:1037`），floating-ui 定位，`strategy: 'absolute'`（`:192`），定位用 flip + shift + size。
   - 锚点是一个虚拟点，就是鼠标坐标（`TxContextMenu.vue:84-90`）。原地只留一个 `position: fixed` 的 0×0 虚拟参考节点（`TxBaseAnchor.vue:1243`），不占网格格子。
   - 层级：每次打开取分配器 `next()`（≥2000），高于展开浮层的 1900。
   - 关闭：外部点击靠 document 捕获阶段的 `pointerdown`；Esc 靠 document `keydown`（`:993-994`）。
   - **推荐用法**：整个模板只放一个 `trigger="manual"` 的实例，宿主调用 `openAt(event)`。键盘上 Shift+F10 / ContextMenu 键由宿主换算成坐标。
   - **焦点**：关闭后**不会**把焦点还给触发元素（TxDropdownMenu 也一样），宿主要在 `@close` 里自己恢复。
4. **TxFileUploader 只负责接收文件，不做上传。** 它没有进度，不生成 object URL，文件大小单位固定 1024 进制的 B/KB/MB。
   - 拖放区就是它自己的根节点；`pick()` 已 expose；`add` 事件交出 `File`。
   - **推荐用法**：拖入 OS 文件时，把它当作文件区的全覆盖浮层显示，宿主监听 `@add` 模拟分文件进度（`TxProgressBar`）。进度放在挂在「上传」按钮下的 `TxToastPanel` 里，这个面板要 `live="off"`，否则每次进度变化都会被读屏重读。
5. **TxTree 适合做文件夹树，但 Nexus 里还没有任何 demo 用过它的 `#item` 插槽**，要在浏览器里确认。
   - 已有能力：完整 ARIA tree 键盘、受控 `expandedKeys`、`toggle` 事件（可接懒加载）、节点图标走 TxIcon 的类名图标。
   - 限制：行 14px、行距偏松；写死英文 `No results` / `Collapse` / `Expand`；自定义 `#item` 里的展开按钮必须 `@click.stop`，否则会同时选中该行。
6. **存储配额用真实常量。** 插件业务文件存储：单文件 ≤ 10 MB、总量 ≤ 100 MB、≤ 1,000 个文件，文件名须匹配 `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`，**扁平、没有子目录**（`apps/core-app/src/main/modules/plugin/host/plugin-business-file-storage.ts:20-23,95`）。
   - 配额条用 `TxProgressBar :segments`（悬停 tip 需要约 28px 顶部空间）。
   - 不出现升级 / 购买入口（Nexus AGENTS.md:30-35）。
7. **勿扰（DND）的时间段没有现成组件。** tuffex 没有 TimePicker；`TxSlider` 只有单滑块；`TxInput` 的 `type` 联合里没有 `time`。
   - `TxPicker` 内联时滚轮区 `@wheel.prevent`（`TxPicker.vue:627,684`），会劫持页面滚动；弹层模式是移动端底部抽屉。
   - **推荐**：两个 `TxSelect`（30 分钟一档，显式宽度）+ `TuffSwitch`；开关入口用 `TxModeChip`（标签、图标、色调会一起形变，已有减弱动效处理）。
8. **通知行用 `TxCardItem`。** 它有头像 / 标题 / 副标题 / 描述 / 右侧插槽，根节点是 div，可以嵌按钮；`TxToastPanel` 的文档也推荐用它拼内容。
   - 暗色下它的 hover 底色公式在 overlay 表面上几乎看不见，要覆写 `--tx-card-item-hover-bg`。
   - `TxCollapse` 的标题整块是 `<button>`，不能在标题里再放按钮。
9. **看板详情用 `TxModal`**，和 CMS 表格版的 `TxDrawer` 区分开。
   - `TxFlipOverlay` 的 teleport 修复还没提交：生产构建若从 HEAD 出，就会回到第一批的错位问题（B1-content R4）。本批不依赖它。
10. **三个模板都要在 `.vue` 里写出图标类名字面量。** 组件内部用到的 `i-carbon-*`（TxBreadcrumb 的分隔符、TxFileUploader 的删除图标）在 Nexus dev 下不会被 Uno 扫到（`tuffex-docs-sync.md:94`）。
    - 已核对的缺失名：`markdown`、`spreadsheet`、`rename`、`hard-drive`、`sync`、`bug`、`inbox`、`shield-check`、`do-not-disturb`、`kanban` 在 carbon 里**不存在**。
    - 替代见各模板。

---

## Reused from batch 1

下表中的组件第一批已经调研过，本批直接复用，只补本批用得到的增量。行号指对应调研文件的小节。

| 组件 | 出处 | 本批增量 / 注意 |
|---|---|---|
| TxDataTable | B1-content:198-288 | Files 列表视图。<br>• 行上没有 `data-*` 键：右键菜单要靠单元格插槽里的 `data-file-id` 配合 `closest('tr')` 找回行。<br>• `rowClick` 载荷里没有 MouseEvent，⌘ / Shift 修饰键要在包装层用 `@click.capture` 记下。<br>• 没有双击事件，沿用 CMS 的 400ms 计时法（`TemplateCmsDemo.vue:974-994`）。<br>• 吸顶靠 flex 收高度，不写死 `maxHeight`（`TemplateCmsDemo.vue:1797-1815`）。 |
| TxFilterChips | B1-content:289-334 | 看板快捷筛选 / 窄屏的列切换（`role="tablist"`）；通知类型筛选。只能单选，计数必须从数据推导。 |
| TxStatusBadge | B1-content:335-342 | 通知快捷操作的结果行（「已批准」）、看板详情。warning 默认图标是时钟，要显式传 `icon`（design.md §6.11）。 |
| TxTag / TxBadge / TxDotIndicator | B1-content:343-351, 822-826, 382-386 | 卡片栏目标签、列计数（`TxBadge :value` 数字滚动；超 WIP 上限时 `variant="warning"`）、未读点。 |
| TxAvatar / TxAvatarGroup | B1-content:352-374 | 卡片作者（`:size="20"`）、在线协作者（`status="online"`）；Tuff 系统来源用 `src="/logo.svg"`（`TemplateInboxDemo.vue:1471-1477`）。 |
| TxSearchInput / TxInput | B1-content:401-416 | 宽度要在带 scope 的包装层上用 `:deep(.tx-input)` 设（`TemplateCmsDemo.vue:1770-1776`）。`TxInput` 的 `type` 没有 `time`。 |
| TxButton / TxIconButton / TxSplitButton | B1-content:417-441 | —— |
| TxDropdownMenu / Item / Submenu | B1-content:442-475 | 卡片「⋯」菜单、「移到 ▸」、「稍后提醒 ▸」、排序菜单。<br>• 关闭后不还焦点，宿主在 `@close` 里恢复。<br>• 放在可拖拽项里时，触发器外层要 `@click.stop`，并同时处理 keydown 的 stop（见结论 2）。 |
| TxDrawer | B1-content:476-516 | 本批不用（看板详情改用 TxModal，以示区分）。 |
| TxSelect | B1-content:557-583 | 勿扰「从 / 到」两个下拉。根节点宽 240，要给显式宽度；`eager` 默认开；面板会 teleport。放在 TxPopover 里时通过 anchor 链（`anchor-delay.ts:548-554` provide/inject）识别为子层，点选项不会关掉外层 popover。 |
| TxDatePicker | B1-content:594-604 | 看板详情里的「截止 / 发布」日期。用 `variant="field"`，星期表头写死英文。 |
| TxSwitch / TuffSwitch | B1-content:605-610 | 勿扰开关、按来源静音、「仅未读」。尺寸名是 small / default / large。 |
| TxMarkdownEditor | B1-content:611-631 | **仍禁用**（模板规则）。工作树里的 ri 图标 safelist 修复还没提交。 |
| Toast（`toast()` + TxToastHost） | B1-content:632-652 | **禁用**；反馈一律用 TxToastPanel。 |
| TxEmptyState / TxSearchEmpty / TxNoSelection | B1-content:653-666 | 空文件夹、无结果、全部处理完、无法预览。用 `#icon` 插槽放静态图标，避开无限循环动画。 |
| 骨架屏 / `useDeferredLoading` | B1-content:667-674 | 切文件夹时模拟取数的占位。 |
| TxImageGallery | B1-content:675-687 | Files 宽档预览栏里的「同文件夹图片」缩略条，灯箱用它自带的；它不能程序化打开，6 个文案 prop 要本地化。 |
| TxFlatRadio | B1-content:739-746 | Files 网格 / 列表切换（纯图标项，照 `FlatRadioIconDemo.vue`）；看板详情里的列切换。 |
| TxModal | B1-content:800-811 | 看板卡片详情、Files 快速预览。会 teleport；内容 v-if，关闭即卸载；没有减弱动效处理；关闭按钮 aria 写死 `Close`。 |
| TxTooltip / TxPopover | B1-content:827-839 | 通知设置面板（列内档）、WIP 超限提示、图标按钮提示。 |
| TxSplitter | B1-content:852-867 | Files 宽档「文件区 \| 预览」两栏。比例是分数，树栏用 grid 的固定 px。要用 `:deep` 去掉它自带的边框和圆角（参照 Inbox）。 |
| TxMarkdownView | B1-content:934-944 | `.md` 预览。正文 16px，局部覆盖成 13px（`TemplateCmsDemo.vue:2161-2169`）。暗色泄漏 R2 的修复在工作树里、尚未提交。 |
| TxKbd | B1-content:999-1005 | 看板 / 通知 / Files 宽档的快捷键提示。 |
| TxBreadcrumb | B1-shells:141-155 | 增量见下方速查。 |
| TxToastPanel | B1-shells:306-319、B1-data:304-330 | 增量见下方速查。 |
| TxIconChip | B1-shells:392-400 | 增量见下方速查（文件类型角标）。 |
| TxCheckbox | B1-shells:596-600 | 增量见下方速查（根节点是 `<button>`）。 |
| TxSlider | B1-shells:555-562 | 只有单滑块，不能做时间范围。 |
| TxProgressBar | B1-data:173-178 | 增量见下方速查（上传行、配额）。 |
| TxAllocationBar | B1-data:107-115 | 评估过，不做配额条（见「不建议」）。 |

**第一批已上线模板里可以直接照抄的写法：**

- `StageSize` 中继：把 slot 里的宽高传进 script（`TemplateCmsDemo.vue:78-91`）。
- `mode` 三档：`narrow < 640 ≤ column < 960 ≤ wide`（`:707-715`）。
- 受控 `TxToastPanel`：外层绝对定位的包装层，关闭时 `pointer-events: none`（`TemplateCmsDemo.vue:1444-1457,1991-2002`；`TemplateInboxDemo.vue:1538-1568,2159-2170`）。
- 模板根节点上的 `keydown`，遇到可编辑元素时让行（`TemplateInboxDemo.vue:952-1007`）。
- 到达时间线与减弱动效：直接落到终态（`TemplateInboxDemo.vue:1259-1309`）。
- 读者一交互就停止自动演示（`TemplateShellDemo.vue:596-631`）。
- 用 `watch(locale, resetDemo)` 切语言时复位。
- SVG data URI 作品生成器（`TemplateGalleryDemo.vue:97-393`），其中 `drawCorebox` 在 `:251-290`、`drawOrbs` 在 `:157-177`。要复制子集，不要从 Gallery 里抽取：PRD 要求第一批不回退。

---

## New component cheat sheets

说明：
- 「源码」指 `packages/tuffex/packages/components/src/<slug>/`。
- 所有组件都由 `apps/nexus/modules/tuffex-components.ts` 全局注册，模板**不 import 组件**，只 import 类型。

### TxSortableList（`sortable-list`）— 看板每一列

**导出**：`TxSortableList`（别名 `SortableList`）；类型 `SortableListItem`、`SortableListProps`、`SortableListLabels`、`SortableListEmits`；`TxSortableListInstance = Record<string, never>`，没有 expose（`index.ts:9-11`）。

**Props**（`src/types.ts:18-33`，泛型 SFC，type-only props）：

| Prop | 默认 | 说明 |
|---|---|---|
| `modelValue` | 必填 | `T[]`，`T extends { id: string }`，id 必须稳定且在**整页**唯一，见下文 `focusItem` |
| `disabled` | `false` | 同时关掉拖拽和键盘重排 |
| `handle` | `false` | 为 true 时只能从 `[data-tx-sort-handle="true"]` 开始拖；自定义插槽把 `handleAttrs` 展开到手柄上 |
| `ariaLabel` | — | 列表的名字，例如「审核中，3 张卡片」 |
| `itemLabel` | — | `(item) => string`，播报用。不传就念 id |
| `labels` | 英文默认 | `grabbed` / `moved` / `dropped` / `cancelled` / `handle`，支持 `{item}`、`{position}`、`{size}` 占位 |

**Events**
- `update:modelValue(T[])`：预览的每一步都会发，指针每经过一行、键盘每移一格都发一次。
- `reorder({ from, to, items })`：交互结束时只发一次。

**Slot**：`item { item, dragging, grabbed, index, handleAttrs }`。

**行为（源码核对）**

- **原生 HTML5 DnD。**
  - 项上有 `draggable`，`dragstart` 时写 `dataTransfer.setData('text/plain', id)`、`effectAllowed='move'`（`:158-170`）。
  - `dragover` 时一越过别的行就立刻重排，这就是拖拽反馈（`:172-189`）。
  - `drop` 时 `preventDefault()`，但**不** `stopPropagation`（`:196-223`）。
  - 拖到列表外松手也算数：以 `dragend` 为准，结算预览结果（`:225-237`）。
- **跨列表不支持。**
  - `draggingId` 是实例私有的。B 列在 `onDragOver` 里 `if (!fromId) return`，不会 `preventDefault()`，于是 B 不是合法落点。
  - B 列的 `onDrop` 没有 `fromId` 时只做 `endDrag()` 就返回（`:204-210`），事件会继续冒泡给宿主。
  - 这两点正是宿主补跨列逻辑的前提。
- **键盘**
  - 整个列表只有一个 tab 停靠点（`:75-80`）。
  - 空格 / 回车拿起，↑↓ 移动，再按空格 / 回车放下，Esc 取消并恢复顺序，失焦时自动放下（`:269-318`）。
  - **←/→ 不处理，也不 preventDefault**（`:292-294`），宿主可以接过来做换列。
  - **不判断 `e.target`**：项内任何按钮的 Enter / Space 都会触发拿起并被 `preventDefault`，按钮点不了。项内控件必须 `@keydown.enter.stop @keydown.space.stop`。
- **`focusItem` 用的是 `document.querySelector('[data-tx-sort-id="…"]')`**（`:136-141`），查的是整个文档，所以 id 要全页唯一。它调 `focus()` 时不带 `preventScroll`，只在读者按键时发生。
- **读屏**：视觉隐藏的 `role="status"` live region 播报每一步（`:375-377`）。`aria-roledescription="Sortable item"` 写死英文（`:338`）。

**尺寸 / 样式**

- 根节点是纵向 flex，gap 8。
- 每项：1px 边框（`--tx-border-color-lighter`）、圆角 12、背景 `--tx-fill-color-blank`、`cursor: grab`（`:382-406`）。
- 拖起时：主色 55% 描边、6% 底色、`--tx-elevation-3`、`scale(1.015)`（`:419-426`）。
- 默认行 padding 10/12、13px。

**减弱动效**：有，拖起时的 transform 在减弱动效下去掉（`:470-479`）。

**暗色**：`--tx-fill-color-blank` 在暗色下是透明的（`tuffex-design-rules.md:131`），卡片会透出列底色。要用 `:deep(.tx-sortable-list__item)` 铺一层不透明表面，例如 `--tx-bg-color-overlay`。卡片外观直接画在这一层上，**不要**在插槽里再套 TxCard（设计规则：卡片里不套卡片，`tuffex-design-rules.md:217-219`）。

**图标**：没有，手柄是内联 SVG。

**借鉴**：`SortableListSortableListDemo.vue`（最简用法）；文档页 `sortable-list.zh.mdc:42-74`（手柄与持久化）。

### TxContextMenu / TxContextMenuItem / TxContextMenuDivider / TxContextMenuSubmenu / TxContextMenuPanel（`context-menu`）— Files 右键菜单

**导出**：上面 5 个组件，外加各自不带 `Tx` 前缀的别名；类型 `ContextMenuProps`、`ContextMenuTrigger`、`ContextMenuAnchorMode`、`ContextMenuOpenTarget`、`ContextMenuPoint`、`ContextMenuItemProps`、`ContextMenuSubmenuProps`、`ContextMenuPanelProps`…（`index.ts:1-34`）。

**TxContextMenu Props**（默认值见 `TxContextMenu.vue:9-39`）：

| 分组 | Prop 与默认值 |
|---|---|
| 开合与坐标 | `modelValue?`（不传 = 非受控）、`x=0`、`y=0` |
| 面板尺寸 | `width=220`、`minWidth=0`、`maxWidth=360`、`maxHeight=420`、`unlimitedHeight` |
| 可用性 | `disabled`、`eager=false` |
| 触发与锚点 | `trigger='contextmenu'`（可选 `click` / `both` / `manual`）、`anchorMode='pointer'`（可选 `reference`）、`preventDefault=true` |
| 定位 | `placement='bottom-start'`、`offset=2` |
| 关闭行为 | `closeOnEsc=true`、`closeOnClickOutside=true`、`closeOnTriggerPointerDown=true`、`closeOnAnyPointerDown=false`、`closeOnSelect=true` |
| 箭头与动画 | `showArrow=false`、`arrowSize=10`、`animation={}` |
| 内容保活 | `keepAliveContent=true` |
| 面板外观 | `panelVariant='solid'`、`panelBackground='refraction'`、`panelShadow='medium'`、`panelRadius=14`、`panelPadding=6`、`panelCard` |

**Events / Slots / Expose**

- Events：`update:modelValue`、`open({ x, y })`、`close`。
- Slots：`trigger`（回退到 `default`）、`menu`。
- Expose：`openAt(target?: {x,y} | MouseEvent | PointerEvent)`、`openFromEvent(e)`、`close()`、`updatePosition()`（`:310-315`）。

**Item**（`TxContextMenuItem.vue`）

- Props：`disabled`、`danger`、`color`（CSS 颜色，可用变量）、`shortcut`（右侧快捷键文字）、`submenu`（显示箭头）、`closeOnSelect?`。
- Event：`select`。
- Slots：默认（标签）、`avatar`（放图标）、`description`、`right`。
- 实现：根节点是 `TxCardItem role="menuitem"`（`:44-74`）；子菜单箭头用 TxIcon 内置的 `chevron-down`，不依赖图标集。

**其余三个**

- **Divider**：`dashed`、`inset`。
- **Submenu**：`placement='right-start'`、`offset=4`、`minWidth=160`、面板系列 prop；插槽是默认插槽（行标签）加 `menu`。子面板里的项一旦选中，会按根菜单的 `closeOnSelect` 关掉整条链。
- **Panel**：有 `role='menu'|'listbox'|'none'`、`outsideGuard`、`dense`，暴露 `focusFirstItem`。

**DOM 与定位**

- 根节点是**两个元素的 fragment**（`:318-388`）：
  - `div.tx-context-menu__trigger`：`display:block; width:100%`（`:391-394`）。非 manual 时带 `tabindex=0`、`aria-haspopup="menu"`、`aria-expanded`。
  - TxPopover 的参考节点：一个 `position: fixed` 的 0×0 虚拟参考节点（`TxBaseAnchor.vue:1243-1251`），不占网格格子。
- 因为是 fragment，传给 TxContextMenu 的 `class` / `style` 不会落地（还会有 extraneous-attrs 警告），要包一层元素。
- 面板经 TxBaseAnchor `<Teleport to="body">`，floating-ui 定位，`strategy: 'absolute'`。
- 虚拟参考返回鼠标点的 `getBoundingClientRect`（`TxContextMenu.vue:84-90`），打开后页面滚动时菜单停在原来的视口位置，不跟着内容走。
- z-index 取 `zIndexAllocator.next()`（`TxBaseAnchor.vue:914`），展开态下也高于模板浮层的 1900。

**关闭与焦点**

- 点外部：TxContextMenu 在 document 上挂捕获阶段的 `pointerdown`（`:246-269, 302-308`）。
- Esc：TxBaseAnchor 在 document 上挂 `keydown`（`TxBaseAnchor.vue:994`）。
  - 面板在 body 下，Esc 的 keydown 不经过模板根节点。展开态下按 Esc 只会关菜单，不会收起模板浮层，符合 spec 行为矩阵。
- 打开时焦点移到第一项（`:275-300`，`focus()` 不带 preventScroll，但面板就在指针处）。
- 面板内支持 ↑↓ / Home / End（`TxContextMenuPanel.vue:56-80`）。
- **关闭后不恢复焦点**（`onAnchorClose() {}`，`:283`），宿主要在 `@close` 里把焦点还给文件格，`focus({ preventScroll: true })`。

**键盘打开**

- 非 manual 时，触发元素上的 ContextMenu 键 / Shift+F10 会在触发元素**左下角**打开（`:159-186`）。
- 触发元素如果包着整个文件区，这个左下角离焦点格很远。所以推荐 `manual`，由宿主按焦点格的矩形算坐标。

**减弱动效**：TxBaseAnchor 读 `prefers-reduced-motion` 并跳过开合动画（`:721-728`、`:534-536`、`:627`）。

**暗色**

- 面板是 `refraction` 玻璃，`--tx-card-fake-background: var(--tx-bg-color-overlay)`（`:401-403`）。
- **菜单项 hover** 用的是 TxCardItem 的公式（overlay 色的 18%）。`card-item.zh.mdc` 自己点名了这个情况：暗色锚定菜单在 `#1c1c1e` 表面上几乎看不见（`TxCardItem.vue:156-172`）。**要实测**。
  - 覆写办法：给 `TxContextMenuItem` 加一个 scoped class，并设 `--tx-card-item-hover-bg`。
  - 为什么可行：插槽内容带着父组件的 scope id，teleport 出去后 scoped 选择器仍然生效；`:deep` 反而够不到，因为模板根节点不再是它的祖先。

**图标**：只用内置 `chevron-down`。项里的图标由宿主放进 `#avatar` 插槽。

**借鉴**
- `ContextMenuContextMenuDemo.vue:179-196`：`trigger="manual"` + `v-model` + `x/y`。
- `ContextMenuContextMenuSubmenuDemo.vue`。
- 文档交互契约：`context-menu.zh.mdc`「交互契约」一节。

### TxTree（`tree`）— Files 文件夹树（补充 B1-content:907-916）

**Props**：用运行时对象声明（`TxTree.vue:21-34`）。

| Prop | 默认 | 说明 |
|---|---|---|
| `nodes` | `[]` | `TreeNode { key: string\|number; label; children?; leaf?; disabled?; icon?: TxIconSource \| string }` |
| `modelValue` | `undefined` | 不绑定时组件自己维护选中态，并用 `defaultSelectedKeys` 播种（`:59-101`） |
| `multiple` | `false` | |
| `selectable` | `true` | |
| `checkable` | `false` | |
| `disabled` | `false` | |
| `defaultExpandedKeys` | `[]` | 按值 watch（`:40-51`） |
| `expandedKeys` | `undefined` | 传了就是受控 |
| `indent` | `16` | |
| `filterText` / `filterMethod` | — | 过滤只临时展开祖先，不改展开状态（`:152-189`） |

**Events**：`update:modelValue`、`select({ key, node })`、`toggle({ key, expanded })`、`update:expandedKeys`。

**`#item` 插槽**

- 参数：`{ node, level, expanded, hasChildren, selected, toggleExpand, toggleSelect, indent }`。
- 插槽只替换行内的视觉，外层 `div role="treeitem"` 保留，上面的 `aria-level/setsize/posinset/expanded/selected` 也都在（`:354-371`）。
- **外层 treeitem 自己有 `@click` → `toggleSelect`**（`:369`）。插槽里的展开按钮必须 `@click.stop="toggleExpand()"`，否则点一下既展开又选中。`TxTreeSelect.vue` 的写法就是 `@click.stop`。

**键盘**（`:284-339`）：roving tabindex；↑↓ / Home / End；→ 展开或进入子节点；← 折叠或回到父节点；Enter / 空格选中。`focus()` 不带 preventScroll，只在按键时发生。

**图标与展开箭头**

- `node.icon` 是字符串时按 `{ type: 'class' }` 交给 TxIcon（`:103-110`），类名字面量要写在模板 `.vue` 里。
- 展开箭头是内联 SVG，用内联 `rotate(90deg)`，没有过渡。
- **没有「展开时换成打开的文件夹图标」**，要在 `#item` 里按 `expanded` 自己切 `i-carbon-folder` / `i-carbon-folder-open`。

**默认尺寸**：行 padding 6/10、圆角 10、标签 14px、行间距 4（`:429-497`）。密集的侧栏要用 `#item` 画 13px、28px 高的行。选中底色（主色 12%）和 hover 在插槽模式下都要宿主自己画。

**懒加载**：没有。`leaf: false` 会显示展开箭头，宿主在 `toggle` 里补 children 并显示「加载中」（文档最佳实践）。

**写死英文**：`No results`（`:350`，`#empty` 插槽可以覆盖）、`Collapse` / `Expand`（`:392`，自定义 `#item` 时不渲染）、checkbox 的 `aria-label="Select"`（`:405`）。

**减弱动效**：只有 hover 底色 150ms，没有减弱动效处理，影响很小。

**借鉴**：`TreeTreeDemo.vue`、`ComponentsPermissionOrchestrationDemo.vue:215-233`。**Nexus 目前没有 demo 使用 `#item` 插槽。**

### TxTreeSelect（`tree-select`）— Files「移动到…」对话框（可选）

- **Props**（`src/types.ts:14-28`，默认值 `TxTreeSelect.vue:13-26`）：
  - `modelValue`、`nodes`（`{ key, label, disabled?, children? }`，**没有 icon**）、`multiple`、`disabled`。
  - `placeholder='请选择'`：**默认值是中文**，en 页必须传。
  - `searchable=true`、`clearable=true`、`placement='bottom-start'`、`dropdownOffset=6`、`dropdownWidth=0`、`dropdownMaxWidth=480`、`dropdownMaxHeight=320`、`defaultExpandedKeys`。
- **Events / Slot / Expose**：`update:modelValue`、`change`、`open`、`close`；插槽 `node { node, level, expanded, selected }`；expose `open`、`close`、`toggle`、`focus`、`blur`、`clear`、`setValue`、`getValue`、`getCheckedKeys`。
- **浮层**：TxPopover 会 teleport，参考元素铺满宽度。触发元素是 `role="combobox"`，按 Esc 时 TemplateFrame 会让行（`aria-expanded` 为 true）。
- **写死英文**：搜索框 `placeholder="Search"`（`:196`）、`aria-label="Clear"`（`:172`）。
- **用途**：Files 批量「移动到…」的 `TxModal` 里选目标文件夹。也可以直接复用 `TxTree` 做单选树，文案更可控，**推荐后者**。

### TxBreadcrumb（`breadcrumb`）— Files 路径（补充 B1-shells:141-155）

- **Props / Event**：`items: { label; href?; icon?; disabled? }[]`、`separatorIcon='i-carbon-chevron-right'`；事件 `click(item, index)`，只有「没有 href、不是末项、未禁用」的项才会触发，这类项渲染成 `<button>`（`TxBreadcrumb.vue:21-37`）。
- **带 `href` 就是真 `<a>`，会让 docs 页跳走**，模板里一律不要传 href。
- **图标**：`icon` / `separatorIcon` 以 `i-` 开头时走 TxIcon 的类名分支（`icon/src/TxIcon.vue:105-115`）。
  - 默认分隔符的类名写在 tuffex 源码里，Nexus dev 模式下 Uno 扫不到（`tuffex-docs-sync.md:94`）。要**显式传 `separator-icon="i-carbon-chevron-right"`**，让字面量出现在模板文件里。
- **尺寸**：单行 flex、不换行、不省略；项 padding 4/8、14px。
- **窄档写法**（Shell 已验证）：`:deep(.tx-breadcrumb__item:not(:last-child)) { display: none }`（`TemplateShellDemo.vue:1814-1816`），字号降到 13px（`:1139-1142`）。
- **路径太长时**：TxBreadcrumb 没法在某一项上挂下拉菜单。组合办法是在它前面放一个 `TxDropdownMenu`（触发器 `TxIconButton icon="i-carbon-overflow-menu-horizontal"`）列出被折叠的祖先，TxBreadcrumb 只显示最后 2–3 级。
- **写死英文**：`aria-label="Breadcrumb"`（`:41`）。没有监听器，只有 0.2s 的颜色过渡（属于遗留）。

### TxFileUploader（`file-uploader`）— Files 拖入上传

- **类型**：`FileUploaderFile { id; name; size; type; file: File }`（`src/types.ts:1-7`）。
- **Props**（`TxFileUploader.vue:7-17`）：`modelValue?`、`multiple=true`、`accept='*/*'`、`disabled`、`max=10`、`showSize=true`、`allowDrop=true`、`buttonText='Choose files'`、`dropText='Drop files here'`、`hintText='or click to browse'`。
- **Events / Expose**：`update:modelValue`、`change`、`add(FileUploaderFile[])`、`remove({ id, value })`；expose `pick()`（`:167`）。
- **行为**
  - `accept` 在拖放路径上也会校验（`:54-74`）。
  - 单选时新文件替换旧文件；多选时按 `max - modelValue.length` 截断（`:86-114`）。
  - 拖放目标是**组件根节点**（`:170-178`）；`dragleave` 用 `relatedTarget` 去抖（`:146-154`）。
  - **没有上传、没有进度、没有 object URL**，只交出 `File`，文件留在浏览器里。
- **写死**
  - 删除按钮 `aria-label="Remove ${name}"`（`:215`）。
  - 大小单位 1024 进制 `B/KB/MB`，不本地化（`:31-41`）。
  - 删除图标 `i-carbon-close` 写在组件内部（`:219`），模板文件里要出现同名字面量。
- **样式与暗色**
  - 拖放区：虚线边框，底色 `color-mix(var(--tx-fill-color) 55%, transparent)`（`:243-258`），拖入时换主色 12%（`:264-267`）。
  - 用作全覆盖浮层时，底色是半透明的，下面的文件格会透出来，要垫一层不透明底（`tuffex-design-rules.md:129-131`）。
  - 内部的「按钮」胶囊是白字配实心主色（`:279-288`），属于设计规则不支持的配色（`tuffex-design-rules.md:113-115`）。浮层里这颗按钮反正点不到，用 `:deep(.tx-file-uploader__button){display:none}` 藏掉；列表同理 `:deep(.tx-file-uploader__list){display:none}`。
- **减弱动效**：没有处理（边框 / 背景有 160ms 过渡）。
- **借鉴**：`FileUploaderFileUploaderDemo.vue`（文案本地化、`accept`、`max`）。

### TxProgressBar（`progress-bar`）— 上传行与配额（补充 B1-data:173-178）

- **上传行**：`:percentage` 加 `show-text text-placement="top"`，`:format="p => \`上传中 ${p}%\`"`，`:detail="'1.4 MB / 2.3 MB'"`；失败时 `status="error"`（或 `error`），完成时 `success`。
  - 借鉴：`ProgressBarUploadDemo.vue:30-57`。它 100ms 一跳、每跳步长不均，由组件自己的 480ms 缓动连成平滑推进。
- **`complete` 事件**：百分比首次到 100 时发出，挂载时就是 100 也会发（`TxProgressBar.vue:271-287`），可以用来把行切到「已完成」。
- **配额条**：`:segments="[{ value, color, label }]" :segments-total="100"`（单位 MB）。
  - 悬停某段会抬起并出 tip（`标签 · 占比`），需要约 **28px 顶部空间**（`ProgressBarSegmentsDemo.vue:27-31`）。放在侧栏底部时，父级不要 `overflow: hidden`。
  - 有 segments 时，`status` 颜色和 `flowEffect` 都不生效（分段自己占着填充层）。
- **aria**：没有 `ariaLabel` 也没有 `message` 时，回落成英文 `'Progress'`（`:310,362`），每条都要传本地化的 `aria-label`。
- **减弱动效**：indeterminate、flow、分段过渡都有处理（`:1070-1093`）；但填充宽度的 **480ms 过渡**（`:685`）在减弱动效下仍然保留。减弱动效时直接给终值即可。

### TxToastPanel（`toast-panel`）— 三个模板的框内反馈（补充 B1-shells:306-319）

- **Props**（`src/types.ts:22-79`，默认值 `TxToastPanel.vue:25-33`）：`open=true`、`tether=true`、`tetherLength=28`、`side='below'|'above'`、`stack=1`（0–2，纯装饰）、`ariaLabel='Latest item'`、`live='polite'|'off'`。
- **Slots**：`default`（卡片内容）、`tether`（替换虚线引线）。
- **布局**：组件**不定位自己**，隐藏时仍占位（opacity + transform）。要沿用第一批的写法：外层绝对定位，关闭时 `pointer-events: none`。卡片底色是 `--tx-bg-color-overlay`（`:141,154`），暗色下不透明。
- **播报**
  - 根节点是 `role="status"`，`aria-live` 由 `live` 决定。
  - **上传托盘这类内容会频繁变化的面板必须 `live="off"`**，另外放一个视觉隐藏的 status，只播报「开始上传 3 个文件」和「3 个文件上传完成，1 个失败」（文档最佳实践：一次到达只播报一次）。
- **借鉴**：`ToastPanelToastPanelDemo.vue`（它的 `replay()` 用了 `setTimeout(420)` 但没清理，不要照抄）；`TemplateInboxDemo.vue:1538-1568`（头像 + 「查看」动作）。

### TxCardItem（`card-item`）— 通知行、上传托盘行

- **Props**（`src/types.ts:3-36`）：
  - 文字：`title`、`subtitle`、`description`。
  - 左侧媒体：`iconClass`、`avatarText`、`avatarUrl`、`avatarSize=36`、`avatarShape='circle'|'rounded'`。
  - 交互状态：`clickable`、`active`、`disabled`、`tabindex?`（可以传 -1 做 roving）。
  - 其他：`role?`（只在 clickable 时生效）、`align='start'|'center'`。
- **Event**：`click(MouseEvent)`。Enter / 空格只在 `event.target === currentTarget` 时触发，右侧插槽里按钮自己的键盘处理不受影响（`TxCardItem.vue:32-50`）。
- **Slots**：`avatar`、`title`、`subtitle`、`right`、`description`。
- **DOM**：根节点是 `div`，可以嵌按钮（`TxCheckbox` 也是 `<button>`，放在 `avatar` 插槽里合法）。
- **尺寸**
  - padding 10/12、圆角 12、gap 12。
  - 标题 13px / 600，单行省略；副标题 12px，单行省略；描述 12px，可换行（`:233-285`）。
  - `.tx-card-item__right` 是 `flex: 0 0 auto`，右侧放太多按钮会挤压标题。
- **暗色**：hover 底色读 `--tx-card-item-hover-bg`，默认公式在暗色 overlay 表面上几乎看不见（`:156-172`），行落在深色面板上时要覆写；选中底色读 `--tx-card-item-active-bg`。
- **动效**：border / 背景 / 阴影 0.18s 过渡，没有减弱动效处理。
- **借鉴**：`CardItemCardItemDemo.vue`。

### TxCheckbox（`checkbox`）— 批量选择（补充 B1-shells:596-600）

- **根节点是 `<button type="button" role="checkbox">`**（`TxCheckbox.vue` 模板第一行），**不能放进另一个 `<button>`**。文件格或通知行要用 `div role="option"` / TxCardItem 做容器。
- `indeterminate` 会输出 `aria-checked="mixed"`，点击后变成全选，用于「全选本组」和表头。
- `variant='fill'|'checkmark'`；`ariaLabel` 要本地化（如「选择 corebox-dark.png」）。

### TxCollapse / TxCollapseItem（`collapse`）— 通知「已延后」分组

- **Props / Events**
  - `TxCollapse`：`accordion=false`、`modelValue?: string | string[]`；事件 `update:modelValue`、`change`。
  - `TxCollapseItem`：`title?`、`name?`（要给稳定的 name）、`disabled`、`arrowIcon='chevron-down'`（TxIcon 内置图标）；插槽 `title`、默认。
- **DOM 与样式**
  - 外框 1px 边、圆角 10，**`overflow: hidden`**，底色 `--tx-bg-color-overlay`（`TxCollapse.vue:106-113`）。
  - 标题是**整块原生 `<button>`**，最小高 40、13px；**标题插槽里不能再放按钮**（文档最佳实践也禁止把危险操作放进标题）。
  - 内容用 `v-show` 常驻，高度过渡 0.32s，有减弱动效处理。
- **借鉴**：`CollapseBasicDemo.vue`、`CollapseAccordionDemo.vue`。

### TxIconChip（`icon-chip`）— 文件类型角标 / 大图标底板（补充 B1-shells:392-400）

- **Props**（`src/types.ts:9-42`）：`size=14`、`radius`（默认 size/4）、`tone='neutral'|'ink'|'accent'|'green'|'orange'|'red'`、`variant='solid'|'soft'`、`shape`、`label`（如 `PDF`）、`fontSize`、`ariaLabel`（不传就是 `aria-hidden`）。
- **文档约定**：文件类型角标固定 14px，全站同一格式用同一色调（PDF 红、CSV 绿等，见 `icon-chip.zh.mdc` 最佳实践；`IconChipIconChipDemo.vue:33-39`）。
- **大图标**：文件格里可以用 `:size="44" variant="soft"`，默认插槽放 `<i class="i-carbon-document-pdf" />`（Uno 图标是 1.2em），右下角再用 `TxCornerOverlay` 叠一个 14px 的类型角标。
- **注意**：`solid` 彩色色调是白字，只适合 7px 的角标字形（设计规则里的豁免）；大图标用 `soft`。样式带 `bui-scope`。

### TxModeChip（`mode-chip`）— 勿扰开关

- **Props**（`src/types.ts`）：`label`（必填，可见文字兼可访问名称）、`icon=''`（类名）、`tone: StatusTone='muted'`（success / warning / danger / info / muted）、`disabled`。
- **DOM**：根节点就是 `<button>`（`TxModeChip.vue:152-157`）。没有声明 emits，`@click`、`aria-pressed` 会直接落到根按钮上。
- **动效**
  - `label`、`icon`、`tone` 变化时，标签经 TxTextTransformer 模糊交叉淡变，图标在固定尺寸的盒子里缩放替换，颜色只在 `.is-morphing` 期间过渡。
  - 有减弱动效处理（`:48,253,352`），对比度按规则实测过（`tuffex-design-rules.md:117-123`）。
- **用法**：`:icon="dnd ? 'i-carbon-notification-off' : 'i-carbon-notification'"`、`:label="dnd ? '勿扰中 · 至 08:00' : '通知已开启'"`、`:tone="dnd ? 'warning' : 'muted'"`、`:aria-pressed="dnd"`。
- **借鉴**：`ModeChipModeChipDemo.vue`。

### TxCornerOverlay（`corner-overlay`）— 格子角标 / 悬停复选框

- **Props / Slots**：`placement='bottom-right'`（另有三个角）、`offsetX` / `offsetY`（数字即 px）、`overlayPointerEvents='none'|'auto'`；插槽：默认（主体）、`overlay`。
- **DOM**：根节点 `span`，`position:relative; inline-block`；角标层绝对定位。`pointer-events` 为 `none` 时角标层带 `aria-hidden`（`TxCornerOverlay.vue:53-73`）。
- **用法**：文件格左上角放复选框时要设 `overlay-pointer-events="auto"`。
- **借鉴**：`CornerOverlayBasicDemo.vue`。

### 评估过、不建议在这三个模板里用

| 组件 | 原因 |
|---|---|
| `TxCard`（`card`） | 有 `cover` / `header` / `footer` 插槽，看着适合看板卡片。但它每个实例都带一层 TxBaseSurface，还监听 mousemove；再放进 TxSortableList 项（本身有边框和底色），就成了卡片套卡片（设计规则禁止）。卡片外观直接画在排序项上。 |
| `TxSelectionActions`（`selection-actions`） | 这是**文本选区**的 AI 操作浮条（`src/types.ts:31-62`、`use-selection-anchor.ts`），不是多选批量操作栏。批量栏要自己写。 |
| `TxPicker`（`picker`） | 内联时滚轮区 `@wheel.prevent` 会劫持页面滚动（`TxPicker.vue:627,684`）；弹层（默认 `popup=true`，`:15`）是移动端风格的底部抽屉。勿扰时间改用 TxSelect。 |
| `TxSlider` | 只有单滑块，做不了「22:00–08:00」这种范围。 |
| `TxAllocationBar` | 是 radiogroup 选择器，百分比要合计 100，图例不换行（B1-data:107-115），表达不了「已用 / 上限」。配额用 TxProgressBar 分段。 |
| `TxTimeline horizontal` | 用来画周历：每项 `min-width:120px`，一天只能放一个标题；圆点在暗色下有白环（B1-data:259-263）。周历手写 7 列 grid。 |
| `TxDatePicker` 内联日历 | 没有内联日历模式，日历只在 `field` 的 popover 里。 |
| `TxTransfer`、`TxVersionCapsule`、`TxLoadingOverlay` | 场景不匹配。发布版本胶囊留给 Release 章节；加载占位用骨架屏。 |
| `TxFlipOverlay` | teleport 修复还没提交（见基线），生产从 HEAD 构建就会错位。 |

---

## Template proposals

### 通用约定（三份都适用）

- **文件与注册**
  - `TemplateCmsBoardDemo.vue`：接到 `template-cms.{zh,en}.mdc` 的 `## 模板` 下，新增 `### 看板排期 / Editorial board`。
  - `TemplateInboxNotificationsDemo.vue`：接到 `template-inbox.{zh,en}.mdc`，新增 `### 通知中心 / Notification center`。
  - `TemplateFilesDemo.vue`：新章节，`template-files.{zh,en}.mdc`，`category: TemplateContent`（PRD D3「内容运营」），同时要进 TAXONOMY 和 SECTION_ORDER。
  - registry 行和 demo 文件同一次落地（spec §2）。
- **舞台高度**：`<TemplateFrame :height="580">`。CMS 和 Inbox 已上线的第一种风格都是 580，同一章节页上两个 demo 等高。
- **尺寸档位**
  - 用 `StageSize` 中继 slot 的宽高，得到 `mode`：`narrow < 640 ≤ column < 960 ≤ wide`。
  - 宽档内可以再加一级 `≥ 1200`（Files 的预览栏）。
  - CSS 用 `@container template (…)`，规则写在对应基础规则之后（`TemplateCmsDemo.vue:2226-2232` 的注释解释了原因）。
- **单一数据源**：mock 数据放在 `ref` / `reactive` 里，筛选、计数、徽标都从同一份数据推导。时间用固定的 `NOW = Date.UTC(2026, 8, 23, 2, 30)`（周三 10:30，上海时间），显示走 `Intl.RelativeTimeFormat` / `Intl.DateTimeFormat`，时区 `'Asia/Shanghai'`。
- **文案**：`copy` computed 分 zh / en 两支，并按 `zh.value` 生成 `L(bi)` 辅助函数；所有组件的 label / aria 文案都要传。
- **反馈**：框内 `TxToastPanel`，外层绝对定位；撤销一律恢复快照数组。
- **键盘**
  - 快捷键挂在模板根节点：遇到可编辑元素、`defaultPrevented`、菜单 / 工具条内部时让行。
  - 模板自己吃掉的 Esc 要 `preventDefault()`，TemplateFrame 才不会收起。
  - 自动演示期间不 `focus()`，也不 `scrollIntoView`。
- **图标**：只用 `i-carbon-*` 字面量，并用 `tuffex-docs-sync.md:127-129` 的脚本逐个核对名字。
- **颜色**：只用 `--tx-*` / `--tx-bui-*`。栏目色沿用 CMS 的 `SECTION_META`（图表类别色），需要时复制过来，不从 CMS 文件 import。

---

### A. CMS 第二风格「看板排期 / Editorial board」— `TemplateCmsBoardDemo`

**设定**：tuff.tagzxia.com 编辑部的发布排期板。文章从「草稿」到「审核中」「已排期」「已发布」逐列推进；审核中有在制上限（WIP）；展开后多一条「本周发布周历」，可以把卡片拖到某一天完成排期。和 CMS 表格版的区别：看的是流转，不是逐条编辑。

#### 跨列拖拽：结论与实现骨架

- **TxSortableList 不能跨列**（见速查）。推荐做法：列内排序交给 TxSortableList（每列一个，带键盘和播报），跨列由宿主在列容器和周历格子上补原生 DnD。
- **为什么选这个**：TxSortableList 的列内实时预览、键盘重排、live region 播报都能直接用；不做「全手写原生看板」那种退路。
- **退路 1**（更稳）：不做跨列拖拽，只保留「移到 ▸」菜单和 ←/→ 键。代码最少，但失去最有辨识度的交互。
- **退路 2**：完全手写原生 DnD 并套 tuffex 外观。会失去列内实时预览和键盘路径，不推荐。

```ts
// Board root: <div class="board" @dragstart="onDragStart" @dragend="onDragEnd">
type ColumnKey = 'draft' | 'review' | 'scheduled' | 'published'
const drag = reactive({ id: null as string | null, from: null as ColumnKey | null, over: null as ColumnKey | null, index: -1 })
let pendingMove: { id: string, to: ColumnKey, index: number, publishAt?: number } | null = null

function onDragStart(event: DragEvent) {
  if (event.defaultPrevented) // handle-only lists cancel drags that start off the grip
    return
  const item = (event.target as HTMLElement).closest<HTMLElement>('[data-tx-sort-id]')
  if (!item)
    return
  // dataTransfer.getData() is blank during dragover (protected mode), so keep our own copy.
  drag.id = item.dataset.txSortId!
  drag.from = columnOf(drag.id)
}

// On each column wrapper and on each week-lane day cell.
function onColumnDragOver(event: DragEvent, column: ColumnKey) {
  if (!drag.id || column === drag.from) // same column: TxSortableList owns it
    return
  event.preventDefault() // makes the drop legal; the other list never does
  event.dataTransfer!.dropEffect = 'move'
  drag.over = column
  drag.index = insertionIndex(event.currentTarget as HTMLElement, event.clientY) // compare against the midpoints of each [data-tx-sort-id]
}

function onColumnDrop(event: DragEvent, column: ColumnKey) {
  if (!drag.id || column === drag.from)
    return
  event.preventDefault()
  pendingMove = { id: drag.id, to: column, index: drag.index }
}

// Bubble phase on the board root: runs after the source list's own onDragEnd has
// settled its preview, and before the source row has been unmounted.
function onDragEnd() {
  const move = pendingMove
  pendingMove = null
  Object.assign(drag, { id: null, from: null, over: null, index: -1 })
  if (move)
    applyMove(move) // snapshot → mutate → toast with undo
}
```

**实现细节**

- **为什么在 `dragend` 里改数组**：如果在 `drop` 里改，Vue 会在下一个微任务里先把源行卸载，这时浏览器还没派发 `dragend`。源节点被移除后浏览器对 `dragend` 的处理不一致（待实测），源列表的 `pendingOrder` / `draggingId` 可能残留（`TxSortableList.vue:56,69`），结果同一张卡在两列里各出现一次。
- **插入位置**：用卡片中点比较，宿主画一条 2px 的指示线（手写 CSS，绝对定位在列内，没有动画）。
- **周历格子**：落在某一天 → `pendingMove.publishAt = dayTs`，并移到「已排期」。已发布的卡不接受：在 dragover 里不 `preventDefault`，光标显示「不可放置」。
- **快捷筛选「淡化、不隐藏」**：不匹配的卡片 `opacity: .35`，列计数显示「3/5 匹配」。如果真的隐藏，TxSortableList 拿到的是子集，重排后要做槽位合并（隐藏的卡留在原位，可见的卡按新顺序依次填回）。淡化最稳。
- **键盘换列**：根节点 keydown 收到 ←/→，且 target 在 `[data-tx-sort-id]` 内、没有 `defaultPrevented`、所在项不是 `.tx-sortable-list__item--grabbed` 时，把卡移到相邻列的同一位置，`nextTick` 后 `focus({ preventScroll: true })`。再用宿主自己的 `role="status"` 播报「已移到「已排期」第 1 位」；TxSortableList 的 live region 只管列内。
- **id**：卡片 id 加 `useId()` 前缀，保证整页唯一（`focusItem` 用 document 查询）。

#### 布局 — 栏内（≈782 × 580，column）

```
┌──────────────────────────────────────────────────────────────────────── 782 ─┐
│ ▦ 排期看板  tuff.tagzxia.com · 14 篇 · 本周发布 3   (MO)(AC)+2  [🔍 ▢▢▢▢] [+ 新建]│ 48  标题 + 摘要 + TxAvatarGroup（在线）+ TxSearchInput + TxButton
│ (全部 14)(我负责 4)(本周到期 5)(有新评论 3)                         栏目 ▾      │ 34  TxFilterChips（淡化不匹配）+ TxDropdownMenu（栏目）
│ ┌ 草稿  4 ───────┐┌ 审核中 3/3 ⚠───┐┌ 已排期  3 ──────┐┌ 已发布  4 ──────┐     │ 30  列头：名称 + TxBadge 计数 + WIP「3/3」（TxTooltip）
│ │▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔││▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔││▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔││▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔│     │     卡片：6px 栏目色封面条（CSS 渐变）
│ │[指南]         ⋯ ││[发布说明]      ⋯ ││[插件]          ⋯ ││[发布说明]      ⋯ │     │     TxTag soft + ⋯ TxDropdownMenu
│ │用 Surface 做一个 ││sdkapi 260713    ││插件聚光灯：     ││Tuff 2.4 发布说明 │     │     标题两行截断
│ │番茄钟插件        ││变更日志          ││touch-translate  ││                 │     │
│ │(MO) 📅9/30  💬0  ││(LQ) 📅明天 💬3   ││(MO) 🕙9/24 10:00││(LQ) ✓9/23  💬12 │     │     TxAvatar 20 + 日期 + 评论数
│ │ …               ││ …（列内纵向滚动）││                 ││                 │     │     每列 = TxSortableList
│ │ ＋ 添加卡片       ││                 ││                 ││                 │     │     只有草稿列有
│ └─────────────────┘└─────────────────┘└─────────────────┘└─────────────────┘     │
└──────────────────────────────────────────────────────────────────────────────────┘
4 列 × 约 178px，gap 10；看板容器保留 overflow-x:auto 兜底（≈640–700 时）
TxToastPanel：右下角，side="above"（移动 / 撤销 / 远端协作提示）
点卡片 → TxModal 详情
```

#### 布局 — 展开（≈1440 × 900，wide）

```
┌──────────────────────────────────────────────────────────────────────────────────────── 1440 ─┐
│ ▦ 排期看板  14 篇 · 本周发布 3 · 2 篇逾期   空格 拿起 · ↑↓ 排序 · ←→ 换列    (LQ)(MO)(AC)+2  [🔍 ……] [+ 新建] │
│ (全部)(我负责)(本周到期)(有新评论)    栏目 ▾                                                    │
│ ┌ 草稿 4 ─────────────────┐┌ 审核中 3/3 ────────────┐┌ 已排期 3 ──────────────┐┌ 已发布 4 ──────────────┐ │
│ │ 卡片约 300px：多一行摘要   ││                        ││                        ││                        │ │ ≈ 470
│ │ + 清单进度 2/4（3px 进度条）││                        ││                        ││                        │ │
│ └──────────────────────────┘└────────────────────────┘└────────────────────────┘└────────────────────────┘ │
│ 本周发布 · 9月21日 – 27日                                           ‹ 上一周 · 本周 · 下一周 ›         │
│ ┌ 一 21 ──┬ 二 22 ──┬ 三 23 今天 ─┬ 四 24 ─────┬ 五 25 ─────┬ 六 26 ──┬ 日 27 ──┐                    │ ≈ 200
│ │●社区周报 │         │●Tuff 2.4    │●touch-     │●自带密钥   │         │         │ ← 把卡片拖到某天即排期 │
│ │ #38     │         │ 发布说明     │ translate  │            │         │         │   （草稿 / 审核中 → 已排期）│
│ └─────────┴─────────┴─────────────┴────────────┴────────────┴─────────┴─────────┘                    │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 布局 — 窄屏（< 640）

```
┌───────────────────────────── ~536 ─┐
│ ▦ 排期看板          [🔍] [筛选 ▾] [+]│ 快捷筛选收进 TxDropdownMenu
│ (草稿 4)(审核中 3)(已排期 3)(已发布 4)│ TxFilterChips role="tablist" = 列切换（横向滚动）
│ ┌───────────────────────────────┐  │
│ │▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔│  │ 只显示一列，卡片全宽
│ │[指南]                      ⋯   │  │ ⋯ → 移到 ▸ 审核中 / 已排期 / 已发布
│ │用 Surface 做一个番茄钟插件       │  │ （触屏没有原生 DnD，只走菜单）
│ │(MO) 📅 9/30    💬 0           │  │
│ └───────────────────────────────┘  │
└────────────────────────────────────┘
```

#### 组件分工

| 区域 | 组件 | 作用 |
|---|---|---|
| 头部 | `TxAvatarGroup`（`TxAvatar status="online"`）、`TxSearchInput`、`TxButton primary icon="i-carbon-add"` | 在线协作者、搜标题（匹配的高亮、其余淡化）、新建草稿 |
| 筛选 | `TxFilterChips`、`TxDropdownMenu` | 全部 / 我负责 / 本周到期 / 有新评论，计数从数据推导；栏目多选放菜单，菜单项右侧打勾 |
| 列头 | `TxBadge :value`、`TxTooltip` | 计数（数字滚动）；审核中 WIP 上限 3，超限时 `variant="warning"`，并加文字「超限」，不能只靠颜色表达 |
| 列体 | `TxSortableList`（`:aria-label`、`:item-label`、本地化的 `:labels`） | 列内拖拽 / 键盘重排；项的外观用 `:deep(.tx-sortable-list__item)` 画成卡片 |
| 卡片 | `TxTag soft`、`TxAvatar :size="20"`、`TxDropdownMenu` + `TxDropdownSubmenu`、`TxProgressBar height="3px"`（宽档清单进度） | 栏目标签；作者；⋯（打开 / 移到 ▸ / 复制链接 / 删除）；清单进度 |
| 周历（宽档） | 手写 7 列 grid 加小胶囊 | 排期可视化 + 放置目标 |
| 详情 | `TxModal width="min(640px, calc(100vw - 48px))"`，内含 `TxFlatRadio`（4 列切换）、`TxDatePicker variant="field"`、`TxSelect`（栏目）、`TxCheckbox`（清单）、`TxAvatar`、`TxInput` + `TxButton`（评论）、`TxStatusBadge` | 查看 / 编辑卡片；底部「删除（danger ghost）/ 关闭 / 下一步主按钮」（提交审核 / 排期 / 发布） |
| 反馈 | `TxToastPanel`（`side="above"`）+ 宿主 `role="status"` | 「已移到「已排期」 · 撤销」、远端协作提示、WIP 超限提示 |

#### 交互

- **拖拽**：列内拖动重排；跨列拖到任意位置；宽档拖到周历某天即排期；拖入已满的「审核中」时允许，但提示超限。
- **键盘**：Tab 进入某一列（每列一个停靠点）；空格拿起、↑↓ 移动、空格放下、Esc 取消（TxSortableList 自带）；←/→ 换列（宿主实现）；卡片 ⋯ 菜单里有「打开详情」「移到 ▸」。
- **点卡片**：打开详情。卡片内的 ⋯ 触发器外层要 `@click.stop`，并加 `@keydown.enter.stop @keydown.space.stop`。
- **新建**：草稿列顶部插入一张内联卡，标题用 `TxInput`；Enter 确认，Esc 取消，Esc 要 `preventDefault`，否则会收起展开浮层。
- **撤销**：移动、删除、排期都走快照撤销。
- **窄屏**：列切换 chips 加菜单移动。

#### 自动演示（`@enter` 开播，可重播）

- +1.0s：Mara 上线，头像组 +1。
- +1.8s：远端移动。「sdkapi 260713 变更日志」从审核中移到已排期，publishAt 设为 9/24 10:00；宽档周历周四出现胶囊；被移动的卡描一圈高亮环 1.2s（`prefers-reduced-motion: no-preference` 时才有动画）；`TxToastPanel` 提示「Mara Okafor 把《…》移到了「已排期」」，带「查看」按钮（打开详情）。
- +3.4s：「插件审核标准」评论数 +1，出现「新评论」点。
- 读者第一次 pointerdown / keydown 就取消剩余步骤（照 Shell）。
- 减弱动效：直接落到终态，不弹提示。
- `resetDemo`：复位数据、筛选、搜索，关闭 Modal，清空 pendingMove 和拖拽状态；如果已经 `entered` 就重播。
- `watch(locale, resetDemo)`。

#### Mock 数据（双语，14 张卡）

```ts
type ColumnKey = 'draft' | 'review' | 'scheduled' | 'published'
type Section = 'release' | 'guide' | 'plugin' | 'engineering' | 'community' // same hues as CMS SECTION_META
interface BoardCard {
  id: string // `${uid}-card-01`, unique across the page
  title: Bi; summary: Bi; section: Section; column: ColumnKey
  authorId: 'lq' | 'mo' | 'ks' | 'ac' | 'nh'; reviewerId?: AuthorId
  dueAt: number | null // draft / review deadline
  publishAt: number | null // scheduled / published time
  comments: number; unreadComments: boolean
  checklist: { label: Bi, done: boolean }[] // 配图 / 校对 / 中英同步 / SEO 描述
}
```

| 列 | 卡片（zh / en）· 作者 · 时间 · 评论 |
|---|---|
| 草稿 | 「Tuff 2.5 路线图：插件市场与团队空间」/ Tuff 2.5 roadmap · LQ · 截止 10/08 · 2<br>「用 Surface 做一个番茄钟插件」/ Build a Pomodoro plugin with a Surface · MO · 9/30 · 0<br>「插件聚光灯：touch-window-presets」/ Plugin spotlight: touch-window-presets · KS · 10/02 · 1<br>「单写入者：本地数据库的一次重构」/ One writer: reworking the local database · KS · 10/05 · 4 |
| 审核中（上限 3） | 「Nexus 插件审核标准（2026 版）」/ Nexus plugin review guidelines (2026) · NH · 9/25 · 6<br>「sdkapi 260713 变更日志」/ Changelog: sdkapi 260713 · LQ · 9/24（明天）· 3<br>「键盘优先：CoreBox 的交互原则」/ Keyboard first: how CoreBox is designed · AC · 9/22（**逾期 1 天**）· 2 |
| 已排期 | 「自带密钥：接入你自己的 AI Provider」/ Bring your own key · AC · 9/25 10:00<br>「插件聚光灯：touch-translate」/ Plugin spotlight: touch-translate · MO · 9/24 10:00<br>「CoreBox 主题征集结果」/ CoreBox theme contest results · NH · 9/30 |
| 已发布 | 「Tuff 2.4 发布说明」· LQ · 9/23 08:00 · 12<br>「社区周报 #38」· AC · 9/21<br>「我们如何把搜索主线程阻塞压到 16ms 以下」· KS · 9/18<br>「快捷键速查表」· MO · 8/14 |

作者沿用 CMS 的 5 位（`TemplateCmsDemo.vue:110-116`，复制过来即可）。

#### 需要手写的 CSS

- 看板 grid：4 × `minmax(168px, 1fr)`，`overflow-x: auto`。
- 列：flex column；列头吸顶，用 1px 分隔线，不用阴影（设计规则 `:93-95`）。
- 卡片外观：通过 `:deep(.tx-sortable-list__item)` 设不透明底、ring、圆角 10、封面条。
- 插入指示线、放置高亮、淡化态。
- 周历 7 列 grid 和胶囊。
- 窄屏单列与列切换。
- 减弱动效时关掉高亮环动画。

#### 图标（已核对存在）

`i-carbon-column` / `task-view`（标题）、`calendar`、`time`、`chat`、`warning-alt`、`add`、`overflow-menu-horizontal`、`arrow-right`、`view`、`link`、`trash-can`、`draggable`、`checkmark-outline`。`i-carbon-kanban` **不存在**。

#### 风险与退路

- 跨列 DnD 必须在真实浏览器里验证：拖到列中间、拖到空列、拖到周历、拖出看板后松手、快速来回。ego 是 Chromium，Safari / Firefox 没有覆盖。退路：只保留菜单和 ←/→。
- 项内控件的 Enter / 空格会被吞（需要 `.stop`）。
- `--tx-fill-color-blank` 在暗色下透明。
- TxModal 没有减弱动效处理。
- TxDatePicker 星期表头是英文。
- 触屏上没有原生 DnD。

---

### B. Inbox 第二风格「通知中心 / Notification center」— `TemplateInboxNotificationsDemo`

**设定**：Tuff 账户的通知中心，不涉及账单。按日期分组的单列信息流，每条通知带就地快捷操作（批准 / 查看 / 静音 / 稍后提醒）；支持批量已读、类型筛选、勿扰时段、按来源静音；新通知经 `TxToastPanel` 从铃铛下方浮出。和三栏邮件客户端的区别：没有阅读区，不需要「打开」就能处理。

#### 布局 — 栏内（≈782 × 580）

```
┌──────────────────────────────────────────────────────────────────────── 782 ─┐
│ 🔔 通知中心 (12)                [◐ 通知已开启]  [选择]  [✓ 全部已读]  [⚙]      │ 48  TxBadge + TxModeChip + TxButton×2 + TxIconButton→TxPopover（设置）
│     ┊ TxToastPanel（side="below"，从铃铛引出，绝对定位盖在列表上方）              │
│ (全部 24)(@ 提及 4)(构建 5)(安全 2)(插件 4)(系统 3)                仅未读 ◯     │ 34  TxFilterChips + TuffSwitch
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ 今天 · 4 条未读                                            全部标为已读    │ │ 吸顶分组头（手写，底部 1px 线）
│ │ ●(KS) 佐藤健二 在 #plugin-dev 提到了你                      10:24    ⋯    │ │ TxCardItem：头像 + 未读点 + 标题
│ │       “@你 预览面板的空状态插画三套方案都放在设计稿里了…”  [提及]  [回复]   │ │ 描述 + TxTag + 主快捷操作
│ │ ●[🔨] Nightly 2.4.0-beta.3 · win32 构建失败                  09:15    ⋯    │ │ TxIconChip（类型字形）做系统来源头像
│ │       package:win 步骤退出码 1              [构建]  [查看日志]  [重试]      │ │
│ │ ●[🔌] touch-browser-bookmarks 请求新权限「读取剪贴板」          08:40    ⋯    │ │
│ │       批准前不会安装 1.3.0                   [插件]  [批准]  [拒绝]         │ │ 批准类成对按钮
│ │ ●[🔒] 新设备登录：Windows 11 · 杭州                           08:02    ⋯    │ │
│ │       如果不是你本人，请立即撤销              [安全]  [是我]  [不是我]       │ │
│ │ 昨天 · 7                                                                  │ │
│ │ …                                                                        │ │
│ │ ▸ 已延后 · 2                                                              │ │ TxCollapse（默认折叠，放在列表末尾）
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ （选择模式）☐ 全选 · 已选 3   [标为已读] [稍后提醒 ▾] [删除]           [完成]    │ 44  批量栏：只在选择模式出现
└──────────────────────────────────────────────────────────────────────────────┘
```

#### 布局 — 展开（≈1440 × 900）

```
┌────────────────────────────────────────────────────────────────────────────────────────── 1440 ─┐
│ 🔔 通知中心 (12)   J / K 切换 · E 已读 · X 选择             [◐ 勿扰中 · 至 08:00] [选择] [✓ 全部已读] │
│ (全部 24)(@ 提及 4)(构建 5)(安全 2)(插件 4)(系统 3)      仅未读 ◯                                   │
│ ┌──────────── 信息流（阅读宽度 ≤ 760）──────────────────┐ ┌──────── 通知设置 360 ─────────────────┐ │
│ │ 今天 · 4                                              │ │ 勿扰时段                     [◯──]     │ │
│ │ 行更宽：快捷操作全部内联，⋯ 只放静音和稍后提醒            │ │ 从 [22:00 ▾] 到 [08:00 ▾]             │ │ TuffSwitch + TxSelect×2
│ │                                                       │ │ (每天 | 工作日 | 周末)                  │ │ TxFlatRadio size="sm"
│ │                                                       │ │ 安全通知可穿透勿扰           [──◉]     │ │
│ │                                                       │ │ ───────────────────────────────────── │ │
│ │                                                       │ │ 按来源静音                            │ │
│ │                                                       │ │ [🔨] Tuff CI 构建                [──◉]│ │ TxIconChip + TuffSwitch
│ │                                                       │ │ [@]  提及与评论                  [──◉]│ │
│ │                                                       │ │ [🔌] 插件审核与更新              [──◉]│ │
│ │                                                       │ │ [ℹ]  系统与维护公告              [──◉]│ │
│ │                                                       │ │ [🔒] 安全（不可关闭）             [──◉]│ │ disabled + TxTooltip
│ │                                                       │ │ ───────────────────────────────────── │ │
│ │                                                       │ │ 已延后 2 · 今晚 20:00 / 明天 09:00     │ │
│ └───────────────────────────────────────────────────────┘ └───────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 布局 — 窄屏（< 640）

```
┌───────────────────────────── ~536 ─┐
│ 🔔 通知 (12)       [◐] [✓] [⚙]      │ 勿扰：窄屏换成 TxIconButton :pressed（TxModeChip 必须带文字）
│ (全部 24)(@ 4)(构建 5)… →          │
│ 今天                                │
│ ●(KS) 佐藤健二 提到了你   10:24  ⋯   │ 快捷操作收进 ⋯；批准类成对按钮换行显示
│   “@你 预览面板的空状态…”            │
│   [回复]                            │
│ …                                  │
└────────────────────────────────────┘
```

#### 组件分工

| 区域 | 组件 | 作用 |
|---|---|---|
| 头部 | `TxBadge :value`、`TxModeChip`、`TxButton`、`TxIconButton` + `TxPopover`（列内 / 窄屏的设置入口） | 未读数；勿扰开关（形变）；选择模式；全部已读；设置 |
| 筛选 | `TxFilterChips`（计数从数据推导）、`TuffSwitch`「仅未读」 | 类型：提及 / 构建 / 安全 / 插件 / 系统 |
| 分组 | 手写吸顶头 + 组内 `TxCheckbox :indeterminate`（选择模式） | 今天 / 昨天 / 本周更早；「全部标为已读」是 TxButton ghost，位置在头的右端，不在 TxCollapse 里 |
| 行 | `TxCardItem`：`avatar` 插槽放 `TxAvatar` / `TxIconChip` / `TxCheckbox`，`right` 插槽放时间、`TxDropdownMenu`、主快捷按钮，`description` 插槽放摘要和 `TxTag` | 未读：`TxDotIndicator` + 标题 600；快捷操作执行后，行里换成 `TxStatusBadge`（「已批准」「已撤销设备」） |
| ⋯ 菜单 | `TxDropdownMenu` + `TxDropdownSubmenu` | 标为未读 / 稍后提醒 ▸（1 小时后、今晚 20:00、明天 09:00、下周一）/ 静音此来源 ▸（1 小时、今天、直到我打开）/ 删除 |
| 已延后 | `TxCollapse` + `TxCollapseItem name="snoozed"` | 列表末尾默认折叠；每条带「取消延后」（按钮在内容区，不在标题里） |
| 设置 | `TuffSwitch`、`TxSelect`×2（`style="width:104px"`，48 个半小时档）、`TxFlatRadio size="sm"`、`TxIconChip` 行 | 列内放在 `TxPopover` 里，宽档放在右侧栏 |
| 到达 | `TxToastPanel side="below" :stack="Math.min(2, queued)"` + `TxCardItem` | 最新一条带「查看」和关闭；勿扰期间不弹，只累计「已静默 N 条」 |
| 空态 | `TxEmptyState`（`#icon` 放静态 `i-carbon-notification`） | 「全部处理完了」，次操作「查看已延后（2）」 |

#### 交互

- **筛选**：切类型、「仅未读」；筛到空时显示空态和「清除筛选」。
- **单条处理**：点行 = 标为已读，并显示「宿主会打开 …」（不导航）。快捷操作就地执行，执行后行折叠成结果行，并提供撤销。批准 / 拒绝是读者自己点，自动演示**从不**替读者点批准（spec「安全闸门」精神）。
- **批量**：「选择」进入选择模式，头像位换成 TxCheckbox；分组头提供「全选本组」（indeterminate）；底部批量栏：标为已读 / 稍后提醒 ▾ / 删除（可撤销）/ 完成。
- **勿扰**
  - `TxModeChip` 手动开关（立即勿扰 1 小时），或在设置里配定时段。
  - 勿扰期间新到的非紧急通知**静默插入**：带未读点，不弹 TxToastPanel，头部显示「勿扰中 · 已静默 2 条」。
  - 安全类在「可穿透」开启时照常弹出。
- **按来源静音**：关掉某来源后，该来源的通知淡化，并在该组下显示「已静音 · 撤销」。
- **键盘**（挂在根节点）
  - J / K / ↑ / ↓：移动行焦点（roving `tabindex`，`focus({ preventScroll: true })` 后调整列表的 `scrollTop`）。
  - E：已读 / 未读；X：选中；Enter：打开。
  - 焦点在菜单、tablist 或可编辑元素里时让行（照 `TemplateInboxDemo.vue:970-977`）。
  - 语义二选一：APG feed（`role="feed"` + `article` + `aria-setsize/posinset`），或 list + roving tabindex。定下来后用键盘和读屏实测一遍。

#### 自动演示（`@enter` 开播；读者交互不取消，因为到达本身就是演示内容）

- +3s：「Nightly 2.4.0-beta.4 · win32 构建通过」（非紧急）。
- +8s：「Ava Chen 在 #design 提到了你」。
- +14s：「新设备登录：iPad · 上海」（紧急）。
- 每条都插到「今天」组顶部。读者已经滚离顶部时，列表的 `scrollTop` 补偿一行高度（照 `TemplateInboxDemo.vue:1269-1281`）。
- 减弱动效：`@enter` 时一次性插好 3 条，不弹提示，不做入场高亮。
- `resetDemo`：复位数据、筛选、选择模式、勿扰、静音和延后，清掉计时器；已 `entered` 时重播。
- `watch(locale, resetDemo)`。

#### Mock 数据（双语，不含账单 / 价格）

```ts
type Kind = 'mention' | 'build' | 'security' | 'plugin' | 'system'
type SourceId = 'ci' | 'community' | 'store' | 'updates' | 'security'
type ActionId = 'reply' | 'viewLog' | 'retry' | 'approve' | 'deny' | 'itsMe' | 'notMe' | 'update' | 'publish' | 'restart' | 'renew' | 'resolve' | 'view'
interface Notice {
  id: string; kind: Kind; source: SourceId; actor?: AuthorId // people get initials, system sources get TxIconChip/logo
  title: Bi; body: Bi; at: number; unread: boolean; urgent?: boolean
  actions: ActionId[]; result?: { tone: StatusTone, text: Bi } // set after a quick action
  snoozedUntil?: number; muted?: boolean
}
```

**种子（18 条）**

| 分组 | 通知 · 快捷操作 |
|---|---|
| 今天 | 佐藤健二 @你（#plugin-dev）· 回复<br>Nightly 2.4.0-beta.3 · win32 构建失败 · 查看日志 / 重试<br>touch-browser-bookmarks 请求新权限「读取剪贴板」· 批准 / 拒绝（呼应 core-app 的权限模块）<br>新设备登录 Windows 11 · 杭州（紧急）· 是我 / 不是我<br>Tuff 2.4.1 已下载，重启即可安装 · 立即重启 |
| 昨天 | touch-translate 1.4.0 已通过审核 · 发布<br>Ava Chen 在《Tuff 2.4 发布说明》评论里提到了你 · 回复<br>tuff-native 0.9.2 三平台构建通过 · 查看<br>Workspace Scripts 3.2 可更新（新增 pnpm 工作区识别）· 更新<br>你的主题《CoreBox 午夜》获得 100 个赞 · 查看 |
| 本周更早 | API 令牌「ci-deploy」7 天后过期 · 续期<br>Nexus 计划维护 9 月 28 日 02:00–03:00（UTC+8），期间插件市场只读 · 查看<br>Nightly 2.4.0-beta.2 · macOS 构建通过<br>touch-clipboard 1.8.0 已自动更新<br>剪贴板同步：2 条记录冲突 · 处理<br>Mara Okafor 请你审阅 PR #1043「剪贴板：时间线分组」· 查看 |
| 已延后 | 「设置备份提醒」（至明天 09:00）<br>「每周依赖更新报告」（至今晚 20:00） |

- 自动到达的 3 条见上。
- 人物沿用 CMS / Inbox 的 5 位；Tuff 系统来源用 `/logo.svg` 或 TxIconChip 字形。

#### 需要手写的 CSS

- 头部 flex；吸顶分组头；未读行加粗、左侧点；结果行。
- 批量栏；宽档双栏 grid；设置面板的分组。
- `TxToastPanel` 的绝对定位包装层。
- `--tx-card-item-hover-bg` 覆写；减弱动效时去掉入场高亮。

#### 图标（已核对存在）

`i-carbon-notification`、`notification-off`、`notification-new`、`at`、`build-tool`、`security`、`locked`、`plug`、`information`、`renew`、`snooze`、`moon`、`checkmark`、`checkmark-outline`、`close`、`launch`、`view`、`settings`、`undo`、`trash-can`、`overflow-menu-horizontal`。`do-not-disturb`、`inbox`、`shield-check`、`bug` **不存在**。

#### 风险与退路

- TxModeChip 必须带可见文字，窄屏改用 `TxIconButton :pressed`。
- TxCollapse 标题整块是按钮。
- TxCardItem 暗色 hover。
- 两个 TxSelect 的面板 `eager`（可以传 `:eager="false"`）。
- TxPopover 里的 TxSelect 靠 anchor 链不误关，需要实测一次。
- 勿扰逻辑只是演示状态，不接系统通知 API。

---

### C. Files 文件管理（新章节）— `TemplateFilesDemo`

**设定**：Tuff 工作区文件，也就是本机同步文件夹：文档 / 截图 / 剪贴板导出 / 主题。另有「插件存储」分区，按插件分文件夹，每个插件 100 MB 上限、单文件 10 MB、最多 1,000 个文件（真实常量，见结论 6）。

- **插件存储保持扁平**：真实存储没有子目录，文件名只允许 `A-Za-z0-9._-`。
- **不出现套餐或升级入口**。「工作区」只显示已用量，不虚构上限。

#### 布局 — 栏内（≈782 × 580）

```
┌──────────────────────────────────────────────────────────────────────── 782 ─┐
│ [⋯] 工作区 › 截图 › 2026-09        [🔍 在此文件夹中搜索  ] [▦|☰]  [⤒ 上传]     │ 44  TxDropdownMenu(祖先) + TxBreadcrumb + TxSearchInput + TxFlatRadio + TxButton
│ ┌ 树 208 ─────────────────┐┌──────────────────────────────────────────────────┐ │                     ┊ 上传托盘 TxToastPanel（side="below"，live="off"）
│ │ ▾ 🗂 工作区              ││ 8 项                              排序：修改时间 ▾ │ │ 文件区头：计数 + TxDropdownMenu
│ │   ▸ 📁 文档          5   ││ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐      │ │
│ │   ▾ 📂 截图              ││ │ SVG  │ │ SVG  │ │ SVG  │ │ SVG  │ │ SVG  │      │ │ 网格：格子 ≥ 112px
│ │     ▸ 📁 2026-09   8  ◀  ││ │ 缩略图│ │      │ │      │ │      │ │      │      │ │ 图片 = SVG data URI 缩略图
│ │     ▸ 📁 2026-08   6     ││ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘      │ │ 其他 = TxIconChip 44 soft
│ │   ▸ 📁 剪贴板导出    3   ││ corebox-  corebox- clipboard settings launcher-   │ │ 文件名两行 + 大小
│ │   ▸ 📁 主题          2   ││ dark.png  light.png -timeline -ai.png  search.png │ │ ☐ 左上角 TxCornerOverlay + TxCheckbox
│ │ ▾ 🧩 插件存储            ││ 1.2 MB    1.1 MB    860 KB   740 KB   920 KB      │ │   （悬停 / 已选时出现）
│ │   ▸ touch-clipboard      ││ …                                                │ │
│ │   ▸ touch-translate      ││                                                  │ │
│ │ ─────────────────────── ││ ─ 已选 3 项 · 2.9 MB  [下载] [移动到…] [删除]  ✕ ─ │ │ 批量栏（有选中时替换底栏）
│ │ 插件存储 · 上限各 100 MB  ││                                                  │ │
│ │ clipboard ▰▰▰▰▰▰▱▱ 63.4  ││                                                  │ │ 3 条迷你 TxProgressBar
│ │ translate ▰▰▰▰▱▱▱▱ 41.0  ││                                                  │ │ 点击进入对应插件
│ │ scripts   ▱▱▱▱▱▱▱▱ 0.2   ││                                                  │ │
│ └─────────────────────────┘└──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────┘
从系统拖入文件：文件区出现覆盖层 TxFileUploader「松开以上传到「截图 / 2026-09」」
右键（或 Shift+F10 / ContextMenu 键）：同一个 manual 的 TxContextMenu，菜单按目标切换
空格 / 双击：TxModal 快速预览（图片 / Markdown / 文本；← → 切换）
列表视图：TxDataTable（选择 | 名称 | 大小 | 类型 | 修改时间 | ⋯）
```

#### 布局 — 展开（≈1440 × 900；预览栏从 `≥ 1200` 起出现）

```
┌──────────────────────────────────────────────────────────────────────────────────────────── 1440 ─┐
│ [⋯] 工作区 › 截图 › 2026-09     [🔍 搜索全部文件          ] [▦|☰]  [📁+ 新建文件夹]  [⤒ 上传]       │
│ ┌ 树 240 ─────────────┐┌──────────── 文件区 ───────────────────────┬─┬──── 预览 ≈ 36% ─────────────┐ │
│ │ （同上）             ││ 网格每行 6–7 个 / 列表多「类型」「来源」列   │║│ corebox-dark.png             │ │ TxSplitter（文件区 | 预览）
│ │                     ││                                           │ │ ┌──────────────────────────┐ │ │
│ │                     ││                                           │ │ │      大图（contain）       │ │ │
│ │                     ││                                           │ │ └──────────────────────────┘ │ │
│ │                     ││                                           │ │ 同文件夹图片 ■ ■ ■ ■ ■        │ │ TxImageGallery（自带灯箱）
│ │                     ││                                           │ │ PNG · 1440×900 · 1.2 MB       │ │
│ │                     ││                                           │ │ 修改于 2 小时前 · 来自 MacBook  │ │
│ │ 配额（3 条）          ││                                           │ │ [打开] [复制链接] [⋯]          │ │
│ └─────────────────────┘└───────────────────────────────────────────┴─┴──────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
960–1199：没有预览栏，空格 / 双击仍然用 TxModal 预览
插件文件夹：文件区头部多一条分段配额（63.4 / 100 MB · 单文件 ≤ 10 MB · 1,000 个文件以内）
```

#### 布局 — 窄屏（< 640）

```
┌───────────────────────────── ~536 ─┐
│ [←] … › 2026-09     [🔍] [▦☰] [⤒]   │ 返回上级 + 只显示末级面包屑（⋯ 菜单列出祖先）
│ 8 项                     排序 ▾      │
│ ┌──────┐ ┌──────┐ ┌──────┐          │ 网格每行 3 个；子文件夹以格子出现（隐藏树）
│ │      │ │      │ │      │          │
│ └──────┘ └──────┘ └──────┘          │
│ …                                   │
│ ▰▰▰▰▱ 插件存储 63.4 / 100 MB         │ 只在插件文件夹里显示的配额条
└─────────────────────────────────────┘
```

#### 组件分工

| 区域 | 组件 | 作用 |
|---|---|---|
| 路径 | `TxDropdownMenu`（祖先）+ `TxBreadcrumb :items separator-icon="i-carbon-chevron-right"` + `@click`（不传 href）；窄屏加 `TxIconButton` 返回 | 导航到上级 |
| 工具 | `TxSearchInput`；`TxFlatRadio size="sm"`（两个纯图标项，`aria-label` 网格 / 列表）；`TxButton` 上传（调 `uploaderRef.pick()`）/ 新建文件夹 | —— |
| 树 | `TxTree` + `#item`（展开按钮 `@click.stop`、`folder` / `folder-open`、13px 行、计数）；`v-model` = 当前文件夹；受控 `:expanded-keys` | 进入某个文件夹时，自动把它的祖先加入展开集合 |
| 网格 | 手写 `role="listbox" aria-multiselectable="true"`；格子 `div role="option"`，内含 `<img>`（SVG data URI，`draggable="false"`）或 `TxIconChip :size="44" variant="soft"`；`TxCornerOverlay`（右下 14px 类型角标、左上 `TxCheckbox`）；`TxTag`「新」 | 二维方向键、多选、重命名（`TxInput`） |
| 列表 | `TxDataTable selectable highlight-selected sticky-header table-layout="fixed" :sort :sort-on-client="false"`；单元格：`TxIconChip :size="14" label="PDF"`、名称、大小（右对齐、等宽数字）、相对时间、⋯ | 和网格共用同一个选择集；文件夹永远排在前面 |
| 右键 | 一个 `TxContextMenu trigger="manual" v-model`，外包一层元素；项：`TxContextMenuItem`（`#avatar` 放图标、`shortcut`）/ `Divider` / `Submenu`（排序 ▸、显示方式 ▸） | 文件：打开 / 快速预览（空格）/ 重命名（F2）/ 复制链接 / 移动到… / 下载 / 删除（⌫，danger）；空白处：新建文件夹 / 上传 / 排序 ▸ / 显示方式 ▸ |
| 拖入上传 | 覆盖层 `TxFileUploader :model-value="[]" multiple :max="20"`，文案本地化，`@add` | 显示条件：`dataTransfer.types` 包含 `Files` 且文件区 `dragenter`。`:deep` 隐藏内部列表和按钮，垫不透明底 |
| 上传托盘 | `TxToastPanel side="below" live="off"`（挂在上传按钮下）+ 每行 `TxCardItem` + `TxProgressBar`（`text-placement="top"`，失败时 `status="error"`）+ 视觉隐藏的 status | 分文件进度；插件文件夹里单个文件超过 10 MB → 失败「超过单文件 10 MB 上限」，并提供「改存到工作区」 |
| 配额 | `TxProgressBar`：侧栏 3 条迷你条；插件文件夹头部用 `:segments`（数据库 / 缓存 / 其他）+ 文字 | 真实常量；超过 90% 时旁边加 `TxStatusBadge warning`「接近上限」 |
| 预览 | 列内：`TxModal width="min(760px, calc(100vw - 48px))"`，内容根节点上 `@keydown` 处理 ←/→；宽档：`TxSplitter` b 窗格 | 图片 `<img>`（contain）；`.md` 用 `TxMarkdownView`（13px）；`.txt` / `.json` 用 `<pre>`（12px 等宽，JSON 格式化）；其他用 `TxEmptyState`「无法预览此类型」；宽档加「同文件夹图片」`TxImageGallery` |
| 空态 / 加载 | 空文件夹：内嵌 `TxFileUploader` 当空态；无结果：`TxSearchEmpty`（静态 icon）；切文件夹：`TxSkeleton` 方块，由 `useDeferredLoading` 驱动 | —— |
| 移动到… | `TxModal` + `TxTree`（单选），或 `TxTreeSelect`（要传本地化 placeholder） | 批量移动，可撤销 |

#### 交互

- **进入**：单击树或面包屑进入文件夹；双击 / Enter 打开文件夹，文件则打开预览。
- **选择**
  - 单击选中；⌘ / Ctrl 点击加选；Shift 点击连续选；⌘ / Ctrl+A 全选。只在焦点位于文件区时处理，并 `preventDefault`。
  - 选中后显示批量栏；Esc 清空选择，要 `preventDefault`，否则会同时收起展开浮层。
- **预览**：空格快速预览（再按空格或 Esc 关闭），预览里 ←/→ 切换上一个 / 下一个。
- **编辑**：F2 或菜单「重命名」，就地出现 `TxInput`：Enter 确认，Esc 取消；插件存储文件名按真实正则校验，不合法就地提示。删除（⌫ / 菜单）可撤销。「下载」只提示「宿主会下载 …（示例）」，不真的下载。
- **拖入上传**
  - 拖入 OS 文件 → 覆盖层 → 松开 → 托盘逐个显示进度（时长按文件大小换算，计时器链）→ 格子出现并打上「新」。
  - 图片生成 object URL 做缩略图；`.md` / `.txt` 不超过 256 KB 时用 `file.text()` 读出来做预览；其他文件只保留元数据。
- **防止页面跳走**：模板根节点 `dragover` / `drop` 在 `types.includes('Files')` 时 `preventDefault`，保证在模板任何位置松手都不会让浏览器打开文件。
- **（可选增强）拖动文件格到树上的文件夹 = 移动**：用自定义 MIME `application/x-tuff-file` 区分 OS 文件；树行在 `#item` 里接 dragover / drop。

#### 自动演示（`@enter` 开播）

- 托盘浮出，标题「正在从 MacBook 同步 2 个截图」，两行进度约 2.6s 走完。完成后 `menubar-dark.png` 和 `quick-actions.png` 出现在「截图 / 2026-09」并标「新」，托盘在 2.4s 后收起，悬停时不收。
- 读者交互不取消。
- 减弱动效：两个文件一开始就在并标「新」，托盘不出现。
- `resetDemo`：复位文件夹、视图、排序、选择、预览，清空托盘和计时器，**revoke 所有 object URL**；已 `entered` 时重播。
- `watch(locale, resetDemo)`。

#### Mock 数据

```ts
type NodeKind = 'folder' | 'image' | 'markdown' | 'text' | 'json' | 'pdf' | 'csv' | 'zip' | 'binary'
interface FileNode {
  id: string; parentId: string | null; kind: NodeKind
  name: string // real file name, same in both locales
  label?: Bi // folders only: display name
  size: number // bytes; folders compute from children
  modifiedAt: number; source?: 'macbook' | 'windows' | 'plugin'
  art?: { motif: 'screen' | 'orbs', palette: string, seed: number } // SVG thumbnail
  preview?: Bi // markdown/text/json body
  isNew?: boolean
  objectUrl?: string // uploaded images; the template owns and revokes it
}
```

**工作区**

- 文档：`release-notes-2.4.md` 8.4 KB、`plugin-review-guidelines.md` 12.1 KB、`roadmap-2026-q4.md` 5.2 KB、`meeting-notes-0923.txt` 2.8 KB、`sdkapi-260713.json` 18.6 KB。
- 截图 / 2026-09：`corebox-dark.png` 1.2 MB、`corebox-light.png` 1.1 MB、`clipboard-timeline.png` 860 KB、`settings-ai.png` 740 KB、`launcher-search.png` 920 KB、`ocr-demo.png` 1.4 MB、`tray-menu.png` 310 KB、`notification-center.png` 680 KB。
- 截图 / 2026-08：6 张。
- 剪贴板导出：`clipboard-2026-09-22.json` 320 KB、`snippets.csv` 46 KB、`history-0915.zip` 2.3 MB。
- 主题：`corebox-midnight.zip` 540 KB、`aurora-dusk.png` 2.4 MB。
- 根目录：`README.md` 3.1 KB、`review-report.pdf` 2.1 MB。

**插件存储（扁平）**

- touch-clipboard，合计 63.4 MB：`history-0923.db` 9.6 MB、`history-0922.db` 9.4 MB、`thumbs-0923.pack` 8.1 MB …
- touch-translate，合计 41.0 MB：`dict-en-zh.bin` 9.8 MB、`dict-ja-zh.bin` 9.1 MB、`cache.json` 1.2 MB …
- touch-workspace-scripts，合计 0.2 MB：`scripts.json` 12 KB、`recent.json` 4 KB。

**其他约定**

- 文件夹显示名双语（zh「截图」/ en「Screenshots」）；文件名不翻译。
- 大小用 1024 进制，经 `Intl.NumberFormat`（最多 1 位小数）显示，与 `100 * 1024 * 1024` 常量一致。
- 缩略图：从 `TemplateGalleryDemo.vue` 复制 `random` / `stops` / `blur` / `drawCorebox` / `drawOrbs` 的子集，生成「窗口截图」和「壁纸」两种 motif，同一个 seed 永远得到同一张图。不外链，也不用本地 JPG（缩略图要多，SVG 更轻）。

#### 需要手写的 CSS

- 外层 grid（树固定 px | 文件区 | 宽档预览）。
- 格子网格 `repeat(auto-fill, minmax(112px, 1fr))`；格子的选中 ring 和焦点 ring。
- 覆盖层（`position:absolute; inset:0`、不透明底、虚线描边）。
- 批量栏、托盘包装层；树的 `#item` 行；配额块。
- `:deep` 覆盖：`.tx-file-uploader__drop` 撑满高度、隐藏其列表和按钮、TxSplitter 去边框、TxMarkdownView 改 13px。
- 键盘：二维方向键要知道每行几列，从 `getComputedStyle(grid).gridTemplateColumns` 读，或用宽度除以最小格宽算。

#### 图标（已核对存在）

`i-carbon-folder`、`folder-open`、`folder-add`、`folder-move-to`、`folder-shared`、`document`、`document-pdf`、`document-blank`、`document-view`、`image`、`txt`、`json`、`csv`、`zip`、`data-base`、`data-volume`、`plug`、`upload`、`cloud-upload`、`download`、`grid`、`list`、`search`、`sort-ascending`、`sort-descending`、`chevron-right`、`arrow-left`、`home`、`edit`、`copy`、`link`、`trash-can`、`view`、`close`、`warning-alt`、`checkmark-filled`、`tree-view`。`markdown`、`spreadsheet`、`rename`、`hard-drive`、`sync` **不存在**，分别用 `document`、`data-table`、`edit`、`data-volume`、`renew` 代替。

#### 风险与退路

- `TxTree #item` 首次在 Nexus 使用。
- TxContextMenu 关闭后不还焦点，暗色 hover 待实测。
- TxFileUploader 的英文单位和 aria；它作浮层时要不透明底。
- object URL 和 `file.text()` 的体积上限。
- 覆盖层显隐要自己计数 `dragenter` / `dragleave`：TxFileUploader 不往外报拖拽状态。
- 宽档预览栏只在 `≥ 1200` 出现，避免 960 时挤压。
- TxImageGallery 不能程序化打开，所以只做缩略条。

---

## Risks

按严重度排列。

**R1（高，看板）TxSortableList 不支持跨列，宿主补 DnD 需要实测**

- 依据：`TxSortableList.vue:172-177`（非本列表发起的拖拽不 `preventDefault`）、`:196-210`、`:225-237`；没有 `group` prop（`src/types.ts:18-33`）。
- 对策：模板 A 的代码骨架，在根节点 `dragend` 里改数组。拖拽 id 要在 `dragstart` 时自己记下来，因为 `dataTransfer.getData()` 在 `dragover` 期间是空的。
- 待实测：「在 `drop` 里改数组 → 源行卸载 → `dragend` 不触发，源列表状态残留」这一推断；以及 Safari / Firefox。
- 退路：菜单 + ←/→（不拖拽）。

**R2（高，看板）项内控件的 Enter / 空格被列表吞掉**

- 依据：`TxSortableList.vue:269-290`，没有 target 过滤。
- 对策：项内按钮加 `@keydown.enter.stop @keydown.space.stop`，点击加 `@click.stop`。打开详情走 ⋯ 菜单。

**R3（中高，Files / 通知 / 看板）菜单关闭后焦点落到 body**

- 依据：`TxContextMenu.vue:283`（`onAnchorClose(){}`）；TxDropdownMenu 也没有恢复焦点的代码（grep 结果为空）。
- 对策：`@close` 里 `focus({ preventScroll: true })` 回到触发的格子或按钮。只在读者操作之后执行，不违反自动演示期间不 focus 的规则。

**R4（中高）组件内部写死的英文 / 中文**

- 本批新增的写死文案：
  - `TxSortableList` 的 `aria-roledescription="Sortable item"`（`:338`）。
  - `TxTree` 的 `No results` / `Collapse` / `Expand` / `Select`。
  - `TxTreeSelect` 的 `Search` / `Clear`，以及**默认 placeholder 是中文「请选择」**。
  - `TxBreadcrumb` 的 `Breadcrumb`。
  - `TxFileUploader` 的 `Remove {name}` 和 B/KB/MB 单位。
  - `TxProgressBar` 回落的 `'Progress'`。
  - `TxModal` 的 `Close`，`TxDatePicker` 的星期表头。
- 可以传本地化值的 prop：`TxSortableList.labels` / `itemLabel`，`TxFileUploader` 的三段文案，`TxToastPanel.ariaLabel`，`TxCheckbox.ariaLabel`，`TxProgressBar.ariaLabel`，`TxImageGallery` 的 6 个 label。
- 处理：记入审阅说明，本任务不改组件（PRD Constraints）。

**R5（中）暗色**

- `TxSortableList` 项的背景是透明的 `--tx-fill-color-blank`，要在 `:deep` 里铺不透明表面。
- `TxCardItem` 和 `TxContextMenuItem` 的 hover 在暗色 overlay 上几乎看不见，要覆写 `--tx-card-item-hover-bg`（`TxCardItem.vue:156-172`）；teleport 出去的菜单项用 scoped class，不用 `:deep`。
- `TxFileUploader` 浮层半透明，要垫底；它的按钮是白字配实心主色，要隐藏。
- `TxMarkdownView` 的 `.dark` 泄漏修复在工作树里、未提交（`TuffexDocsHeroBackground.vue:195`）。暗色截图验收前先确认它已经提交。

**R6（中）减弱动效缺口**

- 没有处理的：TxModal（详情 / 预览）、TxFileUploader（160ms）、TxCardItem（0.18s）、TxTree（150ms）、TxBreadcrumb（0.2s）；TxProgressBar 的填充宽度 480ms 在减弱动效下仍在。
- 已处理的：TxSortableList、TxCollapse、TxToastPanel、TxModeChip、TxCheckbox、TxBaseAnchor 系列（菜单）。
- 模板对策：时间线直接落终态；自己加的高亮环 / 插入线 / 入场动画一律包在 `prefers-reduced-motion: no-preference` 里。

**R7（中）原生 DnD 的页面礼仪**

- 模板里任何位置松开 OS 文件都不能让 docs 页打开文件：根节点在 `types.includes('Files')` 时 `preventDefault`。
- 看板不接受 OS 文件（不 `preventDefault`），和页面其他位置行为一致。
- 触屏没有原生 DnD，窄档只走菜单。

**R8（中）真实数据约束与 Nexus 规则**

- 插件存储：单文件 10 MB、总量 100 MB、1,000 个文件、文件名正则、扁平（`plugin-business-file-storage.ts:20-23,95`）。
- 不出现升级、价格、购买入口；通知里不放账单 / 发票（Nexus AGENTS.md:30-35；第一批 Inbox 的「Pro 方案发票」本批不复用）。
- 快捷操作「批准」只能由读者点，自动演示不替读者批准。

**R9（中）图标名**

- `check:icon-collections` 只查集合，不查名字（`tuffex-docs-sync.md:127-129`）。
- 本调研已核对的缺失名：`kanban`、`markdown`、`spreadsheet`、`rename`、`hard-drive`、`sync`、`bug`、`inbox`、`shield-check`、`do-not-disturb`。
- 组件内部的类名（TxBreadcrumb 分隔符、TxFileUploader 的 `i-carbon-close`）要在模板 `.vue` 里出现一次字面量。

**R10（中）object URL 与文件读取**

- 上传的图片由模板自己 `createObjectURL`，在删除、重置、卸载时 `revokeObjectURL`（TxFileUploader 本身不生成 URL）。
- `file.text()` 只读小于 256 KB 的 `.md` / `.txt` / `.json`，大文件只显示元数据。

**R11（低）并行改动**

- `TxFlipOverlay` 的 teleport、`TxEmptyState` 插画、`TxStatusBadge` 字形、`TxMarkdownEditor` 的 safelist 都还未提交。本批不依赖 FlipOverlay 和 MarkdownEditor。
- 实现前重新 `git status`：共享的 `demo-registry.ts`、两个章节 `.mdc`、TAXONOMY、SECTION_ORDER 都只做插入式改动。

**R12（低）组件自身限制**

- TxContextMenu 是 fragment 根，`class` 落不上去；打开后页面滚动时菜单不跟随内容。
- TxCollapse 的标题是按钮，外框 `overflow:hidden`。
- TxDataTable 的 `rowClick` 不带事件对象。
- TxBreadcrumb 不换行、不省略。
- TxTree 没有懒加载。
- TxTreeSelect 的节点没有图标。
- TxImageGallery 不能程序化打开。
- TxSelect 默认宽 240 且 `eager`。

---

## 附：关键文件

| 路径 | 说明 |
|---|---|
| `packages/tuffex/packages/components/src/sortable-list/src/TxSortableList.vue:56-69,136-141,158-237,269-318,321-378,382-479` | 预览状态、`focusItem`、拖拽处理、键盘、模板、样式与减弱动效 |
| `packages/tuffex/packages/components/src/sortable-list/src/types.ts:18-38` | Props / Emits |
| `apps/nexus/content/docs/dev/components/sortable-list.zh.mdc:76-96` | 交互契约与键盘 |
| `packages/tuffex/packages/components/src/context-menu/src/TxContextMenu.vue:9-39,84-90,116-186,246-315,318-394` | 默认值、虚拟参考、打开 / 键盘、外部点击、expose、fragment 模板 |
| `packages/tuffex/packages/components/src/context-menu/src/{TxContextMenuItem,TxContextMenuPanel,TxContextMenuSubmenu}.vue` | 项基于 TxCardItem，面板的键盘导航，子菜单 |
| `packages/tuffex/packages/components/src/base-anchor/src/TxBaseAnchor.vue:192,721-728,811-829,914,993-994,1027-1037,1243-1251` | absolute 定位、减弱动效、外部点击链、z-index、document 监听、Teleport、虚拟参考样式 |
| `packages/tuffex/packages/utils/anchor-delay.ts:548-554` | 嵌套浮层的父子链（provide/inject） |
| `packages/tuffex/packages/components/src/tree/src/TxTree.vue:21-34,59-101,118-150,284-339,346-419` | Props、选择、展开、键盘、`#item` 插槽 |
| `packages/tuffex/packages/components/src/tree-select/src/TxTreeSelect.vue:13-26,133-260` | 默认值（中文 placeholder）、模板 |
| `packages/tuffex/packages/components/src/breadcrumb/src/TxBreadcrumb.vue:11-75` | Props、点击语义、模板 |
| `packages/tuffex/packages/components/src/file-uploader/src/TxFileUploader.vue:7-17,31-41,86-167,170-223,243-288` | 默认值、单位、接收文件、拖放、模板、样式 |
| `packages/tuffex/packages/components/src/progress-bar/src/{types.ts,TxProgressBar.vue:271-287,310,362,685,1070-1093}` | segments、complete、aria 回落、宽度过渡、减弱动效 |
| `packages/tuffex/packages/components/src/toast-panel/src/{types.ts:22-79,TxToastPanel.vue:25-33}` | Props |
| `packages/tuffex/packages/components/src/card-item/src/{types.ts:3-36,TxCardItem.vue:32-50,156-172}` | Props、键盘、hover 变量 |
| `packages/tuffex/packages/components/src/collapse/src/{TxCollapse.vue:106-113,TxCollapseItem.vue}` | 外框、按钮标题、v-show、减弱动效 |
| `packages/tuffex/packages/components/src/icon-chip/src/{types.ts,TxIconChip.vue}` | 色调、soft 变体 |
| `packages/tuffex/packages/components/src/mode-chip/src/{types.ts,TxModeChip.vue:152-157}` | 形变芯片 |
| `packages/tuffex/packages/components/src/corner-overlay/src/TxCornerOverlay.vue:10-73` | 角标 |
| `packages/tuffex/packages/components/src/picker/src/TxPicker.vue:15,627,650,684` | 滚轮劫持、弹层 |
| `apps/core-app/src/main/modules/plugin/host/plugin-business-file-storage.ts:20-23,95` | 10 MB / 100 MB / 1,000 个文件、文件名正则、扁平 |
| `apps/nexus/AGENTS.md:30-35` | 禁止 mock checkout 和假价格 |
| `apps/nexus/app/components/content/demos/TemplateFrame.vue` | 舞台（Teleport 展开、z-index 1900、Esc 矩阵） |
| `apps/nexus/app/components/content/demos/TemplateCmsDemo.vue:78-91,701-717,930-970,974-994,1444-1457,1797-1815,1991-2002,2226-2232` | StageSize、mode、toast 撤销、双击判定、toast 包装、表格 flex、容器查询顺序 |
| `apps/nexus/app/components/content/demos/TemplateInboxDemo.vue:952-1007,1259-1352,1538-1568,2159-2170` | 根节点键盘、到达时间线 / 重置、到达提示、toast 定位 |
| `apps/nexus/app/components/content/demos/TemplateShellDemo.vue:596-631,720,1134-1142,1814-1816` | 自动演示停止、面包屑点击与窄屏折叠 |
| `apps/nexus/app/components/content/demos/TemplateGalleryDemo.vue:97-177,251-290,373-393,932,1392-1393` | SVG 生成器、Modal 内的 ←/→ |
| `apps/nexus/app/components/content/demos/{SortableListSortableListDemo,ContextMenuContextMenuDemo,ContextMenuContextMenuSubmenuDemo,TreeTreeDemo,ComponentsPermissionOrchestrationDemo,FileUploaderFileUploaderDemo,ProgressBarUploadDemo,ProgressBarSegmentsDemo,ToastPanelToastPanelDemo,CardItemCardItemDemo,CollapseBasicDemo,IconChipIconChipDemo,ModeChipModeChipDemo,CornerOverlayBasicDemo,FlatRadioIconDemo}.vue` | 可借鉴的 demo |
| `.trellis/spec/frontend/nexus-docs-templates.md`、`.trellis/spec/frontend/tuffex-design-rules.md`、`.trellis/spec/frontend/tuffex-docs-sync.md:94,127-129` | 模板契约、设计规则、图标规则 |
