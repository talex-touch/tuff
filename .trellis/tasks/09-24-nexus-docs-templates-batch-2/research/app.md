# Research: 第二批 · 应用框架分组（Shell 第二风格「顶栏控制台」+ 新章节 Onboarding 登录引导）

- **Query**：为 `09-24-nexus-docs-templates-batch-2` 的两个应用框架模板调研真实 tuffex 组件（第一批 `app-shells.md` 未覆盖的部分），给出三档布局、组件分工、交互、脚本演示、双语 mock 数据与风险。
- **Scope**：internal。tuffex 源码与文档页、Nexus 已有 demo 与第一批模板、core-app 与 Nexus 的真实引导 / 登录文案；未做外部检索。
- **Date**：2026-09-24
- **基线**
  - 源码读于 2026-09-24。并行会话在工作树里有**未提交**的 tuffex 改动：TxGlowText、TxGradientBorder、TxKeyframeStrokeText、TxEmptyState、TxStatusBadge（另有 TxStatCard、TxFlipOverlay、TxLayoutSkeleton、TxMarkdownEditor）。本文记录的是工作树版本。
  - `packages/tuffex/dist` 构建于 09-24 07:31，晚于前三者的源码修改（09-23 22:42–23:14），所以 dev（读 dist）看到的就是本文描述的行为。TxEmptyState 源码在 07:44 又改过一次（错误插画），它的减弱动效规则已经在 `dist/es/empty-state/style.css` 里。
- 路径前缀：除注明外，组件路径相对 `packages/tuffex/packages/components/src/`，demo 路径相对 `apps/nexus/app/components/content/demos/`。

---

## 结论速览

1. **下拉菜单最宽 360px。** `TxDropdownMenu` 在模板里写死了 `:width="0"` 和 `:max-width="360"`（`dropdown-menu/src/TxDropdownMenu.vue:148-150`），`minWidth` 超过 360 也会被夹回。
   - 多栏的 mega 面板只能用 `TxPopover` 加显式 `width`：显式宽度不受 360 限制（`base-anchor/src/TxBaseAnchor.vue:163-166`）。
   - 代价是面板被 teleport 到 body 末尾，不在 Tab 顺序里，焦点进出要宿主自己管。
   - 推荐做法：产品切换用 TxDropdownMenu（面板内 2 列格子，键盘现成可用）；真正的宽 mega 面板只作为可选项。
2. **入场特效是挂载即播的。** 以下组件都用 CSS 动画在挂载时播放一次：`TxTuffLogoStroke mode="once"`、`TxKeyframeStrokeText`、`TxGlowText :repeat="false"`。
   - docs 包装器会在 demo 滚入前 240px 就挂载它，读者到场时动画已经播完。
   - 解决办法：在 `@enter` 里用 v-if 挂载或换 key；重播也靠换 key。
3. **TxBorderBeam 的旋转家族没有减弱动效兜底。** `sm` / `md` / `line` 会一直转（CSS 只在两个 pulse 生成器里写了 reduced-motion，`border-beam/src/styles.ts:1677,1863`）。
   - `theme` 默认是 `'dark'`，`'auto'` 读的是**系统**配色，不是 docs 的 `.dark` 类。
   - 模板要用 `useColorMode()` 传主题，并在减弱动效下 `:active="false"`。
4. **Nexus 真实登录没有密码框。** 真实方式是 Passkey / GitHub / LinuxDO / Magic Link（`apps/nexus/app/pages/sign-in/components/SignInEmailStep.vue:43-85`，`app/composables/useSignIn.ts:22-25,929-947`）。
   - 模板照这个做，同时避开两个问题：浏览器在"密码框提交后从 DOM 消失"时可能弹出「保存密码」；`TxSensitiveInput` 在输入时是明文显示的。
5. **core-app 已有完整的真实引导文案**，模板可以直接取材：`beginner.*` 与 `setupPermissions.*`（`apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`）。
   - 包括：欢迎、登录 / 离线继续、引导模式 / 自助探索、文件访问（必需）/ 辅助功能 / 完全磁盘 / 麦克风 / 通知、隐私说明、「按下 ⌘ + E 可快速唤起 Tuff」。
   - 屏幕录制权限的文案在截图相关键下（`en-US.json:5344-5372`）。
6. **TxNavBar 是移动端顶栏**，适合顶栏控制台的窄档。
   - 左右两个插槽都被包在 `<button>` 里，插槽里不能再放按钮或菜单。
   - 只放图标时按钮没有可访问名（有插槽就不再给 aria-label）。
7. **TxCornerOverlay 可以做角标**，替代第一批手写的铃铛计数定位。
8. **TxSteps 没有任何 emit。** 点击只改它的内部状态；要做"点已完成的步骤回退"，由宿主挂原生 `@click` 并自行判断。
9. **新增的"无减弱动效"缺口**（需要在模板层绕开）：
   - `TxBlockSwitch` 的 loading 闪光（另外它的开关读屏名是英文 `Toggle`）
   - `TxIconMorph`：默认 `reducedMotion='never'`
   - `TxBorderBeam` 的旋转家族（见第 3 条）
10. **第一批 R7「TxEmptyState 插画无减弱动效」已过时**：工作树与 dist 都已补上（`empty-state/src/TxEmptyState.vue:964-1000`）。

---

## Reused from batch 1

### 直接复用，不再调研

| 组件 | 第一批出处 | 本批用法 / 自第一批以来的变化 |
|---|---|---|
| TxBreadcrumb | `app-shells.md` §TxBreadcrumb | 控制台页头。项不带 `href`，带了会让 docs 页跳走。源码无变化 |
| TxCommandPalette | `app-shells.md` | 顶栏搜索，⌘K 绑在模板根上。列内打开时在站点页头之下，design §6.1 已接受这一取舍 |
| TxSearchInput | `app-shells.md` | 项目页筛选 |
| TxKbd | `app-shells.md` | ⌘K 键帽、快捷键录制、完成页大键帽。`md` 高 26px 是上限，放大靠宿主 CSS（见 Onboarding 风险） |
| TxAvatar / TxAvatarGroup | `app-shells.md`、`content.md` | 在线头像。`overflowPopover` 的 `+N` 是不可聚焦的 TxAvatar，默认只能 hover 打开（`avatar/src/TxAvatarGroup.vue:104-150`） |
| TxBadge | `app-shells.md` | 未读数、tab 计数；定位改用 TxCornerOverlay |
| TxStatusBadge | `app-shells.md`、`data-flow.md` | 项目与权限状态。warning 图标是时钟（design §6.11）；工作树里图标盒尺寸修正尚未提交 |
| TxToastPanel | `app-shells.md` | 受控反馈；props 没变（`toast-panel/src/types.ts`） |
| TxDropdownMenu / Item / Submenu | `app-shells.md`、`content.md` | 工作区、产品、通知、账户菜单。本文补充 360px 上限和子菜单键盘细节 |
| TxButton / TxIconButton / TxSplitButton | `app-shells.md`、`content.md` | 「新建项目」用 SplitButton，必须传 carbon 的 `menu-icon`（默认是未安装的 `ri`） |
| TxTooltip / TxIconChip / TxTag | `app-shells.md` | 图标按钮提示、项目图标、「必需 / 可选」标签 |
| TxGlassSurface | `app-shells.md` | 完成页和宽档预览里的 CoreBox 窗体 |
| TxFilterChips | `app-shells.md`、`content.md` | 项目类型筛选；`role="tablist"` 时选择跟随焦点 |
| TxTabs 家族 | `app-shells.md` | 顶栏第二行导航。本文补充 top 放置的细节 |
| TxSwitch / TxSelect / TxFlatRadio / TxRadioGroup / TxCheckbox | `app-shells.md` | 偏好与权限控件。TxFlatRadioItem 有 `#icon` 插槽，可以放色板 |
| TxInput / TxSensitiveInput | `app-shells.md` | 本文补充两者的语义差异（密码 vs 密钥） |
| TxImageUploader | `app-shells.md` + design §6.11 | 工作区图标，可选。照 Settings 模板自己持有 object URL |
| TxAlert / TxModal | `app-shells.md` | 注意 TxAlert 的 `role="alert"` 在每次挂载时都会播报 |
| TxSparkChart / TxStatCard / TxTimeline | `app-shells.md` | 宽档「本周构建」、项目详情 KPI。第二风格不再用时间线，避免和侧栏风格同质 |
| TxEmptyState | `app-shells.md` | 禁用 tab 或空分区。减弱动效已补（见结论第 10 条），仍建议用 `#icon` 插槽放静态图标 |
| TxDrawer | `content.md` §TxDrawer | 窄档导航抽屉。动效不理会减弱动效（design §6.11）；`mobileAdapt` 看的是视口宽度 |
| TxTagInput | `content.md` | 邀请成员邮箱。没有逐项校验钩子，宿主在 `update:modelValue` 里过滤；移除按钮的 aria 文案是英文 |
| TxTextMorph | `app-shells.md` | 在线人数滚动；默认 `respectReducedMotion: true`（`text-morph/src/engine/types.ts:52`） |
| TxDotIndicator | `data-flow.md` | 通知未读点 |
| TxStagger | `content.md` | 不推荐：无减弱动效 |

### 第一批模板里可以照搬的写法

- **自动演示骨架**，`TemplateShellDemo.vue`：
  - `schedule` / `clearAutoplay`：`:480-504`
  - `play` / `applyFinalState` / `onEnter` / `resetDemo`：`:594-651`
  - ⌘K 绑在根元素上：`:653-661`
  - `watch(locale, resetDemo)` 与卸载清理：`:663-671`
- **托盘**：关闭时加 `inert`，TxToastPanel 带牵引线（`TemplateShellDemo.vue:769-789, 1250-1274`）。
- **头像取色**：`AVATAR_TINTS` 用同色相的浅底配深色字（`TemplateShellDemo.vue:428-437`）。
- **快捷键录制**，`TemplateSettingsDemo.vue:405-443`：
  - 监听挂在聚焦的「录制」按钮上。
  - 录制期间所有键都 `preventDefault`，Esc 取消录制，因此不会连带收起展开浮层。
  - 必须带 ⌘ / ⌃ / ⌥ 才接受。
- **自管头像 URL**：TxImageUploader 在卸载时会回收自己的 object URL（`TemplateSettingsDemo.vue:445-475`）。
- **预览窗强制暗 / 亮**：给子树加 `.dark`，并用 `.is-light` 反转（`TemplateSettingsDemo.vue:917-924, 1263-1290`）。
- **TxTabHeader 不透明底**：`--fake-color` / `--fake-opacity`（`TemplateSettingsDemo.vue:1034-1037`）。
- **壁纸加玻璃窗**：
  - 令牌渐变壁纸，暗色下降饱和度：`TemplateLauncherDemo.vue:770-800`。
  - `TxGlassSurface width="100%" height="100%"`：`TemplateLauncherDemo.vue:626`。
- **常开列表**：用 `data-template-esc="self"` 标记（`TemplateLauncherDemo.vue:630`）。

---

## New component cheat sheets

### A. 顶栏控制台相关

#### TxNavBar（`nav-bar`）

- **导出**：`TxNavBar`，类型 `NavBarProps` / `NavBarEmits`（`nav-bar/index.ts`）。
- **Props**（`nav-bar/src/types.ts`；默认值 `TxNavBar.vue:7-17`）：
  - `title=''`
  - `fixed=false`：sticky，top 0
  - `safeAreaTop=true`：渲染 `env(safe-area-inset-top)` 占位，桌面端为 0
  - `showBack=false`、`disabled=false`、`zIndex=2000`
  - `backLabel='Back'`、`leftLabel='Navigation left action'`、`rightLabel='Navigation right action'`：都是英文默认值
- **Events**：
  - `back`：只由内置返回按钮发出
  - `click-left`
  - `click-right`：没有 `right` 插槽时右侧按钮是 disabled 的
- **Slots**：`left`、`title`、`right`。无 expose。
- **结构**：`<header>` 里是一个 44px 高的三列 grid，列宽 `minmax(56px,1fr) minmax(0,2fr) minmax(56px,1fr)`。
  - **左右两侧都是 `<button>` 包着插槽**（`:77`、`:103`），插槽里不能放按钮或菜单，否则是嵌套交互元素。
  - 只有 `title` 插槽是普通 div，可以放 TxDropdownMenu 这类组件。
- **可访问名**：只要提供了 `left` / `right` 插槽，组件就不再给 aria-label，由插槽内容命名。只放图标会得到一个无名按钮，插槽里要带 sr-only 文字。
- **层级与外观**：
  - 根节点 `position: relative; z-index: var(--tx-nav-bar-z-index, 2000)`（`:128-129`），在模板内会压住同层兄弟元素。
  - 背景是 `--tx-bg-color-overlay` 的 70% 加 `backdrop-filter: blur(18px)`，底部 1px 分隔线。亮 / 暗两种主题都成立。
- **动效**：无。内置返回图标用 `i-carbon-arrow-left`（Nexus 中已有引用）。
- **借鉴**：`NavBarNavBarDemo.vue`；`nav-bar.zh.mdc` 的「自定义左侧与标题」一节。

#### TxCard（`card`）

- **导出**：`TxCard`，类型 `TxCardProps` / `TxCardBackground` 等（`card/index.ts`）。
- **Props**（`card/src/types.ts`；默认值 `TxCard.vue:9-40`）：
  - `variant='solid'|'dashed'|'plain'`
  - `background='pure'|'mask'|'blur'|'glass'|'refraction'`，默认 `pure`
  - `shadow='none'|'soft'|'medium'`
  - `size`：决定 padding，small / medium / large 分别为 10 / 12 / 16
  - `radius=18`、`padding`
  - `clickable`、`loading`（TxSpinner 遮罩）、`disabled`
  - `inertial`：指针跟随，走 rAF
  - 一组 glass / refraction 参数
- **Event**：`click(ev)`，只在 clickable 且未 disabled 时发出。Enter / Space 也会触发，但只在卡片自身是事件目标时（`:441-452`）。
- **Slots**：`cover`、`header`、默认、`footer`。无 expose。
- **尺寸**：`width: 100%`，flex column；solid / dashed 有 1px 边框。
- **坑**
  - **根节点常驻 `transform: translate3d(...)` 和 `will-change: transform`**（`:543-545`）。每张卡都是一个层叠上下文，也是 fixed 后代的包含块。
  - `clickable` 时根节点是 `role=button tabindex=0`（`:477`）。卡里不要再放按钮或链接；需要卡内操作时就别设 clickable，改让标题成为真正的按钮。
  - `pure` 的底色是 `--tx-surface-color`，回退到 `--tx-fill-color-lighter`（亮色 #fafafa、暗色 #1d1d1d，`base-surface/src/style/index.scss:7-9`）。
    - 要白卡，就在卡上设 `--tx-surface-color: var(--tx-bg-color)`。
    - 这样可行，因为 TxBaseSurface 只在传了 `color` 时才写这个变量（`TxBaseSurface.vue:557-559`）。
  - 悬停时边框变主色；clickable 按下时 `scale: 0.985`；transition 有减弱动效兜底（`:615`）。
  - soft / medium 阴影遵循 1:2 光源。
- **借鉴**：`CardHeaderFooterActionsDemo.vue`、`CardStatesDemo.vue`、`BorderBeamShowcaseDemo.vue`（TxCard 放进 BorderBeam）。

#### TxCardItem（`card-item`）

- **Props**（`card-item/src/types.ts`；默认值 `TxCardItem.vue:9-27`）：
  - 文本：`role?`、`title`、`subtitle`、`description`
  - 左侧头像块：`iconClass`、`avatarText`、`avatarUrl`、`avatarSize=36`、`avatarShape='circle'|'rounded'`
  - 状态：`clickable`、`active`、`disabled`、`tabindex?`
  - `align='start'|'center'`
- **Event**：`click`，需要 clickable；Enter / Space 只在行本身是事件目标时触发。
- **Slots**：`avatar`、`title`、`subtitle`、`right`、`description`。
- **版式**：
  - 标题 13px / 600，单行省略；副标题 12px，单行省略；描述 12px，可换行。
  - **`right` 插槽在标题那一行的右侧**，不是整行垂直居中。
- **状态色**：hover / active 分别读 `--tx-card-item-hover-bg` / `--tx-card-item-active-bg`，暗色的半透明面板上可以重新指向。transition 只有颜色，无减弱动效（可接受）。
- **与菜单的关系**：它是 `TxDropdownItem` 的底座，后者用 `role=menuitem` 加 `align=center`。
- **借鉴**：`CardItemCardItemDemo.vue`。

#### TxDropdownMenu 宽度上限与 TxDropdownSubmenu（补充 `app-shells.md`）

- **宽度上限**：
  - 模板写死了 `:width="0"`、`:max-width="360"`（`TxDropdownMenu.vue:148-150`）。
  - 面板宽度 = max(触发器宽, `minWidth`)，再被 360px 夹住（`TxBaseAnchor.vue:156-166`）。
- **面板内网格可用**：把菜单项包在一个 2 列 grid 的 div 里仍然可以用方向键。
  - 原因：方向键用 `querySelectorAll('[role=menuitem]')` 找项，再用 `closest('[role=menu]') === panel` 过滤（`:61-67`），中间多一层 div 不影响。
  - ↑↓ 按 DOM 顺序线性移动。
- **首项聚焦**：`initialFocus='first-item'` 在 nextTick 聚焦首项。但 Chromium 在面板 `visibility: hidden` 期间会拒绝 focus，spec 把它列为「未在真实浏览器验证」（`anchor-overlay-chain.md`「Panels that host a text field」）。
- **TxDropdownSubmenu**（`dropdown-menu/src/TxDropdownSubmenu.vue`）：
  - 内部是 TxPopover：`trigger=hover`、`placement=right-start`、`offset=4`、`minWidth=160`、`max-width=360`（`:117`）、无箭头。
  - 键盘：
    - → / Enter / Space：打开并聚焦子菜单首项（`:49-69`）
    - ←：关闭并回到父行（`:71-77`）
    - ↑ / ↓ / Home / End：在子菜单内移动
  - 选中子项时借根菜单的 context 关闭整条链。
  - 行尾自动加内置 `chevron-down` 并旋转 -90°，不依赖 Uno 图标。
  - 插槽：`default` 是行标签，`right` 放行尾当前值，`menu` 放子项。
- **借鉴**：`DropdownMenuDropdownSubmenuDemo.vue`（嵌套两层，`#right` 显示当前格式）、`DropdownMenuDropdownMenuNavDemo.vue`。

#### TxPopover 用作宽面板（补充 `content.md`）

- **Props**（`popover/src/types.ts`；默认值 `TxPopover.vue:12-40`）：
  - 开合与触发：`modelValue?`、`trigger='click'|'hover'|'manual'`、`eager`、`virtualReference?`
  - 定位：`placement='bottom-start'`、`showArrow=true`、`arrowSize=12`
  - 尺寸：`width=0`、`minWidth=0`、`maxWidth=360`、`maxHeight=420`
  - `matchReferenceWidth?`：未设且 `width ≤ 0` 时匹配触发器宽
  - `keepAliveContent=true`
  - 面板：`panelBackground='refraction'`、`panelPadding=10`、`panelRadius=18`
  - 关闭：`closeOnClickOutside=true`、`closeOnEsc=true`
- **显式 `width` 不受 360 限制**（`TxBaseAnchor.vue:163-166`），所以多栏 mega 面板只能用它。
- **Events / Slots / Expose**：`update:modelValue` / `open` / `close`；插槽 `reference` 与默认 `{ side }`；expose `updatePosition`。
- **语义**：
  - 触发器包装层带 `aria-haspopup="dialog"` 和 `aria-expanded`（`:165`），TemplateFrame 的 Esc 规则能识别它。
  - 面板是 `role=dialog`。
  - hover 触发时 focusin 也会打开（`tooltip/src/TxTooltip.vue:122-128`）。
- **键盘缺口**：
  - 面板 teleport 到 body 末尾，不在 Tab 顺序里；组件既不把焦点移进面板，也不在关闭时还焦。
  - 宿主要自己补（约 20–30 行）：
    - 用户打开时，按 spec 的 rAF 重试把焦点移进面板。
    - 在面板里按 Tab 或 Esc 时关闭，并把焦点还给触发器。
- **层级**：属于 `menu` 层，打开时会顶掉其他 menu 和 hint（`packages/tuffex/packages/utils/anchor-delay.ts` 的 `preempts.menu`）。这个服务是全页共享的。

#### TxFlatDropdown（`flat-dropdown`）— 评估后不推荐做 mega 面板

- **Props**（`flat-dropdown/src/types.ts`；默认值 `TxFlatDropdown.vue:10-27`）：
  - 触发与时序：`trigger='hover'`、`openDelay=0`、`closeDelay=600`、`exitDuration=280`
  - 定位：`placement`、`offset=10`、`teleport='body'`
  - 尺寸：`matchTriggerWidth`、`width`（数字或字符串，没有 360 上限）
  - 关闭：`closeOnClickOutside`、`closeOnEsc`、`closeOnContentClick`
  - `panelClass`
- **插槽**：`trigger { open, toggle, show, hide }`、默认 `{ open, close, side }`。
- **不推荐的原因**：
  - 面板**没有任何底色和边框**，只有 z-index 与 will-change（`:328-331`），外观全靠宿主。
  - 触发器是包装 div，不是按钮。
  - Esc 挂在 document 上，且不 `preventDefault`（`:237-251`）。
  - 面板同样不在 Tab 顺序里。
  - 离场动画是 280ms 缩放加模糊；减弱动效下降到 1ms。

#### TxCornerOverlay（`corner-overlay`）

- **Props**（`corner-overlay/src/types.ts`）：
  - `placement='bottom-right'`：四个角可选
  - `offsetX=0`、`offsetY=0`：数字转 px，可以为负
  - `overlayPointerEvents='none'|'auto'`
- **Slots**：默认插槽放基础内容，`overlay` 放角标。
- **结构**：根是 relative 的 inline-block `span`；角标绝对定位。装饰态（`none`）下角标带 `aria-hidden="true"`（`TxCornerOverlay.vue:62-66`）。
- **用途**：铃铛未读数（替代第一批手写的 `.shell__bell-count`，`TemplateShellDemo.vue:1181-1194`）、菜单按钮上的未读点。
  - 因为角标对读屏隐藏，计数要同时写进按钮的 aria-label。
- **借鉴**：`CornerOverlayBasicDemo.vue`。

#### TxTabs 顶部放置（补充 `app-shells.md`）

- **布局**：`placement="top"` 时导航横排；`nav-inner` 设 `overflow-x: auto` 并隐藏滚动条，窄屏可以横滑；指示器高 3px（`tabs/src/TxTabs.vue:1227-1275`）。
- **宽度参数**：`navMinWidth` / `navMaxWidth` 只作用于左右放置（`:800-806`）。
- **`nav-right` 插槽**：渲染在导航行右侧的 `.tx-tabs__nav-extra`（`:834-836`），适合放在线头像和主操作。
- **边框**：顶部放置时导航自带 `border-bottom: 1px`，`borderless` 去不掉（`TemplateSettingsDemo.vue:1414-1419` 的注释）。
- **键盘**：←/→/Home/End 直接切换，自动激活（`:525-560`）。
- **其余与 `app-shells.md` 相同**：
  - `name` 同时是标签，本地化文案放 `#name` 插槽。
  - 只渲染当前面板。
  - 无减弱动效。
  - 根节点 `overflow: hidden`（`:893-903`）。
  - 父级必须给高度。

#### TxModeChip（`mode-chip`）— 可选

- **Props**：`label`（必填）、`icon`、`tone`（StatusTone，默认 `muted`）、`disabled`。
- **外观**：根是 28px 高的 `<button>`。label / icon / tone 变化时图标先换，文字随后模糊交叉淡入（TxTextTransformer），有减弱动效兜底。
- **用途**：顶栏的「环境 / 区域」chip，例如「生产 ↔ 预发」。
- **坑**：它是新组件。在 dev server 启动之后才新增的组件拿不到依赖的样式（text-transformer / text-morph / liquid），表现为两层文字并排。遇到时需要重启 :3200（`tuffex-docs-sync.md:111-115`）。

### B. Onboarding 相关

#### TxBorderBeam（`border-beam`）

- **导出**：`TxBorderBeam`，另有 `borderBeamSizePresets` / `borderBeamSizeThemePresets` 和各类型（`border-beam/index.ts`）。移植自上游 border-beam（MIT）。
- **Props**（`border-beam/src/types.ts`；默认值 `TxBorderBeam.vue:26-38`）：
  - `size='md'`：`sm` / `md` / `line` 是旋转家族，`pulse-inner` / `pulse-outside` 是呼吸家族
  - `colorVariant='colorful'|'mono'|'ocean'|'sunset'`
  - `theme='dark'`
  - `staticColors=false`
  - `duration`：旋转 1.96s、line 3.1s、呼吸 2.3s
  - `active=true`
  - `borderRadius?`：不传就读第一个子元素的左上圆角
  - `brightness?`、`saturation?`、`hueRange=30`、`strength=1`
- **Events**：`activate`（淡入结束）、`deactivate`（淡出结束）。只有默认插槽，无 expose。
- **结构**：
  - 根节点是 div `[data-beam=<id>]`。
  - 每个实例注入一段 `<style>`，其中包含 `@property` 注册。
  - `::before` / `::after` 和 bloom 层都是 `pointer-events: none`。
- **尺寸**：
  - 根节点是**块级 div**，光束画在根自己的盒子上。包按钮时要让根 `width: fit-content`（或让按钮 `block`），否则光束会框住整行。
  - 旋转家族和 `pulse-inner` 的根节点都是 `overflow: hidden`（`styles.ts:1176-1180, 1406-1410, 1590-1594, 1987-1991`），会裁掉：
    - 子元素外扩的焦点环（TxButton 没有自己的 focus-visible 样式，用的是浏览器默认外描边）
    - 任何不 teleport 的弹出物
  - `pulse-outside` 是 `overflow: visible`，但要求不透明的子元素，周围也要留出空间。
- **主题**：
  - 默认 `'dark'`。
  - `'auto'` 读的是**系统** `prefers-color-scheme`（`:129-139`），不是 docs 页面的 `.dark` 类。
  - 做法照 `BorderBeamShowcaseDemo.vue:4-6`：用 `useColorMode()` 传入 `'dark' | 'light'`。
- **动效**：
  - 离屏时自动暂停：IntersectionObserver 的 rootMargin 为 256px，暂停时加 `data-paused`（`:143-157`）。
  - **只有 pulse 家族有减弱动效兜底**：JS 驱动见 `:237-249`，CSS 见 `styles.ts:1677, 1863`。`sm` / `md` / `line` 在减弱动效下照转不误。
  - pulse 家族在减弱动效下 fade-in 被 `animation: none` 取消，`--beam-opacity` 停在 0，等于完全不显示。
- **成本**：每个实例一套 style 和 `@property`。文档建议一个视图区块只保留一个（`border-beam.zh.mdc` 最佳实践）。
- **借鉴**：
  - `BorderBeamShowcaseDemo.vue`：md 包 TxCard，sm 包 TxButton，line 包 TxFlatInput。
  - `BorderBeamPulseDemo.vue`。

#### TxGradientBorder（`gradient-border`）

- **Props**：定义在 `gradient-border/index.ts`，默认值见 `TxGradientBorder.vue:10-16`。
  - `as='div'`
  - `borderWidth='2px'`、`borderRadius='12px'`、`padding='12px'`
  - `animationDuration=4`：单位秒
  - 无 events / expose，只有默认插槽。
- **结构**：
  - `.tx-gradient-border__ring`：aria-hidden，`filter: blur(borderWidth)`，用环形 mask 抠出圆环。
    - 渐变色写死为 `#0894ff → #c959dd → #ff2e54 → #ff9004`，亮 / 暗主题下一样亮。
  - `.tx-gradient-border__inner`：带 padding，同圆角，`overflow: hidden`（`:95-101`）。
- **坑**：
  - 内层 `overflow: hidden` 会裁掉子控件外扩的焦点环和阴影。
  - 内层没有底色，要自己放一层 surface；文档 demo 包了一层 `background: var(--tx-bg-color)`。
- **动效**：`@property --tx-gradient-angle` 驱动旋转；减弱动效下停在静态角度（`:111-115`）。
- **借鉴**：`GradientBorderGradientBorderDemo.vue`。

#### TxGlowText（`glow-text`）

- **Props**（`glow-text/src/types.ts`；默认值 `TxGlowText.vue:8-20`）：
  - `tag='span'`、`active=true`、`repeat=true`
  - 时序：`durationMs=2000`、`delayMs=0`
  - 光带：`angle=20`、`bandSize=38`、`color='rgba(255,255,255,.9)'`、`opacity=.75`
  - `blendMode?`、`backdrop?`
  - `mode='adaptive'|'classic'|'text-clip'`，默认 `adaptive`
  - `radius=10`
- **结构**：
  - 根节点 inline-block，`overflow: hidden; isolation: isolate`。
  - adaptive / classic：画一层扫光，用混合模式加 backdrop-filter，并遮罩到光带上。
  - text-clip：用 MutationObserver 读取插槽文字，镜像出一层 `background-clip: text` 的扫光文字（aria-hidden）。
- **坑**
  - adaptive 只会提亮（screen / plus-lighter）。浅色表面上用浅色光带，什么都看不到（`glow-text.zh.mdc` 交互契约）。
    - 浅色页面上的文字用 `text-clip`，并按主题给 `color`，例如 `var(--tx-color-primary)`。
    - `color` 走 CSS 变量，可以直接用 token。
  - 减弱动效下会**留一条静态高光带**（`:285-297`：`translateX(0)` / `background-position: 50%`）。不想要一道静止条纹，就在减弱动效下设 `:active="false"`。
  - `repeat=false` 跑一次后停在末帧，而且挂载即播。要让读者看到，就在 `@enter` 或进入该步骤时换 key 重新挂载。
- **借鉴**：
  - `GlowTextGlowTextDemo.vue`：四个 text-clip 例子。
  - `GlowTextGlowTextCasesDemo.vue`：徽章一次性扫光，`:repeat="false"`。

#### TxTuffLogoStroke（`tuff-logo-stroke`）

- **Props**（`tuff-logo-stroke/src/types.ts`；默认值 `TxTuffLogoStroke.vue:10-19`）：
  - `size=120`：数字按 px，也可以是 CSS 长度
  - `mode='once'|'breathe'|'hover'|'loop'`：`loop` 等同 `breathe`
  - `durationMs=2200`
  - 颜色：`strokeColor='#4C4CFF'`、`fillStartColor='#199FFE'`、`fillEndColor='#810DC6'`、`outerStartColor='#D73E4D'`、`outerEndColor='#7F007F'`
  - 无 events / slots / expose。
- **渲染**：
  - 100×100 viewBox 的 SVG：外框 rect、渐变环、核心描边、模糊填充。
  - 渐变与滤镜 id 用 `useId()` 生成，多实例不会冲突；SVG `overflow: visible`。
- **动效**：
  - `once` 是挂载即播的 CSS 动画：外框 0–45%，环 20–70%，核心描边 40–100%，填充 60–100%。**重播只能换 key 重新挂载。**
  - `breathe` 画完之后无限呼吸（scale 1.03 加提亮）。
  - 减弱动效下直接显示终帧（`:252-270`）。
- **可访问性**：`role="img"`，`aria-label` 写死为英文 `"Tuff logo stroke animation"`（`:57`），无法本地化。
  - 做法：外面包一层 `aria-hidden="true"`，品牌名放在旁边的文字里。
- **颜色与尺寸**：颜色写死，亮 / 暗一致。小于 32px 时模糊填充会发糊，窄档改用 TxIconChip「T」。
- **借鉴**：`TuffLogoStrokeModesDemo.vue`、`TuffLogoStrokePaletteDemo.vue`。

#### TxKeyframeStrokeText（`keyframe-stroke-text`）

- **Props**（`keyframe-stroke-text/src/types.ts`；默认值 `TxKeyframeStrokeText.vue:10-19`）：
  - `text=''`
  - `strokeColor='#4C4CFF'`、`fillColor='#111827'`
  - `durationMs=1800`、`strokeWidth=2`
  - 字体：`fontSize=64`、`fontWeight=700`、`fontFamily='inherit'`
  - 无 events / slots / expose。
- **渲染**：
  - SVG 里三层 `<text>`：测量层留在原点，另有描边层和填充层。
  - 在挂载时、props 变化时、`document.fonts.ready` 时，用 `getBBox()` 和 `getComputedTextLength()` 重新测量。
  - viewBox 的宽随文字变化，SVG 高度等于测量高度（`width: auto`）。
  - **只有一行，不换行。**
- **坑**
  - `fillColor` 默认近黑的 `#111827`（`:13`），暗色主题下几乎看不见。
    - 传 `fill-color="var(--tx-text-color-primary)"`；它写进 CSS 变量，可以直接用 token。
  - 在 `display: none`（v-show 隐藏）时 `getBBox()` 返回 0，之后只有 props 或字体变化才会重测。
    - 用 v-if 在可见时挂载，不要用 v-show。
  - 宽度不会随容器收缩。窄档给根节点 `max-width: 100%`（高度不变，会留白），或换短文案、小字号。
  - 动画挂载即播，重播要换 key；减弱动效下显示终帧（`:190-200`）。
  - `role="img"`，`aria-label` 取 `text`。装饰性用法下，语义标题应放在组件外面（文档审阅说明）。
  - **测量偏移的修复还没提交。** 修复内容是测量层不再带 x/y，目前只在工作树里；09-24 07:31 的 dist 已经包含。
    - 如果并行会话回滚，`fonts.ready` 之后字形会跑到 viewBox 的左上角。
- **借鉴**：`KeyframeStrokeTextKeyframeStrokeTextDemo.vue`、`KeyframeStrokeTextChineseDemo.vue`（中文 40px）。

#### TxSteps / TxStep（`steps`，补充 `data-flow.md`）

- **TxSteps**：
  - Props：`direction='horizontal'|'vertical'`、`size='small'|'medium'|'large'`、`active=0`。
  - **没有 emits，也没有 v-model**（`steps/src/TxSteps.vue`）。
- **TxStep**：
  - Props：
    - `title`、`description`
    - `icon`：`i-carbon-*` 类名或内置名，由 TxIcon 解析
    - `status='wait'|'active'|'completed'|'error'`
    - `step?`、`clickable=true`、`disabled`、`showLine=true`
    - `completedIcon='check'`：内置图标
- **行为**：
  - 点击可点击的步骤，只会改 TxSteps 的内部 activeStep（`TxStep.vue:81-85`），不通知父级。父级之后再改 `active` 时，watch 会把值覆盖回来。
  - 想实现「点已完成的步骤回退」：
    - 在 TxStep 上挂原生 `@click`，它会透传到根 div。
    - 但点标题、描述区域时也会触发，而且对 disabled 和非 clickable 的步骤同样触发。宿主要自己判断 `i < current`。
  - 数字 step 小于 active 时自动显示为 completed。
  - 建议显式传 `:step="i"`；不传时按注册顺序。
- **视觉与动效**：
  - wait：空心环。
  - active：主色，外加 4px 光晕，光晕 2.8s 无限呼吸。
  - completed：主色，数字换成对勾（带一点过冲）。
  - 连接线从左到右扫过，按序号错开 140ms。
  - error：danger 色。
  - 全部是 CSS 动画，有减弱动效兜底（在 `TxStep.vue` 末尾）。
- **尺寸**：
  - horizontal：每步 `flex: 1` 均分宽度，标题居中。
  - vertical：每步 `margin-bottom: 16px`，连接线依赖这个间距。
  - small：标记 20px，标题 12px，描述 11px。
- **借鉴**：`StepsStepsDemo.vue`（数字步骤与字符串步骤两种写法）。

#### TxForm / TxFormItem（`form`，补充 `content.md`）

- **校验时机与文案**：
  - 只有调用 `validate()` 时才校验，没有 blur / change 触发。
  - 默认错误文案是英文：`` `${label} is required` ``、`` `${label} is invalid` ``（`TxFormItem.vue:78-83`）。每条规则都要传 `message`。
  - 错误行用 `v-if` 插入，会把布局顶开：要么预留高度，要么接受跳动。
- **回车提交**：
  - TxForm 的根是 `<form @submit.prevent>`，没有声明 `submit` 事件，所以宿主写的 `@submit` 会透传到原生 form。
  - 在表单里放一个 `native-type="submit"` 的 TxButton（`button/src/types.ts:32`），回车即可提交。
- **接线与标签**：
  - TxFormItem 的默认插槽提供 `{ id, ariaInvalid, ariaDescribedby }`。
  - 写成 `<TxInput :id="id" :aria-invalid="ariaInvalid" :aria-describedby="ariaDescribedby">` 时，这些属性会落到内层 input（TxInput 设了 `inheritAttrs: false`）。
  - label 自带 `for=id`；有 required 规则时 label 带红色 `*`。
- **借鉴**：`FormFormDemo.vue`。

#### TxProgressBar（补充 `data-flow.md`）

- **引导进度条**：
  - 用法：`:percentage`、`height="4px"`，完成时用 `status` 或 `success`。
  - 宽度过渡 480ms（`progress-bar/src/TxProgressBar.vue:685`）；到 100 时发一次 `complete`。
- **可选特效与兜底**：`flowEffect` 可选 `shimmer` / `wave` / `stardust` / `particles`；有减弱动效兜底（`:1070`）。
- **语义**：`role=progressbar` 加 `aria-valuenow`；`ariaLabel` 要本地化。
- **TxProgress**（TuffProgress）只是它的薄封装，文字放在条外。

#### TxTransition（`transition`）

- **导出**：`TxTransition`、`TxTransitionFade`、`TxTransitionSlideFade`、`TxTransitionRebound`、`TxTransitionSmoothSize`。
- **Props**：
  - `preset='fade'|'slide-fade'|'rebound'|'smooth-size'`
  - `group=false`、`tag`
  - `appear=true`：首次挂载也会播
  - `mode='out-in'`、`duration=180`、`easing`
  - SmoothSize 另有 `width` / `height` / `motion`
- **减弱动效**：时长降到 0.01ms（`transition/src/TxTransition.vue:148-160`）。
- **用法**：步骤切换写成 `<TxTransition preset="slide-fade"><section :key="step">…</section></TxTransition>`。

#### TxIconMorph（`icon-morph`）

- **导出**：`TxIconMorph`（别名 `TxMorphIcon`）。
- **内置路径**：menu、close、x、plus、minus、check、arrow-*、chevron-*、search、user、star、info、check-circle、x-circle、alert-triangle（`icon-morph/src/types.ts`）。
- **Props**：
  - 模式：`icon`（非受控，换值即形变），或 `from` / `to` / `progress`（受控）
  - `spring`
  - **`reducedMotion='never'`：默认忽略系统的减弱动效偏好**（`TxIconMorph.vue:25`）
  - 外观：`size=24`、`color`、`strokeWidth=2`
  - `label?`：给了才渲染成 `role=img`
- **用途**：权限行的状态图标 x-circle → check-circle、窄档汉堡 menu → close。使用时必须传 `reduced-motion="user"`。

#### TxInput 的密码模式与 TxSensitiveInput（补充）

- **`TxInput type="password"`**：
  - 没有显示 / 隐藏开关，只有 CapsLock 提示；`capsLockText` 默认英文，要本地化（`input/src/TxInput.vue:21,33`）。
  - 可以在 `#suffix` 里放一个眼睛 TxIconButton，自己切换 `type`。
- **`TxSensitiveInput` 是「展示密钥」的语义**，不适合登录密码，适合只读的恢复密钥：
  - 往空字段里**输入时是明文显示**（`handleInput`，`:121-129`），失焦后才遮盖。
  - 复制会写入真实剪贴板。
  - 在输入框里按 Esc 只会重新遮盖，不 `preventDefault`（`:157-160`），展开态下会连带收起 TemplateFrame。

#### TxPermissionState / TxGuideState（`permission-state`、`guide-state`）

- **结构**：都是 `TxEmptyState` 的变体包装，分别固定 `variant="permission"` 和 `variant="guide"`。
  - Props：`EmptyStateProps` 去掉 `variant`，即 title、description、icon、iconSize、layout、align、size、surface、primaryAction、secondaryAction、actionSize、loading。
  - Events：`primary`、`secondary`。
  - Slots：icon、title、description、actions。
- **插画**：
  - permission 是一把一直在抖的锁，2s 无限循环（`TxEmptyState.vue:735-739`）。
  - guide 是箭头加进度。
  - 减弱动效：工作树版本已补（`:964-1000`，未提交，dist 已含）。
- **评估**：它是整块空状态的体量，做不了权限「行」。可以在权限全部被跳过时当提示卡（`size="small" layout="horizontal"`），也可以不用。
- **借鉴**：`PermissionStatePermissionStateDemo.vue`、`GuideStateCustomDemo.vue`。

#### TxBlockSwitch（`group-block`）— 不推荐用于权限行

- **问题**：
  - `loading` 时整行 1.35s 无限闪光，**没有减弱动效兜底**（`group-block/src/TxBlockSwitch.vue:131`）。
  - 内部的 TuffSwitch 不传 aria-label，读屏名是英文默认值 `Toggle`（`:85`；`switch/src/TxSwitch.vue:31`）。
  - 点整行不会切换开关。
- **替代**：权限行用 TxCardItem 加 `TuffSwitch :loading :aria-label`。TxSwitch 的 loading 有减弱动效兜底（`switch/style/index.scss:271`）。

### C. 图标核对

对照 `apps/nexus/node_modules/@iconify-json/{carbon,cib,logos,twemoji}/icons.json` 逐个检查（2026-09-24）。

**本文提案里用到的图标全部存在：**

- 导航与操作：`i-carbon-app-switcher` `chevron-down` `search` `help` `notification` `add` `user-follow` `checkmark` `earth` `location` `logout` `user-avatar` `keyboard` `menu` `close` `launch` `overflow-menu-horizontal` `arrow-right` `arrow-left` `reset` `play`
- 产品与分区：`application` `dashboard` `store` `machine-learning-model` `cube` `book` `home` `folders` `activity` `user-multiple` `settings`
- 项目类型与状态：`plug` `flow` `bot` `color-palette` `translate` `paste` `flash` `screen` `code` `image` `deploy` `rocket` `renew` `time` `edit` `star` `star-filled` `chart-line`
- 登录与引导：`fingerprint-recognition` `logo-github` `email` `send` `workspace` `sun` `moon` `language` `idea` `compass` `laptop` `power` `mac-command` `party-popper`
- 权限：`folder-open` `accessibility` `video` `data-base` `microphone` `security` `checkmark-filled` `checkmark-outline` `warning-alt` `locked` `unlocked`
- 其他集合：`i-cib-apple` `i-cib-github` `i-logos-google-icon` `i-logos-github-icon` `i-twemoji-waving-hand` `i-twemoji-party-popper` `i-twemoji-sparkles`

**不存在，不要用：**

- carbon：`celebrate` `sparkle` `sparkles` `shortcut` `screen-recording` `record` `cast` `pulse` `bug` `git-branch` `git-commit` `git-merge` `git-pull-request` `logo-apple` `logo-microsoft` `mac-control` `question-circle`
- logos：`raycast-icon`

**深色主题下的品牌图标**：`i-logos-github-icon` 和 `i-logos-apple` 是黑色字形，深色主题下看不见。改用跟随 currentColor 的 `i-carbon-logo-github` 和 `i-cib-apple`；真实的 Nexus 登录页也是这么做的（`SignInEmailStep.vue:54`）。

**LINUX DO 没有现成图标：**

- 已安装的集合里都没有。
- 站内的 `app/components/icon/LinuxdoIcon.vue:2` 会**显式** import `TxIcon from '@talex-touch/tuffex/icon'`（dist）。
- 模板里直接内联它的三段 SVG：圆形裁切，上黑、中白、下黄。

---

## Template proposals

两个模板共用的约定都沿用 `nexus-docs-templates.md` §6：`@container template` 三档（`<640` / `640–959` / `≥960`，可再加 `≥1200`）、从 `@enter` 开播、`defineExpose({ resetDemo })`、`watch(locale, resetDemo)`、反馈统一用 `TxToastPanel`、不 `import Tx*`。

### A. Shell · 第二风格「顶栏控制台 / Top-nav console」

- 页面：在 `template-shell.{zh,en}.mdc` 的 `## 模板` 下，新增 `### 顶栏控制台` / `### Top-nav console`。
- Demo：`TemplateShellTopNavDemo.vue`；在 registry 里按字母序排在 `TemplateShellDemo` 之后。
- 舞台：`:height="580"`，与侧栏风格一致。
- 场景：Tuff Nexus 团队控制台。一个团队在这里管理自己的插件、工作流、智能体、主题项目，并与成员协作。

#### 与已上线的「侧栏工作台」的区别（避免同质）

| | 侧栏工作台（第一批） | 顶栏控制台（本批） |
|---|---|---|
| 导航 | 左侧 TxSidebarNav | 两行顶栏：全局栏 + TxTabs 下划线导航 |
| 切换器 | 侧栏头部的工作区块 | 产品切换（应用格）+ 工作区切换（含数据区域子菜单） |
| 主区 | 统计卡 + 时间线 + spark 看板 | 页头（面包屑 + 标题 + 动作）+ 项目卡片网格 + 动态列表 |
| 通知 | 铃铛 + TxToastPanel 托盘 | 铃铛 + 通知菜单（TxDropdownMenu）；TxToastPanel 只做操作反馈 |
| 在线状态 | 宽档右栏 | 导航行右侧常驻 |
| 窄档 | 汉堡按钮 + 下拉菜单 | TxNavBar + TxDrawer，tab 行横向滑动 |

#### 栏内（约 782×580）

```
┌ .topnav（flex column，height 100%）──────────────────────────────────────────────────────┐
│ ▦ │ ◆ Nexus │ (TL) Tuff Labs ▾ │           [⌕ 搜索项目与命令…    ⌘K]  (?)  🔔²  (林)▾    │ 52  第 1 行：全局栏（手写 flex）
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 概览  项目 ⑨  活动  成员  设置🔒                             (陈)(S)(周)+1  4 人在线     │ 44  第 2 行：TxTabs 导航（line）+ #nav-right
│ ━━━━                                                                                     │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ Tuff Labs › 概览                                           [邀请成员] [+ 新建项目 ▾]    │ 60  TxTabHeader：TxBreadcrumb + 标题 + 动作
│ 9 个项目，2 个待处理                                                                     │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 最近项目                                                              查看全部 →        │   内容（TxTabs 内容区滚动）
│ ┌ TxCard ────────────────┐ ┌ TxCard ────────────────┐ ┌ TxCard ────────────────┐        │   grid: repeat(auto-fill, minmax(220px, 1fr))
│ │ [◧] 翻译      ● 构建中  │ │ [◧] 剪贴板历史 ● 已发布 │ │ [⇄] 截图翻译   ● 运行中 │        │
│ │ touch-translation · 插件│ │ clipboard-history · 插件│ │ 工作流 · 今天 18 次     │        │
│ │ ▓▓▓▓▓▓▓▓░░░ 72% · 2.4.1│ │ v1.2.0 · 2 小时前       │ │ 由 ⌘⇧T 触发            │        │
│ │ (陈)(林) 正在编辑       │ │ (周)                    │ │ (S)                    │        │
│ └────────────────────────┘ └────────────────────────┘ └────────────────────────┘        │
│ 动态                                                                                     │
│ (陈) 陈凯 发布了「剪贴板历史」1.2.0                                         2 小时前     │   TxCardItem 行
│ (周) 周以宁 把「快捷动作」1.1.0 提交审核                                     昨天         │
│                                                      ┌ TxToastPanel（右下，绝对定位）┐   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 展开（≥960，约 1440×900）

```
┌ 第 1 行（56）──────────────────────────────────────────────────────────────────────────────────────────────┐
│ ▦ ◆ Nexus │ (TL) Tuff Labs ▾ · 上海          [⌕ 搜索项目、成员与命令…              ⌘K]  文档  更新日志  (?)  🔔²  (林)▾ │
├ 第 2 行：TxTabs 导航（48）──────────────────────────────────────────────────────────────────────────────────┤
│ 概览  项目 ⑨  活动  成员  设置                                          (陈)(S)(周)(林)  4 人在线  [+ 新建项目 ▾] │
├──────────────────────────────────────────────────────────────────────────────┬─────────────────────────────┤
│ Tuff Labs › 概览                                             [邀请成员]      │ 在线成员                    │
│ 早上好，小满。Tuff Labs 本周发布了 3 个版本。                                 │ (陈) 陈凯 · 所有者 · 编辑「翻译」│
│ 最近项目                                                                      │ (S)  Sam Rivera · 开发者    │
│ ┌card┐ ┌card┐ ┌card┐        ← 960–1199：2–3 列                              │ …                           │
│ ┌card┐ ┌card┐ ┌card┐ ┌card┐ ← ≥1200：4 列                                    │ 本周构建（TxSparkChart，示例）│
│ 部署队列：TxCardItem + TxProgressBar（进行中 / 等待审核）                     │ 动态（TxCardItem 列表）      │
└──────────────────────────────────────────────────────────────────────────────┴─────────────────────────────┘
                                                                                  右栏 300–320px
```

#### 窄档（<640）

```
┌ TxNavBar（44）────────────────────────────┐
│ [≡•]         概览 · Tuff Labs         [⌕] │  左：打开抽屉（带未读点）；右：命令面板
├ TxTabs 导航（横向滑动）──────────────────┤
│ 概览  项目⑨  活动  成员  设…             │
├───────────────────────────────────────────┤
│ 概览                               [+]    │  TxTabHeader：面包屑只留末项，动作收成图标按钮
│ ┌ TxCard（单列）─────────────────────────┐ │
│ └────────────────────────────────────────┘ │
│ 动态 …                                     │
└───────────────────────────────────────────┘
TxDrawer（视口 ≤768 时 mobileAdapt 成底部抽屉）：工作区切换、产品、通知 ②、账户
```

#### 组件与职责

| 区域 | 组件 | 作用 |
|---|---|---|
| 产品切换（mega 面板，推荐方案） | TxDropdownMenu（`min-width` 340）+ 面板内 2 列 grid 的 TxDropdownItem + TxIconChip；下方一组「最近访问」TxDropdownItem | 6 个产品格子加 3 个最近项目。当前产品有高亮；点其他产品只弹 TxToastPanel「宿主会打开「插件市场」（演示）」，不导航 |
| 产品切换（可选的真宽面板，仅 ≥960） | TxPopover `:width="560"` `trigger="click"` `:show-arrow="false"` + TxCardItem（clickable）三栏 | 真正的 mega 面板。焦点与 Tab 需要宿主补（见 cheat sheet） |
| 工作区切换 | TxDropdownMenu + TxDropdownItem（`#right` 放 `i-carbon-checkmark`）+ TxDropdownSubmenu「数据区域 ▸」+ TxAvatar（`shape="rounded"`，首字母） | 切换工作区、选择数据区域、新建工作区（反馈） |
| 全局搜索 | 原生 `<button>`（做成搜索框外观）+ TxKbd + TxCommandPalette | ⌘K 绑在模板根上并 `preventDefault` |
| 帮助 | TxIconButton + TxTooltip | 点击弹 TxToastPanel，列出快捷键提示 |
| 通知 | TxIconButton + TxCornerOverlay + TxBadge；TxDropdownMenu（`min-width` 320）+ TxDropdownItem + TxDotIndicator | 通知是 menuitem，键盘现成可用。「全部标为已读」的 item 设 `:close-on-select="false"` |
| 账户 | TxDropdownMenu + 原生 `<button>` 包 TxAvatar | 个人资料、快捷键、退出登录（danger，演示反馈）。注意第一批记录的 TxAvatar 键盘陷阱 |
| 主导航 | TxTabs `placement="top"` `indicator-variant="line"` + TxTabItem（稳定英文 `name`，`#name` 插槽放本地化标签 + TxBadge 计数）；「设置」`disabled` | 概览、项目、活动、成员；设置需要所有者权限，演示禁用态 |
| 在线状态 | TxAvatarGroup（`max=3`，`size="small"`）+ TxAvatar `status` + TxTextMorph 人数 | 放在 TxTabs 的 `#nav-right`；人数写进文字，读屏可读 |
| 页头 | TxTabHeader + TxBreadcrumb + TxButton + TxSplitButton（`menu-icon="i-carbon-chevron-down"`） | 当前位置、邀请成员、新建项目（菜单：插件 / 工作流 / 智能体 / 主题） |
| 项目卡 | TxCard（pure，`--tx-surface-color: var(--tx-bg-color)`）+ TxIconChip + TxStatusBadge + TxProgressBar + TxAvatarGroup + TxTag | 最近项目。建议卡片 `clickable`，卡内不放按钮 |
| 项目列表 | TxFilterChips（全部 / 插件 / 工作流 / 智能体 / 主题，计数由数据推导）+ TxSearchInput + TxCardItem 行（`#right` 放状态、版本、头像） | 筛选；点行进入详情 |
| 项目详情 | TxBreadcrumb 延长到「Tuff Labs › 项目 › 翻译」+ TxStatCard ×3（示例）+ TxCardItem 部署记录 | 演示面包屑下钻：点「项目」返回列表，点「Tuff Labs」回到概览 |
| 活动 / 成员 | TxCardItem 行 + TxAvatar status + TxTag 角色 | 动态流、成员表 |
| 反馈 | TxToastPanel（右下，`:tether="false"`，关闭时 `inert`） | 所有演示动作的反馈 |
| 窄档 | TxNavBar（`#left` 放图标 + sr-only 文字，`#title` 放当前分区，`#right` 放搜索）+ TxDrawer | 紧凑顶栏 |
| 禁用 / 空分区 | TxEmptyState，`#icon` 插槽放静态图标 | 暂无内容的分区 |

#### 交互

- **键盘**：⌘/Ctrl+K 绑在模板根的 keydown 上并 `preventDefault`，打开命令面板（同第一批）。
  - 命令：前往各分区；打开「翻译」或「剪贴板历史」；新建插件或工作流项目；切换到「小满的空间」；邀请成员；「工作区设置」禁用，说明「需要所有者权限」。
- **工作区菜单**：切换后更新面包屑首项和页面数据（个人空间只有 2 个项目），并弹 TxToastPanel。
  - 子菜单「数据区域」切换后，第 1 行显示「· 上海 / 法兰克福 / 俄勒冈」（示例）。
- **产品菜单**：点当前产品只关闭菜单；点其他产品弹反馈，不导航。
- **通知菜单**：打开即清零铃铛计数；点某条通知跳到对应项目详情，并标为已读；「全部标为已读」不关闭菜单。
- **tab**：
  - ←/→ 切换。
  - 「项目」tab 的计数随新建草稿变化。
  - 从 URL 意义上的「详情」退回靠面包屑。
- **新建项目**：SplitButton 主按钮新建「未命名插件 n」草稿卡，插在网格首位（TransitionGroup 进场，带减弱动效兜底），并弹反馈；菜单项新建对应类型。
- **项目卡**：Enter / Space / 点击都进入详情。
- **筛选与搜索**：筛选 chip 和搜索框实时过滤；无结果时显示 TxSearchEmpty，提供「清空筛选」。

#### 自动演示（`@enter` 开播一次，可重播）

| 时间 | 动作 |
|---|---|
| +0.8s | 周以宁上线：在线头像组多一位，人数 3 → 4（TxTextMorph），成员页状态同步变化 |
| +1.6s | 「翻译」卡构建完成：TxProgressBar 72 → 100（`complete`），TxStatusBadge「构建中 → 已发布」，版本 2.4.0 → 2.4.1；动态顶部插入一条 |
| +2.2s | 铃铛计数 1 → 2；右下 TxToastPanel「「翻译」2.4.1 已发布 · 查看」显示 3.2s 后收起 |

- 读者在模板内第一次 `pointerdown` / `keydown` 就停止自动演示。
- 自动演示不打开任何菜单，也不 `focus()`。
- 减弱动效：直接写入终态（4 人在线、100%、已发布、计数 2、动态已插入），不弹托盘。
- `resetDemo`：清计时器，恢复种子数据，关闭所有浮层，回到概览；如果已进入过视口就重播。

#### Mock 数据（中英双份，全部为示例）

- **当前用户**：林小满 / Mia Lin，`xiaoman@example.com` / `mia@example.com`，角色「管理员 / Admin」。所有者是陈凯，因此「设置」tab 禁用。
- **工作区**：
  - Tuff Labs（团队 · 6 人 / Team · 6 people）✓
  - 小满的空间 / Mia's space（个人 / Personal）
  - Tuff 开源社区 / Tuff Open Source（社区 / Community）
- **数据区域**（示例）：上海 / Shanghai、法兰克福 / Frankfurt、俄勒冈 / Oregon。
- **产品**：
  - Tuff 桌面版 / Tuff Desktop（CoreBox 与插件）
  - Nexus 控制台 / Nexus Console（当前）
  - 插件市场 / Plugin Store
  - Tuff Intelligence（AI 网关）
  - TuffEx（组件库）
  - 文档 / Docs
- **项目**：插件 id 取自真实的 `plugins/` 目录。

  | 项目 | id | 类型 | 状态 | 补充 |
  |---|---|---|---|---|
  | 翻译 / Translate | `touch-translation` | 插件 | 构建中 72% → 2.4.1 | 陈凯、林小满正在编辑 |
  | 剪贴板历史 / Clipboard History | `clipboard-history` | 插件 | 已发布 1.2.0 | |
  | 快捷动作 / Quick Actions | `touch-quick-actions` | 插件 | 审核中 1.1.0 | |
  | 窗口预设 / Window Presets | `touch-window-presets` | 插件 | 已发布 1.0.0 | |
  | 工作区脚本 / Workspace Scripts | `touch-workspace-scripts` | 插件 | 草稿 | |
  | Tuff 智能 / Tuff Intelligence | `touch-intelligence` | 插件 | 已发布 1.2.0 | |
  | 截图翻译 / Screenshot translate | — | 工作流 | 运行中 · 今天 18 次 | 由 ⌘⇧T 触发 |
  | 每日摘要 / Daily digest | — | 智能体 | 等待确认 | |
  | 极光 / Aurora | — | 主题 | 草稿 | |

- **成员**：

  | 成员 | 角色 | 状态 |
  |---|---|---|
  | 陈凯 / Kai Chen | 所有者 | 在线 |
  | 林小满 / Mia Lin | 管理员（你） | 在线 |
  | Sam Rivera | 开发者 | 在线 |
  | 周以宁 / Zhou Yining | 开发者 | 离开 → 在线（自动演示） |
  | 陈默 / Chen Mo | 访客 | 离线 |
  | 李想 / Li Xiang | 开发者 | 离线 |

- **通知**：
  - 「陈凯 请你审核「快捷动作」1.1.0」（未读）
  - 「智能体「每日摘要」等待确认」（已读）
  - 自动演示新增：「「翻译」2.4.1 已发布」（未读）
- **动态**：
  - 陈凯 发布了「剪贴板历史」1.2.0 · 2 小时前
  - 周以宁 把「快捷动作」1.1.0 提交审核 · 昨天
  - Sam 新建工作流「截图翻译」· 2 天前
  - 林小满 邀请了 陈默 · 3 天前
- **本周构建**（宽档 spark，示例）：`[3, 5, 2, 6, 4, 7, 5]`。
- **文案禁区**：不要出现「套餐 / Team plan / 席位」。第一批 Shell 里的「Team 套餐 · 管理员」不要照抄（Nexus 禁止伪套餐和价格暗示，见 `apps/nexus/AGENTS.md:34-35`）。

#### 需要手写的 CSS

- 两行顶栏：第 1 行的 flex 布局，搜索触发按钮的外观，品牌区。
- TxTabs 的 `:deep` 调整：导航左右 padding 对齐第 1 行；把 TxTabHeader 设为不透明。
- 菜单面板内的产品格子 grid：面板 teleport 出去了，只能用 token 取色。
- 项目卡的内部版式。
- 在线头像区。
- TxToastPanel 的定位。
- 容器查询：
  - `<720`：搜索框收成图标按钮。
  - `<640`：换成 TxNavBar。
  - `≥960`：出现右栏。
  - `≥1200`：卡片 4 列。
- 减弱动效：给 TxTabs 传 `:animation="{ size:false, nav:false, indicator:false, content:false }"`；宿主自己的 TransitionGroup 写 `@media (prefers-reduced-motion)` 兜底。

#### 风险与兜底（本模板）

- **mega 面板**：TxDropdownMenu 最宽 360px，推荐方案的「mega」只是 2 列应用格加一组最近访问。
  - 老板如果要真正的三栏宽面板，走 TxPopover，要额外写焦点移入、Tab/Esc 还焦（约 30 行），并且只在 `≥960` 出现。
- **窄档**：
  - TxNavBar 左右都是按钮，所以窄档的菜单和通知都放进 TxDrawer；只有图标的插槽要带 sr-only 文字。
  - TxDrawer 的动效不理会减弱动效，且 `mobileAdapt` 看视口宽度，这是组件本身的行为。
- **项目卡**：clickable 的 TxCard 里不能再嵌按钮（收藏、更多菜单）；需要这些操作时改为 hover 出现的独立行动作，或放进详情页。
- **命令面板层级**：列内打开的 TxCommandPalette 在站点页头之下（同第一批，已接受）。
- **与其他章节的边界**：「插件市场」和「发布控制台」是本批的其他章节。项目卡不放「安装 / 发布」按钮，只显示状态，避免和那两个章节重复或矛盾。

#### mdc 补充（`## 组成` / `## 交互要点`）

- **`## 组成` 新增几行**：全局栏（产品与工作区切换）、导航（TxTabs）、在线状态、页头、项目网格、窄档（TxNavBar + TxDrawer）。
- **`## 交互要点` 新增几条**：⌘K 与侧栏风格一致；工作区子菜单；面包屑下钻；自动演示时间轴；窄档的变化。

### B. Onboarding 登录引导（新章节）

#### 注册

- 页面：`template-onboarding.{zh,en}.mdc`。
  - frontmatter：`category: TemplateApp`，标题「Onboarding 登录引导」/「Onboarding」。
  - description 里不要出现半角冒号加空格。
- TAXONOMY：`TemplateApp` 组里放在 `template-settings` 之后（`apps/nexus/scripts/recategorize-component-docs.py:60-63`）。
- 侧栏：`SECTION_ORDER` 里放在 `template-settings` 之后（`app/components/DocsSidebar.vue:229-231`）。
- Demo：`TemplateOnboardingDemo.vue`；registry 按字母序放在 `TemplateLauncherDemo` 与 `TemplateResearchDemo` 之间（`demo-registry.ts:368-369`）。
- 舞台：`:height="560"`。

#### 场景

Tuff 桌面版首次启动的引导。流程和文案取自 core-app 真实的 Beginner 引导（`apps/core-app/src/renderer/src/views/base/begin/`）和 Nexus 登录页，只是全部改成 mock，不做真实认证，也不申请真实系统权限。

| 步骤 | 内容 | 主要组件 | 真实出处 |
|---|---|---|---|
| 1 登录 | Passkey（推荐，带「上次使用」）/ GitHub / LINUX DO / 邮箱 Magic Link；「离线继续」 | TxBorderBeam `sm`、TxButton `block` `loading`、TxBadge、TxForm + TxFormItem + TxInput `type="email"` | `SignInEmailStep.vue:43-85`；Nexus `i18n/locales/{zh,en}.ts` 的 `auth.*`（`zh.ts:127-180`）；core-app `beginner.account.*` |
| 2 工作区 | 创建个人空间，或接受团队邀请 | TxRadioGroup `type="card"`、TxInput、TxFlatRadio（色板放 `#icon` 插槽）、TxAvatar `rounded` 预览、TxTagInput 邀请、邀请卡（TxCard + TxAvatarGroup） | Nexus `team.join.*`（`zh.ts`，文案不用「席位」） |
| 3 偏好 | 呼出快捷键、主题、语言、使用方式、开机启动 / 托盘；可选的剪贴板同步恢复密钥 | TxKbd `md` + TxButton 录制 + TxGradientBorder（仅录制中）、TxFlatRadio ×2、TxRadioGroup `card`、TuffSwitch ×2–3、TxSensitiveInput `readonly` | core-app `beginner.optionMode.*`、`setupPermissions.autoStart/showTray`、`beginner.language.*` |
| 4 权限 | 文件访问（必需）、辅助功能（可选）、屏幕录制（可选）；隐私说明；「稍后再说」 | TxCardItem 行 + TxIconChip + TxTag + TxStatusBadge + TuffSwitch `loading` 或 TxButton；TxProgressBar 汇总；可选 TxIconMorph | core-app `setupPermissions.*`；屏幕录制文案取 `en-US.json:5344-5348` / 对应 zh |
| 5 完成 | 「一切就绪」、试按 ⌘E、CoreBox 预览、设置摘要、「开始使用」 | TxKeyframeStrokeText、TxGlowText、TxKbd 大键帽、TxGlassSurface、TxBorderBeam `md`、TxCardItem、TxButton | core-app `beginner.done.*`、`Done.vue:34-36`（⌘ + E） |

#### 栏内（约 782×560）

```
┌ .onb（grid: 264px | 1fr）──────────────────────────────────────────────────────────────┐
│┌ 品牌栏 264 ────────────────┐┌ 步骤区 ──────────────────────────────────────────────┐│
││ ░ 令牌渐变壁纸（亮 / 暗）░   ││ ▔▔▔▔▔▔▔▔▔░░░░░░░░░░░░░░░░░░░░░░ 1 / 5  TxProgressBar 4px ││
││ [TxTuffLogoStroke 56]       ││                                                      ││
││ 欢迎来到 Tuff               ││  登录 Tuff                                            ││
││ (TxKeyframeStrokeText 26)   ││  使用 Magic Link 或其他方式登录。                       ││
││ 本地优先、AI 原生、可无限    ││  ╭ TxBorderBeam sm ──────────────────────────╮ 上次使用││
││ 扩展的桌面指令中心。         ││  │ [⌘ Passkey 登录]                             │        ││
││ (TxGlowText text-clip 一次) ││  ╰──────────────────────────────────────────────╯        ││
││                             ││  [ GitHub ]             [ ◐ LINUX DO ]                  ││
││ ① 登录     ━ TxSteps        ││  ─────────────── 或 ───────────────                     ││
││ ② 工作区     vertical small ││  邮箱 [ you@example.com                      ]           ││
││ ③ 偏好                      ││  [ 使用邮箱继续 ]  ← 提交后换成「已发送 Magic Link」块   ││
││ ④ 权限                      ││                                                      ││
││ ⑤ 完成                      ││ ───────────────────────────────────────────────────── ││
││ 离线继续 · ▶ 看一遍流程      ││  ‹ 上一步                                  [继续 →]  ││  页脚常驻，不随步骤重渲染
│└─────────────────────────────┘└──────────────────────────────────────────────────────┘│
│                          TxToastPanel（步骤区底部居中，绝对定位）                         │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

步骤区内容限宽约 400px 居中；步骤内容区 `overflow-y: auto`，第 3 步在 560 高度下可能需要滚动。

#### 展开（960–1199 两栏；≥1200 三栏，约 1440×880）

```
┌ 品牌栏 300 ─────────┬ 步骤区（卡片最宽 540，居中）─────────────────────┬ 实时预览 380（仅 ≥1200）──┐
│ Logo 72             │ ▔▔▔▔▔▔▔▔▔░░░░░░░░ 3 / 5                         │ ┌ 桌面模拟 ──────────────┐ │
│ 欢迎来到 Tuff (40)   │ 偏好设置                                          │ │ 菜单栏 · 12:04          │ │
│ 副标题（GlowText）   │ 呼出快捷键 ╭TxGradientBorder╮[⌘][E] [录制]         │ │ ░ 壁纸 ░                │ │
│                     │ 主题  [☀ 浅色 | ☾ 深色 | ▣ 跟随系统]               │ │ ┌TxGlassSurface CoreBox┐│ │
│ TxSteps vertical     │ 语言  [跟随系统 | 简体中文 | English]               │ │ │[T] 搜索应用、文件…  ⌘E││ │
│ （带描述）            │ 使用方式  (引导模式·推荐) (自助探索)                │ │ │ ▸ Visual Studio Code  ││ │
│                     │ 开机自动启动 ●   显示托盘图标 ●                      │ │ └───────────────────────┘│ │
│ 离线继续 · ▶ 看一遍  │ ‹ 上一步                              [继续 →]     │ │ 文件 ✓ · 辅助 – · 录屏 – │ │
└─────────────────────┴───────────────────────────────────────────────────┴───────────────────────────┘
```

- 预览窗反映偏好设置：
  - 主题：用 Settings 模板的 `.dark` / `.is-light` 子树技巧强制暗或亮。
  - 语言：占位文字随之切换。
  - 快捷键：显示所录的组合。
  - 权限：底部的权限 chip 同步状态。
- 完成时预览窗套上 TxBorderBeam `md`。

#### 窄档（<640）

```
┌ 头部 52：[T] Tuff · 引导                2 / 5 ┐   TxIconChip「T」替代 Logo 描边动画（小尺寸会发糊）
├ TxProgressBar ───────────────────────────────┤
│ TxSteps horizontal small（标题做成 sr-only）   │
├───────────────────────────────────────────────┤
│ 步骤内容（单列，可滚动）                         │
├ 页脚（贴底）───────────────────────────────────┤
│ ‹ 上一步                          [继续 →]      │
└───────────────────────────────────────────────┘
```

#### 各步交互

1. **登录**
   - **Passkey**：按钮 `loading` 1.2s（「将调用系统 Passkey 完成验证」）→ TxToastPanel「已通过 Passkey 登录（演示）」→ 自动进入第 2 步。这一跳是用户触发的，可以接受。
   - **GitHub / LINUX DO**：`loading` 1.0s（「正在跳转到第三方授权页面…」）→ 成功。
   - **邮箱**：TxForm 校验（必填 + 邮箱格式，文案本地化）→「使用邮箱继续」`loading` 0.9s → 步骤区换成「已发送 Magic Link · 请查收 mia@example.com」，下面是「更换邮箱」和「我已点开链接（演示）」。
     - 表单里放 `native-type="submit"` 的按钮，回车即可提交。
   - **离线继续**：跳到第 3 步。第 2 步的描述写「已跳过」，完成摘要里注明「跨设备同步不可用」（core-app `beginner.account.offline.description`）。
2. **工作区**
   - **创建**：名称必填；色板 TxFlatRadio；右侧用 TxAvatar `rounded` 预览首字母和颜色；TxTagInput 输入邀请邮箱，宿主过滤非法地址，最多 5 个。
   - **加入**：邀请卡「陈凯 邀请你加入 Tuff Labs · 5 位成员 · 7 天内有效」→「加入团队」`loading` → 成功。
3. **偏好**
   - **快捷键录制**：沿用 Settings 模板的写法（监听挂在聚焦的「录制」按钮上，Esc 取消并 `preventDefault`）。录制中外面套 TxGradientBorder，旋转环表示「正在监听」。
   - 主题、语言只影响预览，不改 docs 站点。
   - 使用方式用两张卡，文案取 core-app `optionMode.*`。
   - 可选：开启「跨设备同步剪贴板」后，出现只读的 TxSensitiveInput「恢复密钥」。
     - 值是一眼能看出是假的 `TUFF-DEMO-7F3A-91C2-NOT-REAL`；说明写「示例值，并非真实密钥」。
     - 复制按钮在字段上方，上面要留约 20px。
4. **权限**
   - 每行结构：TxIconChip + 标题 / 描述 + TxTag（必需 / 可选）+ TxStatusBadge（未检查 muted / 等待确认 info / 已授权 success / 已拒绝 danger）+ TuffSwitch（`:loading`，`aria-label` 本地化）。
   - 流程：打开开关 → 1.2s「请在系统弹窗中点击「允许」」→ 已授权。
   - **屏幕录制**第一次演示为「已拒绝」，出现「前往系统设置」按钮，文案取 `deniedHint`；再点一次就授权，并打 TxTag「重启后生效（示例）」。
   - 汇总：TxProgressBar 显示「已授权 n/3」。
   - **文件访问未授权时「继续」不可用**，提示「必须授予文件访问权限才能继续」（core-app `requiredFileAccess`）。
   - 隐私说明（core-app `privacyNote`）用普通文字或非 alert 的提示块。TxAlert 是 `role="alert"`，每次进入这一步都会被读屏播报一次。
5. **完成**
   - TxKeyframeStrokeText「一切就绪 / You're all set」，`fill-color` 用 token。
   - TxGlowText 对「按下 ⌘ + E 可快速唤起 Tuff」扫一次，`repeat=false`，进入这一步时换 key。
   - 两个大键帽 TxKbd ⌘ 与 E：
     - 读者在模板内按下时点亮（`tone="primary"`），两个都按下即成功。
     - 另有一个「模拟按下」按钮，给不方便按键的读者用。
   - 成功后：CoreBox 预览弹出，TxBorderBeam `md` 淡入，TxToastPanel「已唤起 CoreBox（演示）」。
   - 摘要用 TxCardItem 列出账户、工作区、快捷键、权限 n/3。
   - 「开始使用」→ 反馈「引导完成（演示）」，再给一个「重新开始」按钮调用 `resetDemo`。
6. **全程通用**
   - 「上一步」可用；TxSteps 上已完成的步骤可以点击回退（宿主在原生 `@click` 里判断 `i < current`）。
   - 步骤切换用 TxTransition `slide-fade`，`mode` 为 out-in。
   - 用户主动换步时，把焦点移到新步骤的标题上（`tabindex="-1"`，`focus({ preventScroll: true })`）。页脚按钮常驻，焦点不会掉到 body。
   - ⌘E 监听挂在模板根上，只在焦点位于模板内时生效；可编辑元素里不响应。

#### 自动演示

- **`@enter`**：只播入场，不自动推进步骤。
  - 把 `entered` 设为 true，挂载 Logo 描边和标题描边文字，让它们在读者可见时才开始画。
  - +0.9s：Passkey 的 BorderBeam `active` 变为 true，淡入。
  - +1.4s：副标题 GlowText 扫一次。
- **「▶ 看一遍流程」**（读者点击触发，任何输入都会中止）：
  - Passkey 登录（1.2s）→ 选「加入团队」（1.0s）→ 偏好页快捷键区闪一下 GradientBorder（1.2s）→ 进入权限页。
  - **在权限页停下等读者**，提示「点「允许访问」继续：模板不会替你授权」。
  - 这里沿用模板规则「安全闸门不自动放行」（`nexus-docs-templates.md` §6）的精神，不示范自动授予系统权限。
- **减弱动效**：
  - 描边类组件直接显示终帧。
  - BorderBeam 不激活。
  - GlowText 设 `active=false`，否则会留一条静态高光。
  - 步骤切换瞬时完成；流程演示直接跳到各步终态。
- **`resetDemo`**：
  - 回到第 1 步，恢复所有默认值。
  - 清计时器，关闭托盘。
  - 换 `introKey` 让入场动画重播。
  - 回收头像的 object URL（如果用了上传）。

#### Mock 数据（中英双份）

- **品牌**：
  - 「欢迎来到 Tuff / Welcome to Tuff」（core-app `beginner.language.title`）。
  - 「本地优先、AI 原生、可无限扩展的桌面指令中心。/ A local-first, AI-native, and infinitely extensible desktop command center.」（Nexus `auth.brandSubtitle`）。
- **登录**（Nexus `auth.*`）：
  - 标题与副标题：「登录 Tuff」「使用 Magic Link 或其他方式登录。」
  - 邮箱：「使用邮箱继续」「已发送 Magic Link」
  - 其他：「上次使用」「Passkey 登录 — 将调用系统 Passkey 完成验证。」
  - 默认的「上次使用」是 Passkey；邮箱占位 `you@example.com`。
- **离线**（core-app）：「离线继续 — 您可以不登录继续使用应用，但无法进行跨设备同步，也无法使用云端功能。」
- **工作区**：
  - 创建：「小满的空间 / Mia's space」，4 个色板（主色 / 成功 / 警告 / 危险的 light-9 底配同色相字）。
  - 邀请：`kai@example.com`。
  - 加入：陈凯 → Tuff Labs · 5 位成员 · 7 天内有效。
- **偏好**：
  - 快捷键：⌘ E（非 Mac 显示 Ctrl E）。
  - 主题：跟随系统。
  - 语言：跟随系统 / 简体中文 / English；core-app 只有 zh-CN 和 en-US，不要加日语。
  - 使用方式：引导模式（推荐）/ 自助探索。
  - 开机自动启动：开；显示托盘图标：开。
- **权限**（core-app `setupPermissions.*`）：
  - 文件访问权限（必需）：「索引并搜索本机文件，只在本地读取，不会上传。」涉及文稿、下载、桌面。
  - 辅助功能权限（可选）：「用于扫描应用和读取前台上下文；自动粘贴还需要 macOS 自动化权限…」
  - 屏幕录制（可选）：截图翻译与 OCR。
  - 附注：「麦克风、通知会在首次使用时单独询问。」（改写自 `jitNotice`）
- **完成**（core-app `beginner.done.*`）：「一切就绪，开始使用吧。」「按下 ⌘ + E 可快速唤起 Tuff」「可在设置中修改快捷键」「开始使用」。
- **禁区**：不出现任何套餐、价格、试用、升级字样。

#### 需要手写的 CSS

- 壁纸：令牌渐变，暗色降饱和，参照 Launcher。
- 品牌栏、步骤区和页脚的布局；TxToastPanel 定位。
- 大键帽。TxKbd 最大 26px，要放大就得压过组件的 scoped 规则，所以用 `.onb .onb__key` 这种 (0,3,0) 的选择器。
- CoreBox 迷你窗与桌面模拟，参照 Settings 模板的实时预览。
- 权限行版式：TxCardItem 的 `#right` 插槽在标题行，想让它整行垂直居中，要么接受，要么自己写行布局。
- 色板。
- 容器查询：`<640` 单栏；`960–1199` 两栏；`≥1200` 出现预览栏。
- 限制 BorderBeam 的宽度：包 Passkey 按钮时根节点 `display: block`，按钮本身也是 `block`；在根上用 `:focus-within` 画一个内缩的焦点环，替代被 `overflow: hidden` 裁掉的外描边。

#### 风险与兜底（本模板）

- **入场动画错过**：必须按结论速览第 2 条处理。
- **BorderBeam**：减弱动效和主题都要宿主处理（见 cheat sheet）；同屏最多一个，完成页的 `md` 与登录页的 `sm` 不会同时出现。
- **KeyframeStrokeText**：暗色下要改 `fill-color`；不能在 v-show 下挂载；窄档注意宽度。
- **密码框**：如果老板坚持要密码框，就用 TxInput `type="password"`，在 `#suffix` 放眼睛按钮，并接受「保存密码」提示的风险。
  - 这个风险无法用 `autocomplete="off"` 完全消除：Chrome 会在「密码表单提交后从 DOM 消失」时提示保存。
  - 不要用 TxSensitiveInput 做登录密码。
- **快捷键**：浏览器保留的组合（⌘W / ⌘T / ⌘N / ⌘Q、Ctrl+W 等）页面根本收不到，录制器要提示「此组合被浏览器保留，请换一个」。⌘E / Ctrl+E 可以 `preventDefault`。
- **TxImageUploader**（如果用）：会打开真实的文件选择器；object URL 要自己管理。
- **TxSteps**：没有 emit，回退要宿主自己判断（见 cheat sheet）。
- **TxTuffLogoStroke**：英文 aria-label 写死，用 `aria-hidden` 包裹。

---

## Risks

1. **（高）入场特效挂载即播。**
   - 涉及：TxTuffLogoStroke `once`、TxKeyframeStrokeText、TxGlowText `repeat=false`，以及 TxTransition 的 `appear=true`。
   - docs 在 demo 进入视口前 240px 就挂载它，读者会错过。
   - 兜底：用 `@enter` 控制 v-if 或 key；`resetDemo` 换 key 重播；不要在 `onMounted` 里触发。
2. **（高）TxBorderBeam 的旋转家族（`sm` / `md` / `line`）没有减弱动效兜底**（`styles.ts` 只在 pulse 生成器里有，`:1677,1863`）。
   - 默认 `theme='dark'`，`'auto'` 跟随系统而不是 docs。
   - 根节点 `overflow: hidden`，会裁掉焦点环和不 teleport 的弹层。
   - 兜底：`useColorMode()` 传主题；`:active="!reducedMotion"`；在 wrapper 上用 `:focus-within` 画内缩焦点环。
3. **（中）mega 面板的宽度与键盘。**
   - TxDropdownMenu 被写死在 360px 以内（`TxDropdownMenu.vue:148-150`）。
   - 只有 TxPopover 显式传 `width` 才能更宽，但它的面板不在 Tab 顺序里，焦点进出要宿主写。
   - 推荐：默认用菜单方案，宽面板仅作可选。
4. **（中）TxNavBar 的左右插槽被包在 `<button>` 里。**
   - 不能嵌套交互元素；只有图标时没有可访问名；默认文案是英文。
   - 根节点在模板内 `z-index: 2000`。
   - 窄档的菜单和通知因此交给 TxDrawer。
5. **（中）TxSteps 无 emit、TxForm 只在 `validate()` 时校验且默认文案是英文、TxTabs 无减弱动效且 `name` 即标签。** 都有宿主层绕法，见各 cheat sheet。
6. **（中）登录形态。**
   - 真实 Nexus 登录没有密码。
   - 用密码框会带来浏览器「保存密码」提示的风险。
   - TxSensitiveInput 在输入时是明文，而且 Esc 会连带收起展开浮层。
   - 建议：照 Nexus 做 Passkey / OAuth / Magic Link。
7. **（中）新增的减弱动效与可访问性缺口。**
   - 减弱动效：
     - TxBlockSwitch 的 loading 闪光（`TxBlockSwitch.vue:131`）
     - TxIconMorph 默认 `reducedMotion='never'`（`TxIconMorph.vue:25`）
     - TxGlowText 在减弱动效下留一条静态光带（`TxGlowText.vue:285-297`）
     - TxDrawer / TxModal 无兜底（design §6.11）
   - 可访问性：
     - TxTuffLogoStroke 的英文 aria-label 写死（`:57`）
     - TxBlockSwitch 的开关读屏名为「Toggle」
     - TxNavBar、TxInput `capsLockText`、TxTagInput 的「Remove tag」都是英文默认值
   - 建议：并入 design §6.11 的「已知 tuffex 缺陷」表。
8. **（中）并行会话的未提交改动。**
   - 涉及：TxGlowText、TxGradientBorder、TxKeyframeStrokeText、TxEmptyState、TxStatusBadge 等。
   - dist 09-24 07:31 已包含前三者；TxEmptyState 在 07:44 又改过一次。
   - 截图验收要等这些改动落地并重建 dist 之后再做；如果被回滚，TxKeyframeStrokeText 的测量偏移 bug 会回来。
   - 如果用 TxModeChip，dev server 需要重启才能拿到它的依赖样式（`tuffex-docs-sync.md:111-115`）。
9. **（中）不示范自动授予权限。** Onboarding 的流程演示在权限步骤停下等读者，与 §6「安全闸门不自动放行」保持一致；权限状态一律标「模拟」。
10. **（低）两套令牌并存。** TxSparkChart、TxFilterChips 用 BUI 的蓝；TxButton、TxTabs、TxSteps 用 `--tx-color-primary`。同屏会出现两种蓝，这是第一批 R9 就有的问题，按第一批的结论处理。
11. **（低）外链与导航。**
    - 产品格子、「文档 / 更新日志」、Magic Link 都不能真的导航，一律用 TxToastPanel 反馈「宿主会打开 …（演示）」。
    - TxBreadcrumb 不传 `href`。
    - 不引用外网图片：头像用首字母，LINUX DO 标志用内联 SVG。
12. **（低）不能出现价格与套餐。** 依据是 `apps/nexus/AGENTS.md:34-35`。两个模板里都不能出现套餐、席位、价格、升级、试用等字样；第一批 Shell 的「Team 套餐」文案不要照抄。
13. **（低）TxCard 的包含块与层叠。** 根节点常驻 `transform` / `will-change`，每张卡都是层叠上下文，卡内的非 teleport 弹层会受影响；卡内控件只用会 teleport 的菜单。
14. **（低）TxAvatarGroup 的 `+N`。** 它的 `overflowPopover` 只能 hover 打开，而 `+N` 不可聚焦；在线人数要另外写成可读文字。
