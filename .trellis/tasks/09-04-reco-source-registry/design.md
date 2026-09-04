# Design — 推荐来源注册表

Parent: `.trellis/tasks/09-04-corebox-recommend-platform`

## 1. 边界

改动集中在三处,不越界:

| 归属 | 文件 | 改动性质 |
|---|---|---|
| 契约 | `packages/utils/core-box/tuff/tuff-dsl.ts` | 新增可选能力接口 |
| 注册 | `search-engine/recommendation/recommendation-source-registry.ts` | 新建 |
| 调度 | `search-engine/recommendation/item-rebuilder.ts` | 退化为调度器 |
| 迁移 | 7 个来源各自的 provider / 新建 source 适配器 | 逻辑平移 |

评分、维度、缓存、插件并池均不在本任务(见父任务任务地图)。

## 2. 契约

### 2.1 能力接口

```ts
// packages/utils/core-box/tuff/tuff-dsl.ts
export interface RecommendationRebuildCapable {
  /**
   * 除自身 id 外,本来源还负责应答的 sourceId。
   * 取代 item-rebuilder 内的 normalizeSourceId 别名表。
   */
  readonly recommendationSourceAliases?: readonly string[]

  /**
   * 批量重建。返回顺序不必匹配输入 —— 调度器按推荐分数序重排。
   * 单条缺失(记录已删除等)静默省略,不得抛错。
   */
  rebuildRecommendationItems(itemIds: readonly string[]): Promise<TuffItem[]>
}
```

**批量而非逐条**是刻意的:`rebuildAppItems` 现在做 path/bundleId 两次批量 DB 查询
再批量拉扩展字段。若契约定为 `rebuildItem(id)`,这些会退化成 N+1。
既有 3 个逐条实现(`main-window` / `windows-shell` / `system-actions`)在迁移时包一层 map 即可。

### 2.2 两条注册路径

必要性:`clipboard-history` **不是 search provider** —— `search-core.ts:registerDefaults()`
中没有它,`rebuildClipboardItems`(`item-rebuilder.ts:324`)直接查 `clipboardHistory` schema。
因此单靠「给 ISearchProvider 加能力」覆盖不全。

```ts
// search-engine/recommendation/recommendation-source-registry.ts
export interface RecommendationSourceEntry {
  readonly sourceId: string
  readonly aliases?: readonly string[]
  rebuild(itemIds: readonly string[]): Promise<TuffItem[]>
}

export interface RecommendationSourceRegistry {
  /** 路径 A:search provider 自带能力时,由 search-core 注册时自动接入 */
  registerProviderSource(provider: ISearchProvider<unknown>): (() => void) | null
  /** 路径 B:非 provider 的独立来源(clipboard-history 等)显式注册 */
  registerSource(entry: RecommendationSourceEntry): () => void

  resolve(sourceId: string): RecommendationSourceEntry | undefined
  /** sourceId → 规范 sourceId(经别名表);未注册时返回原值 */
  canonicalize(sourceId: string): string
}
```

**别名冲突**:两个来源声明同一 alias 时,注册**失败并抛错**(而非后者覆盖前者)。
静默覆盖会让推荐条目随注册顺序漂移,且不可观测。

### 2.3 反向导入约束

注册一律**由来源推入**,注册表与 rebuilder 均不导入任何具体 provider。
这样即使 `recommendation/` 与 `addon/` 之间存在 import 环,也不会因本次重构被引成静态环。

> 待验证(实现前第一步):把 `item-rebuilder.ts:159/169/179/220` 的 `await import()`
> 改成静态导入是否成环。若成环,记录环路径;若不成环,说明动态导入只是延迟加载,
> 在 design review 中据实修正 PRD 风险条目。
> 注意 `core-box-import-cycle.test.ts` 只扫 `core-box/` 目录,不覆盖本目录,不能作为依据。

## 3. 数据流

```
ScoredItem[] (已按分数排序)
   │
   ├─ canonicalize(sourceId) 分组          ← 别名来自 provider 声明,非 rebuilder 硬编码
   │
   ├─ 每组 → registry.resolve(sourceId)
   │     ├─ 命中 → entry.rebuild(itemIds)   ← 批量,失败记 error 返回 []
   │     └─ 未命中 → warn + []              ← 可观测降级,不中断整批
   │
   └─ mergeAndEnrichItems(flat, scoredItems) ← 按输入分数序重排(既有契约,不变)
```

重构后的调度器:

```ts
async rebuildItems(scoredItems: ScoredItem[]): Promise<TuffItem[]> {
  if (scoredItems.length === 0) return []

  const grouped = new Map<string, string[]>()
  for (const item of scoredItems) {
    const canonical = this.registry.canonicalize(item.sourceId)
    const bucket = grouped.get(canonical)
    if (bucket) bucket.push(item.itemId)
    else grouped.set(canonical, [item.itemId])
  }

  const batches = await Promise.all(
    [...grouped].map(async ([sourceId, itemIds]) => {
      const entry = this.registry.resolve(sourceId)
      if (!entry) {
        itemRebuilderLog.warn('No recommendation source registered', {
          meta: { sourceId, itemCount: itemIds.length }
        })
        return []
      }
      try {
        return await entry.rebuild(itemIds)
      } catch (error) {
        itemRebuilderLog.error('Recommendation source rebuild failed', {
          error,
          meta: { sourceId, itemCount: itemIds.length }
        })
        return []
      }
    })
  )

  return this.mergeAndEnrichItems(batches.flat(), scoredItems)
}
```

文件内不再出现任何具体来源名与 DB 调用。
`rebuildPluginRecommendItems`(`item-rebuilder.ts:120/485`)暂**原样保留** —— 它的并池归 C3。

## 4. 七个来源的迁移去向

| sourceId | 现位置 | 迁移到 | 别名 |
|---|---|---|---|
| `app-provider` | `rebuildAppItems` + `fetchExtensionsForApps` | `appProvider` | `application`, `app` |
| `file-provider` | `rebuildFileItems` | `fileProvider` | `file`, `files`, `everything-provider`, `macos-spotlight-provider`, `linux-native-file-provider` |
| `plugin-features` | `rebuildPluginFeatureItems` | `PluginFeaturesAdapter` | — |
| `clipboard-history` | `rebuildClipboardItems` | **新建** 独立 source(路径 B) | `clipboard` |
| `main-window-provider` | 委托调用 | `mainWindowProvider`(已有 `rebuildItem`) | — |
| `system-actions-provider` | 委托调用 | `systemActionsProvider`(已有 `rebuildItem`) | — |
| `windows-shell-file-provider` | 委托调用 | `windowsShellFileProvider`(已有 `rebuildItem`) | — |

### 等价性要点(最易丢失的行为)

`rebuildAppItems` 迁移必须完整保留:

- path / bundleId 双路分流(`itemId.startsWith('/')`)后**各自批量**查询
- `fetchExtensionsForApps` 批量拉扩展字段并按 `fileId` 归并
- `isSelfAppIdentity` 过滤(排除 Touch 自身)
- `matchNoisySystemAppRule` 过滤(排除系统噪声应用)
- `mapAppsToRecommendationItems` 映射

任一遗漏的表现是「推荐里混进 Touch 自己或系统噪声应用」,**类型系统捕获不到**。
因此实施顺序上,这四条的行为基线测试必须先于结构改动落地。

`rebuildPluginFeatureItems` 迁移注意:现为逐条循环 + 循环内 `await import()`;
迁移时改为循环外解析一次 adapter,行为不变但去掉重复解析。

## 5. 兼容性与回滚

- 能力接口为**可选**,未实现的 provider 行为不变(不会被推荐调度器解析到,与现状一致 —— 现状它们本就不在 7 分支里)。
- 无 schema 变更、无 IPC 事件变更、无 `recommendation.source` 联合类型变更 → **不触发父任务的三文件同步约束**。
- 回滚点:注册表与契约可独立先落(纯新增,无行为变化),再逐个来源迁移。
  任一来源迁移出问题,单独回退该来源到 rebuilder 内分支即可,不必整体回滚。

## 6. 测试策略

| 层 | 断言 |
|---|---|
| 注册表单测 | 别名解析、别名冲突抛错、重复注册、dispose 后不再解析 |
| 调度器单测 | 未注册 sourceId → warn + 跳过且其余正常;单来源抛错 → error + 其余正常;输出顺序 = 分数序 |
| 开放性测试 | 注册一个假 source → 其条目出现在结果中,**diff 不含 `item-rebuilder.ts`** |
| 等价性测试 | 以现有 `item-rebuilder.test.ts` 为基线,断言不放宽;app 分支补两道过滤的判别性 fixture |
| 批量语义 | N 个 app 条目的 DB 查询次数与现状同量级(no N+1) |

## 7. 开放问题

- 能力接口放在 `packages/utils`(随 npm 发布,等于对外承诺)还是主进程内部类型?
  本设计暂放 `tuff-dsl.ts` 与 `ISearchProvider` 同处,但这会让它成为公开 API 面。
  若 C3 要对插件开放推荐来源,放 utils 是对的;若不开放,应留在主进程。
  **依赖 C3 的 SDK 边界决策,design review 时一并定。**
