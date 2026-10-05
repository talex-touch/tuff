# Implement — 执行计划

先读 `prd.md`、`design.md`，再读 `implement.jsonl` 列出的 spec。子代理派发时，提示词第一行写 `Active task: .trellis/tasks/10-03-flow-into-metak-drill-in`。

## 仓库纪律（本仓库有多个会话并发写入，执行前必读）

- 不用 `git stash`、`checkout`、`restore` 做验证。要对照原版，用 `git show HEAD:path > /tmp/...`。
- 有几个文件现在已经是脏的，是其他会话改的：`components.d.ts`、`modules/lang/{zh-CN,en-US}.json`、`ShellSidebar.vue` 等。只动自己的 hunk。
  - 本任务**不新增 i18n key**：返回按钮复用 `layout.back`，流转文案全部沿用 `flow.*`。
  - 新组件一律显式 import，不靠 `components.d.ts`。如果它被自动改写，提交时只暂存自己的行。
- 没有用户明确同意，不 commit、不 push。提交时用私有 index（`GIT_INDEX_FILE`），并对照记忆「Private-index commit under contention」。
- 磁盘紧张：截图和日志写到 `/tmp/tuff-flow-metak-2/`，不进仓库。

## 步骤

### 1. TuffEx `TxTransitionPush`（R13）

1. `tuffex/src/transition/src/types.ts` 加 `TransitionPushDirection`、`TxTransitionPushProps`。
2. 新建 `tuffex/src/transition/src/TxTransitionPush.vue`，按 design §6.2 实现：用 JS 钩子驱动 WAAPI，支持方向、RTL、减弱动效、`duration` 为 0、中途打断，过渡期间 `overflow: clip`。
3. `transition/index.ts` 导出 `TxTransitionPush`、`TransitionPush`、`TxTransitionPushProps`、`TransitionPushDirection`、`TxTransitionPushInstance`。名字不能和全局桶里已有的导出冲突。
4. `transition/__tests__/transition.test.ts` 追加 design §6.3 列出的用例。
5. 验证：

   ```bash
   # corepack 在 Bash 工具的 PATH 里可能找不到，先接上 mise 的 shims（见记忆 corepack-missing-on-homebrew-node-26）
   pnpm -C packages/tuffex run typecheck
   (cd packages/tuffex && ./node_modules/.bin/vitest run packages/components/src/transition)
   pnpm -C packages/tuffex run build      # 刷新 dist，audit:size 和 audit:exports 读的是 dist
   node packages/tuffex/scripts/audit-readme-inventory.mjs   # 应该无变化：transition 模块已经计过数
   ```

   - tuffex 在 `--fix` 时可能把同源的值导入合并成 `import type`，见记忆 `tuffex-eslint-autofix-import-trap`。只对改动的文件跑 eslint。
   - 重建 tuffex 会让正在运行的 nexus dev 挂掉，重建后要重启 dev server。

### 2. Nexus 文档（R14）

1. `apps/nexus/content/docs/dev/components/transition.{zh,en}.mdc`：Props 表、语义化组件表那一行、`## 推入翻页（Z）` 一节加 demo、最佳实践，按 design §6.3 写。
2. `apps/nexus/app/components/content/demos/TransitionTransitionPushDemo.vue`，并登记到 `demo-registry.ts`，位置排在现有两个 transition demo 后面。
3. `packages/tuffex/CHANGELOG.md` 的 `## [Unreleased]`：Added `TxTransitionPush`。如果 Nexus 的 changelog 页也有 `[Unreleased]` 约定，就同步一条，否则不动。
4. 验证：

   ```bash
   node apps/nexus/build/check-mdc-fences.mjs
   (cd apps/nexus && ./node_modules/.bin/vitest run)    # CI 同款，文档覆盖契约只在这里检查
   ```

   - 不要用 `pnpm -C apps/nexus <script>`：它会触发 `pnpm install`，还可能杀掉正在运行的 dev server。
   - 可选的真机检查：起 nuxt dev，用 CDP 截 `/zh/docs/dev/components/transition` 和 `/en/...` 两页，看推入 demo 是否正常。

> **提交 1**（待用户同意）：`feat(tuffex): add TxTransitionPush`，TuffEx 代码和 Nexus 文档放在同一个提交里。

### 3. 协议（design §1）

1. `utils/transport/events/types/meta-overlay.ts`：加 `MetaPanelPage`、`MetaPageChangeRequest`、`MetaFlowSelection`；`MetaShowRequest` 加 `page`、`flowTargets`；`MetaActionExecuteRequest` 加 `flow`。
2. `utils/transport/events/types/core-box.ts`：`CoreBoxMetaOverlayItemActionPayload` 加 `flow`，`CoreBoxMetaOverlayPanelStatePayload` 加 `blur`。
3. `utils/transport/events/meta-overlay.ts`：加 `ui.page` 事件。
4. `shared/meta-overlay-geometry.ts`：加 `META_FLOW_CONFIRM_PANEL_HEIGHT`（232），计算式和注释从 FlowSelector 搬过来。

### 4. 主进程（design §2）

1. `core-box/meta-overlay.ts`：
   - 加 `page`、`canGoBack`、`currentAnchor` 三个状态和 `changePage()`。
   - `publishPanelState` 带上 `blur`。
   - Esc 拦截加上 `!canGoBack` 条件。
   - `executeAction` 转发 `flow`。
   - 删除交接代码：`FLOW_HAND_OFF_MAX_WAIT_MS`、`flowHandOffTimer`、`handOffToFlowPicker`、`clearFlowHandOff` 及其所有调用点。
   - hide、dismissWithHost、destroyRenderer 都要复位页面状态。
2. `core-box/ipc.ts`：
   - 新增 `ui.page` 处理器，检查发送方是否为 overlay，并校验载荷。
   - `action.execute` 校验并转发 `flow`。
   - `ui.show` 的日志加上 `page`；`page === 'flow'` 时不追加插件行的高度。
3. 测试 `core-box/meta-overlay.test.ts`，以及 ipc 已有的测试文件：
   - 删除交接相关用例。
   - 新增以下用例：
     - `ui.page` 触发只拉高不缩小，`restoreHeight` 只记录一次。
     - `blur` 只在 visible 且页面不是 `actions` 时为真，hide 后为假。
     - `canGoBack` 时 Esc 放行，根页面时 Esc 关闭，组字时不拦。
     - `flow` 原样转发；不合法的 `flow` 被丢弃。
     - 非 overlay 发送方的 `ui.page` 被拒绝。
     - `page: 'flow'` 的 show 不追加插件行高度。

### 5. overlay 渲染层（design §3、§4）

1. 抽出 `renderer/modules/box/meta-actions/core-box-flow-payload.ts`，放纯函数 `buildCoreBoxFlowPayload`、`resolveCoreBoxFlowActorPluginId`、`resolveFeaturePluginId`。`useDetach` 改为重新导出。
2. 新建 `renderer/modules/box/meta-actions/meta-flow-page.ts`，内容是 `useMetaFlowPage` 和 `estimateFlowTargetsPanelHeight`，由 FlowSelector 的脚本迁移而来，行为不变。
3. 拆分 `components/meta/`：
   - `MetaPanelList.vue`：从 `MetaPanel.vue` 迁出列表、高亮板和 `syncHighlight`。
   - `MetaPanelFilter.vue`：迁出过滤框。
   - `MetaFlowConfirm.vue`：从 FlowSelector 的 `#body` 迁出确认视图。
   - `MetaPanel.vue` 改为外框加标题行（「‹」按钮、`header-meta`）加 `TxTransitionPush` 主体，删掉 `view` prop。
4. `views/meta/MetaOverlay.vue`：
   - 页面栈、`direction`。
   - 「流转」行改为推入流转页，不再执行动作。
   - show 时预取目标；直接打开时使用请求里的 `flowTargets`。
   - 选中目标后用 `executeFlowTransfer` 发出 `action.execute` 并带上 `flow`。
   - 确认页的推入和弹出。
   - 按 design §3.5 的表格分页处理键盘。
   - 用 `ui.page` 发出切页通知。
   - 换页时的焦点处理，离场页加 `inert`。
5. 测试：
   - `views/meta/MetaOverlay.test.ts` 现有用例**不修改**，必须照样通过。
   - 新增用例：
     - 「流转」行推入流转页，不发 `action.execute`。
     - 直接打开时没有「‹」，Esc 关闭。
     - 从列表进入时：第一次 Esc 弹回操作列表，第二次 Esc 关闭。
     - `ui.page` 的载荷正确（页面、`canGoBack`、高度）。
     - 预取：有「流转」行才取；用了 `flowTargets` 就不再请求。
     - 选中后 `action.execute` 带上 `flow`；连按 ↵ 只发一次。
     - 确认页：Esc 不调用 `grantConsent`，并弹回列表。
     - 流转页上 ⌘⇧D 是 no-op。
     - 组字时不处理按键。
   - FlowSelector 测试里仍然有效的用例迁到新测试文件，包括：分组顺序、过滤与空行、↑↓ 循环、晚到回复被丢弃、`{source}` / `{target}` 占位符、图标归一化。
   - `MetaPanel` / `MetaActionItem` 的已有测试按拆分后的结构调整。

### 6. CoreBox 渲染层（design §5）

1. `useDetach`：
   - 新增 `openFlowPanel`，DivisionBox 里直接短路。
   - `dispatchFlow` 改为 `dispatchFlow(item, selection)`。
   - 删除 FlowSelector 相关状态。
   - `corebox:flow-item` 和 `triggerTransfer` 都改为调用 `openFlowPanel`。
2. `useActionPanel`：`openFlowSelector` 换成 `dispatchFlow`，`flow` 一路传到 `executeAction`。
3. `useKeyboard`：`buildCoreBoxMetaShowRequest` 支持 `page` 和 `flowTargets`；删除 `.FlowSelector` 避让。
4. `meta-panel-fill.ts` 改为 `useMetaPanelState()`，返回 `{ fill, blur }`。
5. `CoreBox.vue`：
   - 删除 FlowSelector、`useFlowPanelRoom` 和 `windowFloor` 的接线。
   - 加上 `--meta-blur` class 和模糊 CSS（design §5.5，含运动总闸）。
   - `useActionPanel` 传入 `dispatchFlow`。
6. 删除 floor（design §5.7，对照 `85221fba1` 的 diff 反向删）：
   - `useResize` 的 `floor` / `floorApplied`。
   - `useSearch` 的第三个参数。
   - `FlowSelector.vue` 及其测试、`useFlowPanelRoom.ts` 及其测试。
7. 测试：
   - `useDetach.test.ts`：
     - `openFlowPanel` 发出 `page: 'flow'`，带上 `flowTargets` 和对应高度；取目标失败时目标为空数组。
     - DivisionBox 里不发请求。
     - `dispatchFlow` 的载荷可以 `structuredClone`，三种底栏反馈都对。
   - `useActionPanel.test.ts`：有 `flow` 时派发，没有 `flow` 时不派发。
   - `useKeyboard.test.ts`：删除 `.FlowSelector` 用例；补上 `buildCoreBoxMetaShowRequest` 在 `page: 'flow'` 时的高度。
   - `useResize.test.ts`：删除 floor 用例，其余用例不修改，全部通过。
   - `CoreBox.*.test.ts`：去掉 FlowSelector 的 stub 和 `openFlowSelector` mock。
   - 新增一条：`panelState.blur` 能切换 `--meta-blur` class。
8. 验证：

   ```bash
   cd apps/core-app
   npm run typecheck:node && npm run typecheck:web
   ./node_modules/.bin/vitest run src/renderer/src/views/meta src/renderer/src/components/meta \
     src/renderer/src/modules/box src/renderer/src/views/box src/main/modules/box-tool/core-box
   ```

   如果 `.bin` 的 shim 失效，见记忆 `stale-bin-shims-after-repo-move`，直接调用 `.pnpm` 里的入口。

9. 残留扫描（AC9），要先做正向对照：先在一个已知包含某个词的文件里确认能搜到，再搜残留，并核对零结果是真实的：

   ```bash
   rg -n "FlowSelector|useFlowPanelRoom|windowFloor|floorApplied|handOffToFlowPicker|flowHandOffTimer" apps/core-app/src packages/utils
   ```

> **提交 2**（待用户同意）：`feat(core-app): open Flow as the second page of the ⌘K card`，范围是协议、主进程、overlay、CoreBox 和删除旧实现。

### 7. footer 毛玻璃（design §5.5 底板、§5.6）

1. `CoreBox.vue`：`.CoreBoxRes-Main` 加上 `--footer-plate` class 绑定和 `::before` 底板 CSS，注释写清原因。
2. `CoreBoxFooter.vue`：`--fake-inner-opacity` 和 `--fake-opacity` 都设成 0.5，并补注释。
3. 真机调参：在隔离实例里分别截深色和浅色主题，填充在 0.4 / 0.5 / 0.6 之间取残影不可读、模糊可见、底栏文字清楚的那一档。
4. 用逐帧采样确认 footer 滑入时底板同步出现：可以用 `getAnimations` 加暂停的方法，见记忆 `tuff-dev-cdp-verification-gotchas`。

> **提交 3**（待用户同意）：`fix(core-app): give the CoreBox footer an opaque backdrop to frost`。

### 8. 真机验收（AC1–AC8、AC11、AC12）

- 用现有的隔离实例：CDP 9344，profile 在 `/tmp/tuff-flow-metak-2/userdata-r11`，脚本在 `/tmp/tuff-flow-metak-2/`。
- 如果实例已经被外部清理，按记忆 `tuff-dev-cdp-verification-gotchas` 重建：必须走 dev wrapper，新 profile 要先用 `storage:app:save` 过新手引导。
- 逐条验收 AC，结论写进 `implement.md` 末尾的「验收记录」。截图只放在 `/tmp`，任务目录里只记路径和测量值。
  - **AC1、AC8**：在短列表上（2–4 条结果）按 ⌘K，激活「流转」。记录窗口高度序列（只能单调变化），以及卡片高度动画的起点和终点。
  - **AC2、AC3**：两种 Esc 语义。
  - **AC4**：进入插件 UI 模式（任选一个 webcontent 插件），按插件页快捷键，截图证明卡片在插件视图上方。
  - **AC5、AC6**：分别派发 System Info 和一个需要确认的 QuickOps 目标，记录底栏文案和 `ACKED`。
  - **AC7**：截取模糊开和关两个状态；用 `Emulation.setEmulatedMedia` 模拟 `prefers-reduced-motion`，确认没有过渡。
  - **AC11**：深色和浅色主题各截一张 footer 对比，并检查 canvas 布局没有变化。
  - **AC12**：由单测覆盖。如果 DivisionBox 能打开，再补一次真机确认。
- 真机验收开始前，先确认屏幕没有锁定（`CGSSessionScreenIsLocked=false`），否则过渡不会推进，见 spec 「Native visibility」。

### 9. Spec 更新（Phase 3.3）

- `.trellis/spec/main-process/corebox-meta-overlay-contracts.md`：
  - 场景 1：删掉交接相关的条款，加上「切页时只拉高」。
  - 场景 2：`panelState` 加 `blur`。
  - 键盘场景：Esc 只在根页面由主进程关闭；分页按键表；去掉 `.FlowSelector`。
  - 「The Flow picker in the CoreBox renderer」整节改写为「The Flow page inside the ⌘K card」。7 段结构保持完整，包括签名、校验矩阵、Good/Base/Bad、测试要求、Wrong vs Correct。
- `.trellis/spec/frontend/corebox-results-contracts.md`：补「底栏下方的不透明底板」（透明窗口里 `backdrop-filter` 的原理和对照实验），以及「流转页的 CoreBox 模糊」（只能用 `filter`，受运动总闸控制）。
- `.trellis/spec/main-process/channel-transport-contracts.md`：如果里面引用了 FlowSelector 的克隆规则，改成指向 `dispatchFlow`。
- `.trellis/spec/main-process/index.md`、`.trellis/spec/frontend/index.md`：同步 meta overlay 和 CoreBox 那一行的摘要。

### 10. 收尾检查

- 用 `trellis-check` 做一次全范围检查。
- lint 只看增量，用各包自己的配置，不对整个文件跑 `--fix`，见记忆 `coreapp-lint-config-vs-root`。
- `git diff --check`。
- 对照 PRD 的 AC 表逐条打勾，没有验证过的写明原因。

## 有风险的地方

| 文件 | 风险 | 兜底 |
| --- | --- | --- |
| `core-box/meta-overlay.ts` | 删交接、改 Esc，容易漏掉某个计时器或复位 | 主进程测试全覆盖；扫描残留；真机看窗口高度序列 |
| `components/meta/MetaPanel.vue` | 拆分后 ⌘K 操作列表回归（高亮板、悬停、焦点） | `MetaOverlay.test.ts` 现有用例不改且全绿；真机对比悬停跟随 |
| `hooks/useResize.ts` | 删 floor 时没有逐行回到原样 | 对照 `85221fba1` 的 diff 反向删；`useResize.test.ts` 其余用例不改 |
| `views/box/CoreBox.vue` | 大文件，其他会话可能同时在改 | 只暂存自己的 hunk；提交前核对 `git diff` |
| `TxTransitionPush` | 封顶加内部滚动的卡片里 FLIP 测量不准 | 单测用固定尺寸 mock；真机在长列表（目标多于 12 个）上验证封顶 |
| 模糊性能 | 720×544 区域上的 `filter` 过渡在低端机上掉帧 | 运动总闸关闭时不过渡；真机看过渡期间的帧间隔 |

## 回滚点

- 提交 1：TuffEx 加 Nexus。回退它要连同提交 2 一起回退，因为 MetaPanel 依赖它。
- 提交 2：可以整体回退，回到双面板加交接的方案。
- 提交 3：独立回退，footer 回到现状。

## 验收记录

### 环境

- 隔离 dev 实例：CDP 9344，vite 5191，profile 在 `/tmp/tuff-flow-metak-2/userdata-r11`。
- 主进程代码改动后，旧实例还跑着旧的主进程，没有自动重启。所以 04:17 和 04:36 各重启过一次。
- 第二次重启前，把 `plugins/json-formatter/dist/build` 装进了 profile，留给 AC4 用。
- 采样脚本放在 `/tmp/tuff-flow-metak-2/`：`run-drill.sh`、`run-direct.sh`、`run-dispatch.sh`、`plate-sync-test.js`、`plate-toggle-test.js`。CoreBox 和 overlay 两边都按 `Date.now()` 对齐时间轴，逐帧记录。
- 截图在 `/tmp/tuff-flow-metak-2/shots/`。

### footer 毛玻璃（AC11）

**通过。**

- **深色主题**：让「Channels」那一行整行压在 footer 下（556–600），footer 里看不到任何字，只剩图标糊开的一点色晕。修复前那张图里，「General」那一行的残影是清楚可读的。截图：`before-after-dark.png`、`after-aligned-footer.png`。
- **浅色主题**：同样位置，同样看不到残影。底板颜色 rgb(240,242,245)，和遮罩色一致。截图：`light-aligned-footer.png`。
- **底板和 footer 同步**：
  - 第一版底板的 class 绑在 `footerRef` 上，晚一次渲染才生效。结果区重新挂载时，footer 已经在原位，底板却还要从 44 滑到 0，用了约 100ms。这次窗口刚好还是 56 高，没露出来。
  - 改成 `:has(> .CoreBoxFooter-Sticky.display)` 之后：结果区重新挂载时，两者同一帧出现在原位；原地切换 `display` 时，滑入的 13 帧里两者的位移值逐帧相同。
- canvas 布局用 `:not(.CoreBoxRes-Main--canvas)` 排除，不生成底板。

### 场景 A：短列表（「betterdisplay」2 条结果）上 ⌘K → ⌘⇧D → Esc → Esc（AC1、AC2、AC7、AC8）

**通过。**

- **打开 ⌘K**：
  - meta-fill 先铺上（188ms），窗口从 190 长到 488。
  - overlay 打开之前是空的（`no-card`），不再闪出上一次的旧页面。
- **⌘⇧D 推入流转页**：
  - 窗口只拉高一次，488 → 536。
  - 卡片顶边固定在 64，高度 372 → 420，过渡约 110ms，推入期间带 `is-pushing`。
  - 模糊从 0 平滑到 8px，约 210ms。
  - 标题行出现「‹」和「选择目标」。
- **Esc #1**：
  - 推回操作列表，窗口保持 536 不缩。
  - 卡片从顶部收回到 372，模糊平滑褪掉。
  - 「‹」和「选择目标」淡出。
- **Esc #2**：
  - 主进程拦下并关闭面板，卡片立即移除。
  - 窗口平滑缩回 190，meta-fill 等高度落定后才撤掉。

### 场景 B：结果列表上直接 ⌘⇧D → Esc（AC3）

**通过。**

- 卡片直接停在流转页，没有「‹」，标题行有「选择目标」。
- 模糊立即开始；窗口 190 → 536 一次到位，因为 CoreBox 先取好了目标、请求里带的就是准确高度。
- Esc 一次就关闭面板，窗口缩回 190，模糊撤掉。

### 场景 C：派发与确认（AC5、AC6）

**部分通过。**

- **推入确认页**：选中「QuickOps System Info」后推入了 `flow-confirm`。这个 profile 还没授权过 corebox → QuickOps，确认页文案是「确认流转 / 允许 corebox 将内容发送到 QuickOps？/ 拒绝 / 仅本次允许 / 始终允许」。
- **确认与派发**：04:39:51 确认页被允许（不是脚本操作的，见下文），会话从 `flow-1791027591316-0` 走到 `quickops.system-info`，`INIT → TARGET_SELECTED → DELIVERING → ACKED`。CoreBox 的 footer 显示了「已发送到目标插件」。
- **未真机验证（只有单测覆盖）**：确认页上按 Esc 拒绝，不应调用 `grantConsent`，并退回流转列表。原因见下文。

### 闪旧页（这次一并修掉）

- **现象**：主进程关面板时会同步隐藏 view，overlay 的离场过渡就卡在第一帧（`meta-panel-leave-from` / `leave-active`）。旧卡片的 DOM 一直留着，下次打开时会先露出约 20ms，这次闪出的是 `flow-confirm` 页。
- **修法**：`MetaOverlay.vue` 加了 `endLeave` 钩子，卡片离场时立即移除，只保留进场动画。
- **复测**：打开前 overlay 里是空的，关闭时卡片立即消失。

### 不是脚本触发的操作

- **04:19:00–04:19:13**：3 秒内在操作列表和流转页之间来回进出 6 次，之后进确认页、退回、再确认，最后派发 `quickops.disk-space`，结果是 ACKED。
- **04:39:51**：上面那次 System Info 的确认。
- 判断是有人在手动操作这个实例。为了不互相干扰，之后就停了自动操作。

### 尚未验证 → 用户同意后补测（2026-10-03 04:44–04:56）

- **AC10：通过。** 用户同意后，`touch apps/nexus/nuxt.config.ts`，:3200 中断约 20 秒后恢复。用 ego（TaskSpace 193，已 finish）打开 `/zh/docs/dev/components/transition`：
  - 页面里已经没有未解析的 `<txtransitionpush>`。
  - 「推入翻页（Z）」一节渲染正常。
  - 点「下一页」后，第一页从 0 推到 -100%，第二页从 100% 推到 0，用时约 220ms；容器高度 114.5 → 185.5；运动期间带 `is-pushing`，结束后撤掉。
  - 截图：`nexus-push-demo-2.png`。
- **AC4：通过。**
  - 准备工作：在隔离 profile 里给 json-formatter 授予 `clipboard.read` 和 `network.internet`，然后启用它，搜「格式化」回车，进入插件 UI 模式。
  - CDP 注入的按键会绕过主进程的 `before-input-event`，所以「插件视图按 ⌘⇧D → 主进程广播 `triggerTransfer`」这一段测不到。这段代码这次没有改动，由 `plugin-window-boundary-contract.test.ts` 覆盖。
  - 改用等价路径：插件 UI 模式下，焦点在 CoreBox 顶栏时按 ⌘⇧D。主进程收到 `ui.show`（`anchor=corner`、`page=flow`）；卡片停在流转页，没有「‹」，标题是「JSON格式化」，距窗口底边 12px；CoreBox 顶栏模糊到 8px。
  - 窗口级截图 `win-ui-mode-flow.png`（`screencapture -l`，窗口 ID 用 Swift 调 CGWindowList 查到）：卡片画在插件页面上方；插件页面只有遮罩，没有模糊。
  - 中途有一次没打开，是因为 CoreBox 失焦自动隐藏了，主进程按设计记了「Skip MetaOverlay show: CoreBox window is hidden」。
- **AC6 拒绝路径：通过。**
  - 过滤到「QuickOps Public IP」（需要确认，只做只读查询），回车推入 `flow-confirm`。确认页出现「‹」，焦点落在主按钮「授权并发送」上。
  - Esc 后退回流转列表：当前行还是 Public IP，焦点回到过滤框，「‹」消失。日志里没有新的 FlowBus 会话，也没有授权记录。
  - 再按 Esc，面板关闭。
- **AC7 减弱动效：通过。** 用一个长连接脚本 `reduced-motion.mjs`，在两个渲染层上都模拟 `prefers-reduced-motion: reduce`：
  - CoreBox 的过渡时长被压到 0，模糊一帧切换到 8px。
  - overlay 切页时没有任何位移动画（推入时长为 0）。

### 新发现的原有缺陷（不是本任务引入的，只报告）

- **退出插件后，流转取到的还是插件功能，不是当前选中的结果。**
  - 现象：在插件 UI 模式里按 Esc 退出后，搜「betterdisplay」并选中 BetterDisplay，按 ⌘⇧D，流转页的标题却是「JSON格式化」，确认页写的是「来自 json-formatter 的内容」。
  - 原因：`useDetach.handleFlowShortcut` 和 `triggerTransfer` 的处理函数都先调用 `getActiveFeature(activeActivations, boxOptions.data)`，它在没有激活中的插件时，会回退到 `boxOptions.data.feature` 里缓存的上一个插件功能。
  - 这段逻辑和 HEAD 完全一致（HEAD 里也是 `getActiveFeature(...) ?? detail?.item ?? res[focus]`）。
  - 后果：会把错误的内容发给目标。

### 顺带发现的原有行为（不在本任务范围，只记录）

- ⌘K 打开时，主进程在窗口拉高动画开始的同时就把 view 设为可见，所以卡片会跟着窗口从 73px 一起长到 372px，第一帧并没有完整空间。spec 场景 1 写的「first visible frame has room」只在关闭尺寸动画时成立。
