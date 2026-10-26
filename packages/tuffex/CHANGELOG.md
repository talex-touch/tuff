# TouchX UI 更新日志

## [Unreleased]

### 📦 组件变动 (Components)

- **新增组件**: `drawer-form`, `image-preview`, `modal-form`, `steps-form`
- **更新组件**: `attachment-tray`, `avatar`, `base-surface`, `charts`, `checkbox`, `command-palette`, `dialog`, `drawer`, `flip-overlay`, `form`, `group-block`, `image-gallery`, `input`, `modal`, `motion-transition`, `number-input`, `radio`, `select`, `sensitive-input`, `stream-markdown`, `switch`, `textarea`

### ✨ 组件增强

- 重写 `TxForm` 与 `TxFormItem`。`layout` 设定字段布局（`auto` / `side` / `stacked` / `inline`，默认 `auto`）：`auto` 按表单自身的宽度（容器查询）在 520px 及以上把 label 放在左侧、更窄时放到上方，侧边布局的各项经 subgrid 共享 label 列，`labelWidth` 是这一列的最大宽度；另有 `labelAlign` 与 `requiredMark`（标星号、给选填项标「选填」或都不标），表单项新增 `width`（`xs` / `sm` / `md` / `lg` / `full`）与 `help`。规则新增 `type`（`email` / `url` / `number` / `integer`）、`min` / `max`、`minLength` / `maxLength` 与 `pattern`，`level: 'warning'` 只提示、不阻止提交，`deps` 在所依赖的字段变化时重新校验已显示消息的本字段；validator 收到 `{ signal, path }`，声明为 `async` 的在同步规则通过后运行，输入时防抖 300 ms、值变化时中止，超过 1 秒显示 `messages.validating`。`schema` 接受任意 Standard Schema v1 校验器（Zod、Valibot、ArkType 等），按路径把问题交给对应字段。消息在用户改过字段并离开后出现（`validateOn="submit"` 时改为首次提交后），此后随编辑更新。原生提交先校验，全部通过才调用 `@submit` 处理函数并等待它返回的 Promise，失败时焦点移到错误摘要或第一个出错的字段；处理函数里的 `setErrors()` 把服务端错误交还给对应字段，`setRootError()` 设置表单级错误。`setBaseline()` 写入取回的数据，用户改过的字段默认保留，由 `reconcile` 决定其他取舍，`reset()` 回到基线。新增暴露 `submit`、`reset`、`validateField`、`setBaseline`、`setErrors`、`setRootError` 与只读的 `dirty`、`valid`、`submitting`、`submitted`、`errors`、`rootError`，默认插槽带同样的状态，`resetFields` 保留为 `reset` 的旧名。字段路径可以嵌套（`meta.homepage`、`links[0].url`），字段 id 为 `<表单 id>-<prop>`，消息经 `aria-describedby` 关联，并带屏幕上隐藏的错误、警告前缀。新增 `TxFormRow`（一行放多个字段，放不下时换行）与 `TxFormErrorSummary`（列出错误并链接到对应字段）。内置文案由 `messages` 覆盖，默认为英文（`FORM_DEFAULT_MESSAGES`），`provideTxFormHost()` 为一个组件树或整个应用提供当前语言的文案，它也从 `@talex-touch/tuffex/utils` 导出，应用启动时提供它不会带上表单。新增导出 `TxFormRow`、`TxFormErrorSummary`、`FORM_DEFAULT_MESSAGES`、`provideTxFormHost`、`useTxFormField` 及配套类型。**行为变化**：未设 `labelPosition` 的表单此前固定把 label 左对齐放在左侧，现在是 `auto` 布局、侧边 label 右对齐，传 `label-position="left"` 恢复；`labelWidth` 由 label 的固定宽度改为 label 列的最大宽度；`required` 把 `false` 也视为空值，未勾选的复选框不再通过；原生提交此前被阻止、什么都不做，现在会校验并调用 `@submit`。
- `TxInput`、`TxTextarea`、`TxNumberInput`、`TxSensitiveInput`、`TxSelect`、`TxCheckbox`、`TxSwitch` 与 `TxRadioGroup` 放在 `TxFormItem` 里时自动接入：由表单项的 label 命名（`for` 或 `aria-labelledby`），经 `aria-describedby` 关联消息，取得 `aria-invalid` 与必填，并读取表单的 `disabled`（`TxSwitch` 与 `TxSensitiveInput` 另读取 `size`），显式传入的属性优先；所在字段显示错误时，`TxInput` 与 `TxNumberInput` 改用危险色边框与焦点环，`TxSelect`、`TxTextarea` 与 `TxSensitiveInput` 进入 `error` 状态。自定义控件调用 `useTxFormField()` 接入，它也从 `@talex-touch/tuffex/utils` 导出，按需引入控件时不会带上表单。`TxBlockSlot`、`TxBlockInput`、`TxBlockSelect` 与 `TxBlockSwitch` 新增 `prop`、`rules` 与 `required`：设了 `prop` 的行加入外层 `TxForm`，标题命名控件，错误或警告显示时替换描述，`required` 在标题后显示星号。
- `TxForm` 新增草稿（`persist`）：以表单的 `id`（不同记录另加 `recordId`）保存用户输入，刷新页面或关掉标签页后再打开都能找回。停止输入 300 ms 后写入，持续输入时至少每 2 秒写一次，页面隐藏时也写，提交成功或 `reset()` 后删除；默认存进 `localStorage`，可改为 `session`、`memory` 或自定义存储，`version` 变化或超过 `ttl`（默认 7 天）的草稿被丢弃。草稿只填入用户没动过的字段；写入后又被保存过的字段留在表单上方的提示中由用户恢复（`restore: 'manual'` 时全部等用户恢复），或以 `source: 'draft'` 交给 `reconcile` 做三方合并，提示可经 `draft` 插槽替换。密码输入框、`TxSensitiveInput`、`autocomplete` 要求密码、一次性验证码或银行卡信息的输入框、`persist` 设为 `false` 的表单项与 `exclude` 路径不进草稿，自定义控件经 `useTxFormField(kind, { sensitive })` 声明。草稿按宿主给出的 `namespace`（如 `user:42`）分开存放，尚不知道时传 `null`，期间不保存。带着草稿存不下的修改离开时才询问：刷新或关闭页面由浏览器询问；应用内离开（切换路由、关闭弹层）前调用 `confirmLeave()`，依次由新增的 `leaveConfirm`、宿主提供的询问或 `window.confirm` 询问；`leaveConfirm` 设为 `false` 从不询问，适合筛选栏。新增暴露 `draft`、`flush`、`confirmLeave`、`restoreDraft`、`discardDraft`，事件 `persist-error`，导出 `flushTxForms`（立即写入所有表单的草稿，用于页面会被直接关掉的场合）、`clearTxFormDrafts` 及配套类型；`provideTxFormHost()` 另可提供 `namespace`、`storage` 与 `leaveConfirm`。
- `TxModal` 与 `TxDrawer` 新增 `beforeClose`：遮罩、Escape 与关闭按钮先询问它，返回 `false` 或解析为 `false` 的 Promise 时保持打开，原因为 `'escape'`、`'mask'` 或 `'close'`；直接修改 `modelValue` / `visible` 不询问。新增类型导出 `DrawerCloseReason`。
- 新增 `TxModalForm` 与 `TxDrawerForm`，在对话框或抽屉里编辑一条记录。以 `v-model`（抽屉为 `v-model:visible`）打开，每次打开都编辑 `initialValues` 的一份副本，所以不收 `model`；打开期间 `initialValues` 变化（例如记录还在加载）时作为基线写入，用户改过的字段保留。提交成功才关闭并触发 `submit-success`，提交进行中不能关闭；遮罩、Escape、关闭按钮与取消按钮先经表单的 `confirmLeave()` 询问。保存与取消按钮的文案由 `submitText` / `cancelText` 设定，`TxModal` / `TxDrawer` 的其他属性经 `modalProps` / `drawerProps` 传入。其余属性与 `TxForm` 相同，`autosave` 除外。
- 新增 `TxStepsForm` 与 `TxFormStep`，把一个表单分成几步，步骤条由 `TxSteps` 绘制。「下一步」只校验当前一步的字段，通过后焦点移到下一步；最后一步提交整个表单，有字段出错时回到它所在的一步并聚焦它。当前步骤可经 `v-model:active` 控制，开启 `persist` 时草稿记下所在的步骤，恢复草稿时回到那一步。按钮文案由 `prevText`、`nextText` 与 `submitText` 设定。其余属性与 `TxForm` 相同，`autosave` 除外。
- `TxForm` 新增 `autosave`（`true` 或 `{ delay }`）：编辑停顿 1 秒（或 `delay` 毫秒）后经 `onSubmit` 保存，表单内的提交改为立即保存。只校验改过的字段，出错或异步校验未完成的字段保留已保存的值、其余字段照存，保存结果由读屏播报（`messages.autosaved` / `autosaveFailed`）。新增 `readonly`：表单里读取表单状态的控件能聚焦、能复制、不能修改，字段不再标必填，提交照常可用；`TxCheckbox`、`TxRadio`、`TxSelect` 与 `TxSwitch` 只读时去掉悬停与按下反馈，自定义控件从 `useTxFormField()` 读取 `readonly`。新增事件 `submit-success`，在提交或自动保存成功后触发。离开字段时鼠标仍按着的（例如按在字段下方的提交按钮上），消息等松手、点击处理完再显示，免得消息把按钮推开、这次点击落空。草稿存储新增可选的 `keys(prefix)`；`clearTxFormDrafts()` 的 `namespace` 可传函数，清掉它接受的所有命名空间的草稿（例如启动时清掉当前账号以外的所有账号），存储没有 `keys` 时给出警告并跳过。新增类型导出 `FormAutosaveOptions`。
- 新增 `TxImagePreview` 全窗口图片预览，一次看一张，左右相邻的图片候在两侧。滚轮以指针为中心缩放，触控板捏合与 ⌘/Ctrl + 滚轮跟手缩放，放大后拖动平移、松手滑行；未放大时横向拖动或一划翻页，上下拖走关闭。触屏双指捏合、双击放大或恢复、单击隐藏或显示控件，长按 480 ms 弹出操作菜单。传 `origin` 时图片按缩略图的裁切与圆角飞出、关闭时飞回，越过终点的程度由 `bounce` 控制（默认 `0.2`）。`actions` 逐项开关旋转、复制、分享与下载，右键或菜单键打开同一组操作的菜单（`contextMenu`），`action` 事件在执行前触发，`preventDefault()` 后由宿主处理。底部条用缩略图或圆点（`indicator`）。工具栏的比例读数打开缩放菜单，列出「适应屏幕」（`resetLabel`）与 25%、50%、100%、200% 直到 1600% 中比整张大、不超过 `maxScale` 的几档，当前比例打勾。放大后右下角的小地图（`minimap`）显示整张图片并框出画面中的部分，点按或拖动它移动画面，在它上面滚动滚轮以画面中心缩放。遮罩默认 `refraction` 材质、控件默认 `blur` 材质，各有颜色、不透明度与模糊半径可调。宽度不超过 640px 或高度不超过 480px 时改用手机版式。所有文字与可访问名称都是 props，另有 `counterFormatter`、`scaleFormatter`、`indicatorItemFormatter`、`labelFormatter` 与 `readoutLabelFormatter`。
- `TxImageGallery` 与 `TxAttachmentTray` 改用 `TxImagePreview`：图片从点开的缩略图飞出、关闭时飞回。两者新增 `previewProps`，把预览的其余选项（操作、底部条、动效与材质）原样传入，新增 `action` 事件转发预览的操作；`TxAttachmentTray` 另新增 `openLabelFormatter`，由图片名生成缩略图的 `aria-label`（默认 `` (name) => `${previewTitle}: ${name}` ``）。原内部预览器 `ImageGalleryViewer` 移除，它不在包的导出中。预览在第一次要用时才加载：指针移到画廊或托盘上、焦点进入其中，或按下缩略图时开始，加载完成前按下的那张在加载完成后打开。预览的样式在 `image-preview` 的样式表里，按需样式插件让它们随预览一起加载（见「按需样式」）；手动引入样式时需另引 `@talex-touch/tuffex/image-preview/style.css`，以及它依赖的 `base-surface`、`flow-light` 与 `glass-surface` 的样式表。
- `TxTimeseriesChart` 的 `labels` 新增 `loading` 与 `more`：加载骨架的可访问名称（默认 `Loading chart`）与 tooltip 里收起多余序列的那一行（默认 `` (n) => `+${n} more` ``）此前写死为英文，现在可以换成界面语言的文案。`TxTimeseriesSkeleton` 单独使用时以新增的 `label` 命名。新增导出 `TimeseriesChartLabels` 与 `TIMESERIES_DEFAULT_LABELS`。
- `TxSankeyChart` 的 `labels` 新增 `value` 与 `items`：默认 tooltip 里数值行的名称（默认 `Value`）与可下钻节点的条目数（默认 `` (n) => `${n} items` ``）此前写死为英文，现在可以换成界面语言的文案。
- `TxMonoChart` 新增 `formatX`：横轴标签与提示标题里的 x 值经它写出（默认 `String`），例如把时间戳写成日期；此前以毫秒数原样显示。
- `TxDrawer` 面板默认改用实色材质：`surface` 的默认值由 `refraction` 改为 `pure`，以 `surfaceColor`（默认 `--tx-drawer-panel-background`）不透明铺底，正文不再透出后面的页面。需要琉光的传 `surface="refraction"`；`panelTransparent` 与 `surfaceOpacity` 只作用于 `mask`、`blur`、`acrylic`、`glass` 与 `refraction`。`TxDrawerForm` 随之改变。

### 🐛 组件修复

- `TxModal`、`TxDrawer`、`TxMotionTransition` 与 `TxCommandPalette` 的 Tab 循环改用同一套规则：只停在显示出来、排在 Tab 顺序里的控件上，跳过隐藏的（`display: none`、`visibility: hidden`）、`inert` 里的与 `tabindex="-1"` 的控件，可编辑区域（`contenteditable`）也算一站。此前最后一个控件是隐藏的、在 `inert` 里的或 `tabindex="-1"` 的按钮时，从前一个控件按 Tab 会走出对话框，从第一个控件按 Shift+Tab 会停在原处或落到那个按钮上（`TxMotionTransition` 已跳过 `display: none` 与 `inert`，`TxCommandPalette` 已跳过 `tabindex="-1"`）；排在最后的可编辑区域用 Tab 到不了（`TxDrawer` 只认 `contenteditable="true"`）。`TxDrawer` 此前还跳过 `aria-hidden="true"` 的控件，现在与其他三个一样停在上面。`TxModal` 与 `TxDrawer` 关闭后把焦点还给打开前的元素时不再滚动页面。
- `TxDrawer` 打开时焦点移进抽屉。此前聚焦时根节点的 `visibility` 过渡还在起点、抽屉仍是隐藏的，聚焦没有效果，焦点留在抽屉后面打开它的控件上。
- `TxCommandPalette` 的 Tab 与 Escape 改在 document 上监听，在面板位于最上层时生效：焦点不在面板里时（例如点了面板的空白处，或 `autoFocus` 为 `false`），Tab 进到面板的第一个控件，Shift+Tab 进到最后一个，Escape 照样关闭面板。此前 Tab 只在焦点位于面板内时被拦住，否则在后面的页面上移动；Escape 只在搜索框里有效。关闭或卸载后焦点回到打开前的元素，不滚动页面；此前焦点落到 `body` 上。
- `TxModal` 与 `TxCommandPalette` 关闭后的离场过渡（200 ms 与 340 ms）里设为 `inert`，指针与焦点落到下面的一层，它也不再算作最上层的对话框。此前叠在 `TxDrawer` 等对话框上关闭时，这段时间里第二次按 Escape 关不掉下面那层，Tab 不在其中循环，点按落在正在淡出的遮罩上。
- `TxBottomDialog`、`TxBlowDialog`、`TxPopperDialog`、`TxTouchTip` 与 `TxFlipOverlay` 一开始关闭就把焦点还给打开前的元素，离场期间（`TxFlipOverlay` 为卡片飞回原处的这段时间）设为 `inert`，指针与按键落到下面的一层，它也不再算作最上层的对话框。此前叠在 `TxDrawer` 等对话框上关闭时，离场期间第二次按 Escape 让 `TxBottomDialog`、`TxBlowDialog` 与 `TxPopperDialog` 再关闭一次（`close` 回调执行两次），下面那层仍然开着；点按落在正在离场的面板上，焦点等离场结束才回去。五者打开期间 Tab 与 Shift+Tab 留在其中循环，此前会走到后面的页面上；归还焦点时不再滚动页面。`TxBottomDialog` 离场期间不再走完倒计时、替用户按下按钮。`TxFlipOverlay` 以 `modelValue` 为 `true` 挂载时焦点同样移进卡片，打开中被卸载时焦点回到打开前的元素；叠开的浮层里上面那个飞回期间，点按交给下面那个的遮罩，此前仍落在飞回的那个上，再关一次。
- `TxDrawer`、`TxModal`、`TxCommandPalette`、`TxMotionTransition` 与 `TxMermaidBlock` 判断自己是否位于最上层时，按各层祖先上设置的 z-index 逐级比较。`TxTouchTip` 与 `TxFlipOverlay` 的层级设在外层包裹或遮罩上，对话框本身没有 z-index，此前叠在这几者上打开时，下面那层仍认为自己在最上层：一次 Escape 把两层一起关掉，Tab 落进下面那层。
- `TxBottomDialog` 与 `TxTouchTip` 打开期间锁住页面滚动，与 `TxFlipOverlay` 共用一个计数，叠开时最后一个关闭才解锁。此前两者在页面滚动时把页面拉回顶部：在滚下去的页面上打开，第一下滚轮就让页面跳到顶部。`TxMermaidBlock` 的全屏预览打开期间同样锁住页面滚动，此前在遮罩上滚动或滚过高图表的末尾时，后面的页面跟着滚。
- `TxAvatar` 的图片加载失败后，换一个 `src` 会重新加载图片。此前一直显示回退内容，直到组件重新挂载。
- `TxImageGallery` 的缩略图加载失败后显示占位图标，与 `TxAttachmentTray` 一样和预览共用失败记录：预览打开这张时直接显示失败占位，预览先发现的失败也让缩略图换成占位，不再请求。此前缩略图显示浏览器的破图标记，预览打开时把这个地址再加载一次。`previewProps` 不再接受 `failed`，由画廊设置。
- `TxChoroplethMap` 与 `TxBubbleMap` 放在缩放过的容器里（祖先的 `transform: scale()` 或 CSS `zoom`）时，指针位置按地图自身的像素换算：缩放以指针下的点为中心，拖动 1:1 跟手，提示框贴着指针。此前按屏幕像素计算，在放大 2 倍的容器里拖动时地图走两倍的距离，缩放中心偏离指针，提示框也远离指针。
- `TxMermaidBlock` 的全屏预览补上焦点管理：打开时焦点移到关闭按钮，Tab 留在预览内，在关闭按钮与图表之间切换，比屏幕高的图表 Tab 到后用方向键滚动；关闭后焦点回到图表。Escape 只在预览位于最上层时关闭它，此前叠在上面的对话框收到的 Escape 会连预览一起关掉。预览改为打开时才挂到 `body` 上，宿主清空过 `body` 后再打开或关闭预览不再抛错。
- `TxFlipOverlay` 的 `source` 是元素、又被滚动容器裁掉一部分时，卡片从露出来的部分飞出、飞回。此前从整个元素的位置起飞，被裁掉的部分在第一帧突然出现在容器外。
- `TxBaseSurface` 在强制颜色模式（如 Windows 高对比度主题）下改为实色 `Canvas` 填充，并加一圈 `CanvasText` 描边，模糊、着色与描边各层不再绘制。此前系统调色板保留了材质的半透明与背景模糊，文字底下透出被模糊的页面，阴影去掉后浮层也没有边界。

### 按需样式

- 组件在第一次用到时才加载的同包组件（如 `TxImageGallery` 与 `TxAttachmentTray` 的预览），样式随这次加载进入页面，不再计入首屏：构建时插件把被加载组件的样式闭包并进包内的这次 `import()`；`vite serve` 下依赖预构建不经过插件，改为随发起加载的组件一起引入。新增 `dist/es/style-lazy-deps.json`（`dist/lib` 下同），记录每个组件用到时才加载的组件，`style-deps.json` 只记静态依赖；手动引入样式时，两份文件里的闭包都要引入。

## [0.9.1] - 2026-10-21

### 📦 组件变动 (Components)

- **更新组件**: `base-surface`, `card`, `glass-surface`

### ✨ 组件增强

- `TxBaseSurface` 的 `refractionRenderer` 默认值由 `'svg'` 改为 `'css'`，此前 `'css'` 不起作用。`css` 渲染器只画滤镜层、着色、光晕与描边，不跑 SVG 位移滤镜；`svg` 渲染器另加 SVG 位移（玻璃）层，新增 `refractionGlassOpacity` 控制它的不透明度（0–1，默认 `0.3`）。`TxCard` 新增同名的 `refractionRenderer` 与 `refractionGlassOpacity`，转发给表面。**行为变化**：`refraction` 材质默认不再画 SVG 位移层。纯色或内容少的底上看不出差别；有内容的底上原先能看到的折射与色散，需要传 `refraction-renderer="svg"`，传 `:refraction-glass-opacity="1"` 恢复完整强度。`glass` 材质照常画玻璃层。
- 新增页面级的极致性能模式：`setSurfacePerformanceMode('max')` 让所有表面的 `refraction`、`glass`、`acrylic`、`blur`、`mica` 换成 `flat`，开没开 `autoDetect` 都生效，铺在系统材质上的表面（`systemBackdrop`）不受影响；传 `'default'` 恢复。新增导出 `setSurfacePerformanceMode`、`getSurfacePerformanceMode` 与 `SurfacePerformanceMode` 类型，`getSurfaceEnvironment()` 多返回一个只读的 `performanceMode`。

### 🐛 组件修复

- `TxGlassSurface` 的位移图改为长边不超过 256px 的位图，按容器的长宽比画出后拉伸铺满。此前位移图是与容器同尺寸的 SVG：Chromium 每出一帧都要在 CPU 上把它栅格化后随合成帧提交，1526×1886 的面板每帧约 100–200ms，页面滚动、悬停、动画都掉到个位数帧率。改后每帧不到 1ms，位移结果与此前相差在一个量化步长内。拿不到 2D canvas、或浏览器不走 SVG 滤镜路径时，仍用 SVG 位移图。
- 卡片外层被宿主用 `overflow: hidden` 裁切，或放在另一层圆角裁切容器里时，`TxCard` 的 SVG 玻璃层不再消失。Chromium 在超椭圆（`corner-shape`）的溢出裁切下会整条丢掉 `backdrop-filter: url()`，但每帧照样付出代价；`TxCard` 画玻璃层时（`background="glass"`，或 `refraction` 配 `svg` 渲染器），卡片与表面改用同一半径的圆角，与超椭圆轮廓相差约 0.3px。

## [0.9.0] - 2026-10-20

### 📦 组件变动 (Components)

- **更新组件**: `alert`, `allocation-bar`, `attachment-tray`, `base-surface`, `card-spread`, `carousel-3d`, `charts`, `command-palette`, `dialog`, `drawer`, `fine-tune-card`, `flip-book`, `image-gallery`, `markdown-editor`, `modal`, `motion-dock`, `physics-motion`, `stream-element`, `stream-markdown`, `stream-text`, `thinking-orb`, `toast`

### ✨ 组件增强

- `TxThinkingOrb` 新增 `variant="gradient"` 彩色渐变变体：每个点按它在画面中的横向位置从 `palette` 的色标取色，球转动时颜色随之流动，原有的远近明暗不变；深色背景下各点保持原来的亮度，最近的点接近白色，浅色背景下色标略微加深以保持对比。`palette` 接受九组内置配色名（`amber`、`glacier`、`violet`、`rose`、`magenta`、`teal`、`indigo`、`lagoon`、`forest`）或从左到右排列的 CSS 颜色数组（不解析 `var()`），未传时每种形态使用各自的配色；内容相同的新数组不会重启绘制。新增导出 `ORB_PALETTES`、`ORB_STATE_PALETTES` 及 `OrbVariant`、`OrbPaletteName`、`OrbPalette` 类型，状态文字可以取同一组色标做渐变。默认的 `mono` 绘制与此前一致。
- 重构 `TxAttachmentTray`：移除/取消按钮移到缩略图右上角内侧，使用 SVG 图标，悬停或键盘聚焦时出现、触屏上常显；可移除时上传结束后同一按钮由「取消上传」改为「移除」，焦点不丢。图片预览改用 `TxImageGallery` 的预览器（见下条），加载占位的比例取图片附件的 `width` / `height`，未给时沿用上一张已加载的图片；图片加载失败时缩略图也显示占位图标，同一地址不再重试；点击缩略图时先让它获得焦点，关闭预览后焦点在 WebKit 中也能回到缩略图；上传中的文件胶囊显示细进度条；所有按钮带 `:focus-visible` 焦点环，过渡只在未开启减少动态效果时生效。新增 CSS 变量 `--tx-attachment-tray-thumb-size`（默认 `72px`）。预览器的样式随 `image-gallery` 的样式表提供：按需样式插件会一并加载，手动引入样式时需另引 `@talex-touch/tuffex/image-gallery/style.css`。新增 `closeLabel`（预览关闭按钮的可访问名称，默认 `'Close'`），其余 props、事件与导出不变。
- `TxImageGallery` 的灯箱与 `TxAttachmentTray` 共用同一个内部预览器：焦点在灯箱内时可用 ← / → 翻页，翻到两端时焦点移到另一侧按钮；图片加载完成前按上一张已加载图片的比例留出位置，150 ms 后仍未加载才显示闪烁占位，翻回已加载的图片直接显示，减少动态效果时不闪烁；预览图加载失败时显示占位图标，同一地址不再重试；底栏计数改为 `aria-live="polite"` 区域；翻页按钮带 `:focus-visible` 焦点环。新增 `closeLabel`（预览关闭按钮的可访问名称，默认 `'Close'`），其余 props、事件与导出不变。
- `TxModal` 新增 `closeLabel`：头部关闭按钮的可访问名称，默认 `'Close'`，此前写死为英文；`TModal` 同步转发。
- 此前写死为英文的图标按钮名称改为可传入的 props，默认值与此前一致：`TxDrawer` 新增 `closeLabel`（默认 `'Close drawer'`）；`TxAlert` 与 `TxBottomDialog` 新增 `closeLabel`（默认 `'Close'`）；`TxToastHost` 新增 `ariaLabel`（通知区域名称，默认 `'Notifications'`）与 `closeLabel`（每条通知的关闭按钮，默认 `'Dismiss notification'`）；`TxMermaidBlock` 新增 `zoomLabel`、`previewLabel`、`closeLabel`、`errorText`，以及渲染失败后源码复制按钮的 `copyLabel` / `copiedLabel`；`TxCodeBlock` 新增复制按钮的 `copyLabel` / `copiedLabel`（默认 `'Copy'` / `'Copied'`）与预览框名称的 `frameLabelFormatter`（默认 `` (lang) => `${lang} preview` ``）；`TxStreamMarkdown` 新增 `codePreviewText`、`codeSourceText`、`codeFrameLabelFormatter`、`copyCodeText`、`copiedCodeText`、`diagramZoomLabel`、`diagramPreviewLabel`、`diagramCloseLabel`、`diagramErrorText`，只转发给内置的 `TxCodeBlock` 与 `TxMermaidBlock`，自定义渲染器仍只收到 `StreamMarkdownBlockContext`；`TxFineTuneCard` 新增 `layoutLabels`，按 `row` / `col` / `grid` 覆盖三个布局选项的名称，未给的沿用 `'<layout> layout'`；另新增 `valueLabelFormatter`，由标签生成四个数值框的 `aria-label`（默认 `` (label) => `${label} value` ``）。
- 重写 `TxMarkdownEditor`：所见即所得改为按块渲染，光标进入加粗、链接、行内公式等格式时露出 Markdown 标记，可直接编辑；源码模式由 `<textarea>` 改为按需加载的 CodeMirror 6；三种模式共用同一份文档与撤销历史。新增 props：`math`（`$…$` / `$$…$$` 经 KaTeX 渲染）、`emoji`（`:shortcode:` 渲染、`:` 补全与表情选择器）、`highlight`（`==text==` 与五色高亮笔）、`callouts`（GitHub 式 `[!NOTE]` 等提示块）、`slash`（段首 `/` 打开块菜单）、`bubble`（选中文字浮出格式条）与 `statusBar`（字数、字符数与协同者），均默认开启；`codeTheme`（代码块语法高亮预设 `github` / `one` / `vitesse` / `catppuccin` / `solarized`，随编辑器明暗切换，默认 `github`，`none` 关闭）；`ai`（格式条里的 AI 改写，可流式返回，查看逐词改动后替换、插入到下方、重试或放弃）、`comments`（评论线程，锚点随本地与远端编辑移动，原文被删时显示为已脱离；`user` 为本地作者，也是协同者看到的身份）与 `collaboration`（多人协同的变更集传输接口：编辑器只产出和应用变更集，并发变换交给适配器），不传则不启用；`uploadImage`（粘贴、拖入或选择的图片先以带进度的占位插入，完成后换成返回的地址，删除占位即中止上传），不传时图片按钮改为填写地址；`labels` 覆盖全部界面文字。未传 `linkPrompt` 时使用内置的链接输入框，此前链接按钮不起作用。新增事件 `update:comments`、`comment-create`、`comment-reply`、`comment-resolve`、`comment-delete`、`upload-error`、`ai-error`；暴露方法新增 `getSelection`、`setSelection`、`insert`，`setValue` 改为同步，并作为一次编辑发给协同者。工具栏新增 `highlight`、`taskList`、`image`、`table`、`codeBlock`、`math`、`divider`、`emoji`，原有键名不变。任务列表的勾选框改用 `TxCheckbox` 的外观与勾选动效，只有被点击的那个框播放动画，可编辑时在预览模式下也能点击切换。新增导出 `MARKDOWN_EDITOR_DEFAULT_LABELS`、`MARKDOWN_EDITOR_HIGHLIGHT_COLORS`、`MARKDOWN_EDITOR_CALLOUT_TYPES`、`MARKDOWN_EDITOR_CODE_THEMES`、`MARKDOWN_EDITOR_AI_ACTIONS`，变更集工具 `applyMarkdownChanges`、`composeMarkdownChanges`、`mapMarkdownPosition`、`transformMarkdownChanges`，以及配套类型。
- `charts` 新增 `TxLearningCurve` 学习曲线，按训练步数比较多次运行：`smoothing`（0–0.99，默认 `0.6`）与 TensorBoard 相同，是去偏的指数移动平均，`0` 画原始值；`seeds` 传同一运行的多个种子，画成均值与 ± 一个标准差区间，单个种子传 `data`；`showRaw` 在平滑线下画淡色原始值，`showBand` 控制区间；`xType="log"` 使用对数步数轴，第 0 步及以下不画；步数刻度默认写作 `200k`、`1.5M`。读数时 tooltip 列出各运行的平滑值、区间与原始值，并强调离指针最近的运行；`v-model:hidden-runs` 与 `highlightedRun` 接图例。缩放与平移和 `TxTimeseriesChart` 相同（见下文），`v-model:window` 读写步数窗口，窗口停在最后一步时随新数据前进；数值轴适配视图内画出的数据，变化时以弹簧过渡；点数超过绘图区宽度四倍时按像素列保留首、尾、最低与最高点。新增导出 `smoothEma`、`aggregateSeeds`、`LEARNING_CURVE_DEFAULT_LABELS` 及 `LearningCurveRun`、`LearningCurveLabels`、`LearningCurveProps`、`RunCurve`、`CurvePoint`、`TxLearningCurveInstance` 类型。
- `TxChart` 新增图上读数（`interactive`，默认 `true`；`false` 为不可聚焦的静态图）：按住拖动越过 4px 后捕获指针连续读数，拖出绘图区停在边缘数据，拖动结束时的点击被吞掉，不会传到图表或外层元素；触屏与触控笔按下即读、横向拖动扫读，纵向滑动仍滚动页面（`touch-action: pan-y`）。有数据可读的图表可用 Tab 聚焦（此前只有设置了 `ariaDescription` 的图表可聚焦），← / → 逐个数据读数，Home / End 跳到首尾，Escape 清除，读数经 `aria-live` 区域播报，`announce` 定制播报文字；此时 svg 的 `role` 由 `img` 改为 `group`，名称取 `ariaDescription`，缺省为 `labels.chart`，按键说明作为描述。`labels` 覆盖名称与按键说明，新增导出 `CHART_DEFAULT_LABELS` 与 `ChartLabels` 类型。`xType` 新增 `'log'`（以 10 为底，x ≤ 0 的数据不画）。图表上下文新增 `pointer.pressed`、`pointer.source`、`nearestXStop`、`registerKeyLayer`、`announcement`，自定义图层可接入同一套读数，新增类型导出 `ChartGesture`、`ChartKeyLayer`。
- `TxTimeseriesChart` 新增图上缩放与平移（`zoom`，默认 `true`）：拖过一段时间放大到该范围；放大后拖动平移，越过两端回弹，松手后滑行，按住 Shift 拖动仍是刷选；⌘/Ctrl + 滚轮或捏合以指针为中心缩放，触控板横向滑动平移，双击显示全部；聚焦时 `+` / `-` 缩放，Shift + ← / → 平移，`0` 显示全部。缩放用阻尼比 1、响应 0.35 s 的弹簧过渡，触控板捏合与平移 1:1 跟手，`prefers-reduced-motion: reduce` 下直接落到目标视图、松手后不滑行。新增 `v-model:window`（`[number, number] | null`）读写可见时间窗口，窗口停在数据末端时随新数据前进；新增 `labels`。**行为变化**：此前只有监听了 `time-range-change` 才能刷选，松手只上报范围；现在默认可刷选，松手后照常触发 `time-range-change`，并放大到该范围，只需刷选时传 `:zoom="false"`。刷选的起拖阈值由 3px 改为 4px。
- `TxArcSeries` 按住拖动时按角度读取扇区，像转盘一样绕环扫读，拖动结束不触发 `slice-click`；图表聚焦时 ← / → 逐个扇区读数，Home / End 跳到首尾，Escape 清除；新增 `announce`（默认 `name: value`）定制播报文字。
- `TxMonoChart`：按住拖动连续扫读图形，读数吸附到指针下或最近的数据、不做缓动，拖出绘图区停在边缘数据；触屏/触控笔按下即读、横向拖动扫读，纵向滑动仍滚动页面；Escape 清除读数或取消拖动；拖动结束不触发 `select`。
- `TxAllocationBar`：在条上按住拖动逐段选中指针下的分段（每越过一段发一次事件，拖出两端停在首尾段，焦点在组内时跟随）；Escape 或指针取消时退回起点；拖动期间关闭过渡、1:1 跟手。
- `TxDitherChart`：时间类图形改为在图上按住拖动移动日期游标（逐点吸附、拖出边缘停在首/末点），取代外置日期滑块；其他图形拖动时按悬停方式读数；`labels.cursor` 随滑块弃用（仍可传，不再渲染）。
- `TxMonoChart`、`TxAllocationBar`、`TxDitherChart` 的读面统一为十字光标与 `touch-action: pan-y`，共用内部 `utils/press-scrub.ts`（越过 4px 才捕获指针、吞掉拖动结束的点击、Escape 取消）。
- 重新设计 `TxMotionDock`：底板改用 `TxBaseSurface` 材质，新增 `surface`（默认 `'refraction'`）；底板静止高度固定，放大的图标向上越出底板，应用栏在底板上方预留放大所需的高度；每项只留一层图标块，字号为项目尺寸的 56%，插槽里 1em 的图标随放大同步变大；悬停或键盘聚焦时在图标上方显示名称气泡（触屏点按不会留下气泡），`showLabels` 时名称改在底板下方，宽度不超过图标加一个间距，过长截断；当前项改为图标下方的指示圆点，取代原来的蓝色描边。放大衰减由线性改为余弦曲线，峰值与边缘处不再有折角，`distance` 默认值改为 `itemSize × 80 / 28`（`md` 时仍为 80）。拖动排序时图标抬起到 1.06 倍并加深阴影，相邻图标以弹簧让位，松手时按指针速度落到新位置。新增 CSS 变量 `--tx-motion-dock-peak-size`、`--tx-motion-dock-pad`、`--tx-motion-dock-gap`。
- `TxCarousel3D`、`TxFlipBook`、`TxCardSpread`、`TxPhysicsMotion` 新增 `draggable`（默认 `true`）：可以直接用指针拖动，设为 `false` 把指针拖动交还给宿主，点击、按钮、键盘与实例方法不受影响。四者的拖动都从抓住的位置起 1:1 跟手，越过 4px 才捕获指针，拖动结束的点击被吞掉，Escape 或指针取消时退回、不改变当前项；松手时把最后 100ms 的指针速度交给弹簧，带着动量释放时阻尼比约 0.8，其余临界阻尼，到边界处有橡皮筋式阻力；正在运动时可再次抓住，从当前绘制位置继续；`prefers-reduced-motion: reduce` 下仍跟随指针，松手后直接落到终态。触屏上沿页面滚动方向起手时仍滚动页面（`touch-action: pan-y`，纵向拖动的 Time Machine 为 `pan-x`，`TxCardSpread` 的卡片为 `none`）。**行为变化**：`draggable` 默认开启，此前在这些组件上按住拖动没有响应；放在自己处理指针拖动的容器里时传 `:draggable="false"`。
- `TxCarousel3D` 拖动舞台移动卡片堆：弧线与 CoverFlow 跟随横向移动，Time Machine 跟随纵向移动，一项的行程分别为 160 / 32 / 300px（随 `size` 缩放）；释放时按速度推算停靠位置并选中最近的一项，一次甩动可以越过多项。拖动期间不发 `update:modelValue` / `change`，只在释放时发一次；越过首尾时有阻力，`loop` 不会让拖动循环。
- `TxFlipBook` 拖动书页翻页：按下的一侧决定翻哪一页，纸叶的自由边停在指针之下；位置加上释放速度推算过了中点即提交（释放时请求 `update:modelValue` / `change`，落定后发 `flip-end`），否则弹回，弹回时 `flip-end` 带原索引；抓起书页时发 `flip-start`。未设置 `loop` 的首尾页只能抬起一点点，不发事件；父级拒绝请求的页面时以一次普通翻页翻回；宽屏预设的开场期间不响应拖动。
- `TxCardSpread` 把卡片沿自身朝上的方向抽出牌堆即选中它：卡片抬起到 1.04 倍并跟手，抽出约卡片高度的三分之一、且沿朝上方向多于横向时松手，触发 `update:modelValue` / `select`，否则弹回原位；放得下的牌堆里卡片浮在页面之上，需要横向滚动的牌堆里被限制在视口内。`focus-blur` 变体改为扫读：按住拖过各项时高亮、模糊与括号跟随，松手选中而不跟随链接。
- `TxPhysicsMotion` 可以抓住画面甩出去：画面按指针速度弹回原位，编排动画继续播放，拖动不会触发重放；`paused` 时仍可抛掷，`disabled` 时不可。
- `TxChoroplethMap` 与 `TxBubbleMap` 的 `roam` 默认开启，并补全指针与键盘操作：拖动从抓取点起 1:1 平移，越过 4px 才算拖动、不会点中气泡或地区，松手后在地图边界内滑行；⌘/Ctrl + 滚轮或捏合以指针（双指时为两指中点）为中心缩放，普通滚轮仍滚动页面；双击、触屏双击或 `0` 弹回初始视图；聚焦时 ← / → / ↑ / ↓ 平移地图尺寸的 10%，`+` / `-` 以中心缩放 √2 倍，Escape 取消进行中的拖动或捏合。视图始终留在地图之内，拖过边缘有橡皮筋式阻力、松手后弹回，容器尺寸变化时平移量随之等比缩放；`prefers-reduced-motion: reduce` 下滑行、回弹与按键步进直接落到终点。可平移的地图是可聚焦的 `role="application"`，新增 `labels`（`map`、`instructions`）与导出 `MAP_DEFAULT_LABELS`、`MapLabels`。触屏上单指滑动平移地图（`touch-action: none`），从地图上开始的滑动不再滚动页面。**行为变化**：`roam` 默认由 `false` 改为 `true`；需要固定的地图传 `:roam="false"`，此时没有焦点停靠点，地图不响应任何平移、缩放与按键，触屏滑动也回到页面。
- `TxSankeyChart` 的节点可以拖动：节点只做垂直移动，仍留在自己的列里，从抓取点起 1:1 跟随指针并限制在图表高度之内，连线实时重排；越过 4px 后不触发 `node-click`；松手后留在放下的位置，拖动中按 Escape 弹回拾起时的位置，双击空白背景让所有节点弹回计算出的布局。节点可聚焦（`role="button"`）：Alt + ↑ / ↓ 移动 8px，Enter / Space 选中，名称之后朗读新增的 `labels.instructions`。`nodes`、`links`（名称、端点与数值）或 `height` 的内容变化会丢弃所有移动，内容相同的新数组不会；`prefers-reduced-motion: reduce` 下弹簧直接落到终点，被拖动的节点仍跟随指针。新增导出 `offsetSankeyLayout`、`SANKEY_DEFAULT_LABELS` 与 `SankeyLabels` 类型。**行为变化**：触屏上从节点起手的拖动移动节点，不再滚动页面；从连线或背景起手仍滚动。
- ECharts 系图表补上指针操作。`TxEChart`、`TxLineChart`、`TxBarChart`、`TxScatterChart` 与 `TxTreemapChart` 新增 `cooperativeWheel`（默认 `true`）：普通滚轮属于页面，只有 ⌘/Ctrl + 滚轮（触控板捏合以此形式到达）缩放；`false` 把滚轮还给 ECharts，绘图区上每一次滚轮都缩放、页面不再滚动。折线、柱状、散点新增 `zoom`（默认 `true`，散点两个轴都缩放）：⌘/Ctrl + 滚轮或捏合以指针为中心缩放，放大之后拖动平移，双击绘图区以 350ms 动画回到完整区间（减少动态效果时直接跳到）；未放大时滑动仍滚动页面，放大之后改为平移。缩放按 ECharts 固定的档位前进，没有弹簧、松手惯性与键盘缩放。放大后的区间在传入新的 `option`、切换主题和调用 `redraw()` 之后保留，自带 `start`、`end`、`startValue` 或 `endValue` 的 `dataZoom` 项除外；`option` 里的数组整体替换，传入的 `dataZoom` 会取代内置缩放。`TxTreemapChart` 的 `roam` 默认开启：拖动平移，⌘/Ctrl + 滚轮或捏合从适配尺寸起放大，双击重新布局。`TxHeatmapChart` 新增 `selectable`（默认 `true`）：在绘图区拖动框选一块完整的单元格，新增事件 `select` 给出 `HeatmapSelection`（`rows`、`columns` 为含两端的索引区间，`cells` 为区间内的单元格），单击或 Escape 清除后给出 `null`，拖动不触发 `click`；有选区时是 Tab 停靠点，`labels` 覆盖朗读说明与带 `{count}` / `{total}` 的播报。新增导出 `HEATMAP_DEFAULT_LABELS`、`heatmapSelection`，以及 `HeatmapCell`、`HeatmapChartEmits`、`HeatmapLabels`、`HeatmapSelection` 类型。**行为变化**：`TxTreemapChart` 的 `roam` 默认由 `false` 改为 `true`；带 `roam` 或 `type: 'inside'` 的 `dataZoom` 的图上普通滚轮不再缩放（此前 ECharts 在绘图区上的每次滚轮都缩放并拦下页面滚动），需要旧行为时传 `:cooperative-wheel="false"`；带 `roam` 的矩形树图与可框选的热力图在触屏上占用滑动（`touch-action: none`），要让页面从上面滚过去，传 `:roam="false"` 或 `:selectable="false"`。
- `TxBaseSurface` 新增 `systemBackdrop`（默认 `false`）：表面铺在窗口自身的系统材质上时打开，例如透明 Electron 窗口的 vibrancy 或 Mica。页面里的 `backdrop-filter` 采不到这层材质，只会把表面自己的底色再采一遍叠上去，桌面透不上来；打开后玻璃层不渲染，滤镜层的 `backdrop-filter` 置为 `none`、只留着色，模糊交给系统，底色、遮罩、流光与描边照常绘制。表面不再采样页面，`moving` 与 `autoDetect` 随之失效。
- `TxModal` 的面板改由 `TxBaseSurface` 绘制，默认 `refraction` 材质。新增 `surface`（默认 `'refraction'`，不认识的值按 `refraction` 处理）、`surfaceColor`（材质下垫的底色，默认跟随主题）与 `surfaceOpacity`（这层底色的不透明度，`mask` 下默认 0.96，其余材质 0.5）。遮罩的变暗与模糊移到遮罩层自己的伪元素上，面板的材质采到的是页面而不是遮罩；面板的阴影与内描边也移到伪元素上。开合时面板只缩放、不整体淡入淡出：头部、正文、底栏、阴影与描边、材质的各层各自淡入淡出，带背景滤镜的材质从第一帧到最后一帧都采着页面；不带背景滤镜的材质与高对比度下的材质整体淡入淡出。新增减少动态效果的处理：`prefers-reduced-motion: reduce` 时面板原地淡入淡出，不缩放、不位移。
- `TxDrawer` 的面板改由 `TxBaseSurface` 绘制，默认 `refraction` 材质。新增 `surface`、`surfaceColor`（默认 `var(--tx-drawer-panel-background)`）与 `surfaceOpacity`（`mask` 下默认 0.96，其余材质 0.5）。`panelTransparent` 不再给面板另加 18px 模糊，改为把这层底色调薄到 0.78 与 0.3；内部变量 `--tx-drawer-panel-background-transparent` 随之移除。面板滑入滑出期间表面按 `moving` 处理，滑动结束后恢复；中途反向滑动时同样成立。
- `TxCommandPalette` 与 `TxPopperDialog`、`TxBlowDialog`、`TxBottomDialog`、`TxTouchTip` 的面板改由 `TxBaseSurface` 绘制，默认 `refraction` 材质，新增 `surface`、`surfaceColor` 与 `surfaceOpacity`，取值与默认值同 `TxModal`；四种对话框共用的这组 props 导出为 `DialogSurfaceProps` 类型。`TxPopperDialog` 与 `TxTouchTip` 原先在面板上自带的背景模糊，以及 `TxCommandPalette`、`TxBlowDialog` 与 `TxBottomDialog` 原先的实色底随之移除。遮罩的变暗（`TxBlowDialog` 还有模糊）移到遮罩层自己的伪元素上，面板的阴影与描边也移到伪元素上。开合时面板只位移、缩放，不整体淡入淡出：内容、阴影与描边、材质的各层各自淡入淡出，与 `TxModal` 相同。`TxCommandPalette` 的搜索框、列表与 `footer` 插槽包进新的 `.tx-command-palette__body`，由它裁切圆角；遮罩的变暗在 `.tx-command-palette__overlay::before`，描边与阴影在 `.tx-command-palette__panel::after`，经 `overlayClass` / `panelClass` 改这些样式时改对应的伪元素，面板底色改用 `surfaceColor`。`TxPopperDialog`、`TxBlowDialog` 与 `TxTouchTip` 新增减少动态效果的处理：`prefers-reduced-motion: reduce` 时面板原地淡入淡出，不缩放；`TxBlowDialog` 对 `#app` 的放大与变淡不受影响。
- `TxStreamText` 与 `TxStreamElement` 写完的文字按 `text-wrap-style: pretty` 断行，段末不再只剩一两个词；仍在写入的那段保持 `auto`，每到一个词不重算整段断行。宿主设置的 `nowrap` 不受影响。
- 基础样式的工具类 `.tx-help-text` 补上 `text-wrap: pretty`，与 `.tx-prose p`、`.tx-description` 一致：文档此前已写明，样式缺了这一条。

### 🐛 组件修复

- `TxLearningCurve` 修复 Y 轴名称与刻度重叠。
- `TxTouchTip` 关闭时的放大淡出此前没有过渡，面板在 60 ms 后直接消失；现在在 220 ms 内放大并淡出。
- `TxStreamMarkdown` 中行内出现的 `$$`（如 shell 的 `$$`、`$$x$$`）不再被当作公式块的起点：此前 marked 在该处截断段落，块规则不匹配时用换行拼回，在 `breaks: true` 下变成 `<br>`，`$$` 前的空格也被吞掉；现在只在行首查找公式块。
- `TxAttachmentTray` 的缩略图自行固定 `img` 的外边距与尺寸，放进带排版样式的文章（如 `.prose`）里不再下移；内置预览器的样式此前写在托盘选择器之下，`TxModal` 传送到 `<body>` 后从未生效，现已生效。
- `TxTimeseriesChart` 开启刷选后，刷选层此前盖在事件标记之上，标记无法悬停查看；现在刷选与缩放层位于标记之下。
- `TxDitherChart`：外置滑块在无读数时停在最左端、与图上合计不一致的问题随滑块移除消失；无读数时按 ← 从最后一个点开始。
- `TxMonoChart`：触屏在图形上滑动时读数原先停在按下的图形上（隐式指针捕获），现在随手指扫读。
- `TxMotionDock` 静止时图标贴着底板下沿：放大所需的高度此前预留在底板内，图标又按底部对齐；现在预留在底板上方。

## [0.8.0] - 2026-10-14

### 📦 组件变动 (Components)

- **更新组件**: `base-anchor`, `base-surface`, `button`, `card`, `conversation-stream`, `data-table`, `dropdown-menu`, `input`, `number-input`, `select`, `tag-input`, `textarea`, `voice-beam`
- **新增组件 (Since 0.8.0)**: `voice-clip`, `flow-light`

### ✨ 组件增强

- 新增 `TxFlowLight` 流光底：一层固定的 Tuff 品牌色光（蓝 `#0894ff`、紫 `#c959dd`、红 `#ff2e54`、橙 `#ff9004`），颜色不随面板背后的内容变化。`variant` 有三种：`corners` 双角柔光、`rim` 顶缘流光带、`aurora` 极光漫射；`intensity` 乘到主题透明度上，`colors` 覆盖四个色标；高对比度下隐藏。`TxBaseSurface` 与 `TxCard` 新增 `flowLight` / `flowLightIntensity`，任何 `mode`/`background` 都能开，光层位于遮罩之上、描边之下；锚点家族通过 `panelCard` 透传，`TxDropdownSubmenu` 未指定时沿用根菜单的流光。
- 新增 `TxVoiceClip` 语音条：播放键、可拖动定位的波形与倒计时排成一个胶囊，宽度随时长按平方根增长（140–300px）。未传 `peaks` 时组件读取并解码本地录音得到波形（8 kHz 离线解码，按 URL 缓存最近 24 条；远程地址不会再读一次），解码完成前或失败时显示平直轨道；同一页面同时只播放一条，新开始的一条会暂停正在播放的那条。波形本身是 `role="slider"`，支持方向键、Page 键与 Home/End；`src` 为空或加载失败时进入不可用态并显示 `unavailableLabel`。颜色通过 `--tx-voice-clip-*` 变量覆盖，可写在任一祖先上。
- `TxVoiceBeam` 新增 `organic`（0–1，默认 0）：有声音时各色瓣、光带与整道光弧各自起伏，不再整体同步缩放；每个分量是质数周期的正弦叠加平滑噪声，幅度随当前电平变化，静音时不动，处理中与 `prefers-reduced-motion: reduce` 时关闭。`organic` 为 0 时输出与此前逐帧一致。
- 构建审计同步 `FlowLight` 的按需依赖闭包与两项新增组件的样式体积：完整 CSS 实测 744.0 KiB、按需 CSS 合计 714.5 KiB，预算分别为 745 KiB 和 715.5 KiB；单组件 CSS/JS 限制与根入口、全量样式导入禁令不变。
- `TxButton` 新增 `progress`（0–100）、`showProgress` 与 `formatProgress`：有效数字显示背景进度条与百分比读数，进度值夹在范围内；可结合状态反馈使用。
- `TxDataTable` 新增语义列 `type`（`text` / `number` / `datetime` / `date` / `tag` / `source` / `actions`），补齐数值与日期排序、标签与来源展示，以及表头列筛选。列级 `filter` / `filterOptions` 配合 `defaultFilter` 或受控 `filter`，通过 `update:filter` / `filterChange` 报告变化；`filterOnClient` 默认为 `true`，关闭后由调用方筛选；`autoStickyActions` 默认将操作列固定在右侧，显式 `fixed` 优先。
- `TxSelect` 未显式指定 `searchable` 时，选项数达到 `searchThreshold`（默认 8）自动开启搜索；`searchable=false` 或阈值不大于 0 可关闭自动搜索，显式 `searchable=true` 保持强制开启。
- DataTable 的筛选与排序状态提取为内部模块，并合并重复样式声明；真实 0.8.0 构建的单组件 JS 为 42.9 KiB（48 KiB 上限不变），完整 CSS 为 749.0 KiB、按需 CSS 总量为 719.6 KiB。新增语义筛选样式采用 750 / 720.5 KiB 的实测总量基线，根入口、全量样式导入禁令与单文件预算保持不变。

### 🐛 组件修复

- 表单组件 `TxInput`、`TxTextarea`、`TxSelect`、`TxNumberInput` 与 `TxTagInput` 的结构和输入区显式使用 `box-sizing: border-box`，不再依赖宿主全局 reset，避免宽度叠加 padding / border 后溢出；不向全局注入通配重置。
- DataTable 的 `date` 列按本地日历解析纯日期值；`today` 采用本地午夜到下一个本地午夜的半开区间，保留 `datetime` 的时区时间点，并覆盖夏令时回拨的 25 小时日。
- `TxConversationStream` 挂载时测量恢复的对话行，避免初始尺寸记录缺失。

## [0.7.0] - 2026-10-09

### 📦 组件变动 (Components)

- **更新组件**: `ai-elements`, `base-anchor`, `button`, `charts`, `chat`, `code-stream`, `flat-dropdown`, `fusion-surface`, `icon-chip`, `icon-morph`, `liquid`, `popover`, `rating`, `slider`, `steps`, `switch`, `tooltip`, `transition`
- **新增组件 (Since 0.7.0)**: `card-spread`, `carousel-3d`, `flip-book`, `morph`, `motion`, `motion-button`, `motion-control`, `motion-dock`, `motion-form`, `motion-loader`, `motion-metric`, `motion-text`, `motion-toggle`, `motion-transition`, `physics-motion`, `terminal`

### ✨ 组件增强

- 新增 `TxTerminal` 终端显示组件：网页与 Electron 共用的 ANSI / Unicode 输出显示，支持只读日志（`readOnly`、`lines`）、按容器适配尺寸（`fit()` / `getSize()`）与主题；xterm.js 只在客户端加载，组件本身不执行进程。
- 悬停弹层有了悬停桥与安全三角：`TxTooltip` 的交互式悬停面板（Popover、DropdownMenu、两种子菜单、Cascader 各级与 AvatarGroup 的溢出面板都基于它）打开期间在触发器与面板之间渲染一座桥，面板的内边距算作面板本身；指针离开触发器朝面板移动时，只要留在离开点与面板对边构成的三角内、且停顿不超过 100ms，面板不会关闭，途经的其他触发器也不会抢先打开。`TxFlatDropdown` 使用同一套判定，不再靠拉长 `closeDelay` 掩盖斜向移动。纯提示与点击打开的面板不变。
- 新增 `TxTransitionPush` 推入翻页过渡，用于层级导航（进入子页、返回上一页）：key 变化时新旧两页同时横向推入推出，`direction` 为 `forward` 时新页从行内结束方向进入、`back` 时反向，RTL 容器自动镜像；容器高度只在切换那一刻从旧页过渡到新页，结束后回到 `auto`；离场页固定在原位并设为 `inert`；中途打断从当前绘制的位置继续；`duration` 为 `0` 时直接替换，`prefers-reduced-motion: reduce` 时改为 120ms 原位淡入淡出、高度直接落定。新增 `before-enter`/`after-enter`/`after-leave` 事件与 `TransitionPushDirection`、`TxTransitionPushProps` 类型。
- `TxBaseAnchor` 的箭头有了自己的动画：箭头挂到面板内容层上，跟着面板的位移、缩放、模糊和透明度一起动，面板开始运动之前、收起之后都随面板隐藏（此前会在面板动起来前先完整闪出两三帧，关闭的第一帧就消失）；`expand` 下箭头等面板成形后才从边缘探出，回弹比面板晚一拍，关闭时先收回再折叠面板；`opacity` 的箭头只随面板淡入淡出。
- `TxBaseAnchor` 的 `transfer` / `boom` / `opacity` 现在和 `expand` 一样解析 `animation.ease` / `closeEase` 里的 `spring(omega, zeta)` 与 `cubic-bezier(...)`；此前原样交给 GSAP，被静默换成 GSAP 的默认缓动。GSAP 自己的缓动名照旧透传。
- `TxLiquid` 的 `cornerEase` 接受任意 CSS 缓动，包括全部关键字与 `linear(...)` 列表；此前只认 `cubic-bezier(...)` 与 `ease-in-out`，其余按线性处理。
- `charts` 新增 `TxMonoChart` 与 `TxDitherChart`；`liquid` 复用共享的减少动态效果偏好，并在 KeepAlive 停用时清理动态任务。
- 融合 Amicro 固定来源的按钮、卡片展开、三维轮播与书页、命名加载器、文字、物理、指针与滚动、开关和内容转场；Nexus 新增独立 Motion 文档章节，Mono Charts 位于 Data，复合表单、控件和指标位于 Pro。安装边界仍为 base/pro/ai，图表沿用现有 SVG/d3 入口。
- 内容、数据、模型、上传选择与业务结果由调用方驱动；动效复用已有 spring 与 TextMorph。新增 `useMotionActivity` 统一视口、页面活动、KeepAlive 与减少动态效果边界，npm 分发清单保留 `AMICRO-LICENSE`、`AMICRO-APACHE-LICENSE` 和 `LUCIDE-LICENSE`。
- `TxCopyButton` 重做状态反馈：边缘改为内描边，悬停立即变色，颜色只在状态切换后的 420ms 内过渡；复制成功时图标画出对勾、文案经 `TxTextTransformer` 原地形变（共同的字不动），失败时画出叉并转为危险色。新增 `failedLabel`（不传时文案保持 `copyLabel`，失败只靠叉形与色调表达）与 `iconOnly`（平时只显示图标，反馈时按钮宽度以 FLIP 展开文案再收回），默认插槽新增 `failed`；所有动效只在 `prefers-reduced-motion: no-preference` 下声明。`TxCodeStream` 的复制按钮覆盖同步去掉内描边、补上失败色调。
- 新增 `TxMorph` 一形多态容器：同一块形状承载所有状态。`morph-key` 变化时旧内容以短模糊先离场，新内容晚一拍进入；形状的宽高按弹簧逐帧跟到新内容的尺寸（默认 liquid 的 `snappy`），圆角与填充色走同一弹簧编译出的 `linear()` 曲线。中途再变只改目标，位置与速度都保留，不会跳回原尺寸，也不会从零速度重新起步。`width` 关闭时为块级、只过渡高度；落定后尺寸回到 `auto` 并触发 `settle`；`prefers-reduced-motion` 下直接替换内容、尺寸立即落定。圆角写在注册过的 `--tx-morph-radius` 上，子元素可以用 `calc(var(--tx-morph-radius) - var(--tx-morph-inset))` 得到同心圆角。
- `TxTransitionSmoothSize` 的容器尺寸改由弹簧逐帧驱动（与 `TxMorph` 同一引擎）：尺寸在途中再变时只改目标，位置与速度保留，不再从停下的位置重新起一段过渡。`duration` 现在是弹簧的时钟（220ms 时即 liquid 的 `snappy`），`easing` 只作用于内容动效；`duration` 为 `0` 时尺寸直接落定。实现不再经由 `TxAutoSizer`，三层 DOM 结构与 attrs、class、style 的落点不变。
- 新增 `blur` 过渡：内容经 4px 模糊淡入淡出，不位移；`TxTransition` 的 `preset` 与 `TxTransitionSmoothSize` 的 `motion` 都可用，减少动态效果时去掉模糊。
- `TuffSwitch` 的滑块改走 glide 材质（与 Tabs、FlatRadio 的指示器同一引擎）：两端各乘一个弹簧，途中向前拉长、到位收拢，行进中再次切换会就地转向而不是从头再来；减少动态效果时滑块直接到位（此前 `left` 的 0.25s 过渡不理会该设置）。静止位置仍由样式表决定，组件只在行进时写入 `translate` 与 `width`，`:active` 的按压缩放不受影响。
- `TxSlider` 新增 `overdrag`（默认关闭）：拖过两端时滑块带阻尼越界，越远阻力越大、最多露出一个滑块宽度，值仍夹在范围内；松手后带着松手时的速度弹回，弹回途中再次按住会从当前位置接手。减少动态效果时不越界。
- `TxLineSeries` 新增 `enter`：默认 `clip` 保持 ECharts 式的从左向右擦开；`draw` 沿线的长度描出折线（减速收尾），描到哪个数据点，该点的标记才淡入。虚线描边仍用 `clip`；减少动态效果或超过动画阈值时不播放入场。
- `TxIconMorph` 新增内置图标 `play` 与 `pause`（取自 Lucide，同为 24 网格描边）：播放三角会一分为二，变成暂停的两根竖条，反向亦然，中途切换同样可打断。

### 🎨 外观与主题

- `TxBaseAnchor` 的 `expand` 回弹按面板高度封顶：130px 以内最多过冲 6px，更高的面板按高度平方根略微放大（五行约 7.6px、十行约 10.4px，此前为 19.9–38px）；首次到达满高仍在 112ms，宿主显式指定的缓动照原样执行。
- 锚点家族默认不再画箭头：`TxTooltip`（`anchor.showArrow`）与 `TxPopover` 的 `showArrow` 默认值由 `true` 改为 `false`，与 `TxBaseAnchor`、`TxContextMenu` 一致；基于 Popover 的 `TxDropdownMenu`、`TxSplitButton`、`TxCascader`、`TxTreeSelect`、头像组溢出面板，以及基于 Tooltip 的 `TxMotionControl` 提示和 `TxProgressBar` 提示随之不带箭头。需要箭头时逐个实例传 `showArrow`。
- `TxPopover` 未传 `offset` 且无箭头时的间距由 2px 改为 6px，与 DropdownMenu、Select 系列一致：2px 时面板上沿压住触发器 3px 的焦点描边。默认 Popover 的面板因此从离触发器 8px 变为 6px；显式关箭头且不传 `offset` 的 `TxDatePicker`（字段形态）与 `TxIconPicker` 从 2px 变为 6px。开启箭头时的间距不变。

### 🐛 组件修复

- `TxFusionSurface` 的分裂颈部改成液桥：拉开后的凸起是一个带底边和圆角的水滴，两侧各用一段只向内弯的凹弧连到主体，颈部从两侧向中间变细，最后在中点断开。原先的升余弦凹口会在颈部切出两道尖 V，水滴底部是楔形，主体上的残留是帐篷形，看起来不像液体。没有拉开的凸起不变，`pinch`、`breakAt`、`split` 的含义也都不变。
- `TxSplitButton` 普通点击即可打开菜单：此前 pointerdown 打开菜单后，用来吞掉配对 click 的标记被 `setTimeout(0)` 提前清掉，松手时的 click 又把菜单关上，只有长按才看得到。未传 `menuIcon` 时改为绘制内置的竖向三点 SVG，不再依赖宿主装有 `ri` 图标集（Nexus 中此前显示为空白）。
- `TxCardSpread` 的卡片、`TxCarousel3D` 的轮播页、`TxFlipBook` 的书本外框与页面内容，以及 `TxMonoChart` 的提示框，投影都补上横向偏移（约为纵向的一半，如 `0 4px 12px` → `2px 4px 12px`），与组件库统一的左上方光源一致；此前随 Amicro 恢复带回了正下方的阴影，`shadow-light-source` 测试因此失败。
- `TxBaseAnchor` 的 `transfer` 关闭改为落在 `exit.scale`：此前它忽略 `exit.scale`，`closeType: 'transfer'` 的混搭关闭也不回落到 transfer 自己的默认缩放（0.92），而是沿用打开类型的值。
- `TxBaseAnchor` 的保留面板在关闭动画结束后停放到视口外，裁剪根节点自身的溢出。`eager` 与 `keepAliveContent` 仍保留可测量内容；视口缩小时，关闭的面板不再撑宽文档。重新打开会先恢复文档定位，并取消旧关闭回调。
- `TxMotionLoader` 将保留的 React SVG 描边属性转换为标准 SVG 属性，恢复来源中的线宽、端帽、连接和虚线参数；`viewBox` 与滤镜大小写保持不变，SSR 与客户端遵循相同几何。
- `TxDitherChart` 默认 tooltip 不再把数据点标签打两遍：标题写悬停的数据点（日期或类目），数据行写所属系列名与数值；数据项本身就是系列时（环图、仪表、图例聚焦）只保留数据行。tooltip 落到图表下半部时也不再被坐标轴文字盖住。
- `TxIconChip` 的 `label` 超过三个字符（如 `JSON`）时角标横向变宽，不再溢出 14px 方块；三个字符以内仍是原来的正方形，高度、圆角与字号不变。
- `TxStep` 使用字符串 `step` 键时按子项顺序显示编号；此前没有图标的字符串键步骤一律显示 1。
- `TxChatList` 新增 `attachmentLabel` 并透传给每条 `TxChatMessage`，非英文宿主可以本地化无名图片缩略图的读屏名称；导出的 `ChatMessageProps` / `ChatListProps` 类型同步补上该属性。
- `TxAiConversation` 新增 `typingLabel` 并透传给每条消息，同时转发消息的 `open-source` 事件；此前在对话里点击来源没有任何监听者能收到。导出的 `AiConversationProps` / `AiMessageProps` 类型同步补上 `typingLabel`。
- `TxRating` 在 `precision=0.5` 时，方向键或 Home / End 落在当前星上不再把整星减成半星；按键只选整星，落在当前星上时评分不变。
- `TxIconMorph` 实例上的 `seek` 类型改为必选：组件始终提供它，此前沿用引擎接口的可选签名，TS 调用方需要多一层判空。

### 🧩 组件导出

- `@talex-touch/tuffex/utils`（根入口同步）新增闭式弹簧：`solveSpring` 给出任意时刻的精确位置与速度，`createSpringTrack` 是可中途换目标、可按任意顺序读取的弹簧轨道，用于可拖动的时间线与逐帧渲染。帧循环仍用 `stepSpring`（它与 liquid 编译 CSS 曲线的步长一致），两者在 liquid 预设上最多相差行程的 3.2%。
- `@talex-touch/tuffex/utils`（根入口同步）新增 `useMorphBox`：容器跟随内容的自然尺寸做弹簧过渡，尺寸在途中再变时保留位置与速度；`TxMorph` 的尺寸部分即由它实现。
- `@talex-touch/tuffex/utils`（根入口同步）新增缓动工具：`resolveGsapEase`、`resolveCssEase`、`createSpringEase`、`parseSpringEase`、`createCubicBezier`、`parseCubicBezier`。

### 🧪 内部

- 悬停意图的几何（桥、安全三角与过渡判定）收拢到 `utils/hover-intent.ts`；anchor 延迟模块新增 `holdChain` / `releaseChain`，过渡期间到期的父级关闭会暂缓，指针放弃时重放、到达时丢弃。
- 缓动实现收拢到 `utils/animation/easing.ts`，各处副本删除：`TxBaseAnchor` 的弹簧与贝塞尔构件、`TxLiquid` 的两份 CSS 缓动求值（`spring.ts` 的 `easingFunction` 与 observer 的圆角时间线）、`TxTextMorph` 借用的那份，以及图表入口的 `cubicBezier`（名字保留，改用共享求解器）。
- 共享工具的发布模块输出到稳定的 `utils/internal` 路径，不再把构建机的绝对工作区目录带进按需入口；公开组件与工具子路径保持不变。

### 组件修复

- `TxBubbleMap` 开启 `roam` 后仍可点击气泡并返回对应数据行。气泡按下不再触发底图的指针捕获，底图拖拽和滚轮缩放保持可用。

### 按需样式

- 动态组件导入在激活时加载完整 CSS 依赖，不提前加入首屏静态样式。静态导入继续展开依赖闭包；显式样式去重只识别真实导入，不把注释或字符串误当成已加载样式。

## [0.6.3] - 2026-10-01

本版本最初随源码与客户端 beta 测试，2026-10-03 发布到 npm；已发布的 0.6.2 历史记录保持不变。

### 📦 组件变动 (Components)

- **新增组件 (Since 0.6.3)**: `descriptions`, `stream-element`, `stream-text`
- **更新组件**: `code-stream`, `context-menu`, `data-table`, `dropdown-menu`, `pagination`, `stream-markdown`

### ✨ 组件增强

- 新增 `TxDescriptions` / `TxDescriptionsItem` 描述列表组件：以语义 `<dl>` 渲染只读的标签/值对；`columns` 控制每行列数，容器窄于 480px 时退为单列；`layout` 支持 `horizontal`（同一列的标签共用一条 subgrid 轨道，值自动对齐，`labelWidth` 可固定标签宽度）与 `vertical`，`size` 支持 `sm` / `md`；`span` 跨列且不超过 `columns`；值不渲染任何内容（无插槽、仅空白或 `v-if` 为假）时显示 `emptyText`（默认 `—`，`0` 不算空）；`label` 插槽可替换标签。
- 新增 `TxStreamElement` 流式回答组件：把一整段回答（Markdown 或结构化 `parts`）放在同一个匀速时钟上逐词显影，标题、段落、列表、引用与代码严格按顺序出现；`[n]` 按 `sources` 解析为引用 chip（代码与链接文字中不解析）；表格、公式、mermaid、原始 HTML 与图片整体委托给 `TxStreamMarkdown` 并逐行显影；支持 `reserve` 回放、`replay()`/`skip()`，`caret`/`citation`/`inline`/`code`/`part-<name>`/`footer` 插槽与 `state-change`/`done`/`cite` 事件。
- 新增 `TxStreamText` 流式文字组件：逐词匀速放出流式到达的文字，突发内容不会让显示落后源头超过 `maxLagMs`，源头结束后在 `drainMs` 内放完；每个词从轻微模糊中析出并扫过蓝紫粉色带（默认 `aurora`，另有 `hue`/`blur`/`languid`/`none` 预设）；支持行内引用与自定义片段、取材自 Tuff logo 的光标、`caret`/`citation`/`inline` 插槽、`state-change`/`done` 事件与 `replay()`/`skip()`；遵循减少动态效果偏好。新增 `appear` 属性（挂载时已有的内容也播放进场）；关闭 `caret` 时光标立即移除，只有流结束时才收起；修复引用 chip 后紧跟的空格被吞掉，以及行内代码、链接后的空格落进代码框或链接下划线。
- `TxCodeStream` 新增流式模式（设置 `streaming` 即启用）：把目前收到的代码传给 `code`，组件逐词匀速放出，默认每个词在自己的语法颜色里从轻微模糊中析出（`reveal` 可换预设）；增长中的代码按 120ms 合并重新高亮，Tuff 光标跟随正在书写的那一行且换行不重挂载；新增 `reveal`/`wordMs`/`maxLagMs`/`drainMs`/`pauseMs`/`reserve` 属性、`state-change`/`done` 事件、`caret` 插槽与 `state`/`replay()`/`skip()`；并以 `TxStreamCode` 别名导出；另有 `paced`（由父组件统一控制节奏时关闭）与 `appear` 属性；关闭 `caret` 时流式光标立即移除，只有流结束时才收起。`revealedLines` 与 diff 模式行为不变，整个组件的动效统一只在未减弱动效时声明。
- `TxStreamMarkdown` 换上流式家族的动效：新流入的字符使用 `TxStreamText` 的显影预设（默认 `aurora`，新增可选 `reveal` 属性），新块改用共享的模糊淡入；尾部的渐变光球换成 Tuff 光标，全组件只保留一个、用 `translate` 属性定位（新增可选 `caret` 属性，关闭时光标立即移除，流结束时才收起），段落写到哪里跟到哪里，列表/表格/围栏下方单独一行，换元素不重新挂载；整个组件的动效统一只在未减弱动效时声明（遮罩过渡与表格复制按钮的过渡此前在减弱动效下仍会播放）。
- `TxDropdownMenu` 与 `TxContextMenu` 的关闭型菜单项新增统一确认反馈：先清空高亮 90ms、再复用 active 选中态确认 90ms，然后触发 `select` 并关闭；支持菜单/Panel/单项 `activationFeedback` 覆盖，`closeOnSelect=false` 与减少动态效果保持即时路径。
- `TxDataTable` 新增 `loadingVariant`（默认 `overlay`，可选 `skeleton`）与 `skeletonRows`（默认 5）：`skeleton` 在还没有数据时渲染贴合列宽、对齐方式与行高的骨架行（`aria-hidden`，表格仍为 `aria-busy`），不显示遮罩与空态；已有数据时刷新保留现有行、不加遮罩，只在表头下方显示 2px 进度条（减少动态效果时静止）。不传新属性的表格渲染不变。
- `TxPagination` 新增 `pageSizes`、`v-model:pageSize`（`update:pageSize` / `pageSizeChange`）与 `pageSizeLabel`（默认 `Items per page`）：提供 `pageSizes` 才在页码后渲染每页条数选择器（复用 `TxSelect`，由可见标签命名），控件排成一行并可换行；组件只发事件、不改当前页，是否回到第 1 页由调用方决定；不传 `pageSizes` 时 DOM 与此前一致。

## [0.6.2] - 2026-09-28

### 📦 组件变动 (Components)

- **新增组件 (Since 0.6.2)**: `bot-avatar`, `image-generation`, `metal-fx`, `voice-beam`
- **更新组件 (Updated)**: `card`, `empty-state`, `progress-bar`, `status-badge`

### ✨ 组件增强与生态收敛

- 深度适配并导出四大交互视觉特效套件：`TxImageGeneration` 图像生成占位揭示、`TxMetalFx` 金属质感物理悬浮徽标、`TxVoiceBeam` 语音声波光束与 `TxBotAvatar` 智能体动态头像。
- `TxProgressBar` 进度条增强多段聚合 (`segments`) 支持：支持自定义各段值、颜色与浮动标签，完美适配业务每日活动趋势图与版本分布多维度对比展示。
- `TxCard` 优化无遮挡悬浮体验与平滑背景阴影切换，与 `TxEmptyState`、`TxStatusBadge` 等全面覆盖系统后台与数据看板容器规范。
## [0.6.1] - 2026-09-28

### 📦 组件变动 (Components)

- **新增组件 (Since 0.6.1)**: `status-hint`

### ✨ 组件增强

- 新增 `TxStatusHint` 状态操作反馈组件：用于在操作完成后以涌现色带、文字字符级形变过渡与再次触发脉冲强调展示操作反馈（例如“已复制”、“固定失败”）；自带微弱噪点遮罩层，支持深浅色模式与无障碍单 live region 模式；完全支持并遵循用户 reduced motion 偏好。

## [0.6.0] - 2026-09-12

### 📦 组件变动 (Components)

- **新增组件 (Since 0.6.0)**: `agent-screen`, `charts`, `choice-card`, `flowchart`, `fusion-surface`, `icon-morph`, `icon-picker`, `mode-chip`, `prism-glow`, `sensitive-input`, `text-morph`, `toast-panel`
- **更新组件 (Updated)**: `alert`, `badge`, `cascader`, `date-picker`, `flat-radio`, `group-block`, `picker`, `progress-bar`, `slider`, `sortable-list`, `stream-markdown`, `tab-bar`, `text-transformer`, `toast`, `toast-panel`, `transfer`, `tree`


### ✨ 组件增强

- 新增 `TxTextMorph`：按字符粒度在旧值与新值之间做形变过渡，并导出 `TextMorphEngine` / `MorphController` / `MORPH_DEFAULTS` 供 `TxTextTransformer`、`TxBadge` 等自带形变面的组件复用；`@number-flow/vue` 依赖随之移除，Nexus 侧 demo 与文档从 AutoSizer 数字滚动切到新组件。
- `TxToastHost` 重做为可堆叠通知栈：最新的在最前，后面的按 `gap` 与 5% 缩放露出顶边，超过 `visibleToasts` 的完全透明等待；悬停整栈展开并暂停所有倒计时，移开后各自从中断处继续而不是从头计时；收起时宿主 `pointer-events: none`，空列不再吞点击。新增 `position` / `expand` / `gap` / `offset` / `swipeToDismiss`，退场动画补齐（此前只有 0.16s 淡入，退场元素直接消失）。
- `TxSortableList` 拖拽可预期：列表随指针跨越实时重排（预览由组件自己保有，宿主未回写 `modelValue` 时行也会动，拖拽结束后所有权交还宿主），新增握柄与键盘排序路径，`reorder` 仍只在结束时触发一次并携带原始与最终下标。
- `TxTree` 无 `v-model` 时也能选中：内部选中状态与展开同构，新增 `defaultSelectedKeys` 作为种子，`modelValue` 绑定期间忽略种子。
- `TxTransfer` 新增 `minHeight` prop（写入 `--tx-transfer-min-height`），不再被 240px 硬下限撑出容器；行标签改用 `overflow-wrap: anywhere`，不再把 "Quick actions" 断成 "Quick actio / ns"。
- `TxDatePicker` 增加月/年视图、区间选择与过渡动画；`TxCascader` 每一级使用各自锚定的浮层面板；`TxProgressBar` 增加星尘流动与可悬停分段。
- `TxTabBar` 补齐与 `TxFlatRadio` 一致的 variant / size 组合，滑动指示器改由一份共享测量驱动（首次点击前就位）；`TxFlatRadio` 增加 `xl` 档位。
- `TxAlert` 增加状态图标、入场动画与可关闭回退。

### 🎨 外观与主题

- 所有阴影回到同一光源；抬升面锚定到轨道并压柔阴影，画廊单元格不再挤压自身。
- BUI 深色 ramp 回归中性灰：每档保留原有绿色通道（亮度不变），只去掉原先 +3..+5 的蓝偏，`--tx-bui-line` 与 `--tx-fill-color` 对齐；浅色 token 不动。
- 列表行统一 hover / active / 对齐；下拉项 hover 改为面板式；折叠头重绘为描边 chevron，折叠框架重新设计。
- 步骤条标记与连接线重绘并补过渡动画；BlowDialog 卡片重建；头像跟随主题取色；状态徽标图标归位到端帽。
- 自适应带与 GlowText 的离场改为真正离开，而不是在原处溶解或犹豫。

### 🐛 组件修复

- BUI 组件的 `bui-scope` reset 改由 `:where()` 包裹，组件自己写的 `&__name` 按钮样式不再被 `.tx-bui-x button` 的 (0,1,1) 静默压过（`TxSidebarNav` 行高回到 31.5px，`TxSearchPanel` 选项恢复内边距/字号/颜色）。
- `TxGroupBlock` 的行扁平化选择器实际命中；`TxRow` 负 gutter 的成因补齐，网格恢复方正。
- 对话框不再裁切长 token，内容体可滚动；`TxSelectionActions` 不再在用户操作时把自己关掉；`TxTabs` 指示器首次点击前可见。
- Picker 行标签不再重复渲染、滚轮不再卡顿、能滚到最后一行。3D 鼓形方案落地后因命中区随 transform 迁移（居中行挡住相邻行）而整体回退，最终保留平铺列，以及两个与鼓面无关的修复。
- `TxSlider` 分段停点变圆且可命中；滑块拇指沿用 radio 指示器的果冻感，radio 指示器收进组边框。
- 浮层面板锚定到文档而非视口；Nexus 文档的 prose 样式不再渗进组件 specimens。
- `TxStreamMarkdown` 不再重复内联 GitHub markdown 样式表（SFC `@import` 与按 chunk 去重导致 103.3 KiB 表发两遍）。

### ⚡ 性能优化

- 组件样式不再把依赖 CSS 复制进每个 `style.css`：依赖改为 emit 共享样式的一次引用，发布集 2.2 MiB → 743 KiB。
- 共享样式通过 `style-deps.json` 展开为「每个样式表一次 import」，同一份 base-surface 规则只加载一次：五个组件的页面 208 KiB → 104 KiB。
- 导出 CSS 开启 `cssMinify`（JS 仍保持未压缩，便于依赖方调试与自行打包）：`components.css` 663.5 → 541.2 KiB，`base.css` 34.2 → 29.3 KiB；`audit:size` 的完整 CSS 预算以 664 KiB 重新基线。

### 🧩 组件导出

- 新增 `@talex-touch/tuffex/vite`（按需样式注入插件）与 `@talex-touch/tuffex/package.json` 导出。
- 新增 `TxTextMorph` 及其引擎导出；移除 `@number-flow/vue` 依赖。

## [0.5.0] - 2026-09-07

### 📦 组件变动 (Components)

- **更新组件 (Updated)**: `card-item`, `dropdown-menu`, `filter-chips`, `slider`, `stream-markdown`


### ✨ 组件增强

- `TxFilterChips` 增加滑动填充、图标与 icon-only 模式。
- `TxCardItem` 宿主可重新指向 hover / active 填充。
- `TxDropdown` 可承载文本输入框，锚定面板的背景在滚动行之下保持不透明。

### ⚡ 性能优化

- 锚定面板改用 transform 定位，`max-height` 保留 size middleware 写入的值。

### 🐛 组件修复

- 交互组件打磨收口：每个交互控件都有 cursor，`TxSlider` 的折射 slab 按尺寸计算而不是缩放。
- `TxStreamMarkdown` 的 PostCSS 产物保持 pack 可解析，构建期剥离非法律注释。

### 🧪 内部

- 类型审计可从 workspace 解析同级包（#1841）；补齐 spring / fill 契约与视觉任务证据文档。

## [0.4.0] - 2026-09-01

### 📦 组件变动 (Components)

- **组件架构收拢 (Updated)**: `button`, `icon` (移除冗余子路径与 `flat-button`)


### 💥 破坏性变更

- 收拢 button / icon 组件族：`TxIconButton`、`TxCopyButton` 移入 `@talex-touch/tuffex/button`，`TxOsIcon` 移入 `@talex-touch/tuffex/icon`；深子路径 `./flat-button`、`./icon-button`、`./copy-button`、`./os-icon`（含各自 `style.css`）随之移除。根入口导出的组件名与类型不变，仅深子路径消费方需要改导入来源。
- 删除冗余组件 `TuffFlatButton`（连同 `FlatButtonProps`、`TuffFlatButtonInstance`）：其能力与 `TxButton variant="flat"` 完全重复，请直接使用后者。

### 🧹 包体职责收口

- TuffEx 包移除本地 VitePress `docs:*` / playground 展示入口，源码包只保留 build、watch、lint、test、typecheck 与 package audit 脚本。
- 运行时 Demo 与公开文档统一迁移到 Nexus 承载，本地预览改为 `pnpm -C "apps/nexus" run dev`。

## [0.3.9] - 2026-06-12

### 📦 组件变动 (Components)

- **新增组件 (Since 0.3.9)**: `agent-trace`, `ai-elements`, `allocation-bar`, `approval-card`, `attachment-tray`, `border-beam`, `cell-link`, `chain-of-thought`, `code-stream`, `context-cards`, `context-indicator`, `conversation-stream`, `diff-table`, `dot-indicator`, `filter-chips`, `fine-tune-card`, `flat-dropdown`, `icon-chip`, `inline-citation`, `insight-cards`, `liquid`, `markdown-editor`, `message-actions`, `prompt-bar`, `reasoning-disclosure`, `recommendation-card`, `resize-box`, `scrub-field`, `search-panel`, `selection-actions`, `sidebar-nav`, `signal-meter`, `sources`, `spark-chart`, `stream-markdown`, `suggestion-chips`, `task-rows`, `thinking-orb`, `tool-call-card`, `tool-chips`, `tool-confirmation`, `version-capsule`, `working-indicator`
- **更新组件 (Updated)**: `base-anchor`, `base-surface`, `code-editor`, `empty-state`, `flip-overlay`, `radio`, `scroll`, `tabs`


### 🧩 组件导出

- 新增 `@talex-touch/tuffex/<component>` 稳定子路径导出与 `<component>/style.css` 局部样式入口，保留根入口兼容但推荐新代码使用按需子路径导入。
- 新增 `@talex-touch/tuffex/base.css` 基础样式入口，用于按需消费时单独加载共享 token 与全局 utility；`style.css` 继续保留为全量样式入口。
- Core App 的 TuffEx 受控注册逻辑改为按组件子路径动态加载，避免集中注册单个组件时触发根入口全量导出。
- 新增 Vite 按需样式注入插件，用于发布态按组件子路径消费时自动补齐 `<component>/style.css`；Core App 与 Nexus 开发态继续消费源码 SFC 样式，避免重复注入。
- 修复 `@talex-touch/tuffex/utils` 发布入口缺少 JS wrapper 的问题，并新增 `pnpm -C "packages/tuffex" run audit:exports` 校验发布 exports 对应 dist 文件。

### ⚡ 性能优化

- `TxScroll` 的 BetterScroll `pull-down` / `pull-up` 插件改为功能开启时按需加载，避免默认滚动入口静态拉入未启用的下拉刷新/上拉加载插件。
- `TxScroll` 的 pull 插件安装逻辑已抽到独立 helper，并新增 `scroll` 按需入口依赖图审计，防止默认滚动入口回退为静态拉入 pull 插件。
- `TxScroll` 的 wheel/bounce guard/RAF apply 运行时已拆到 `useScrollWheel`，SFC 仅保留模式切换、BetterScroll 初始化、native fallback 和模板绑定。
- `TxCodeEditor` 改为轻量 async wrapper，CodeMirror/YAML 运行时实现延后到真实渲染时加载，并在 `audit:size` 中禁止默认 `code-editor` 入口静态拉入 CodeMirror 依赖。
- 空态 wrapper 组件的局部样式入口改为轻量引用 `empty-state/style.css`，避免 `blank-slate` / `no-data` / `permission-state` 等按需样式重复复制整份 EmptyState CSS，并由 `audit:size` 防回涨。
- `TxBaseAnchor` 的 GSAP 动画运行时已抽到 `useBaseAnchorMotion` 并改为动态加载，默认 `base-anchor` / `button` / `select` 按需入口不再静态拉入 `gsap`，由 `audit:size` 防回涨。
- `TxFlipOverlay` 的 GSAP 动画运行时已抽到 `useFlipOverlayMotion` 并改为动态加载，默认 `flip-overlay` 按需入口不再静态拉入 `gsap`，由 `audit:size` 防回涨。
- `TxButton` 的 `v-wave` directive 改为首次挂载时动态加载，默认 `button` 按需入口不再静态拉入 `v-wave`，由 `audit:size` 防回涨。
- `TxRadioGroup` 的 v-model 延迟提交与 button indicator 动画/拖拽/键盘逻辑已拆到内部 helper，SFC 仅保留组合、provide、模板和样式，并新增 `radio` 按需入口依赖图审计。
- `TxBaseSurface` 的数值解析与 auto-detect / refraction recovery motion 状态机已拆到内部 helper，SFC 从 1150 行降到 725 行，并新增 `base-surface` 按需入口依赖图审计。
- Core App、Nexus 与 `intelligence-uikit` 的应用级样式入口已迁到 `base.css` + 按需局部样式，`audit:size` 现在同时防止根入口和 `@talex-touch/tuffex/style.css` 在这些消费侧回涨。

### 🐛 组件修复

- 修复 `TxTabs` 无法识别 `v-for` 生成的 `TxTabItem` / `TxTabItemGroup` 子项，以及 Nexus 异步注册后子项组件名丢失的问题，避免动态/文档标签页内容显示 `No tab selected`。

## [0.3.8] - 2026-05-29

### 🧩 组件增强

- 增强 `TxDrawer`：支持四方向、统一 `size`、`full` 全屏 prop、Header/Footer 自定义与关闭、TxDivider 分割线、遮罩/透明面板配置，以及移动端默认底部弹出。
- 增强 `TxDivider`：新增 `gradient` 渐变透明分割模式，支持起点、终点与两端透明衰减。
- 补齐 Nexus 侧 `TxDivider` 中英文文档、基础/渐变/垂直分割 demo、组件注册和索引入口。

## [0.3.7] - 2026-05-21

### 🚀 发布链路

- 修复 `@talex-touch/tuffex@0.3.7` 发布前的 lockfile specifier 不一致问题，确保 `pnpm install --frozen-lockfile`、构建与发布 manifest 校验可复现。
- 补齐 Tuffex CI/Publish workflow 对 `pnpm-lock.yaml` 与 workspace catalog 变更的触发，避免依赖规格修复漏跑包级流水线。

### 📚 文档站修复

- 修复组件文档中 `ApiSpecTable` 内联对象数组导致的 VitePress 构建失败，改为在 `<script setup>` 中声明数据后引用。
- 补齐文档主题缺失的 TuffEx 组件注册和旧标签兼容映射，确保 103 个组件页面均可正常渲染。
- 修复 `FlipOverlay`、`GroupBlock`、`Slider`、`Icon`、`Input`、`AvatarVariants` 等文档示例的运行时 warning/error。
- 新增文档站 `logo.svg`，并修正 favicon 路径。
- 补齐 `FlatRadio`、`FlatSelect`、`Transfer` 文档页，并把已有未入口化组件纳入侧边栏导航。
- 补齐 `docs/components/index.md` 中缺失的 `Alert`、`Badge`、`Breadcrumb`、`Card`、`Collapse`、`FlipOverlay`、`Modal`、`Pagination`、`Radio`、`Rating`、`SegmentedSlider`、`Steps`、`TextTransformer`、`Timeline` 入口，组件索引与 sidebar 保持一致。
- 将 `GlassSurface` 基础示例改为独立 Vue demo，修复真实浏览器预览中泄漏 Markdown / HTML 源码文本的问题。
- 将 `Input` 前后缀插槽示例改为独立 Vue demo，修复移动端真实预览中 raw slot markup 撑宽页面的问题。

### 🐛 组件修复

- 修复 `TxInput` 在 flex 容器中的收缩与横向溢出问题。
- 修复 `TxChatMessage`、`TxScroll`、`TxStagger` 在 VitePress SSR / hydration 场景下的客户端结构不一致问题。
- 修复 `TxStatCard` 默认数值与 insight 在文档站中可能被 `NumberFlow` 渲染为空的问题，改为稳定可见的文本基线。
- 修复 `TxTabs` 点击切换后 active nav 与内容不同步、并触发 Vue `setElementText(null)` 控制台错误的问题。

### 🧩 组件导出

- 为 `FlatInput` 增加 `TxFlatInput` 注册名和命名导出，避免文档页组件名与示例标签递归冲突。
- 新增 `TxTextarea`、`TxNumberInput`、`TxDivider`、`TxKbd`、`TxCopyButton` 五个基础补齐组件，并同步导出、文档和最小测试。
- 为文档站注册 `TxFlatRadio`、`TxFlatSelect`、`TxTransfer` 及其子项组件，保证新增页面可以直接渲染。

### ✅ 验证

- 完成组件源码目录、`components.ts` 导出、`docs/components` 页面、VitePress sidebar 与组件索引页对账。
- 真实浏览器桌面静态截图巡检 `111/111 PASS`，移动重点页截图巡检 `37/37 PASS`，明暗主题截图巡检 `222/222 PASS`，交互烟测 `26/26 PASS`。
- 新增 `scripts/audit-docs-inventory.mjs`、`scripts/audit-docs-coverage.mjs`、`scripts/audit-docs-pages.mjs`、`scripts/audit-docs-interactions.mjs` 和 `docs/quality/component-audit-2026-05-21.md`，沉淀可复跑的源码/导出/文档对账、覆盖矩阵、静态、主题、移动与交互 smoke 审计证据。
- 新增 `docs/quality/component-page-matrix-2026-05-21.md`，逐页记录源码、导出、文档、sidebar、索引、桌面截图、主题截图、移动重点页和交互 smoke 覆盖状态。
- `pnpm -C "packages/tuffex" run lint`、`pnpm -C "packages/tuffex" exec vitest run`、`pnpm -C "packages/tuffex" run docs:build`、`pnpm -C "packages/tuffex" run build` 与 `git diff --check -- "packages/tuffex"` 均通过。

## [0.3.4] - 2026-03-08

### 📚 文档优化

- 重写 `README.md`，统一安装、按需引入、工具导出和组件导出约定说明。
- 重写 `README_ZHCN.md`，与英文 README 结构对齐，去除过时 Beta 文案。

### 🧩 组件梳理

- 基于 `packages/components/src/components.ts` 重新梳理组件导出，确认当前导出模块为 **102** 项。
- 按基础导航、表单输入、布局结构、数据状态、反馈浮层、AI内容、动效视觉七大类补齐组件清单，避免文档与实际导出不一致。

## [最新更新] - 2024-07-22

### 🎨 重大设计更新

#### Button 组件全新视觉设计
- 🔥 **镂空透明效果**: 采用透明背景 + 底部 2px 粗边框的现代化设计
- ✨ **优雅悬停效果**: 悬停时轻微背景色 + 边框颜色变化 + 上移动画
- 🎯 **视觉层次优化**: 底部粗边框创造视觉重点，提升用户体验
- 📐 **尺寸规范化**: 统一的最小宽度和高度，确保一致的视觉效果

### ✨ 新功能

#### Button 组件重构
- 🔄 **组件名称更新**: `VcButton` → `TxButton`
- 🎨 **样式类名统一**: 全部使用 `tx-` 前缀
- 📱 **震动反馈支持**: 新增震动反馈功能，提升移动端体验
- 🎯 **完整功能实现**: 支持文档中所有要求的功能

#### 震动工具库
- 📳 **震动 API 封装**: 完整的设备震动功能支持
- 🎛️ **多种震动模式**: 7种预设震动类型
- 🔧 **高级配置**: 支持自定义震动模式和管理器
- 🛡️ **类型安全**: 完整的 TypeScript 类型定义
- 🧪 **单元测试**: 完整的测试覆盖

### 🎨 样式改进

#### 文档排版优化
- 📐 **按钮间距**: 使用 Flexbox 布局，支持自动换行
- 📱 **响应式设计**: 移动端适配，间距自动调整
- 🎯 **视觉一致性**: 统一的组件展示样式

#### 按钮样式增强
- ✨ **现代化效果**: 悬停上移 + 阴影效果
- 🔄 **平滑动画**: 所有状态变化都有过渡动画
- ♿ **无障碍支持**: 聚焦轮廓和键盘导航
- 🎨 **加载动画**: SVG 旋转加载指示器

### 📚 文档更新

#### Button 组件文档
- 🖼️ **可视化示例**: 所有示例都可直接在文档中渲染
- 📖 **完整 API**: 包含所有属性、事件和插槽说明
- 🎯 **震动功能**: 新增震动反馈使用示例
- 💡 **最佳实践**: 提供使用建议和注意事项

#### 工具库文档
- 📳 **震动工具**: 完整的震动 API 使用指南
- 🔧 **高级用法**: 自定义模式和管理器使用
- 🌐 **兼容性**: 浏览器支持情况说明
- 💡 **最佳实践**: 震动反馈使用建议

### 🧪 测试覆盖

#### Button 组件测试
- ✅ **基础功能**: 渲染、类型、尺寸测试
- ✅ **状态测试**: 禁用、加载状态测试
- ✅ **事件测试**: 点击事件和阻止测试
- ✅ **样式测试**: 各种样式变体测试

#### 震动工具测试
- ✅ **API 测试**: 所有公开方法测试
- ✅ **错误处理**: 异常情况处理测试
- ✅ **兼容性**: 不同环境支持测试
- ✅ **管理器**: 震动管理器功能测试

### 🔧 技术改进

#### 类型定义
- 📝 **完整类型**: 所有组件和工具的 TypeScript 类型
- 🔗 **类型导出**: 便于外部使用的类型导出
- 🛡️ **类型安全**: 严格的类型检查

#### 代码结构
- 📁 **模块化**: 清晰的文件组织结构
- 🔄 **可维护**: 易于扩展和维护的代码
- 📚 **文档化**: 完整的代码注释和说明

### 📱 移动端优化

#### 震动反馈
- 📳 **智能震动**: 根据按钮类型自动选择震动模式
- 🎛️ **可控制**: 支持开关震动功能
- 🔋 **性能优化**: 避免频繁震动影响电池

#### 响应式设计
- 📱 **移动适配**: 按钮在移动设备上的最佳显示
- 👆 **触摸友好**: 合适的触摸目标大小
- 🎨 **视觉反馈**: 清晰的交互状态反馈

### 🚀 性能优化

#### 组件性能
- ⚡ **按需加载**: 支持按需导入组件
- 🎯 **优化渲染**: 减少不必要的重新渲染
- 📦 **体积优化**: 精简的组件代码

#### 工具性能
- 🔧 **轻量级**: 震动工具库体积小巧
- 🛡️ **错误处理**: 优雅的错误处理机制
- 💾 **内存优化**: 避免内存泄漏

### 🔮 未来计划

- 🎨 **主题系统**: 完整的主题定制系统
- 🧩 **更多组件**: 持续添加新组件
- 📱 **PWA 支持**: 渐进式 Web 应用支持
- 🌐 **国际化**: 多语言支持

---

## 使用示例

### 基础按钮
```vue
<template>
  <TxButton type="primary" @click="handleClick">
    点击我
  </TxButton>
</template>
```

### 震动反馈
```vue
<template>
  <TxButton 
    type="success" 
    vibrate-type="success"
    @click="handleSuccess"
  >
    成功操作
  </TxButton>
</template>
```

### 自定义震动
```typescript
import { useVibrate } from '@talex-touch/touchx-ui/utils'

const handleClick = () => {
  useVibrate('heavy')
}
```


## 📋 组件引入版本总览 (Component Since Index)

| 组件 (Slug) | 所属套件 (Suite) | 引入版本 (Since) |
|---|---|---|
| `agent-screen` | ai | **0.6.0** |
| `agent-trace` | ai | **0.3.9** |
| `agents` | ai | **0.3.4** |
| `ai-elements` | ai | **0.3.9** |
| `alert` | base | **0.3.4** |
| `allocation-bar` | pro | **0.3.9** |
| `approval-card` | ai | **0.3.9** |
| `attachment-tray` | ai | **0.3.9** |
| `auto-sizer` | pro | **0.3.4** |
| `avatar` | base | **0.3.4** |
| `badge` | base | **0.3.4** |
| `base-anchor` | pro | **0.3.4** |
| `base-surface` | pro | **0.3.4** |
| `blank-slate` | base | **0.3.4** |
| `border-beam` | pro | **0.3.9** |
| `bot-avatar` | ai | **0.6.2** |
| `breadcrumb` | base | **0.3.4** |
| `button` | base | **0.3.4** |
| `card` | base | **0.3.4** |
| `card-item` | base | **0.3.4** |
| `card-spread` | pro | **0.7.0** |
| `carousel-3d` | pro | **0.7.0** |
| `cascader` | base | **0.3.4** |
| `cell-link` | base | **0.3.9** |
| `chain-of-thought` | ai | **0.3.9** |
| `charts` | pro | **0.6.0** |
| `chat` | ai | **0.3.4** |
| `checkbox` | base | **0.3.4** |
| `choice-card` | ai | **0.6.0** |
| `code-editor` | pro | **0.3.4** |
| `code-stream` | ai | **0.3.9** |
| `collapse` | base | **0.3.4** |
| `command-palette` | pro | **0.3.4** |
| `container` | base | **0.3.4** |
| `context-cards` | ai | **0.3.9** |
| `context-indicator` | ai | **0.3.9** |
| `context-menu` | base | **0.3.4** |
| `conversation-stream` | ai | **0.3.9** |
| `corner-overlay` | pro | **0.3.4** |
| `data-table` | base | **0.3.4** |
| `date-picker` | base | **0.3.4** |
| `descriptions` | base | **0.6.3** |
| `dialog` | base | **0.3.4** |
| `diff-table` | pro | **0.3.9** |
| `divider` | base | **0.3.7** |
| `dot-indicator` | base | **0.3.9** |
| `drawer` | base | **0.3.4** |
| `dropdown-menu` | base | **0.3.4** |
| `edge-fade-mask` | pro | **0.3.4** |
| `empty` | base | **0.3.4** |
| `empty-state` | base | **0.3.4** |
| `error-state` | base | **0.3.4** |
| `file-uploader` | base | **0.3.4** |
| `filter-chips` | base | **0.3.9** |
| `fine-tune-card` | ai | **0.3.9** |
| `flat-dropdown` | base | **0.3.9** |
| `flat-radio` | base | **0.3.4** |
| `flat-select` | base | **0.3.4** |
| `flex` | base | **0.3.4** |
| `flip-book` | pro | **0.7.0** |
| `flip-overlay` | pro | **0.3.4** |
| `floating` | pro | **0.3.4** |
| `flow-light` | pro | **0.8.0** |
| `flowchart` | ai | **0.6.0** |
| `form` | base | **0.3.4** |
| `fusion` | pro | **0.3.4** |
| `fusion-surface` | pro | **0.6.0** |
| `glass-surface` | pro | **0.3.4** |
| `glow-text` | pro | **0.3.4** |
| `gradient-border` | pro | **0.3.4** |
| `gradual-blur` | pro | **0.3.4** |
| `grid` | base | **0.3.4** |
| `grid-layout` | base | **0.3.4** |
| `group-block` | base | **0.3.4** |
| `guide-state` | base | **0.3.4** |
| `icon` | base | **0.3.4** |
| `icon-chip` | base | **0.3.9** |
| `icon-morph` | pro | **0.6.0** |
| `icon-picker` | base | **0.6.0** |
| `image-gallery` | base | **0.3.4** |
| `image-generation` | pro | **0.6.2** |
| `image-uploader` | base | **0.3.4** |
| `inline-citation` | ai | **0.3.9** |
| `input` | base | **0.3.4** |
| `insight-cards` | ai | **0.3.9** |
| `kbd` | base | **0.3.7** |
| `keyframe-stroke-text` | pro | **0.3.4** |
| `layout-skeleton` | base | **0.3.4** |
| `liquid` | pro | **0.3.9** |
| `loading-overlay` | base | **0.3.4** |
| `loading-state` | base | **0.3.4** |
| `markdown-editor` | pro | **0.3.9** |
| `markdown-view` | base | **0.3.4** |
| `message-actions` | ai | **0.3.9** |
| `metal-fx` | pro | **0.6.2** |
| `modal` | base | **0.3.4** |
| `mode-chip` | ai | **0.6.0** |
| `morph` | pro | **0.7.0** |
| `motion` | pro | **0.7.0** |
| `motion-button` | pro | **0.7.0** |
| `motion-control` | pro | **0.7.0** |
| `motion-dock` | pro | **0.7.0** |
| `motion-form` | pro | **0.7.0** |
| `motion-loader` | pro | **0.7.0** |
| `motion-metric` | pro | **0.7.0** |
| `motion-text` | pro | **0.7.0** |
| `motion-toggle` | pro | **0.7.0** |
| `motion-transition` | pro | **0.7.0** |
| `nav-bar` | base | **0.3.4** |
| `no-data` | base | **0.3.4** |
| `no-selection` | base | **0.3.4** |
| `number-input` | base | **0.3.7** |
| `offline-state` | base | **0.3.4** |
| `outline-border` | pro | **0.3.4** |
| `pagination` | base | **0.3.4** |
| `permission-state` | base | **0.3.4** |
| `physics-motion` | pro | **0.7.0** |
| `picker` | base | **0.3.4** |
| `popover` | base | **0.3.4** |
| `prism-glow` | pro | **0.6.0** |
| `progress` | base | **0.3.4** |
| `progress-bar` | base | **0.3.4** |
| `prompt-bar` | ai | **0.3.9** |
| `radio` | base | **0.3.4** |
| `rating` | base | **0.3.4** |
| `reasoning-disclosure` | ai | **0.3.9** |
| `recommendation-card` | ai | **0.3.9** |
| `resize-box` | pro | **0.3.9** |
| `scroll` | base | **0.3.4** |
| `scrub-field` | base | **0.3.9** |
| `search-empty` | base | **0.3.4** |
| `search-input` | base | **0.3.4** |
| `search-panel` | pro | **0.3.9** |
| `search-select` | base | **0.3.4** |
| `segmented-slider` | base | **0.3.4** |
| `select` | base | **0.3.4** |
| `selection-actions` | base | **0.3.9** |
| `sensitive-input` | base | **0.6.0** |
| `sidebar-nav` | base | **0.3.9** |
| `signal-meter` | pro | **0.3.9** |
| `skeleton` | base | **0.3.4** |
| `slider` | base | **0.3.4** |
| `sortable-list` | base | **0.3.4** |
| `sources` | ai | **0.3.9** |
| `spark-chart` | pro | **0.3.9** |
| `spinner` | base | **0.3.4** |
| `splitter` | base | **0.3.4** |
| `stack` | base | **0.3.4** |
| `stagger` | pro | **0.3.4** |
| `stat-card` | base | **0.3.4** |
| `status-badge` | base | **0.3.4** |
| `status-hint` | base | **0.6.0** |
| `steps` | base | **0.3.4** |
| `stream-element` | ai | **0.6.3** |
| `stream-markdown` | ai | **0.3.9** |
| `stream-text` | ai | **0.6.3** |
| `suggestion-chips` | ai | **0.3.9** |
| `switch` | base | **0.3.4** |
| `tab-bar` | base | **0.3.4** |
| `tabs` | base | **0.3.4** |
| `tag` | base | **0.3.4** |
| `tag-input` | base | **0.3.4** |
| `task-rows` | ai | **0.3.9** |
| `terminal` | pro | **0.7.0** |
| `text-morph` | pro | **0.6.0** |
| `text-transformer` | pro | **0.3.4** |
| `textarea` | base | **0.3.7** |
| `thinking-orb` | ai | **0.3.9** |
| `timeline` | base | **0.3.4** |
| `toast` | base | **0.3.4** |
| `toast-panel` | base | **0.6.0** |
| `tool-call-card` | ai | **0.3.9** |
| `tool-chips` | ai | **0.3.9** |
| `tool-confirmation` | ai | **0.3.9** |
| `tooltip` | base | **0.3.4** |
| `transfer` | base | **0.3.4** |
| `transition` | pro | **0.3.4** |
| `tree` | base | **0.3.4** |
| `tree-select` | base | **0.3.4** |
| `tuff-logo-stroke` | pro | **0.3.4** |
| `version-capsule` | pro | **0.3.9** |
| `virtual-list` | pro | **0.3.4** |
| `voice-beam` | pro | **0.6.2** |
| `voice-clip` | ai | **0.8.0** |
| `working-indicator` | ai | **0.3.9** |
