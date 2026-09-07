# 推荐来源注册表:替换 item-rebuilder 硬编码 fan-out

Parent: `.trellis/tasks/09-04-corebox-recommend-platform`

## Goal

让「新来源进入 CoreBox 推荐池」不再需要修改 `item-rebuilder.ts`。
把当前 7 分支的硬编码 fan-out 与 `normalizeSourceId()` 别名表,替换为由来源自身声明的注册表。

## 背景与问题

`item-rebuilder.ts:104 rebuildItems()` 当前形态:

```ts
const grouped = this.groupByNormalizedSource(scoredItems)   // 依赖硬编码别名表
const results = await Promise.all([
  this.rebuildAppItems(grouped.get('app-provider') || []),
  this.rebuildFileItems(grouped.get('file-provider') || []),
  this.rebuildPluginFeatureItems(grouped.get('plugin-features') || []),
  this.rebuildClipboardItems(grouped.get('clipboard-history') || []),
  this.rebuildMainWindowItems(grouped.get('main-window-provider') || []),
  this.rebuildSystemActionItems(grouped.get('system-actions-provider') || []),
  this.rebuildWindowsShellItems(grouped.get('windows-shell-file-provider') || [])
])
```

两处硬编码:

1. **来源清单**:7 个分支写死。`ScoredItem.sourceId` 落在清单外 → 该条目被静默丢弃。
2. **别名表**:`normalizeSourceId()` 把 `application/app → app-provider`、
   `everything-provider/macos-spotlight-provider/linux-native-file-provider → file-provider` 等
   映射写死在 rebuilder 内部,而不是由 provider 自己声明。

后果:新索引来源(含图片等文件资源)与新 provider 无法进入推荐池,除非改这个文件。
这是父任务需求 2、5 的机制性根因。

## 已存在的切口(不是从零设计)

`rebuildItem(itemId)` **已经是 3 个 provider 上的事实约定**,只是没有类型声明:

| Provider | 位置 | 签名 |
|---|---|---|
| `mainWindowProvider` | `addon/system/main-window-provider.ts:160` | `rebuildItem(itemId: string): TuffItem \| null` |
| `windowsShellFileProvider` | `addon/system/windows-shell-file-provider.ts:323` | `rebuildItem(itemId: string): TuffItem \| null` |
| `systemActionsProvider` | `addon/system/system-actions-provider.ts:712` | `async rebuildItem(itemId: string): Promise<TuffItem \| null>` |

`ISearchProvider`(`tuff-dsl.ts:1572`)未声明该方法,当前靠鸭子类型调用。
其余 4 个(app / file / plugin-features / clipboard)是 rebuilder 内的定制 DB 逻辑,应下沉到各自 provider。

## Requirements

- R1 在 `ISearchProvider` 上声明可选的推荐重建能力,把既有鸭子类型约定升格为类型契约。
  签名需支持**批量**(现有 app/file 分支是批量 DB 查询,逐条调用会造成 N+1)。
- R2 `item-rebuilder` 退化为**无来源知识的调度器**:按 `sourceId` 查注册表 → 批量调用 → 合并。
  文件内不得残留任何具体来源的名字或 DB 逻辑。
- R3 `normalizeSourceId()` 的别名表由 provider 自行声明(如 `recommendationSourceAliases`),
  注册时汇入注册表;rebuilder 不再持有映射表。
- R4 app / file / plugin-features / clipboard 四条定制逻辑下沉到对应 provider,
  行为与现状**逐条等价**(含自身 App 过滤 `isSelfAppIdentity`、噪声系统应用过滤
  `matchNoisySystemAppRule`、扩展字段批量拉取 `fetchExtensionsForApps`)。
- R5 未注册的 `sourceId` 走**可观测的降级**:记 warn 日志并跳过,不得静默丢弃、不得抛错中断整批。
- R6 顺序契约保持:`mergeAndEnrichItems` 依赖「输入顺序 = 推荐分数序」,重构后必须保持。

## 非目标

- 不改推荐评分逻辑与维度定义(属 C3)。
- 不改插件 recommend 旁路的并池(属 C3)。
- 不改缓存失效触发范围(属 C3)。
- 不新增来源(本任务只做能力开放,新来源接入另行提任务)。

## 附带分析交付(不改代码)

第一层 Provider 收敛分析,产出写入本任务 `research/`:

- **文件搜索职责混装**:`windowsShellFileProvider` / `everythingProvider` / `macSpotlightFileProvider` /
  `linuxNativeFileProvider` / `fileProvider` 五者并存(`search-core.ts:334-343`)。
  注释称 native 出首帧、file-provider 做索引与 enrichment —— 即「快路径」与「索引路径」
  两种职责压在同一注册表,靠 `normalizeSourceId` 事后合并。
  评估是否应拆成两级(`priority: 'fast' | 'deferred'` 已存在于 `ISearchProvider:1611`,
  但当前是否被用于表达这层语义需实测确认)。
- **内置 vs 插件疑似重复**:内置 `system-actions-provider.ts` 与 `plugins/touch-system-actions` 并存;
  CLAUDE.md 记载 2026-02 已将 system-actions 抽为插件。**尚未实测确认是否产生双份结果**。
  分析需给出:是否重复、若重复应保留哪一侧、下线路径。

## Acceptance Criteria

- [x] `item-rebuilder.ts` 的**重建派发路径**不再出现具体 provider 名、`normalizeSourceId`
      别名表或 DB 查询(674 → 345 行)。
      遗留:`findScoredByPartialMatch()` 的身份匹配启发式仍含 `plugin-features` /
      `app-provider` / `application` 三个分支 —— 属 merge/enrich 层,不在本任务范围,
      见 `research/provider-consolidation.md` §6。
- [x] `ISearchProvider` 侧声明可选批量重建能力(`RecommendationRebuildCapable`);
      3 个既有 `rebuildItem` 实现改由该契约暴露,鸭子类型调用消失。
- [x] app / file / plugin-features / clipboard 四条逻辑下沉后行为等价;
      原 9 个测试的断言意图逐条保留,DB 级行为迁到各来源自己的测试套件。
- [x] 新增假来源注册后其条目出现在推荐结果中,**未修改 `item-rebuilder.ts`**
      (`item-rebuilder.test.ts` 的 `dispatch` 组)。
- [x] 未注册 `sourceId` 产生 warn 并跳过,单来源抛错不影响其余(两条独立测试)。
- [x] 输出顺序仍等于推荐分数序。
- [x] 批量语义:N 个 app 条目仍是 path/bundleId 各一次 + 扩展字段一次,无 N+1。
- [x] `research/provider-consolidation.md` 完成,system-actions 重复问题给出**实测**结论
      (不重复;但 `main-window-provider` 与插件的 `open-main-window` 真重复)。
- [x] `pnpm lint`(core-app + utils 配置)、`typecheck`(node + web)、
      box-tool 168 文件 1436 测试、plugin 102 文件 1380 测试全绿。

**未达标/超出范围**:`pnpm utils:test` 有 2 个失败,均在 `src/native/tuff-native-ocr.test.ts`
(Apple Vision 原生调用 5s 超时)。与本任务无关,**未修复**。

## 实现记录(2026-09-04)

设计文档中「provider 自带 rebuild 能力」的规则在实施时收窄为:

> **需要引擎 split-aware 句柄的来源走独立注册(路径 B),其余走 provider 能力(路径 A)。**

原因:`ItemRebuilder` 持有两个 db 句柄是 #295 search split 的既定契约
(FILE 行在 worker 拥有的 `search-index.db`,APP 目录在 primary)。
`FileProvider` 有自己的 `createDbUtils` 实例,把重建挂到它身上会**静默换掉读取的库**。
因此 app / file / clipboard 三者由 `RecommendationEngine` 用自己的句柄创建并注册;
main-window / system-actions / windows-shell / plugin-features 走 provider 能力。

副产物:`ItemRebuilder` 不再需要任何 db 句柄,构造函数参数已全部移除。

## 风险

- **R4 等价性**是最大风险:app 分支含 path/bundleId 双路查询、扩展字段批量拉取、两道过滤。
  下沉时任一遗漏都表现为「推荐里混进自身 App 或系统噪声应用」,且不会被类型系统捕获。
  缓解:先补齐现有分支的字符级行为测试作为基线,再动结构。
- 循环依赖:**已实测确认成环**(2026-09-04,见 `research/provider-consolidation.md` §1)。
  `item-rebuilder.ts` 的 6 处 `await import()` 中 5 处静态化会成环,完整环为
  `item-rebuilder → <provider> → … → search-core → recommendation-engine → item-rebuilder`。
  因此注册表**必须**由 provider 注册时推入,注册表与 rebuilder 不得导入任何具体 provider ——
  反向导入会把动态导入掩盖的环变成静态环(启动期 `Cannot access '...' before initialization`)。
  注:`core-box-import-cycle.test.ts` 只扫 `core-box/` 目录,**不覆盖** `search-engine/recommendation/`,
  Step 5 需为本目录补一个同类回归测试。
