# Research: CoreBox ⌘K 操作面板（MetaOverlay）——居中、背景模糊与展示形式审计

- **Query**：老板 2026-09-26 发来带标注的截图（⌘K 面板处于打开状态）：「1. meta 没有居中 2. 背景的那个模糊也有问题 3. meta这个展示形式也需要重构」。主 agent 要求：说明架构，给出居中和模糊的根因及修复，列出内容问题，提出 2–3 个重构方案并给推荐，列出需要老板拍板的决策。
- **Scope**：mixed。包括代码阅读、git 历史、对运行中 dev app 的 `#/meta-overlay` target 做的只读 CDP `Runtime.evaluate`（只读 DOM 和计算样式，没有输入也没有导航），以及 Electron、Raycast 的外部资料。
- **Date**：2026-09-26
- **行号基准**：2026-09-26 的工作区。`R/views/box/CoreBox.vue` 里有另一会话尚未提交的改动（TxPrismGlow 搜索光效，+88/-5），这个文件的行号按工作区计；其余引用文件和 HEAD 一致。
- **路径简写**：`M/` = `apps/core-app/src/main/modules/box-tool/core-box/`，`R/` = `apps/core-app/src/renderer/src/`，`T/` = `packages/tuffex/packages/components/src/`
- **没看到原图**：截图内容以主 agent 的转述为准：卡片约 800×1000 物理像素（@2x），顶边在约 200px 处，底边压到窗口底，背景的模糊里有不属于 CoreBox 的深红条和终端文字。

---

## 0. 结论速览

1. **MetaOverlay 不是独立窗口。** 它是挂在 CoreBox `BrowserWindow.contentView` 上、铺满整个窗口的透明 `WebContentsView`，靠 `addChildView` 的先后顺序压在插件视图上面。不用 CoreBox 自己的 DOM 来画，是因为插件 UI 本身也是一个 `WebContentsView`（从 y=56 一直到窗口底）。CoreBox 渲染进程的 DOM 永远在它下面。
2. **"没居中"是 CSS 写死的顶对齐，不是算错。**
   - 遮罩写的是 `align-items: flex-start; padding-top: 100px`，卡片写的是 `width: 400px; max-height: 500px`。
   - 按 ⌘K 时，主进程先执行 `expand({ forceMax: true })`，把窗口撑到 600。
   - 100 + 500 = 600：卡片上方留 100px，底边正好贴住窗口底边，阴影被裁掉。截图的 800×1000 @2x、顶部约 200px 和这个完全吻合。
   - 次要因素：开启窗口动画时的首帧；面板打开期间 `layout.update` 仍可能把窗口缩小；小屏时窗口高度被 clamp；关闭面板后窗口高度不还原（后两条是推断）。
3. **"背景模糊"不是面板做出来的。**
   - 面板上的 `backdrop-filter: blur(4px)` 在 macOS 上够不到别的 WebContentsView（Electron #45206：mac 上从来没生效过，Win/Linux 上生效）。
   - 老板在 mac 上看到的模糊，其实是 CoreBox 窗口自身的 vibrancy（`fullscreen-ui`，模糊的是窗口**背后的桌面**）。它透过 CoreBox 那层 75% 不透明的底色露出来，上面再叠一层 40% 的黑色遮罩。
   - forceMax 把窗口从内容高度撑到 600 之后，结果列表下方整条空白里只剩 vibrancy，于是能看到终端、红条这类桌面内容。
   - 覆盖层不会超出 CoreBox：它的 bounds 就等于父窗口的 bounds。实测它确实跟着窗口走，当前是 720×56。
4. **内容问题是系统性的：**
   - 内置动作是硬编码的中文，file/app provider 的动作是硬编码的英文；
   - "打开"和 "Open" 重复，而文件项的 "Open" 实际执行的是"在 Finder 中显示"；
   - 空心圆是缺省图标；
   - 所有动作都挤在一个"操作"组里；
   - Win/Linux 上内置动作的快捷键全部失效，⌘⌥T 永远匹配不上，⌘C 会抢走搜索框的复制；
   - 没有 IME 保护，方向键不会把选中行滚动到可见区域，鼠标 hover 会抢走选中；
   - CoreBox 里的 toast 被关掉了，执行动作后没有任何反馈。
5. **推荐方案 B：Raycast 式的紧凑面板。**
   - 面板锚在右下角，位于 footer「⌘K 操作」提示的正上方。
   - 继续使用现有的全窗口透明 WebContentsView，这样照样能盖住插件视图，ready 握手协议也不用改。
   - 去掉遮罩和模糊。
   - 窗口按需增高，关闭后还原。
   - 动作模型一起重做：i18n、去重、分组、图标、chord。

---

## 1. 架构

### 1.1 组成

| 层 | 文件:行 | 作用 |
|---|---|---|
| 主进程管理器 | `M/meta-overlay.ts:41-604` | 单例 `MetaOverlayManager`：<br>• `init()` 在 `:107` 创建 `WebContentsView`，`:155` 通过 `addChildView` 挂到 CoreBox 窗口<br>• bounds 始终是 `{0, 0, 窗口宽, 窗口高}`（`:157-163`、`:264-270`、`:559-570`）<br>• `:167` 背景色 `#00000001`，`:170` 初始隐藏<br>• `:172-183` 加载同一个 renderer 入口的 `#/meta-overlay` |
| IPC | `M/ipc.ts:604-679` | • `ui.ready`（`:604-614`，只接受当前 view 发来的消息）<br>• `ui.show`（`:616-632`，先 `expand({ forceMax: true })`（`:627`）再 `show`（`:629`））<br>• `ui.hide`、`ui.isVisible`<br>• `action.execute`（`:650-662`，拒绝非 overlay 的 sender）<br>• 插件的 `action.register` / `action.unregister` |
| 触发 | `R/modules/box/adapter/hooks/useKeyboard.ts:774-804` | ⌘K / Ctrl+K：`resolveQuickActionsItem` 取当前项，再用 `generateBuiltinActions` + `convertTuffActionToMetaAction` 组装，发 `MetaOverlayEvents.ui.show`。`:607-610` 保证 ⌘K 不会被转发给插件 |
| 面板渲染 | `R/views/meta/MetaOverlay.vue` | 合并 plugin / item / builtin 三类动作并按 priority 排序（`:100-111`）、过滤（`:53-88`）、分组（`:35-51`）、键盘（`:130-203`）、执行（`:205-235`）。挂载方式：<br>• `R/AppEntrance.vue:91-93` 在 `windowMode === 'MetaOverlay'` 时直接挂载<br>• `R/base/router.ts:364-373` 另有同名路由<br>• preload 在 `apps/core-app/src/preload/index.ts:77-80` 用 hash 或参数识别，`:796-798` 给 body 加 `meta-overlay` class |
| 行组件 | `R/components/meta/MetaActionItem.vue` | 图标 + 标题 + 副标题 + 快捷键 chip |
| 执行回流 | `M/meta-overlay.ts:477-551` → `R/modules/box/adapter/hooks/useActionPanel.ts:272-281` | 插件动作走 `sendToPlugin`。item 动作和内置动作走 `broadcastToWindow(CoreBox)`，由 CoreBox 渲染进程里的 `executeAction`（`:104-229`）执行 |
| Esc | `M/meta-overlay.ts:143-149`（`before-input-event`）、`MetaOverlay.vue:134-139`、CoreBox 侧 `useKeyboard.ts:1029-1053` | CoreBox 侧先问 `isVisible`，可见就只关面板 |
| 插件全局动作 | `packages/utils/plugin/sdk/quick-actions-sdk.ts:440-455` | 默认 priority 100。对插件开放的只有 `action.register` / `action.unregister`（`packages/utils/transport/security/plugin-facing-events.ts:132-134`），`ui.show` 是内部事件，可以放心扩展 |

### 1.2 为什么用 WebContentsView，而不是 CoreBox 的 DOM

- **设计意图。** `docs/plan-prd/03-features/meta-overlay/META-OVERLAY-PRD.md` 写的是：「采用三层 WebContents 架构，确保能够覆盖插件 UI 层」。文中的三层示意图是：MetaOverlay 在顶层，插件 uiView 在中层（y=60 起），CoreBox 在底层。
- **代码上的硬约束。** 插件视图是 CoreBox 窗口的一个子 `WebContentsView`，bounds 从 `y = headerHeight(56)` 一直到窗口底（`M/plugin-view-controller.ts:124-135`），盖住了 CoreBox 的结果区和 footer。
  - 子视图之间的 z 序只由 `addChildView` 的先后决定，后加入的在上面。
  - CoreBox 自己的 webContents 在最底层，DOM 的 z-index 再高也压不过子视图。
  - 所以 overlay 必须是最后加入的子视图。每次 `show()` 都会调用 `ensureOnTop()`（`M/meta-overlay.ts:235-246, 271`）；新建插件视图后也会调用一次（`M/plugin-view-controller.ts:293-295`）。
- **它不是独立的 BrowserWindow。** 主进程里没有 `capturePage`（在 `apps/core-app/src/main` 下 `rg capturePage` 没有结果）。所以"另开一个窗口去截桌面"的情况不存在。
- **搜索模式其实不需要这一层，但一直走的是同一条路径。** 搜索模式下没有插件 WebContentsView。原先还有一个 DOM 版的 `R/components/render/ActionPanel.vue`，在 `33223fc00`（2026-07-22）被当作死代码删掉了。

### 1.3 生命周期

- **预热。** CoreBox 每次显示时都会调用 `metaOverlayManager.prewarm()`（`M/window.ts:412`），并用 `setImmediate` 推迟执行，避开显示动画的那一帧（`M/meta-overlay.ts:217-224`）。
- **显示要等 ready 握手。**
  - `show()` 只是把请求放进 pending 队列（`:255-273`）。
  - renderer 挂好监听后发送 `ui.ready`（`MetaOverlay.vue:245-276`）。
  - 主进程收到之后才执行 `sendTo(ui.show)`、`setVisible(true)` 和 `focus()`（`:297-341`）。
  - 这是 `.trellis/spec/main-process/channel-transport-contracts.md` §3 点名的范例契约，重构时不能破坏。
- **关闭时只隐藏、不销毁**（`a61147f30`，2026-09-14）。`hide()` 会发 `ui.hide` 去重置 renderer 的状态（`:374-403`），**但不会还原 CoreBox 的窗口高度。**
- **高度追随。**
  - `WindowBoundsController.setBounds()` 每次都会调用 `syncOverlayBounds`（`M/bounds-controller.ts:88-92`，接线在 `M/window.ts:77-82`）。
  - show 之后 220ms 再补同步一次（`M/meta-overlay.ts:43, 343-353`）。220 就是窗口动画时长的上限（`M/bounds-controller.ts:199`）。
  - 窗口的 `resize` 事件只在挂着插件视图时才同步 overlay（`M/window.ts:291-307`）。
- **只读 CDP 实测**（overlay target：`http://127.0.0.1:5173/#/meta-overlay`）：
  - `innerWidth × innerHeight = 720×56`（CoreBox 当前是收起状态），`devicePixelRatio = 2`；
  - `html`、`body`、`#app`、`.AppEntrance` 的背景都是 `rgba(0,0,0,0)`，都没有 filter 或 backdrop-filter；
  - `data-theme=light`，`--tx-bg-color=#ffffff`，`--tx-fill-color=#f0f2f5`。
  - 结论：overlay 始终和窗口一样大，它自己的文档完全透明。

### 1.4 相关决策（git）

| 提交 | 日期 | 内容 |
|---|---|---|
| `a2c8b6d22` | 2026-01-03 | 引入 MetaOverlay。遮罩和卡片的 CSS 从那以后没有改过：`padding-top: 100px`、`backdrop-filter: blur(4px)`、`max-height: 500px`、`align-items: flex-start`（对这几项跑 `git log -G`，只命中这一个提交）。这套样式沿用了旧 DOM 版 ActionPanel 的"全窗口遮罩 + 顶部留白"（旧版是 `padding-top: 120px`，可用 `git show 33223fc00^:apps/core-app/src/renderer/src/components/render/ActionPanel.vue` 查看） |
| `d553e8acd` | 2026-02-27/28 | 在 `ui.show` 之前加了 `coreBoxManager.expand({ forceMax: true })`。`docs/plan-prd/01-project/CHANGES.md` 2026-02-27 条目给出的理由是：「触发 Meta+K 后 CoreBox 可能保持当前高度，导致操作面板显示空间不足」 |
| `fd4bad27d` | 2026-04-10 | 面板外框文案（placeholder、footer、默认组名）做了 i18n；内置动作的文案没动 |
| `7a49da34f` | 2026-06-14 | item 动作按 `navigate` / `copy` / `open` / `execute` 走 renderer 管线。「Open → showInFolder」就是这次引入的 |
| `14888aff2` | 2026-07-18 | CoreBox 这类紧凑窗口不再挂 toast 宿主 |
| `33223fc00` | 2026-07-22 | 加入合成主操作（Enter 的行为等同于主列表的 Enter）；删除 DOM 版 ActionPanel.vue。旧版用的是 `corebox.actions.*` 的 i18n key，并且按 `type` 选图标 |
| `a61147f30` | 2026-09-14 | renderer 常驻并预热；把 forceMax 挪到 `show()` 之前，并加了注释 |

---

## 2. 问题 1：面板没居中

### 2.1 几何（默认设置、搜索模式、文件项）

- **窗口。**
  - 按 ⌘K 后执行 `expand({ forceMax: true })`（`M/ipc.ts:627`），得到 `height = 600`（`M/window.ts:481-482`）；宽度固定为 720（`:45`）。
  - 只有当工作区高度不到 624 时才会被 clamp（`M/bounds.ts:19-21`）。
  - 默认 `animation.coreBoxResize = false`（`packages/utils/common/storage/entity/app-settings.ts:462`），所以走的是同步 `setBounds`（`M/window.ts:503-511`）。
- **overlay 视图**：`{0, 0, 720, 600}`（`M/meta-overlay.ts:264-270`）。
- **遮罩 `.MetaOverlay`**：`position: fixed; inset: 0; display: flex; align-items: flex-start; justify-content: center; padding-top: 100px`（`R/views/meta/MetaOverlay.vue:343-353`）。
- **卡片 `.MetaPanel`**：`width: 400px; max-height: 500px; overflow: hidden`（`:355-364`）。
- **结果。**
  - 卡片水平方向是 x 160→560，是居中的；纵向是 y 100→600，上方留 100px，下方 0px。
  - 底边贴住窗口底边，`box-shadow: 0 16px 48px`（`:358`）朝下的部分全被裁掉。
- **内容高度估算**（按 CSS 推算，没有实测）：
  - 头部约 61px，footer 约 32px，列表可视区约 391px。
  - 带副标题的行约 56.5px，不带的约 40px。
  - 文件项一共 10 个动作，自然高度约 616px，超过 500 被截断。
  - 可见范围到"复制名称"为止（最后几像素被切掉）；"在 Finder 中显示""流转到其他插件"在折叠线以下。
  - 这和截图吻合：800×1000 @2x，顶部约 200px，最后一行是"复制名称 ⌘C"。

### 2.2 根因

- **主因（必现）。** 卡片是按"全屏命令面板"的方式顶对齐的：`align-items: flex-start`，加上固定的 `padding-top: 100px` 和固定的 `max-height: 500px`，完全没有参照视口高度（没有任何 `calc(100vh …)`）。forceMax 又恰好把视口定在 600，100 + 500 正好顶满。所以只要动作有 8 个以上，卡片就一定贴到底。
- **次因 1（开启窗口动画时）。**
  - `M/ipc.ts:624-626` 的注释说"先 expand，`show()` 就能读到最终的 bounds"，但这只在同步分支成立。
  - 在动画分支（`M/window.ts:501-502`）里，`show()` 读到的是动画起点的高度。overlay 要靠逐帧的 `syncOverlayBounds` 和 220ms 的补同步才能追上。
  - 结果是最初 120–220ms 内卡片底部会被裁掉。
- **次因 2（推断，未复现）。**
  - 面板打开期间，CoreBox 渲染进程仍可能发 `layout.update`（`R/modules/box/adapter/hooks/useResize.ts:145-210`），比如流式搜索结束，或 `results:settled` 的 180ms 定时器触发（`:23, 237-245`）。
  - 主进程的 `applyLayoutUpdate` 只有 UI 模式的保护（`:230`），没有"overlay 可见时不缩窗"的保护（`apps/core-app/src/main/modules/box-tool/core-box/index.ts:218-380`），会直接调用 `windowManager.setHeight(内容高度)`（`:379`）。
  - 于是窗口在面板底下缩回去，overlay 跟着变矮，卡片被截断。
- **次因 3（推断）：关闭后窗口不还原。**
  - `hide()` 不碰窗口高度（`M/meta-overlay.ts:374-388`）。
  - `_expandState = { forceMax: true }` 要等 CoreBox 隐藏时才会清掉（`M/manager.ts:195-199`）。
  - useResize 会跳过没有变化的 payload（`useResize.ts:195-206`）。
  - 所以按 Esc 关掉面板后，CoreBox 很可能一直停在 600，底部留着一条空白，直到结果发生变化。

### 2.3 修复

- **如果保留居中卡片（方案 A）：**
  - `.MetaOverlay { align-items: center; padding: 12px }`；
  - `.MetaPanel { max-height: min(500px, calc(100vh - 24px)) }`；
  - 给阴影留出边距。
- **窗口高度策略（任何方案都需要）：**
  1. 不再使用 forceMax。由 CoreBox 渲染进程根据动作数和固定行高算出面板需要的高度，放进 `ui.show` 请求里。主进程只在"当前高度小于所需高度"时调用 `expand({ height })`，上限 600（`M/window.ts:477-478` 已经支持 `height` 参数）。
  2. 记下打开面板前的高度，在 `hide()` 时还原；或者让 CoreBox 强制重发一次 layout。
  3. overlay 可见期间，`applyLayoutUpdate` 先暂存不执行，隐藏后再应用最后一次。

---

## 3. 问题 2：背景模糊

### 3.1 模糊从哪里来：三个候选

**候选 1：overlay 自己的 CSS**（`backdrop-filter: blur(4px)` 加 `background: rgba(0,0,0,.4)`，`MetaOverlay.vue:346, 352`）

- **结论**：在 mac 上什么都没模糊，只剩一层平的 40% 黑。在 Win/Linux 上，它会模糊下面的 CoreBox 或插件视图。
- **依据 1**：Electron issue [#45206](https://github.com/electron/electron/issues/45206)「Backdrop filters no longer function/apply between View's」。
  - 一位贡献者实测后写道："doesn't look like the expected behavior ever worked on macOS (at least going back to v30)"。
  - 维护者说上游的修复 "should resolve the reported issue on Linux and Windows, but will probably not create the behavior on Mac"。上游是 crbug 391907157，CL 6262017，2025-03 关闭。
  - 本仓的 Electron 版本是 41.10.4。
- **依据 2**：overlay 文档本身是全透明的（见 1.3 的 CDP 实测），所以它唯一能"模糊"的，是它自己下面那片空的区域。

**候选 2：CoreBox 窗口自己的 macOS vibrancy**

- **结论**：老板看到的模糊就是它。
- **依据**：
  - darwin 上所有 `TouchWindow` 都会调用 `setVibrancy('fullscreen-ui')`（`apps/core-app/src/main/core/touch-window.ts:92-93`）。只有 VoiceDock 通过 `disableVibrancy` 退出（`apps/core-app/src/main/config/default.ts:106`）。
  - CoreBox 就是 `new TouchWindow({ ...BoxWindowOption })`（`M/window.ts:199`），并且 `transparent: true`（`config/default.ts:57`）。
  - CoreBox 渲染进程只铺了一层 75% 不透明的 `--tx-fill-color`（`.core-box .CoreBox-Mask`，`R/views/box/CoreBox.vue:1638-1646`，浅色模式下是 `#f0f2f5`）。
  - 头部 `div.CoreBox`（`:1599`，注释写的是 "the bar's transparent background"）和 `div.CoreBoxRes`（`:1463-1476`）都没有自己的背景。
  - 所以凡是没有行内容的地方，看到的都是 vibrancy 材质，也就是窗口**背后桌面**的模糊。

**候选 3：截图或另开窗口**

- **结论**：不存在。
- **依据**：主进程里没有 `capturePage`；overlay 是子视图，bounds 等于父窗口的 bounds。

### 3.2 为什么会露出"不是 CoreBox 的东西"

- **forceMax 撑出来的空白区只剩桌面。** 它把窗口从内容高度（比如 5 条结果大约是 300–350px）撑到 600。多出来的整块区域里只有 CoreBox-Mask 和 vibrancy，而 vibrancy 采样的是窗口后面的桌面（终端、红色条），再被 40% 的黑色压暗。这就是"背景模糊里是 CoreBox 以外的内容"。
- **窗口本身没有错位，也没有超出 CoreBox。** overlay 和窗口严格同框（`M/meta-overlay.ts:264-270, 559-570`），CDP 实测它的 720×56 也跟着收起的窗口走。
- **遮罩把整个启动器都压暗了。** 遮罩是全窗口的 `inset: 0`，搜索框也被盖住，整个启动器一起变暗。
- **卡片和四周的对比很生硬。** 卡片是纯白、不透明的，阴影垂直向下；四周是偏暗、带桌面纹理的背景。
- **两个平台的效果不一致。** 同一段 CSS：
  - mac 上 = 平的暗化 + vibrancy 露出的桌面；
  - Windows/Linux 上 = 4px 模糊 + 暗化。
- **圆角不是原因。** overlay 是同一窗口的子视图，窗口的形状会连它一起裁，它画不到窗口外面去。

### 3.3 修复

- **去掉 `backdrop-filter`。** 删掉 `.MetaOverlay` 上的这一项。遮罩要么直接删掉（方案 B），要么改成很轻的纯暗化（方案 A，比如 0.12–0.2，不做模糊），这样三个平台效果一致。
- **不再 forceMax。** 改成按需增高、关闭后还原（见 §2.3），就不会凭空多出一大片 vibrancy 空白。
- **如果老板坚持要"模糊 CoreBox"（不推荐）：**
  - mac 上只能由 CoreBox 渲染进程在自己的文档里做：收到"overlay 可见"的信号后，给 `.CoreBox-Wrapper` 加 `filter: blur()`。
  - 插件视图在 mac 上无论如何都模糊不了。
  - 代价是整个窗口的 filter 重绘，还要多加一条可见性信号链路。

### 3.4 建议的验证步骤（给实现阶段用）

1. 分别在"结果很少"和"结果很多"两种状态下按 ⌘K。如果桌面纹理只出现在结果列表下方的空白里，就说明原因是 vibrancy 加 forceMax。
2. 在 overlay target 的 DevTools 里去掉 `backdrop-filter`：在 mac 上应该看不出任何变化。
3. 再把遮罩的 alpha 调成 0：那块桌面纹理仍然在（只是不再变暗），说明它属于 CoreBox 窗口，而不属于 overlay。

---

## 4. 内容与展示问题

1. **中英混排**
   - **位置**：
     - 内置动作：`useKeyboard.ts:46-49`（在 Finder 中显示）、`:240-276`（合成主操作）、`:302-408`（其余内置动作，组名"操作"也在这里）、`:415, 420`（item 动作的兜底标题和组名）。全部是硬编码中文。
     - provider 动作：`apps/core-app/src/main/modules/box-tool/addon/files/utils.ts:247-330`（'Open'、'Open Folder'、'Copy Path'、'Copy Shell Path'、'Copy File URL'、'Copy Windows Path'、'Copy WSL Path'）；`addon/apps/search-processing-service.ts:72-81`（'Open'）；`addon/preview/preview-provider.ts:179-187`（'复制结果'）。
   - **说明**：
     - `corebox.actions.*` 这组 i18n key 已经存在（`R/modules/lang/zh-CN.json` 和 `en-US.json` 的 `:6350-6360`），但代码里没有任何地方用。唯一的使用者就是已经删掉的 DOM 版 ActionPanel.vue。
     - 面板外框的文案已经做了 i18n（`MetaOverlay.vue:307, 333-335`），但 "Enter"、"Esc"、"⌘K" 仍是字面量（`:310, 334-335`）。
     - 结果：中文 UI 里文件动作显示英文，英文 UI 里内置动作和组名显示中文。
     - 主进程其实有 `t()`（`apps/core-app/src/main/utils/i18n-helper.ts:97`）。provider 文案是在主进程本地化，还是在渲染端按 action id 映射，需要拍板（见 §6）。

2. **图标不一致、出现空心圆**
   - **位置**：`R/components/meta/MetaActionItem.vue:15-19, 33`
   - **说明**：
     - 缺省图标是 `i-ri-checkbox-blank-circle-line`，看起来像一个没勾选的单选框。
     - `convertTuffActionToMetaAction`（`useKeyboard.ts:410-425`）只透传了 `icon`，忽略了 `type`；而 DSL 的注释写的是 `type` 会"影响默认图标"（`packages/utils/core-box/tuff/tuff-dsl.ts:525-530`）。
     - 旧 ActionPanel 里有一个 `resolveActionIcon(type)`，按 copy / open / navigate / delete / edit / share 映射图标。

3. **"打开"和 "Open" 重复**
   - **位置**：合成主操作 `useKeyboard.ts:284-300`（priority 1000）；provider 的主操作 `files/utils.ts:249-255`（`primary: true`），app 的在 `search-processing-service.ts:72-81`。
   - **说明**：
     - `convertTuffActionToMetaAction` 忽略了 `primary` 字段，所以两个都会显示出来。
     - 预览项和计算器项会出现两行一模一样的"复制结果"（`useKeyboard.ts:248-254` 和 `preview-provider.ts:179-187`）。

4. **文件项的 "Open" 实际执行的是"在 Finder 中显示"**
   - **位置**：`useActionPanel.ts:192-205` → `apps/core-app/src/main/channel/system-shell-handlers.ts:91-119`
   - **说明**：
     - 调用链：`type: 'open'` 的动作，目标不是 URL、也不是 app 时，会调用 `appSdk.showInFolder(path)`。主进程对文件走 `shell.showItemInFolder`，对目录走 `shell.openPath`。
     - 于是三个动作的实际行为是：
       - "Open" = 在 Finder 中选中这个文件，和 `reveal-in-finder`（`useActionPanel.ts:136-140`）完全一样；
       - "Open Folder" = 打开所在目录；
       - "打开"（合成主操作）才是真正打开文件。
     - 三者的行为单看 label 分不清。这是 `7a49da34f` 引入的。

5. **分组与排序**
   - **位置**：排序在 `MetaOverlay.vue:103-107`，分组在 `:35-51`。
   - **说明**：
     - 所有动作都进了"操作"这一个组。原因是内置动作和 item 动作都显式写死了 group，默认组的 key `corebox.meta.defaultGroup` 永远用不上。
     - 排序按 priority：主操作 1000 → 插件全局动作 100（`quick-actions-sdk.ts:450`）→ item 动作 50 → 内置动作 0。
     - 结果是打开类（打开 / Open / Open Folder / 在 Finder 中显示）和复制类（三个 Copy / 复制名称）交错排列。
     - 插件全局动作不管当前项是什么都会出现。PRD 把"可见性条件"列为后续能力。

6. **行设计**
   - **位置**：`MetaActionItem.vue:38-40, 49-68, 92-104`
   - **说明**：
     - 行高有两种：带副标题约 56px，不带约 40px。
     - 副标题大多在复述标题，比如 `打开 "x"`、`复制 "x"`（`useKeyboard.ts:243, 259, 267, 331`）。
     - 选中态是主色底加 1px 主色描边；hover 又是另一种描边。
     - 卡片阴影 `0 16px 48px` 垂直向下，不符合 `--tx-elevation-*`（x:y = 1:2）的约定。

7. **方向键不会把选中行滚动到可见区域**
   - **位置**：`views/meta` 和 `components/meta` 里都没有 `scrollIntoView`。
   - **说明**：超过 8 行之后，按 ↓ 选中的是看不见的行（"在 Finder 中显示""流转到其他插件"）。

8. **没有 IME 保护**
   - **位置**：`MetaOverlay.vue:130-180`
   - **说明**：用拼音在搜索框里输入时，按 Enter 上屏会直接执行当前选中的动作；按方向键会移动列表的选中，而不是选输入法候选词。作为对照，`T/command-palette/src/TxCommandPalette.vue:264` 有 `isComposing` / `keyCode 229` 的保护。

9. **快捷键匹配有问题**
   - **位置**：`MetaOverlay.vue:168-203`
   - **说明**：匹配方式是字符串拼接后比较。
     - Win/Linux 上，`'Ctrl+Shift+F'` 归一化后是 `meta+shift+f`，而事件拼出来的是 `metashiftf`。所以**非 mac 平台上内置动作的快捷键全部失效**（内置动作用的是 `Ctrl+…` 写法）。插件如果按文档写成 `'⌘⇧S'`，反而会因为 Ctrl→Meta 的归一化碰巧命中。
     - `'⌘⌥T'` 对应的事件是 `⌘Alt†`（mac 上按住 Option 会改写 `key`），永远匹配不上。
     - `⌘C` 绑给了"复制名称"（`useKeyboard.ts:334`），在面板搜索框里按 ⌘C 复制文字会被它抢走。
     - 这些快捷键只在面板打开时有效，主列表并没有绑定它们（`useKeyboard.ts` 的主列表只处理 ⌘1-0、⌘←/→、Tab、⌘D 等）。
     - 仓库里已有正确的做法：`R/modules/shortcuts/shortcut-chord.ts:51-74`。它按 `KeyboardEvent.code` 匹配，只认平台自己的命令键，显示时分平台输出 `⌘⇧N` 或 `Ctrl+Shift+N`。

10. **⌘K 不能再按一次关闭**
    - **位置**：`MetaOverlay.vue:310`
    - **说明**：这里的 ⌘K 只是一个装饰性提示；面板里按 ⌘K 不会匹配任何动作。在 Raycast 里，⌘K 是开关。

11. **hover 会抢走选中**
    - **位置**：`MetaOverlay.vue:326` 的 `@mouseenter`
    - **说明**：
      - 面板在静止的光标下弹出或重新排版时，也可能触发 mouseenter，从而改掉 activeIndex。
      - 截图里选中的是 "Copy Path" 而不是"打开"，很可能就是这个原因（未验证）。
      - 主窗口的命令面板用的是 `@pointermove`（`R/components/shell/MainWindowCommandPalette.vue:171`），只有光标真的移动才会触发。

12. **过滤能力比 PRD 承诺的弱**
    - **位置**：`MetaOverlay.vue:53-88`
    - **说明**：只有子串匹配和子序列匹配，不支持拼音或首字母。PRD 写的是「支持模糊搜索（拼音/首字母）」。

13. **执行后没有反馈**
    - **位置**：`useActionPanel.ts:60, 95, 133, 150-152, 163-165, 188` 调用了 `toast`。
    - **说明**：CoreBox 不挂 `<Toaster>`（`R/AppEntrance.vue:80-89`，是 `14888aff2` 有意为之），所以"已复制"这类提示永远不会出现。

14. **快捷键提示的样式不统一**
    - **位置**：行内 chip 在 `MetaActionItem.vue:106-117`，搜索框里的 chip 在 `MetaOverlay.vue:404-415`，footer 里是纯文本（`:332-336`）。
    - **说明**：主窗口命令面板的行和图例统一用的是 `TxKbd`。

---

## 5. 重构方案

**共同前提：**

- 只要插件视图可能挂在 y=56 以下，"盖住插件视图"就只能靠一个后加入的子 `WebContentsView`。所以 overlay 这一层至少在 UI 模式下要保留。
- ready 握手，以及 `ui.show` / `ui.hide` 的请求-应答契约（`channel-transport-contracts.md` §3），都保持不变。

### 方案 A：保留居中卡片，只修几何和背景（最小改动）

- **做法**：
  - 按 §2.3 做 CSS 居中，并用 `calc(100vh …)` 限制最大高度；
  - 去掉 `backdrop-filter`，遮罩调得很轻或者直接去掉；
  - 窗口按需增高、关闭后还原、面板打开期间冻结 layout；
  - 加上 §4 的内容修复。
- **优点**：改动最小，模态感强。
- **缺点**：400×(≤500) 的卡片仍然压在 720 宽的启动器正中间，结果列表和搜索框都被挡住，看不到上下文。它解决了"没居中"，但没有回应"展示形式要重构"。

### 方案 B（推荐）：Raycast 式锚定操作面板，沿用全窗口透明 overlay 视图

**视觉**

- 没有遮罩，也没有模糊，CoreBox 保持原样可见。
- 面板宽约 320–360px，锚在右下角，正好在 footer「⌘K 操作」提示（`R/components/render/CoreBoxFooter.vue:146-163`）的上方：`right: 12px; bottom: 44px(footer 高度，:181) + 8px`。
- UI 模式下，或者 footer 被隐藏时（插件项默认隐藏 ⌘K 提示，`R/components/render/coreBoxFooterHints.ts:41-50`），改为锚在窗口右下角。
- 面板底色用不透明的 `--tx-bg-color`，加 1px ring 描边，阴影用 `--tx-elevation-4/5`。

**结构**（参考 Raycast 的 `ActionPanel`：有 `title`，用 `Section` 分组，第一个动作是 ↵，第二个动作是 ⌘↵）

- 顶部一行显示当前项的图标和标题，代替现在每一行里重复的 `打开 "x"`；
- 分组，例如：主操作 / 打开 / 复制 / 整理 / 分享与流转 / 插件；
- 行是单行、32–34px 高：16px 图标 + 标签 + 右侧 `TxKbd`；副标题只在确实需要区分时才出现（比如 Shell 路径和普通路径）；
- 过滤框放底部（Raycast 的做法）还是顶部（现状），待定；
- 有空状态文案；
- 执行成功后，在面板或 footer 里给出即时反馈，代替被关掉的 toast。

**键盘**

- ↑↓ 切换，并把选中行滚动到可见区域；
- ↵ 执行；⌘↵ 执行次要动作（待定）；
- ⌘K 或 Esc 关闭；
- 加 IME 保护；
- 快捷键改用 `shortcut-chord.ts` 的 code 匹配；
- hover 改用 pointermove。

**高度**

- CoreBox 渲染进程在 `ui.show` 里带上 `desiredPanelHeight` 和锚点信息。`MetaShowRequest`（`packages/utils/transport/events/types/meta-overlay.ts:22-42`）只需要追加可选字段。
- 主进程只在放不下时才增高窗口（上限 600），关闭面板时还原。
- 面板打开期间冻结 layout.update（见 §2.3）。

**改动面**

- `MetaOverlay.vue`：模板和样式重写；
- `MetaActionItem.vue`：重做或替换；
- `useKeyboard.ts`：动作模型改为 i18n、去重、分组、按 type 给图标；
- `M/ipc.ts:616-632`：高度策略；
- `M/meta-overlay.ts`：hide 时还原高度；
- `core-box/index.ts:218-380`：面板可见期间的保护。
- 主进程的 bounds 逻辑（全窗口）和握手都不用动。

**优点**

- 只有一个宿主，在插件视图上面照样能用；
- 不依赖 backdrop-filter，三个平台效果一致；
- 结果列表保持可见，上下文清楚；
- 是改动最小的"真重构"。

**缺点**

- 全窗口的透明视图在面板打开时仍会接住所有指针事件。点面板外面等于关闭（Raycast 也是这样），但面板打开时不能滚动后面的列表。
- 面板不能超出 CoreBox 窗口，所以窗口太矮时仍然要增高。
- 阴影朝右下投射，靠近窗口右边缘的部分会被窗口裁掉一点。

### 方案 C：缩小 overlay 视图（视图的 bounds = 面板 + 阴影边距）

- **做法**：
  - 视觉和 B 一样，但 `metaView.setBounds()` 只覆盖面板区域；
  - 点击面板外部时，靠 overlay `webContents` 的 `blur` 事件通知主进程关闭；
  - 面板尺寸由 renderer 上报；
  - 窗口 resize 时重新计算锚点。
- **优点**：面板打开时，CoreBox 和插件视图仍然可以交互、可以滚动，过度绘制也更少。
- **缺点**：
  - 多出一批焦点和失焦的边界情况（DevTools、show 时焦点来回转移）；
  - 需要一条尺寸协商链路；
  - 透明的阴影边距仍然会挡住点击；
  - 要补的测试更多。
- **建议**：作为 B 之后的第二步。它主要多给了"面板打开时背后还能交互"这一点，大部分视觉诉求 B 已经覆盖了。

### 不推荐的方案

**D. 混合宿主**（搜索模式在 CoreBox 的 DOM 里渲染，只有 UI 模式才用 overlay）

- 好处：
  - 少一次 IPC；
  - 可以用 `TxBaseAnchor` 的 `virtualReference`（`T/base-anchor/src/TxBaseAnchor.vue:130`）精确锚到 footer。
- 坏处：
  - 两个宿主会越长越不一样；
  - 键盘要在 `useKeyboard` 里再做一套路由；
  - 等于撤销了 `33223fc00` 的收敛；
  - `TxBaseAnchor` 的面板在定位完成、gsap 加载完之前一直是 `visibility: hidden`，打开后立刻 focus 会静默失败（见 `.trellis/spec/frontend/anchor-overlay-chain.md` 的「Panels that host a text field」一节，以及 memory `tuffex-anchor-panel-hidden-until-positioned.md`）。对一个按一下键就要弹出的面板来说，这段延迟不划算。

**E. 独立的子 BrowserWindow 弹层**

- 好处：可以超出 CoreBox 的边界，并且能用原生的 `menu` / `popover` vibrancy 材质。
- 坏处：
  - CoreBox 是不抢激活的 NSPanel，失焦会触发自动隐藏（`M/window.ts:265-289`）；
  - 多显示器定位和 Win/Linux 上的行为都要单独处理；
  - 风险最高。

### 可以直接复用的现成件

- **`R/components/shell/MainWindowCommandPalette.vue`**（主窗口的 ⌘/ 面板）：这是同一产品里最接近目标形态的样板。
  - 分区加分组标题；
  - 行高约 34px（`padding: 7px 8px`，`:226-231`）；
  - 行尾和图例都用 `TxKbd`（`:175, 181-190`）；
  - hover 用 `@pointermove`（`:171`）；
  - `max-height: min(52vh, 420px)`（`:206`）；
  - 不可用的行也会显示，只是不能执行。
- **`R/modules/shortcuts/shortcut-chord.ts`**：chord 的匹配和显示（`:51-74`）。插件 SDK 的 `render.shortcut` 目前是字符串（`apps/nexus/content/docs/dev/api/quick-actions.zh.mdc` 的示例是 `'⌘⇧S'`），所以要么写一个"字符串 → chord"的解析器来兼容旧格式，要么给 SDK 加结构化字段。
- **`T/kbd`（`TxKbd`）和 `TxIcon`。**
- **`T/command-palette/src/TxCommandPalette.vue`**：它本身是"全屏遮罩 + 顶部 10vh"的模态（`:385-393`），形态上正是现在的问题所在，不适合直接用。但下面这些值得照搬：IME 保护（`:264`）、带 `aria-activedescendant` 的组合框（`:325`）、跳过禁用项的导航（`:79`）、匹配高亮。
- **面板材质不要用 glass 或 blur。** 在 overlay 文档里，`backdrop-filter` 背后什么都没有，mac 上只会显示成一块半透明底，影响可读性。

---

## 6. 需要老板拍板的决策

1. **形态**：B 右下角锚定面板（推荐）/ A 居中卡片 / 先做 B，以后再升级到 C。
2. **背景**：完全不加遮罩（推荐）/ 轻度暗化但不模糊 / 必须模糊（mac 上只能由 CoreBox 在自己的文档里做，而且插件视图模糊不了）。
3. **窗口高度**：按需增高、关闭后还原（推荐）/ 保持 forceMax 600 / 不增高，面板在现有高度内滚动。
4. **过滤框位置**：底部（Raycast）/ 顶部（现状）。
5. **行密度**：单行，只在必要时加副标题（推荐）/ 保留两行。另外，顶部是否显示当前项的标题。
6. **分组和顺序**：
   - 有哪些组、按什么顺序排；
   - 插件全局动作放在哪里（现在默认 priority 100，会排在 item 动作前面）；
   - 插件全局动作要不要按当前项过滤。
7. **去重**：
   - 合成主操作和 provider 的 `primary: true` 动作合并成一行，用谁的文案；
   - 文件的 "Open" 是改成真正打开，还是直接删掉。
8. **文案来源**：
   - 内置动作走 `corebox.actions.*`；
   - provider 动作在主进程用 `i18n-helper.t()` 本地化，还是在渲染端按 action id 或 type 映射；
   - 插件动作的文案按插件原样显示。
9. **快捷键策略**：
   - ⌘C 是否继续给"复制名称"；
   - 是否对齐 Raycast Common（Copy ⌘⇧C、CopyName ⌘⌥C、CopyPath ⌘⌃C、Open ⌘O、Pin ⌘.；注意 Duplicate ⌘D 和 CoreBox 的 ⌘D 分离冲突）；
   - 这些快捷键在不打开面板时能不能直接用（Raycast 可以）；
   - ⌘↵ 是否作为次要动作；
   - ⌘K 是否做成开关。
10. **执行反馈**：在面板或 footer 里给即时反馈（CoreBox 里的 toast 是被刻意关掉的）。
11. **范围**：这次是否一起处理下面两件事：
    - DivisionBox 里按 ⌘K：overlay 总是开在 CoreBox 主窗口上（`M/meta-overlay.ts:193-197` 用的是 `getCoreBoxWindow()`，见 `M/window.ts:1034-1036`）。推断在 DivisionBox 里看不到面板，未验证。
    - 插件 SDK 的 `shortcut` 从字符串升级为结构化 chord。

---

## 7. 参考

### 文件（§1–§5 已列出的不再重复）

- **测试基线**：用 `apps/core-app/node_modules/.bin/vitest run` 跑下面三个文件，3 个文件、28 个用例全部通过。
  - `M/meta-overlay.test.ts`（13 个用例）；
  - `R/views/meta/MetaOverlay.test.ts`（5 个用例，依赖选择器 `.MetaOverlay`、`input.SearchInput`、`.meta-action`）；
  - `R/modules/box/adapter/hooks/useActionPanel.test.ts`（10 个用例；`:149-168` 钉住了 app 项的 "Open" 走 `openApp`）。
  - 没有测试钉住 overlay 的 bounds 值，也没有测试钉住 `ui.show` 里的 forceMax。
- **设计文档**：
  - `docs/plan-prd/03-features/meta-overlay/META-OVERLAY-PRD.md`：三层架构、优先级、ESC 顺序、布局草图；
  - `docs/plan-prd/01-project/CHANGES.md`：2026-02-27 条目（forceMax 的理由），2026-06-14 条目（MetaK 提示与 item 动作管线）。
- **开发者文档**：`apps/nexus/content/docs/dev/api/quick-actions.{zh,en}.mdc`。插件 `registerAction` 的 `shortcut` / `group` 是字符串契约，重构后需要同步。

### 规范

- `.trellis/spec/main-process/channel-transport-contracts.md` §3：短生命周期 `WebContentsView` 的 ready 握手，`MetaOverlayEvents.ui.show` 就是其中的范例。
- `.trellis/spec/frontend/anchor-overlay-chain.md`：锚定面板打开后立即 focus 会失败，以及对应的 rAF 重试模式。
- `.trellis/spec/frontend/tuffex-design-rules.md`：有阴影的元素用 ring 而不是 border（`:73-85`）；sticky 元素用 border 分隔（`:93-95`）。另见 memory `shadow-one-light-source.md`：`--tx-elevation-1..5`，x:y = 1:2。

### 外部

- **Electron #45206**（见 §3.1）：View 之间的 backdrop-filter 在 mac 上从来没生效过；Win/Linux 在上游修复之后生效。
- **Raycast**：
  - [Terminology](https://developers.raycast.com/information/terminology)：「Action Panel is located on the bottom right and can be opened with ⌘ K」。
  - [ActionPanel API](https://developers.raycast.com/api-reference/user-interface/action-panel)：第一个动作是 ↵，第二个动作是 ⌘↵；`title` 显示在面板顶部；用 `Section` 分组（例如把所有复制类动作放进一个 section）；支持 `Submenu`。
  - [Keyboard](https://developers.raycast.com/api-reference/keyboard)：`Keyboard.Shortcut.Common` 表。

---

## 8. 注意事项与未验证项

- **没有看到原图。** §3 对"桌面纹理"的解释（vibrancy 加上 forceMax 撑出的空白区）来自代码阅读和只读 DOM 实测，没有做像素级验证。验证步骤见 §3.4。
- **以下几点是读代码推断的**，没有在运行中的 app 里复现（按要求，没有操作 dev Electron）：
  - §2.2 次因 2：面板打开期间被 layout.update 缩窗；
  - §2.2 次因 3：关闭后窗口停在 600；
  - §4 第 11 条：hover 抢选中；
  - §6 第 11 条：DivisionBox。
- **估算值。** §2.1 的行高和可见行数是按 CSS 算出来的，不是实测。
- **并行会话。** `R/views/box/CoreBox.vue` 正在被另一个会话修改（TxPrismGlow 搜索光效，尚未提交）。方案 B 实现时可能要改 CoreBox.vue 或 CoreBoxFooter.vue，动手前需要先和那个会话协调。
- **外部依据的性质。** Electron #45206 里关于 macOS 的结论来自 issue 评论（一位贡献者和一位维护者），不是官方文档。
