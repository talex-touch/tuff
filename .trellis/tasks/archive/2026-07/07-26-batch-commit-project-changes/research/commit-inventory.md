# 当前工作区逻辑提交清单

## 1. 审查范围与基线

- 当前分支：`master`，相对 `origin/master` 为 `ahead 3 / behind 0`。
- 最近 3 个本地提交：
  - `041aa8e18 feat(core-app): streamline file access permission flow`
  - `c0b1130bc feat(nexus): integrate version capsule into landing hero`
  - `052029f94 feat(tuffex): add version capsule components`
- 未提交业务差异：40 个已跟踪文件，另有 2 个业务未跟踪文件：
  - `apps/core-app/src/renderer/src/composables/useBeginnerGuide.ts`
  - `packages/utils/__tests__/renderer-transport-port-lifecycle.test.ts`
- 已按要求排除当前任务目录 `.trellis/tasks/07-26-batch-commit-project-changes/` 下的规划及研究文件。
- 暂存区为空；所有业务差异均未 staged。
- 已执行只读检查 `git diff --check`，未发现 whitespace error。
- 未运行测试、typecheck、build、格式化、`git add` 或 `git commit`；本报告仅给出推荐验证命令。

结论：建议拆为 **19 个逻辑提交组**。其中 8 个文件必须按 hunk 拆分，不能整文件暂存；详见第 4 节。

## 2. 推荐提交组

### G01 - 稳定冷启动耗时统计

**推荐消息**：`fix(core-app): stabilize cold-start duration tracking`

**文件**：

- `apps/core-app/src/main/modules/analytics/startup-analytics.ts`
- `apps/core-app/src/main/modules/analytics/startup-analytics.test.ts`

**边界**：只记录首次 renderer handshake；无效的进程创建时间回退到 analytics 构造时间；无论 main/renderer 指标到达顺序如何只计算一次。测试与实现必须同批。

**最小验证**：

```bash
pnpm -C apps/core-app exec vitest run src/main/modules/analytics/startup-analytics.test.ts
```

**风险**：低到中。测试通过类型强转访问私有字段；仍应关注系统时钟回拨导致 `readyTime - baseline` 为负的极端情况。

### G02 - 分块提交应用扫描写入

**推荐消息**：`fix(core-app): chunk app scan database writes`

**文件 / hunk**：

- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
  - `APP_ADDITION_COMMIT_CHUNK_SIZE = 50`
  - `persistScannedAppAdditions()` 的单事务改为每 50 项一个事务

**边界**：仅缩短 SQLite WAL writer lock 持有时间。不要带入同文件的启动索引健康检查 hunk。

**最小验证**：

```bash
pnpm -C apps/core-app exec vitest run src/main/modules/box-tool/addon/apps/app-provider.test.ts
```

**风险**：中。当前没有新增测试直接证明“超过 50 条时事务被拆分”或“中间 chunk 失败后下次扫描可补齐”；提交前最好补充或至少手工确认这两个行为。分块后不再是全批原子提交，这是有意的语义变化。

### G03 - 等待应用索引预热完成后再判定健康

**推荐消息**：`fix(core-app): defer app index health checks until warmup settles`

**文件 / hunk**：

- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
  - `isAppIndexPipelineBusy()`、`isAppIndexWarming()`、`waitForAppIndexPipelineIdle()`
  - `getIndexedSourceHealth()` 与 `_ensureStartupIndexHealth()` 调整
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider-test-harness.ts`

**边界**：避免扫描/回填尚未提交时误报空索引并重复触发 backfill；测试 harness 的 logger 复用、timeout helper 和私有类型补充都只服务本组测试，必须同批。

**最小验证**：

```bash
pnpm -C apps/core-app exec vitest run src/main/modules/box-tool/addon/apps/app-provider.test.ts
```

**风险**：中。等待逻辑依赖 `isInitializing`、`startupBackfillTask` 和 abort 的生命周期契约；测试覆盖了 settled promise 自旋与 shutdown 中断，但未覆盖 backfill timer 刚创建、尚未生成 task 的完整时序。

### G04 - 将流式搜索的 onboarding gate 显式呈现给用户

**推荐消息**：`fix(core-app): surface onboarding gate failures for streamed search`

**文件**：

- `apps/core-app/src/main/modules/box-tool/core-box/ipc.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/ipc.test.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/manager.ts`

**边界**：捕获 `OnboardingGateError`，复用 `CoreBoxManager.routeAdmissionFailure()` 显示主窗口并正常结束 stream；普通错误仍向上抛。测试与实现同批。

**最小验证**：

```bash
pnpm -C apps/core-app exec vitest run src/main/modules/box-tool/core-box/ipc.test.ts src/main/modules/box-tool/core-box/manager.test.ts
```

**风险**：中。`routeAdmissionFailure()` 从 private 改为 public，但新增测试只验证 IPC 调用，没有直接覆盖“窗口存在 / 已销毁 / 不存在”三个 manager 分支。

### G05 - 复用索引任务状态表的 schema 初始化

**推荐消息**：`fix(core-app): reuse indexing task state schema initialization`

**文件**：

- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-task-state-store.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-task-state-store.test.ts`

**边界**：每个 store 实例只运行一次 `CREATE TABLE` / `CREATE INDEX`；初始化失败时清空 promise 以允许重试。测试与实现同批。

**最小验证**：

```bash
pnpm -C apps/core-app exec vitest run src/main/modules/box-tool/search-engine/indexing-task-state-store.test.ts
```

**风险**：低。实例级缓存不会跨多个 store 实例去重，符合当前所有权边界，但如果运行时会反复构造 store，DDL 争用仍可能存在。

### G06 - 防止配置在异步 flush 期间被错误淘汰

**推荐消息**：`fix(core-app): prevent config eviction races`

**文件**：

- `apps/core-app/src/main/modules/storage/storage-lru-manager.ts`

**边界**：新增 `flushAndEvict()`，flush 后复核版本、dirty 状态和访问时间；所有 manual/force eviction 均保护 hot config。

**最小验证**：

```bash
pnpm -C apps/core-app run typecheck:node
```

**风险**：高。当前仓库没有 `StorageLRUManager` 定向测试，本组改变了 `forceEvict()` 对 hot config 的既有语义。另一个边界是：若条目原本 dirty，flush 期间发生纯读取，当前实现无法区分内部 flush 读取与外部读取，仍可能在该读取后淘汰。建议提交前补并发写入、并发读取、hot/manual/force 四类测试。

### G07 - 被拒绝文件权限时允许继续 onboarding

**推荐消息**：`fix(core-app): handle denied file access during onboarding`

**文件 / hunk**：

- `apps/core-app/src/renderer/src/components/permission/FileAccessCard.vue`
- `apps/core-app/src/renderer/src/composables/useFileAccessPermission.ts`
- `apps/core-app/src/renderer/src/views/base/begin/internal/SetupPermissions.vue`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json` 中 `deniedHint`、`skipForNow`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json` 中 `deniedHint`、`skipForNow`

**边界**：macOS TCC denial 改为跳转系统设置；onboarding 提供“稍后再说”，且跳过时不会伪造已授权状态。主进程的 `system/permission/open-settings` handler 已存在于 `platform-permission-service.ts`，不是缺失依赖。

**最小验证**：

```bash
pnpm -C apps/core-app exec vitest run src/main/modules/system/platform-permission-service.test.ts src/renderer/src/modules/system/system-permission-refresh.test.ts
pnpm -C apps/core-app run typecheck:web
```

**风险**：中到高。没有组件级测试覆盖 denied、skip、grant 三条交互路径；`openSettings()` 只处理 transport rejection，却忽略 handler 返回 `false` 的失败结果，可能静默失败。本组是 HEAD `041aa8e18` 的直接后续修复，提交消息也可使用 `fixup! feat(core-app): streamline file access permission flow`，但只有明确准备 autosquash/改写本地历史时才这样做。

### G08 - 关闭引导前立即持久化完成状态

**推荐消息**：`fix(core-app): persist onboarding completion before closing`

**文件**：

- `apps/core-app/src/renderer/src/views/base/begin/internal/Done.vue`

**边界**：`beginner.init` 是 main process 放行 CoreBox/search 的门禁，不再只依赖 renderer debounce 与延迟 flush。

**最小验证**：

```bash
pnpm -C apps/core-app run typecheck:web
```

**风险 / 阻断建议**：高。`StorageEvents.app.save` 失败后当前代码只记日志，仍隐藏 onboarding 并尝试打开 CoreBox；这与“避免用户再次被 gate 锁住”的目标冲突。建议在提交前明确产品行为：保存失败时保留/恢复引导并提示用户，或确认后续 debounce 必然可恢复。当前没有定向测试。

### G09 - 从设置页重新运行 onboarding

**推荐消息**：`feat(core-app): allow rerunning the onboarding guide`

**文件 / hunk**：

- `apps/core-app/src/renderer/src/composables/useBeginnerGuide.ts`（未跟踪文件，必须纳入）
- `apps/core-app/src/renderer/src/App.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingTools.vue`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json` 中 `settingTools.usage*`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json` 中 `settingTools.usage*`

**边界**：将 guide overlay 可见性从 `appSetting.beginner.init` 解耦，避免“重新看教程”临时关闭 main-process gate；rerun 通过卸载/重挂清理 wizard 写入的 inline `display:none`。

**最小验证**：

```bash
pnpm -C apps/core-app run typecheck:web
```

**风险**：中。新 composable 是模块级 singleton 且没有测试；完成引导后 `visible` 仍为 true，只是 wizard 自身隐藏，rerun 依赖 false/nextTick/true 强制重挂。需手工验证首次启动、完成、设置页重跑、第二次完成四步。

### G10 - 设置页使用紧凑邮箱展示

**推荐消息**：`fix(core-app): compact email labels in settings`

**文件**：

- `apps/core-app/src/renderer/src/views/base/settings/SettingUser.vue`
- `apps/core-app/src/renderer/src/components/base/user-identity-presentation.test.ts`

**边界**：仅设置列表行使用 `formatCompactEmail()`；profile/editor 保留完整邮箱。测试与实现必须同批。

**最小验证**：

```bash
pnpm -C apps/core-app exec vitest run src/renderer/src/components/base/user-identity-presentation.test.ts
```

**风险**：低。共享 formatter 已由 `packages/utils/__tests__/account-display.test.ts` 覆盖。

### G11 - 删除旧 provider 编辑文案

**推荐消息**：`chore(core-app): remove stale provider editor translations`

**文件 / hunk**：

- `apps/core-app/src/renderer/src/modules/lang/en-US.json` 中删除的 `providerName`、`providerNamePlaceholder`、`providerType`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json` 中对应删除

**边界**：这是纯清理，不应混入 G07/G09。静态搜索未发现对这组具体旧 key 的直接调用，仓库其他 namespace 下仍有同名 key。

**最小验证**：

```bash
pnpm -C apps/core-app run typecheck:web
```

**风险**：中。i18n key 可能由动态路径拼接，静态搜索不能完全证明未使用；若不能追溯到删除这些 UI 字段的原提交，建议暂缓本组而不是夹带提交。

### G12 - 文档 demo 接近视口时自动激活

**推荐消息**：`perf(nexus): activate docs demos near the viewport`

**文件 / hunk**：

- `apps/nexus/app/components/content/TuffDemoWrapper.vue`
- `apps/nexus/app/components/content/demo-client-boundary.test.ts`
- `apps/nexus/app/components/content/demo-lazy.ts`
- `apps/nexus/app/components/content/demo-lazy.test.ts`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts` 中 demo activation 断言
- `apps/nexus/i18n/locales/en.ts` 中删除 `docs.demo.run` / `paused`
- `apps/nexus/i18n/locales/zh.ts` 中对应删除

**边界**：用 `IntersectionObserver` + `240px` root margin 替代手动“运行示例”按钮；实现、边界测试、性能契约测试和文案删除必须同批。

**最小验证**：

```bash
pnpm -C apps/nexus exec vitest run app/components/content/demo-client-boundary.test.ts app/components/content/demo-lazy.test.ts app/pages/docs/docs-page-performance.test.ts
```

**风险 / 历史关系**：高。这明确反转了 `787737f8d perf(nexus): require manual docs demo activation` 的产品与性能决策。当前测试主要验证源码字符串，不验证多 demo 页面上的 CPU、内存和加载峰值。提交前应确认这是有意回滚手动激活策略，并在真实长文档上做滚动性能检查。

### G13 - 跨文档路由 remount 保留正确正文

**推荐消息**：`fix(nexus): preserve docs content across route remounts`

**文件 / hunk**：

- `apps/nexus/app/utils/docs-page-client-cache.ts`
- `apps/nexus/app/pages/docs/[...slug].vue` 的 script 数据所有权、full-body cache、stale fetch、loading/viewState hunk
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts` 中 full-body cache / route remount 断言

**边界**：full-body LRU 移到模块作用域；page 用本地 `shallowRef` 接管 Nuxt async-data，拒绝前一路由的陈旧数据与请求；三文件必须同批，否则 import 或缓存契约会断裂。

**最小验证**：

```bash
pnpm -C apps/nexus exec vitest run app/pages/docs/docs-page-performance.test.ts
pnpm -C apps/nexus run typecheck
```

**风险**：中到高。现有测试仍以源码字符串断言为主，没有真实挂载测试覆盖 A→B→A、metadata-only→full-body、fetch 失败、快速连点导航。`null` 不进入 full-body cache，因此不存在页面不会被负缓存，可能重复请求但不会错误命中。

### G14 - 重构文档阅读版式与右侧资源区

**推荐消息**：`feat(nexus): refine the docs reading experience`

**文件 / hunk**：

- `apps/nexus/app/components/docs/DocHero.vue`
- `apps/nexus/app/components/docs/DocsAsideCardsShell.vue`
- `apps/nexus/app/pages/docs/[...slug].vue` 的 template class 与 style hunk
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts` 中 DocHero glow 断言
- `apps/nexus/i18n/locales/en.ts` 的 `outlineLabel`
- `apps/nexus/i18n/locales/zh.ts` 的 `outlineLabel`

**边界**：纯阅读体验和信息架构调整；不要带入 G13 的缓存修复，也不要带入 G12 的 demo 行为。

**最小验证**：

```bash
pnpm -C apps/nexus exec vitest run app/pages/docs/docs-page-performance.test.ts
pnpm -C apps/nexus run typecheck
```

**风险**：中。必须浏览器检查桌面/移动、明暗主题、长标题和中英文。`DocsAsideCardsShell.vue` 新增的“用 AI 解读本页 / Resources / 三个链接”采用 locale 条件硬编码而非 i18n key，后续语言扩展和文案维护成本较高。源码测试不能替代视觉回归。

### G15 - 修正并按需暂停 Floating 视差动画

**推荐消息**：`fix(tuffex): center and suspend floating parallax`

**文件**：

- `packages/tuffex/packages/components/src/floating/src/TxFloating.vue`
- `packages/tuffex/packages/components/src/floating/__tests__/floating.test.ts`

**边界**：坐标改为相对容器中心；动画收敛后停止 RAF；scroll/resize 唤醒；离屏和 reduced-motion 停止动画。测试与实现同批。

**最小验证**：

```bash
pnpm -C packages/tuffex exec vitest run packages/components/src/floating/__tests__/floating.test.ts
pnpm -C packages/tuffex run typecheck
```

**风险**：高。中心坐标替代左上角坐标会改变所有现有消费者的视觉位移语义，属于潜在 breaking visual change；新增测试未覆盖 IntersectionObserver 离屏/重新入屏与运行时切换 reduced-motion。建议在 G16 前提交并独立回滚。

### G16 - 更新 Nexus Instant Preview 卡片与布局

**推荐消息**：`feat(nexus): refresh instant preview cards`

**文件**：

- `apps/nexus/app/components/tuff/landing/TuffLandingInstantPreview.vue`

**边界**：调整卡片 header/footer、层级、舞台缩放、浮层定位、渐变边框与 reduced-motion 样式。只包含 landing consumer。

**依赖**：编译上不强依赖 G15，但视觉校准显然基于新的 `TxFloating` 中心视差语义；推荐 G15 先提交、G16 后提交，便于分别回滚组件基础行为和页面视觉。

**最小验证**：

```bash
pnpm -C apps/nexus run typecheck
pnpm -C apps/nexus run visual:smoke:tuffex
```

**风险**：高。必须浏览器验证 960px 上下断点、常见桌面高度、reduced-motion 和卡片不重叠。`@property` + `border-image` + border radius 的跨浏览器呈现也需要实测；当前无定向测试。

### G17 - 限制 renderer MessagePort 生命周期泄漏

**推荐消息**：`fix(utils): bound renderer MessagePort lifecycle`

**文件**：

- `packages/utils/transport/sdk/renderer-transport.ts`
- `packages/utils/transport/sdk/stream/client-runtime.ts`
- `packages/utils/__tests__/renderer-transport-port-lifecycle.test.ts`（未跟踪文件，必须纳入）

**边界**：stream port timeout 从 1.5s 同步提高到 3s；stream 强制独占 port；未认领 confirm 定时关闭；abandoned port ID 按时间/数量限制；destroy 清理 timer。两个 timeout 常量和新测试必须同批。

**最小验证**：

```bash
pnpm -C packages/utils exec vitest run __tests__/renderer-transport-port-lifecycle.test.ts __tests__/renderer-transport-stream.test.ts
```

**风险 / 历史关系**：中到高。这是 `478a8871c fix(search): deliver MessagePorts through isolated preload` 与 `a0c628289 feat(runtime): hard-cut transport and sandbox widgets` 的后续生命周期加固。3s 会增大失败时 stream 首次 fallback 延迟；fake timer 测试覆盖泄漏边界，但应同时跑已有 stream/handoff 契约测试，避免 force-port 改动破坏订阅缓存。

### G18 - core-app 显式声明 Vue runtime 依赖

**推荐消息**：`chore(core-app): declare the Vue runtime dependency`

**文件 / lock hunk**：

- `apps/core-app/package.json`：新增 `"vue": "catalog:frontend"`
- `pnpm-lock.yaml`：`apps/core-app` importer 下新增 Vue specifier/version 的 hunk

**边界**：core-app 大量直接 import Vue，显式声明依赖，不应依赖传递依赖。只暂存 lockfile 中 core-app importer hunk。

**最小验证**：

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm -C apps/core-app run typecheck:web
```

**风险**：低。`catalog:frontend` 当前解析为 Vue `3.5.39`，与现有 lock 中 Vue 实例一致，没有版本升级。

### G19 - touch-intelligence 使用统一 Vue catalog

**推荐消息**：`chore(touch-intelligence): use the frontend Vue catalog`

**文件 / lock hunk**：

- `plugins/touch-intelligence/package.json`：`^3.5.33` 改为 `catalog:frontend`
- `pnpm-lock.yaml`：`plugins/touch-intelligence` importer 的 Vue specifier hunk

**边界**：只统一依赖声明，不改变当前锁定版本。不要与 G18 整包混暂存；两组可以独立回滚。

**最小验证**：

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm plugins:validate
```

**风险**：低。lock version 仍为 `3.5.39`；风险主要是 plugin package policy 是否允许 named catalog，需由 `plugins:validate` 确认。

## 3. 推荐提交顺序

建议顺序如下：

```text
G18 -> G19
G01 -> G02 -> G03 -> G05 -> G06 -> G04
G07 -> G08 -> G09 -> G10 -> G11
G17
G15 -> G16
G12 -> G13 -> G14
```

说明：

- 依赖声明先落，后续 typecheck/build 基线更可信。
- G02/G03 共用 `app-provider.ts`，先提交较小的事务分块，再提交有测试覆盖的健康检查。
- G06/G04/G07/G08/G09 都与 onboarding 可恢复性有关，但保持独立回滚；先保证存储，再接 gate 呈现和 renderer UX。
- G15 先于 G16，基础组件行为与具体页面视觉可分别回滚。
- Nexus 先提交 demo 行为和缓存功能，最后提交大面积视觉 hunk，发生回归时定位更清楚。

## 4. 必须按 hunk 拆分的文件

以下文件不能直接整文件暂存：

| 文件 | hunk 归属 |
|---|---|
| `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts` | G02：chunk 常量与 `persistScannedAppAdditions()`；G03：warming/idle/health 其余 hunk |
| `apps/core-app/src/renderer/src/modules/lang/en-US.json` | G07：denied/skip；G09：usage/usageDesc/usageAction；G11：provider key 删除 |
| `apps/core-app/src/renderer/src/modules/lang/zh-CN.json` | 同上 |
| `apps/nexus/app/pages/docs/[...slug].vue` | G13：script/cache/loading；G14：template class 与 style |
| `apps/nexus/app/pages/docs/docs-page-performance.test.ts` | G12：demo；G13：cache/remount；G14：DocHero glow |
| `apps/nexus/i18n/locales/en.ts` | G12：删除 run/paused；G14：outlineLabel |
| `apps/nexus/i18n/locales/zh.ts` | 同上 |
| `pnpm-lock.yaml` | G18：core-app importer；G19：touch-intelligence importer |

执行提交时适合使用 `git add -p -- <file>`，并在每次 commit 前用 `git diff --cached --stat` 与 `git diff --cached` 复核。这里仅给出操作建议，本次研究未执行暂存。

## 5. 最近提交与遗留关系判断

### 高置信度后续修复

- G07 直接修改 HEAD `041aa8e18` 新增/重写的 `FileAccessCard.vue`、`useFileAccessPermission.ts`、`SetupPermissions.vue` 和文案，是该提交的明确 follow-up。
- G17 是 MessagePort 交付与 transport hard cut 后的资源生命周期 follow-up，关联 `478a8871c` 与 `a0c628289`。
- G12 明确反转 `787737f8d` 的手动 demo 激活策略，不应伪装成普通性能微调。

### 同域但不应并入最近提交

- G02/G03 所在 `app-provider.ts` 最近由 `6cb294889 fix(core-app): harden app icon self-healing` 修改，但当前 hunk 是扫描事务和索引预热，不属于图标自愈；应独立提交。
- G14/G16 属于 Nexus 视觉继续迭代，但本地提交 `c0b1130bc` 只修改 `TuffLandingNexusHero.vue` 与 landing route i18n，并未触及当前这些文件；不建议当作该提交遗漏文件。
- G15 与本地提交 `052029f94` 都在 TuffEx 域，但后者是 version-capsule 新组件，当前是 floating 行为修复，必须独立。

### 锁文件归属

- 当前 `pnpm-lock.yaml` 相对 HEAD 只有两个 Vue importer 变化：core-app 新增直接依赖（G18）和 touch-intelligence 改 catalog specifier（G19）。
- 最近锁文件提交 `31f77db72` 是 Zod 统一；当前 lock hunk 不属于该提交遗留，也不应与任何业务功能组混在一起。

## 6. 关键风险与提交门禁

1. **G08 建议先决策再提交**：持久化失败后仍关闭引导，可能继续把用户留在 gate 后面。
2. **G06 缺少回归测试**：改动通用 LRU 与 force eviction 语义，风险高于文件规模表面所示。
3. **G12 是策略反转**：自动挂载 demo 可能重新引入长文档 CPU/内存峰值，需要产品与性能确认。
4. **G15 是全局视觉语义变化**：所有 `TxFloating` consumer 都从左上角坐标改为中心坐标，不能只看单元测试。
5. **G13 测试偏结构化**：源码字符串断言不能证明真实 Nuxt 导航竞态已解决，应补浏览器快速导航验证。
6. **G07/G09 无组件测试**：denied/skip/rerun 都是用户可见关键路径，至少需要手工验收。
7. **G14/G16 必须视觉验收**：桌面、移动、明暗主题、reduced-motion、长文本和卡片重叠均不由现有测试覆盖。

## 7. 最终批次复核建议

每组完成最小验证后，全部提交结束前再执行：

```bash
pnpm lint:changed
pnpm -C apps/core-app run typecheck
pnpm -C apps/nexus run typecheck
pnpm -C packages/tuffex run typecheck
pnpm install --frozen-lockfile --ignore-scripts
git status --short --branch
```

如 G14/G16 最终纳入，还需启动 Nexus 并做浏览器截图/交互检查；如 G07-G09 纳入，还需实际走一遍 onboarding 的 grant、deny、skip、complete、rerun 流程。
