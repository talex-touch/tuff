# Implement — 推荐来源注册表

Parent: `.trellis/tasks/09-04-corebox-recommend-platform`

执行顺序按「先立基线,再动结构,最后逐个迁移」。每个 Gate 是一个可回滚点。

## Step 0 — 前置验证(不改产品代码)

- [ ] 验证 import 环:把 `item-rebuilder.ts:159/169/179/220` 的 `await import()`
      临时改为静态导入,跑 `pnpm --filter core-app typecheck` 与启动一次,记录是否报
      `Cannot access '...' before initialization`。结论写回 `design.md` §2.3 与 `prd.md` 风险条目。
- [ ] 实测 Provider 重复:启动应用,空 query + 输入若干 system action 关键词,
      记录内置 `system-actions-provider` 与 `plugins/touch-system-actions` 是否产生双份结果。
      结论写入 `research/provider-consolidation.md`。
- [ ] 恢复临时改动,确认工作区干净。

**Gate 0**:两项结论落盘。若确认成环,`design.md` §2.3 的「注册时推入」从建议升级为硬约束。

## Step 1 — 行为基线(纯测试,不改实现)

- [ ] 阅读现有 `item-rebuilder.test.ts`,列出已覆盖 / 未覆盖的分支。
- [ ] 为 app 分支补判别性 fixture:
      - 自身 App(命中 `isSelfAppIdentity`)必须被过滤
      - 系统噪声应用(命中 `matchNoisySystemAppRule`)必须被过滤
      - path 与 bundleId 混合输入,两路各自命中并合并
      - 扩展字段按 `fileId` 正确归并(两个 app 各带不同 extension,不得串位)
- [ ] 为 file / plugin-features / clipboard 三个分支补齐最小等价断言。
- [ ] 记录当前 app 分支的 DB 查询次数(用 spy 计数),作为 no-N+1 的基线数字。

验证:`pnpm --filter core-app vitest run item-rebuilder` 全绿。

**Gate 1**:基线测试全绿并已提交。此后任何等价性破坏都会被这组测试捕获。

## Step 2 — 契约与注册表(纯新增,零行为变化)

- [ ] `packages/utils/core-box/tuff/tuff-dsl.ts`:新增 `RecommendationRebuildCapable`
      (`recommendationSourceAliases?`、`rebuildRecommendationItems(itemIds)`)。
      **暂不**修改 `ISearchProvider` 本体 —— 以交叉类型使用,待 §7 开放问题定论后再决定是否内联。
- [ ] 新建 `search-engine/recommendation/recommendation-source-registry.ts`:
      `registerProviderSource` / `registerSource` / `resolve` / `canonicalize`。
      别名冲突抛错,不静默覆盖。
- [ ] 新建 `recommendation-source-registry.test.ts`:别名解析、冲突抛错、重复注册、dispose。

验证:`pnpm lint`、`typecheck`、新测试全绿;`item-rebuilder.test.ts` 仍全绿(此步未接线)。

**Gate 2**:注册表可独立存在。回滚 = 删两个新文件。

## Step 3 — 接线(调度器改造 + 三个已有 rebuildItem 迁移)

- [ ] `search-core.ts:registerProvider()` 中,对实现了能力的 provider 调用
      `registry.registerProviderSource(provider)`;`unregisterProvider` 对应注销。
- [ ] `mainWindowProvider` / `windowsShellFileProvider` / `systemActionsProvider`:
      在既有 `rebuildItem` 之上加批量包装 `rebuildRecommendationItems`,
      **保留** `rebuildItem` 以免破坏其他调用点(先查是否还有其他调用点)。
- [ ] `item-rebuilder.rebuildItems()` 改为 `design.md` §3 的调度器形态,
      但**暂时保留** app / file / plugin-features / clipboard 四个分支作为 fallback:
      注册表未命中时回落到旧分支,而非直接 warn。
- [ ] `rebuildPluginRecommendItems` 原样不动。

验证:`item-rebuilder.test.ts` 基线全绿(行为应完全不变)。

**Gate 3**:三个委托型来源已走注册表,四个定制来源仍走旧路径。此时新旧并存,风险最低。

## Step 4 — 迁移四个定制来源(逐个,每个独立可回滚)

按风险从低到高。每迁移一个,删除 `item-rebuilder` 内对应的 fallback 分支。

- [ ] **4a plugin-features** → `PluginFeaturesAdapter`。
      循环内 `await import()` 提到循环外,只解析一次 adapter。
- [ ] **4b clipboard-history** → 新建独立 source(注册路径 B,非 provider)。
      确定注册时机与宿主模块(clipboard 模块 or search-core),写进 design。
- [ ] **4c file-provider** → `fileProvider`,带 5 个别名。
      验证别名全部生效:构造 5 种 sourceId 的 ScoredItem,均应命中。
- [ ] **4d app-provider** → `appProvider`。**风险最高**,完整平移双路查询 +
      `fetchExtensionsForApps` + 两道过滤 + `mapAppsToRecommendationItems`。
      跑 Step 1 的判别性 fixture,并核对 DB 查询次数未超基线。

每个子步验证:`item-rebuilder.test.ts` 全绿 + 该来源的判别性 fixture 全绿。

**Gate 4**:四条 fallback 分支全部删除。

## Step 5 — 收口

- [ ] `item-rebuilder.ts` 中删除 `normalizeSourceId()` 与 `groupByNormalizedSource()`;
      grep 确认文件内无任何具体 provider 名、无 DB 调用、无 `await import()` 具体来源。
- [ ] 新增开放性测试:注册一个假 source,断言其条目出现在结果中。
      该测试的意义是「不改 item-rebuilder 也能加来源」,review 时须确认 diff 不含该文件。
- [ ] 补 no-N+1 断言(对比 Step 1 记录的基线数字)。
- [ ] 完成 `research/provider-consolidation.md`:文件搜索五 provider 的快路径/索引路径职责分析
      + system-actions 重复实测结论 + 建议的收敛路径。

## Step 6 — 全量校验

```bash
pnpm lint
pnpm --filter core-app typecheck
pnpm --filter core-app vitest run   # 至少覆盖 search-engine/recommendation
pnpm utils:test
```

- [ ] 运行时冒烟:启动应用,唤起 CoreBox 空态,确认推荐条目非空、无 Touch 自身、无系统噪声应用。
- [ ] 日志检查:无 `No recommendation source registered` warn(有则说明漏了来源)。

## 回滚点

| Gate | 回滚方式 |
|---|---|
| Gate 2 | 删除注册表与契约两个新文件 |
| Gate 3 | 还原 `item-rebuilder.rebuildItems()` 与 `search-core.registerProvider` 接线 |
| Gate 4 各子步 | 恢复该来源在 `item-rebuilder` 内的 fallback 分支(Step 3 刻意保留了并存结构) |

## 提交约定

签名会失败(pinentry),提交用 `--no-gpg-sign`,且只 stage 本任务涉及的文件 ——
工作区另有 `docs/design/corebox/v2.5.0.pen`、`pnpm-lock.yaml`、
`scripts/check-prod-audit.mjs` 的既存改动,不要一起提交。
