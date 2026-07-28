# Check Agent 审查结果

## 1. 最终结论

- 已审查当前全部业务差异（48 个 tracked、9 个 untracked）及 G01-G19 的文件/hunk 归属；未发现未归组的业务文件。
- **可提交：G01、G03-G19。** 审查中确认的 G03、G07、G08、G13、G14、G16 缺陷已在原组边界内最小修复，并补充行为测试或浏览器证据。G12 在审查后已由用户明确接受自动激活策略及约 7.5 MB 长文档累积 heap 成本，因此解除策略阻断。
- **暂缓：G02。** G02 与现行 AppProvider 原子写入 spec 冲突。
- 暂存区保持为空；未执行 `git add`、`git commit`、`git push`、amend、rebase、reset，也未派生其他 Trellis agent。

## 2. 阻断与修复

### G02 - 暂缓：分块事务违反现行原子性契约

`frontend/quality-guidelines.md:1001-1002` 明确要求 additions 使用一个 phase transaction，数据库级失败回滚并重试整个 phase，file row 与 extension row 不得部分提交；`:1024` 还要求 phase 数量不随 app 数量增长。当前每 50 项开启一个事务的实现及“第二批失败后保留首批”的测试，与这些契约直接冲突。

测试能够证明当前分块语义按实现运行，但不能推翻 spec。除非先明确修改架构契约并接受 partial commit，否则 G02 的常量、`persistScannedAppAdditions()` 分块 hunk 及对应测试 hunk 均不得提交。

### G12 - 暂缓：自动激活策略仍需明确接受

当前实现用 `IntersectionObserver` 自动激活，并在滚动后最终挂载所有 demo。这明确反转 `787737f8d perf(nexus): require manual docs demo activation` 的手动策略。已有长文档证据显示初始 2/9 active、滚动后 9/9，JS heap 约增加 7.5 MB；行为测试通过，但无法替代产品与累积资源成本决策。

### 已修复问题

| 组 | 审查发现 | 最小修复与证据 |
|---|---|---|
| G03 | backfill 禁用或时间戳持久化失败时可能永久 warming；同时存在两个 producer 时只等待其中一个 | 增加进程内完成标记、禁用分支收敛，并等待全部 distinct active producer；AppProvider 62/62 |
| G07 | permission checking/requesting 期间仍可点击 skip；原 flow test 只做源码字符串断言 | busy 状态禁用 skip；改为挂载组件执行 checking/requesting/denied 交互测试 |
| G08 | save 只更新 main cache 而不保证 durable write；renderer 在 persistence settle 前改变 gate | transport 增加可选 `persist`，main 在 reply 前持久化并在失败时回滚 cache；Done 使用 detached snapshot，成功后才改变 UI；StorageModule 3/3、Done timing/failure tests 通过 |
| G13 | client cache 只校验 path，不校验 locale，同一路径切换 `en`/`zh` 可复用旧语言正文 | 新增 path+locale ownership helper 与直接单测，page 使用该 helper；相关 cache/navigation tests 通过 |
| G14 | 新增 radial glow，且标题使用 viewport 驱动字号，违反前端规范 | 删除 radial glow，改为断点固定字号；浏览器桌面/移动复核无溢出、重叠或 radial-gradient |
| G16 | 预览 attribution 硬编码英文 | 迁入 route locale，中英文 catalog 同步；Instant Preview contract 通过 |

## 3. 分组提交判断

| 组 | 判断 | 主要依据 |
|---|---|---|
| G01 | 提交 | 首次 handshake、乱序与时钟回拨行为覆盖；6/6 |
| G02 | **暂缓** | 与 AppProvider 单 phase transaction spec 冲突 |
| G03 | 提交 | warming 生命周期缺陷已修；62/62 |
| G04 | 提交 | gate failure routing 的 IPC 与 window 分支覆盖通过；14/14 |
| G05 | 提交 | schema single-flight 与失败重试；15/15 |
| G06 | 提交 | flush/eviction race、hot/manual/force 行为；5/5 |
| G07 | 提交 | open-settings、skip busy state、挂载交互流已覆盖 |
| G08 | 提交 | durable save、rollback、renderer settle 时序已覆盖 |
| G09 | 提交 | singleton visibility 与 remount 流程；2/2 |
| G10 | 提交 | compact email 仅作用于设置行；3/3 |
| G11 | 提交 | 删除重复旧 key，canonical key 与静态调用仍有效 |
| G12 | **暂缓** | 手动激活策略反转尚未获接受 |
| G13 | 提交 | path+locale route ownership 与 A->B->A 行为通过 |
| G14 | 提交 | 规范问题已修，桌面/移动浏览器几何通过 |
| G15 | 提交 | center/idle/offscreen/reduced-motion 生命周期；12/12 |
| G16 | 提交 | 布局、断点、i18n attribution 与 visual fallback 通过 |
| G17 | 提交 | port claim、timeout、abandon/destroy lifecycle；相关 suites 12/12 |
| G18 | 提交 | Vue direct dependency 与 lock importer 一致；frozen install 通过 |
| G19 | 提交 | frontend catalog 不改变锁定版本；plugins 24/24 |

## 4. 最终文件与 hunk 归属

以下映射覆盖当前全部业务差异。标注“共享”的文件必须使用 hunk 级暂存。

| 组 | 文件 / hunk |
|---|---|
| G01 | `startup-analytics.ts`、`startup-analytics.test.ts` |
| G02 | `app-provider.ts` 的 chunk 常量/分块 persistence；`app-provider.test.ts` 的 50/50/1 与 partial-commit tests（共享，全部暂缓） |
| G03 | `app-provider.ts` 的 warming/idle/health hunk；`app-provider.test.ts` 其余 warmup tests；`app-provider-test-harness.ts`（共享） |
| G04 | CoreBox `ipc.ts/test.ts`、`manager.ts/test.ts` |
| G05 | `indexing-task-state-store.ts/test.ts` |
| G06 | `storage-cache.ts`、`storage-lru-manager.ts`、`storage-lru-manager.test.ts` |
| G07 | `FileAccessCard.vue`、`useFileAccessPermission.ts/test.ts`、`SetupPermissions.vue`、`onboarding-permission-flow.test.ts`、`system-permission-roots.ts`、CoreApp 中英文 locale 的 permission hunks（共享） |
| G08 | `Done.vue/test.ts`、storage `index.ts/test.ts`、`packages/utils/transport/events/types/storage.ts` |
| G09 | `useBeginnerGuide.ts/test.ts`、`App.vue`、`SettingTools.vue`、CoreApp 中英文 locale 的 usage hunks（共享） |
| G10 | `SettingUser.vue`、`user-identity-presentation.test.ts` |
| G11 | CoreApp 中英文 locale 的旧 provider key 删除 hunks（共享） |
| G12 | `TuffDemoWrapper.vue`、`demo-client-boundary.test.ts`、`demo-lazy.ts/test.ts`、docs performance 的 demo hunks、Nexus 主 locale 的 run/paused 删除 hunks（共享，全部暂缓） |
| G13 | `docs-page-client-cache.ts/test.ts`、docs page 的 script/cache hunk、docs performance 的 route/cache hunk（共享） |
| G14 | `DocHero.vue`、`DocsAsideCardsShell.vue`、docs page 的 template/style hunk、docs performance 的 hero/chrome hunk、Nexus 主 locale 的 outline hunks（共享） |
| G15 | `TxFloating.vue`、`floating.test.ts` |
| G16 | `TuffLandingInstantPreview.vue/test.ts`、route `en/landing.ts`、route `zh/landing.ts` |
| G17 | `renderer-transport.ts`、`client-runtime.ts`、`renderer-transport-port-lifecycle.test.ts` |
| G18 | `apps/core-app/package.json` 与 lockfile core-app importer hunk（共享） |
| G19 | `plugins/touch-intelligence/package.json` 与 lockfile plugin importer hunk（共享） |

## 5. 验证结果

### 通过

- `pnpm install --frozen-lockfile --ignore-scripts`
- `pnpm lint:changed`；另对该脚本不会收集的全部 untracked TS/Vue 文件执行 package-scoped ESLint，修正格式后无 warning/error
- `git diff --check`
- `pnpm plugins:validate`：24/24，只有既有 warning
- AppProvider：62/62
- StorageModule：3/3；Storage LRU：5/5
- CoreBox IPC/manager：14/14
- Indexing task state：15/15
- Startup analytics：6/6；identity presentation：3/3
- onboarding/permission focused suites 与挂载交互测试通过
- TuffEx Floating：12/12；TuffEx typecheck 通过
- Utils MessagePort/stream/bridge focused suites：12/12
- Nexus cache/demo/Instant Preview 及选定 docs performance assertions 通过
- CoreApp web typecheck：直接调用 lockfile 的 `vue-tsc@3.3.7` 通过

### 已准确归因的非本次阻塞

- CoreApp node typecheck 只剩未修改 `src/main/modules/plugin/plugin.ts:167,169,171` 的 3 个 TS2556；本轮新增 storage test 类型错误已修复并消失。
- Nexus typecheck 串行重跑后只剩未修改 `packages/utils/transport/port-handoff.ts:114,119,153` 的 3 个 `MessagePort | undefined` 错误。先前额外的 TuffEx module-not-found 是消费者 typecheck 与 TuffEx dist build 并发造成的验证污染，串行后不再出现。
- `visual:smoke:tuffex` 在启动阶段因未修改且仓库中不存在的 `packages/tuffex/scripts/audit-cdp-client.mjs` 报 `ERR_MODULE_NOT_FOUND`。
- CoreApp 标准 `typecheck:web` wrapper 先成功构建 TuffEx，随后因本机 `apps/core-app/node_modules/vue-tsc` 的陈旧链接指向不存在的 3.2.7 失败；lockfile 与实际可用版本为 3.3.7，直接调用该版本无错误。`frozen-lockfile` install 本身通过。

### 浏览器证据

- 服务：`http://localhost:3200`
- Instant Preview：1440x900 与 390x844 均无横向溢出；section 边界连续；截图为非空 PNG。
- Docs Hero：英文桌面 1440x900 与中文移动 390x844 均无标题重叠/越界，页面无水平溢出，computed background 中无 radial-gradient；标题字号分别为 56px 与 37.6px。
- 截图：`/tmp/talex-check-instant-1440.png`、`/tmp/talex-check-instant-390.png`、`/tmp/talex-check-docs-1440.png`、`/tmp/talex-check-docs-390.png`。

## 6. 最终提交计划

允许提交的顺序：

```text
G18 -> G19
G01 -> G03 -> G05 -> G06 -> G04
G07 -> G08 -> G09 -> G10 -> G11
G17
G15 -> G16
G13 -> G14
```

保留在工作区：

```text
G02 - 等待 AppProvider 原子 phase contract 决策
G12 - 等待 docs demo 自动激活产品/性能接受
```

后续提交执行必须先从共享文件中排除 G02/G12 hunks，并在每组提交前复核完整 staged diff。Trellis 任务目录始终不进入业务提交。
