# 搜索系统重构 PRD

## 1. 背景与问题

### 1.1 当前架构问题

当前搜索系统采用**双队列分层架构**：
- **Fast Layer**: app-provider, plugin-features, system-provider, preview-provider
- **Deferred Layer**: file-provider, url-provider (50ms 延迟启动)

这种架构导致以下问题：

1. **结果推送不连贯**: 两批结果分开推送，UI 会闪烁/跳动
2. **窗口动画卡顿**: 高度需要多次调整，动画不流畅
3. **排序混乱**: 无法在完整结果集上进行全局排序
4. **复杂度高**: 状态管理复杂，容易出现时序问题

### 1.2 排序问题

搜索 "videos" 时，当前行为：
- Features 可能排在文件前面
- 缺乏语义相关性排序

期望行为：
- 文件 "Videos" 文件夹应排在最前
- 然后是相关应用、功能

### 1.3 性能分析与瓶颈

当前方案核心是 `Promise.allSettled + timeout` 聚合并一次性返回结果。性能关键点如下：

1. **等待聚合导致首屏延迟**  
   单队列意味着必须等所有 Provider settle 或超时才返回。若文件/URL Provider 进入慢路径，会把首屏结果推迟到 timeout，体感可能比“双队列”更慢。

2. **超时仅切断等待，不会取消计算**  
   Provider 仍可能继续占用 CPU/IO（尤其文件扫描/索引），造成后台抖动与 event-loop lag。需要配合 `AbortController` / 任务门控 / worker 执行。

3. **去重与重排序成本**  
   去重 + 语义评分在“全量结果集”上执行，复杂度通常是 O(n log n) 或更高（若含相似度、路径解析等），需要：
   - 限制参与排序的条数（如 top-N 参与重排）
   - 针对文件/应用使用轻量 key 的索引加速
   - 把评分计算移到 worker 或空闲时段

4. **渲染侧布局一次性膨胀风险**  
   一次性返回全部结果会减少跳动，但也可能导致渲染与布局压力集中爆发（大量 DOM + 预览）。需要配合：
   - 前端虚拟列表
   - 预览延迟加载 / 仅可视区预渲染

5. **超时阈值需要分层**  
   统一 300ms 对“app/plugin”等快速源是合理的，但对文件/URL 可能过短。建议对 provider 设分层超时、并带“partial ready”状态在 UI 上提示。

6. **IPC/渲染链路放大**  
   搜索过程中会频繁触发 IPC 与 UI 更新（query → provider → rerank → render）。若每次输入都进行完整排序与布局计算，容易形成主线程阻塞与 event-loop lag。建议：
   - 输入节流（如 60~120ms）
   - 排序与去重放入 worker 或 idle
   - UI 端分段渲染 / 预览延迟

7. **缓存与索引命中率**  
   搜索频次高但命中范围相对稳定（应用、常用文件、历史记录），可以预热并缓存：
   - 应用列表/常用文件的轻量索引
   - 最近查询结果短期缓存（带 query hash）
   - 结果排序的特征向量缓存（减少重复计算）

## 2. 目标

### 2.1 核心目标

1. **简化架构**: 合并为单队列搜索
2. **流畅体验**: 一次性返回结果，减少 UI 跳动
3. **智能排序**: 基于查询意图的结果重排序
4. **用户反馈**: 搜索过程中显示 loading 状态

### 2.2 非目标

- 不改变现有 Provider 接口
- 不影响插件搜索能力

## 3. 详细设计

### 3.1 单队列搜索架构

```
┌─────────────────────────────────────────────────────────┐
│                    Search Request                        │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│              Parallel Provider Execution                 │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │  App    │ │ Plugin  │ │  File   │ │  URL    │ ...   │
│  │Provider │ │Provider │ │Provider │ │Provider │       │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘       │
│       │           │           │           │             │
│       └───────────┴───────────┴───────────┘             │
│                       │                                  │
│                       ▼                                  │
│              Promise.allSettled()                        │
│           (with timeout: 300ms)                          │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                  Result Aggregation                      │
│         ┌──────────────────────────────┐                │
│         │    Merge & Deduplicate       │                │
│         └──────────────────────────────┘                │
│                       │                                  │
│                       ▼                                  │
│         ┌──────────────────────────────┐                │
│         │   Smart Re-ranking Engine    │                │
│         │   - Query Intent Detection   │                │
│         │   - Category Priority        │                │
│         │   - Relevance Scoring        │                │
│         └──────────────────────────────┘                │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│              Single Response to Frontend                 │
│           (results + isComplete: true)                   │
└─────────────────────────────────────────────────────────┘
```

### 3.2 前端 Loading 状态

```typescript
interface SearchState {
  isSearching: boolean      // 是否正在搜索
  query: string             // 当前查询
  results: TuffSearchResult[]
  isComplete: boolean       // 搜索是否完成
}
```

UI 显示：
- `isSearching && !isComplete`: 显示 "搜索中..." 指示器
- `isComplete`: 隐藏指示器，显示完整结果

### 3.3 智能重排序规则

```typescript
interface RankingConfig {
  // 查询意图检测
  intentPatterns: {
    fileSearch: /^[a-zA-Z0-9_\-\.\/\\]+$/,  // 文件路径模式
    appSearch: /^[a-zA-Z]+$/,                // 应用名称模式
    commandSearch: /^[@#>]/,                  // 命令模式
  }

  // 类别优先级 (数字越小优先级越高)
  categoryPriority: {
    exactMatch: 1,      // 精确匹配
    file: 2,            // 文件/文件夹
    app: 3,             // 应用程序
    feature: 4,         // 插件功能
    url: 5,             // URL
    system: 6,          // 系统功能
  }

  // 相关性权重
  relevanceWeights: {
    titleMatch: 0.4,
    descriptionMatch: 0.2,
    categoryBoost: 0.2,
    usageFrequency: 0.2,
  }
}
```

### 3.4 超时处理

```typescript
const SEARCH_TIMEOUT_MS = 300

async function executeSearch(query: TuffQuery): Promise<SearchResult> {
  const startTime = Date.now()

  const results = await Promise.allSettled(
    providers.map(p =>
      Promise.race([
        p.search(query),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), SEARCH_TIMEOUT_MS)
        )
      ])
    )
  )

  // 合并成功的结果
  const successResults = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)

  return {
    items: rerank(successResults, query),
    isComplete: true,
    duration: Date.now() - startTime
  }
}
```

## 4. 实现计划

### Phase 1: 后端重构 (2-3 天)

1. **search-gather.ts 重构**
   - 移除 fast/deferred 分层
   - 实现 Promise.allSettled 并行执行
   - 添加超时控制

2. **search-core.ts 重构**
   - 简化结果推送逻辑
   - 实现单次结果返回

3. **新增 reranking-engine.ts**
   - 查询意图检测
   - 类别优先级排序
   - 相关性评分

### Phase 2: 前端适配 (1-2 天)

1. **useSearch.ts 适配**
   - 移除增量更新逻辑
   - 添加 isSearching 状态
   - 简化结果处理

2. **UI 组件更新**
   - 添加 Loading 指示器
   - 优化结果渲染

### Phase 3: 窗口动画优化 (1 天)

1. 简化高度计算逻辑
2. 移除多余的动画触发
3. 优化动画参数

## 5. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 搜索延迟增加 | 设置合理超时，慢 Provider 不阻塞快 Provider |
| 文件搜索太慢 | 文件 Provider 优化索引，或设置独立超时 |
| 排序不符合预期 | A/B 测试，收集用户反馈 |

## 6. 成功指标

1. **动画流畅度**: 窗口高度变化从 3-4 次减少到 1 次
2. **搜索延迟**: P95 < 350ms (含超时)
3. **用户体验**: 无 UI 闪烁/跳动

## 7. 附录

### 7.1 当前代码位置

- 搜索核心: `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
- 结果聚合: `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.ts`
- 前端搜索: `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`
- 窗口管理: `apps/core-app/src/main/modules/box-tool/core-box/window.ts`

### 7.2 相关 Issue

- 搜索结果卡顿
- 窗口动画不流畅
- 排序不符合预期








