# Implement — CoreBox 常用幽灵宫格空态 + 流转面板 MetaK 化

先读：`prd.md` → `design.md`。命令都在仓库根目录执行；core-app 的单测按 CI 的写法 `pnpm -C apps/core-app exec vitest run <files>` 来跑，如果遇到 `.bin` shim 失效，就直接调用 `.pnpm` 里的入口。

## 顺序与检查点

### 1. 图标（E）：独立，先做

- [ ] 新增 `apps/core-app/src/shared/flow-target-icons.ts`（`BUILTIN_FLOW_TARGET_ICON_CLASSES`）。
- [ ] 新增 `apps/core-app/src/shared/flow-target-icons.test.ts`：源码抽取加正向对照，并对照已安装的 `@iconify-json/ri` 集合。
- [ ] `apps/core-app/uno.config.ts`：import、展开进 safelist、加进 `configDeps`。
- 验证：`pnpm -C apps/core-app exec vitest run src/shared/flow-target-icons.test.ts`。另外做一次负向对照：临时从列表里删掉一项，测试必须变红；改回去。

### 2. MetaK 外壳（B）

- [ ] `shared/meta-overlay-geometry.ts`：加 `resolveMetaPanelCssVars(anchor)`，并在 `meta-overlay-geometry.test.ts` 补断言。
- [ ] 新增 `renderer/components/meta/MetaPanel.vue`：标题行、列表加高亮板、body 插槽、搜索行，以及整份卡片 CSS。高亮逻辑从 MetaOverlay 原样搬过来，`animateHighlight` 改成一次性的 `glideNext()`。
- [ ] `renderer/views/meta/MetaOverlay.vue` 改用 `MetaPanel`，DOM 和 class 保持不变。
- [ ] `renderer/components/meta/MetaActionItem.vue`：加 `trailing` 插槽，并在 `MetaActionItem.test.ts` 补用例。
- **检查点 B**：`views/meta/MetaOverlay.test.ts` 一行不改就全绿，`MetaActionItem.test.ts` 和 `meta-overlay-geometry.test.ts` 也全绿。不过的话不往下做。

### 3. 流转面板（C）

- [ ] 重写 `renderer/components/flow/FlowSelector.vue`：遮罩根节点 `.FlowSelector`、`MetaPanel`、分组行、加载行与空态行、window 捕获阶段键盘、防连按、面板内确认视图、`room` 事件，并修 D5 的参数名。
- [ ] 语言包（zh-CN / en-US）：`flow.requiresConfirmation`、`flow.searchTargets` 改用 `…`；删除 `flow.selectTargetDesc` / `navigate` / `confirm` / `cancel`，删之前先 `rg` 确认没有其他引用。
- [ ] 更新并扩充 `FlowSelector.test.ts`（清单见 design G）。
- 验证：`pnpm -C apps/core-app exec vitest run src/renderer/src/components/flow/FlowSelector.test.ts src/renderer/src/components/meta`。

### 4. 窗口让位（D）

- [ ] `useResize.ts`：加 `floor` 选项，并补 `useResize.test.ts`。
- [ ] `useSearch.ts`：加第三个可选参数，把 `windowFloor` 透传给 `useResize`。
- [ ] 新增 `useFlowPanelRoom.ts` 及其测试（fake timers）。
- [ ] `useKeyboard.ts`：导出 `isCoreBoxFooterShown`。
- [ ] `useDetach.ts`：`openFlowSelector` 计算 `flowAnchor`；对外暴露 `flowAnchor`；关闭时调用 `room.release()`，room 通过 options 传入。
- [ ] `CoreBox.vue`：在 `useSearch` 之前创建 room 并传进去；`FlowSelector` 绑定 `:anchor`、`@room`；铺底条件改成 `metaPanelFill || flowRoom.fill`。
- [ ] CoreBox 的三份视图测试：给 `useDetach` 的 mock 补上新字段。
- 验证：`pnpm -C apps/core-app exec vitest run src/renderer/src/modules/box/adapter/hooks src/renderer/src/views/box`。

### 5. 幽灵宫格（A）

- [ ] `BoxGrid.vue`：去掉 `TxEmptyState`，换成空格子网格和说明行（`TxKbd` + `shortcutChordLabel`）。
- [ ] 语言包：更新 `coreBox.sections.habitualEmptyTitle`，删除 `habitualEmptyHint`。
- [ ] 新增 `components/render/BoxGrid.test.ts`（清单见 design G）。
- 验证：`pnpm -C apps/core-app exec vitest run src/renderer/src/components/render`。

### 6. 静态检查

- [ ] Web 端类型检查：`cd apps/core-app && vue-tsc --noEmit -p tsconfig.web.json --composite false`。**不要**跑 `pnpm typecheck:web`：它会先重建 tuffex 的 dist，可能把正在跑的 Nexus dev 打挂。如果 tuffex 的 dist 过期导致误报，先报告，再征得同意后重建。
- [ ] Node 端类型检查：`pnpm -C apps/core-app run typecheck:node`（覆盖 `uno.config.ts` 和 shared 模块）。
- [ ] 用包内的 ESLint 配置检查改动过的文件：`cd apps/core-app && eslint <changed files>`。只看新增的问题（判 delta 不判零），不要对整份文件 `--fix`。
- [ ] `git diff --check`。
- [ ] 跑一遍改动涉及的全部单测：`components/flow`、`components/meta`、`components/render`、`views/meta`、`views/box`、`modules/box/adapter/hooks`、`src/shared`。

### 7. 真机验证（隔离的 dev 实例，按 memory 里 Tuff dev CDP 那几条坑来做）

- 启动：在 `apps/core-app` 下，用独立的 `REMOTE_DEBUGGING_PORT`、`TUFF_DEV_SERVER_PORT` 和 `TUFF_STARTUP_BENCHMARK_USER_DATA_DIR=/tmp/...`，带上 `TUFF_DISABLE_GLOBAL_SHORTCUTS=1`、`TUFF_DISABLE_NATIVE_AUDIO=1`，通过 `node scripts/dev-electron-wrapper.mjs -- --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-background-timer-throttling` 拉起。新建的 profile 要先过新手引导闸（`beginner.init`）。截图、日志、userdata 都写在 `/tmp`。
- 截图和检查项，明暗两套主题都要做：
  - [ ] 推荐页无常用：幽灵宫格、说明行、⌘1 仍是第一条列表项；打开预览窗时的 compact 形态。
  - [ ] 推荐页（窗口满高）上 ⌘K → 流转：面板在右下角、遮罩轻、分组、图标齐全、高亮板跟随指针；Esc 关闭。
  - [ ] 只剩 1～2 条结果的搜索上 ⌘K → 流转：窗口拉高、拉高部分铺了实色、面板完整；关闭后缩回、没有透出桌面。同时评估 ⌘K 归还高度再被流转拉高造成的回弹（design D 最后一条）。
  - [ ] 选中 `QuickOps Stop All Sessions`（`requireConfirm`）：确认视图原地出现，发送方文字不再为空（D5）；按 Esc 退回列表。
  - [ ] 面板里按 ↵、↑↓：背后的 CoreBox 结果不被执行、焦点也不移动（D6）。选 `QuickOps System Info` 这个只读目标来做完整派发；不要派发会产生副作用的目标，也不要碰系统剪贴板。
- 收尾：按端口找到 PID 停掉实例，`/tmp` 里的产物保留并在汇报里写明路径。

### 8. 收尾（Phase 3）

- [ ] 更新 spec：`recommendation-freshness-contracts.md`（引导形态改为幽灵宫格）、`corebox-meta-overlay-contracts.md`（新增「共享外壳与流转面板」场景：MetaPanel、流转键盘归属、窗口地板与铺底）。
- [ ] 在 PRD 里追加验收记录，标明哪些是真机证据、哪些只是推断。
- [ ] commit / push 等老板明确要求后再做。

## 风险与回滚点

- B：MetaOverlay 测试是回归门；不过就回滚到抽取之前，C 改为直接在 FlowSelector 里复刻卡片样式（这条退路需要先告知老板）。
- D：`useResize` 的改动只在 `floor > 0` 时生效；有问题时只回滚 D，面板仍然可用，只是在矮窗口里会滚动。
- A / E 各自独立，可以单独回滚。

## 范围扩大后的步骤（R8–R11，2026-10-02 用户确认）

### 9. R10 主进程侧：⌘K → 流转的高度交接（可与检查阶段并行，文件不重叠）

- [ ] `apps/core-app/src/shared/events/corebox-scenes.ts`：新增 `COREBOX_FLOW_TRANSFER_ACTION_ID = 'flow-transfer'`，写法照 `COREBOX_APP_BIND_SHORTCUT_ACTION_ID`。
- [ ] `main/modules/box-tool/core-box/meta-overlay.ts`：按 design J 实现交接等待：持有第一条布局更新后立即 `hide()` 并让它作为重放生效；超时回退；提前结束时清理；其他动作不变。
- [ ] `meta-overlay.test.ts`（以及必要时的 `ipc.test.ts`）补交接场景。
- 验证：`pnpm exec vitest run src/main/modules/box-tool/core-box`，再加 node 端 `tsc`。

### 10. 渲染端：R8、R9、R11，以及 R10 渲染端（等检查阶段结束后再派，避免和它改同一批文件）

- [ ] `useDetach.ts`：`shallowRef` + `toRaw`（R8）；三处 toast 换成 `showCoreBoxFooterFeedback`（R9）；补单测（可克隆、反馈 tone、负向对照）。
- [ ] `meta-action-model.ts`、`useActionPanel.ts`：`'flow-transfer'` 裸字符串换成共享常量。
- [ ] `FlowSelector.vue`：加载期间的 `room` 不小于打开时的 `window.innerHeight`（R10 渲染端），补测试。
- [ ] `useKeyboard.ts`：先证实 R11 的机制，再在 `scrollActiveItemIntoView` 里加「视口装不下焦点行就跳过」的守卫；补单测和负向对照。
- 验证：同第 6 步的静态检查，加上相关目录的单测。

### 11. 真机复验（协调者负责）

- [ ] 派发：选只读目标走完授权，确认主进程收到派发、底栏出现反馈（AC9、AC10）。
- [ ] 回弹：开启尺寸动画，在短列表上走 ⌘K → 流转并采样窗口高度，高度应单调变化（AC11）。
- [ ] 被滚走：重启隔离实例，在剪贴板内容的 5 秒保鲜窗口内唤出 CoreBox，按 Esc 撤附件，`scrollTop` 应为 0（AC12）。
- [ ] 回归：⌘K 面板、流转面板、幽灵宫格的截图与几何复查。
