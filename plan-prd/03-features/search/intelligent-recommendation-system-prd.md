# 智能推荐系统 PRD

## 1. 概要

### 1.1 背景
当前 talex-touch 搜索引擎已具备强大的:
- 基于 `source.id + item.id` 组合键的使用统计
- 搜索/执行/取消行为跟踪
- 时间衰减的频率计算
- 查询补全系统

但缺少**主动推荐**能力:用户召唤 CoreBox 时(空查询状态),系统应根据上下文智能推荐最相关的项目。

### 1.2 目标
构建智能推荐系统,在用户打开 CoreBox 时**无需输入**即提供个性化推荐,基于:
- **时间上下文**: 当前时段、星期、特殊日期
- **历史行为**: 使用频率、最近使用、习惯模式
- **实时上下文**: 剪贴板内容、前台应用、系统状态
- **用户偏好**: 项目类型、来源权重

### 1.3 范围
- 推荐算法设计与实现
- 上下文感知数据采集
- 推荐结果排序与呈现
- 性能优化与缓存策略
- 隐私保护与用户控制

## 2. 核心需求

### 2.1 功能需求

#### FR-1: 空查询推荐
- 用户打开 CoreBox 且输入为空时,自动展示推荐列表
- 推荐列表默认显示 8-12 个项目
- 支持配置是否启用推荐功能

#### FR-2: 时间上下文感知
- **时段推荐**: 工作时间 vs 休闲时间 vs 深夜时段
- **星期模式**: 工作日 vs 周末的不同行为模式
- **特殊时间**: 早晨起床、午餐时间、下班时间等

#### FR-3: 历史行为分析
- 基于 `item_usage_stats` 表的统计数据
- 区分不同时段的使用习惯
- 识别频繁使用的项目组合(例如:先打开 VSCode,再打开 iTerm)

#### FR-4: 实时上下文集成
- **剪贴板智能**: 检测剪贴板内容类型,推荐相关操作
  - 链接 → 浏览器/下载工具/笔记应用
  - 代码片段 → IDE/编辑器/Gist
  - 图片 → 图片编辑器/压缩工具
- **前台应用感知**: 根据当前活动应用推荐相关工具
- **系统状态**: Wi-Fi 连接状态、电量、请勿打扰模式等

#### FR-5: 多维度推荐源
支持从多个维度生成推荐:
1. **高频项目**: 基于全时段使用频率
2. **时段热门**: 当前时段历史高频项目
3. **最近使用**: 距离上次使用时间最近
4. **上下文匹配**: 基于实时上下文的智能推荐
5. **趋势发现**: 最近使用频率上升的项目
6. **查询补全**: 基于 `query_completions` 的热门查询

### 2.2 非功能需求

#### NFR-1: 性能
- 推荐计算延迟 < 50ms (P95)
- 支持增量更新,避免每次重算
- LRU 缓存热门推荐结果

#### NFR-2: 隐私
- 所有数据本地存储,不上传云端(可选云同步)
- 支持禁用特定来源的推荐
- 提供清除历史数据功能

#### NFR-3: 可配置性
- 推荐数量可调(4-20 项)
- 各维度权重可调整
- 时段定义可自定义

## 3. 推荐算法设计

### 3.1 推荐分数公式

```typescript
recommendationScore = 
  contextMatch * 1e6        // 上下文匹配度(最高优先级)
  + timeRelevance * 1e5     // 时间相关性
  + frequencyScore * 1e4    // 使用频率(带时间衰减)
  + recencyBoost * 1e3      // 最近使用加成
  + trendScore * 1e2        // 趋势分数
  + diversityPenalty * 1    // 多样性惩罚(避免同类扎堆)
```

### 3.2 各维度计算方法

#### 3.2.1 上下文匹配度 (Context Match)

```typescript
interface ContextSignal {
  clipboard?: {
    type: 'text' | 'image' | 'file' | 'url'
    content: string
    timestamp: number
  }
  foregroundApp?: {
    bundleId: string
    name: string
  }
  systemState?: {
    isOnline: boolean
    batteryLevel: number
    isDNDEnabled: boolean
  }
}

function calculateContextMatch(item: TuffItem, context: ContextSignal): number {
  let score = 0
  
  // 剪贴板匹配
  if (context.clipboard) {
    if (isClipboardRelated(item, context.clipboard)) {
      score += 100  // 强关联
    }
  }
  
  // 前台应用关联
  if (context.foregroundApp) {
    if (isAppRelated(item, context.foregroundApp)) {
      score += 80
    }
  }
  
  return score
}
```

#### 3.2.2 时间相关性 (Time Relevance)

```typescript
interface TimePattern {
  hourOfDay: number        // 0-23
  dayOfWeek: number        // 0-6
  isWorkingHours: boolean  // 9:00-18:00
  timeSlot: 'morning' | 'afternoon' | 'evening' | 'night'
}

// 为每个 item 统计时段使用分布
interface ItemTimeStats {
  sourceId: string
  itemId: string
  timeSlotDistribution: {
    morning: number    // 使用次数
    afternoon: number
    evening: number
    night: number
  }
  dayOfWeekDistribution: number[]  // 7 天的使用次数
  hourDistribution: number[]       // 24 小时的使用次数
}

function calculateTimeRelevance(
  itemTimeStats: ItemTimeStats,
  currentTime: TimePattern
): number {
  const slotUsage = itemTimeStats.timeSlotDistribution[currentTime.timeSlot]
  const totalUsage = Object.values(itemTimeStats.timeSlotDistribution)
    .reduce((a, b) => a + b, 0)
  
  if (totalUsage === 0) return 0
  
  // 计算当前时段的使用占比
  const slotRatio = slotUsage / totalUsage
  
  // 加权星期几的统计
  const dayUsage = itemTimeStats.dayOfWeekDistribution[currentTime.dayOfWeek]
  const avgDayUsage = itemTimeStats.dayOfWeekDistribution
    .reduce((a, b) => a + b, 0) / 7
  const dayFactor = dayUsage / (avgDayUsage || 1)
  
  return slotRatio * 100 * dayFactor
}
```

#### 3.2.3 频率分数 (Frequency Score)

复用现有的频率计算,带时间衰减:

```typescript
function calculateFrequencyScore(stats: UsageStats): number {
  const executeCount = stats.executeCount
  const searchCount = stats.searchCount
  const cancelCount = stats.cancelCount || 0
  
  const lastInteraction = Math.max(
    stats.lastExecuted?.getTime() || 0,
    stats.lastSearched?.getTime() || 0,
    stats.lastCancelled?.getTime() || 0
  )
  
  const daysSince = (Date.now() - lastInteraction) / (1000 * 60 * 60 * 24)
  const decayFactor = Math.exp(-0.1 * daysSince)  // lambda = 0.1
  
  return (executeCount * 1.0 + searchCount * 0.3 + cancelCount * (-0.5)) * decayFactor
}
```

#### 3.2.4 最近使用加成 (Recency Boost)

```typescript
function calculateRecencyBoost(lastUsed: Date | null): number {
  if (!lastUsed) return 0
  
  const hoursSince = (Date.now() - lastUsed.getTime()) / (1000 * 60 * 60)
  
  // 1 小时内: 100 分
  // 24 小时:  50 分
  // 7 天:     10 分
  // 30 天:     1 分
  return Math.max(0, 100 * Math.exp(-0.1 * hoursSince))
}
```

#### 3.2.5 趋势分数 (Trend Score)

检测最近使用频率的变化:

```typescript
interface TrendData {
  recentCount: number   // 最近 7 天使用次数
  historicalAvg: number // 过去 30 天平均每周使用次数
}

function calculateTrendScore(trend: TrendData): number {
  if (trend.historicalAvg === 0) {
    return trend.recentCount > 0 ? 50 : 0  // 新项目加成
  }
  
  const growthRate = (trend.recentCount - trend.historicalAvg) / trend.historicalAvg
  
  // 增长 > 50%: 高分
  // 持平:      中分
  // 下降:      低分
  return Math.max(-20, Math.min(100, growthRate * 100))
}
```

#### 3.2.6 多样性惩罚 (Diversity Penalty)

避免推荐列表被同一类型项目占据:

```typescript
function calculateDiversityPenalty(
  item: TuffItem,
  alreadyRecommended: TuffItem[]
): number {
  const sameTypeCount = alreadyRecommended.filter(
    r => r.source.type === item.source.type
  ).length
  
  // 同类型每多一个,惩罚 -10 分
  return -10 * sameTypeCount
}
```

## 4. 数据模型设计

### 4.1 新增表: `item_time_stats`

存储项目的时间维度统计:

```sql
CREATE TABLE item_time_stats (
  source_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  hour_distribution TEXT NOT NULL,           -- JSON array[24]: 每小时使用次数
  day_of_week_distribution TEXT NOT NULL,    -- JSON array[7]: 每天使用次数
  time_slot_distribution TEXT NOT NULL,      -- JSON object: { morning, afternoon, evening, night }
  last_updated INTEGER NOT NULL,             -- 最后更新时间戳
  PRIMARY KEY (source_id, item_id),
  FOREIGN KEY (source_id, item_id) REFERENCES item_usage_stats(source_id, item_id)
);

CREATE INDEX idx_item_time_stats_updated ON item_time_stats(last_updated DESC);
```

### 4.2 新增表: `recommendation_cache`

缓存推荐结果,避免高频计算:

```sql
CREATE TABLE recommendation_cache (
  cache_key TEXT PRIMARY KEY,               -- 上下文哈希 (time_slot + day + context_hash)
  recommended_items TEXT NOT NULL,          -- JSON array of { sourceId, itemId, score }
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_recommendation_cache_expires ON recommendation_cache(expires_at);
```

### 4.3 扩展 `usage_logs` 上下文

在现有 `context` 字段中记录更多信息:

```typescript
interface EnhancedUsageContext {
  // 现有字段...
  
  // 新增字段
  timeContext?: {
    hour: number
    dayOfWeek: number
    timeSlot: 'morning' | 'afternoon' | 'evening' | 'night'
    isWorkingHours: boolean
  }
  
  clipboardContext?: {
    type: string
    hasContent: boolean
    contentHash?: string  // 隐私保护,不存原文
  }
  
  systemContext?: {
    foregroundApp?: string  // Bundle ID
    isOnline: boolean
  }
}
```

## 5. 实现方案

### 5.1 核心组件

#### 5.1.1 `RecommendationEngine`

```typescript
export class RecommendationEngine {
  private dbUtils: DbUtils
  private contextProvider: ContextProvider
  private cache: LRUCache<string, RecommendationResult>
  
  constructor(dbUtils: DbUtils) {
    this.dbUtils = dbUtils
    this.contextProvider = new ContextProvider()
    this.cache = new LRUCache({ max: 100, ttl: 5 * 60 * 1000 }) // 5 分钟
  }
  
  /**
   * 生成推荐列表
   */
  async recommend(options: RecommendationOptions): Promise<TuffItem[]> {
    // 1. 获取上下文
    const context = await this.contextProvider.getCurrentContext()
    const cacheKey = this.generateCacheKey(context, options)
    
    // 2. 检查缓存
    const cached = this.cache.get(cacheKey)
    if (cached && !this.shouldRefreshCache(cached)) {
      return cached.items
    }
    
    // 3. 生成候选池
    const candidates = await this.getCandidates(context, options)
    
    // 4. 计算推荐分数
    const scored = await this.scoreAndRank(candidates, context)
    
    // 5. 应用多样性过滤
    const diversified = this.applyDiversityFilter(scored, options)
    
    // 6. 缓存结果
    this.cache.set(cacheKey, { items: diversified, timestamp: Date.now() })
    
    return diversified
  }
  
  /**
   * 获取候选项目池
   */
  private async getCandidates(
    context: ContextSignal,
    options: RecommendationOptions
  ): Promise<CandidateItem[]> {
    const candidates: CandidateItem[] = []
    
    // 维度 1: 时段高频项目 (Top 30)
    const timeBasedItems = await this.getTimeBasedTopItems(context.time)
    candidates.push(...timeBasedItems.map(item => ({ 
      ...item, 
      source: 'time-based' as const 
    })))
    
    // 维度 2: 全局高频项目 (Top 20)
    const frequentItems = await this.getFrequentItems(20)
    candidates.push(...frequentItems.map(item => ({ 
      ...item, 
      source: 'frequent' as const 
    })))
    
    // 维度 3: 最近使用 (Top 10)
    const recentItems = await this.getRecentItems(10)
    candidates.push(...recentItems.map(item => ({ 
      ...item, 
      source: 'recent' as const 
    })))
    
    // 维度 4: 上下文匹配 (Top 15)
    if (context.clipboard || context.foregroundApp) {
      const contextItems = await this.getContextMatchingItems(context)
      candidates.push(...contextItems.map(item => ({ 
        ...item, 
        source: 'context' as const 
      })))

    }
    
    // 维度 5: 趋势项目 (Top 10)
    const trendingItems = await this.getTrendingItems(10)
    candidates.push(...trendingItems.map(item => ({ 
      ...item, 
      source: 'trending' as const 
    })))
    
    // 去重(同一 sourceId + itemId 只保留分数最高的)
    return this.deduplicateCandidates(candidates)
  }
  
  /**
   * 计算分数并排序
   */
  private async scoreAndRank(
    candidates: CandidateItem[],
    context: ContextSignal
  ): Promise<ScoredItem[]> {
    const scored: ScoredItem[] = []
    
    for (const candidate of candidates) {
      const score = await this.calculateRecommendationScore(candidate, context)
      scored.push({ ...candidate, score })
    }
    
    return scored.sort((a, b) => b.score - a.score)
  }
  
  /**
   * 应用多样性过滤
   */
  private applyDiversityFilter(
    scored: ScoredItem[],
    options: RecommendationOptions
  ): TuffItem[] {
    const result: TuffItem[] = []
    const limit = options.limit || 10
    
    for (const item of scored) {
      if (result.length >= limit) break
      
      const penalty = calculateDiversityPenalty(item, result)
      const finalScore = item.score + penalty
      
      // 如果惩罚后依然是高分,或列表还很少,则加入
      if (finalScore > 0 || result.length < limit / 2) {
        result.push(item)
      }
    }
    
    return result
  }
}
```

#### 5.1.2 `ContextProvider`

```typescript
export class ContextProvider {
  /**
   * 获取当前上下文
   */
  async getCurrentContext(): Promise<ContextSignal> {
    const [clipboard, foregroundApp, systemState] = await Promise.all([
      this.getClipboardContext(),
      this.getForegroundAppContext(),
      this.getSystemContext(),
    ])
    
    return {
      time: this.getTimeContext(),
      clipboard,
      foregroundApp,
      systemState,
    }
  }
  
  private getTimeContext(): TimePattern {
    const now = new Date()
    const hour = now.getHours()
    const dayOfWeek = now.getDay()
    
    let timeSlot: TimePattern['timeSlot']
    if (hour >= 6 && hour < 12) timeSlot = 'morning'
    else if (hour >= 12 && hour < 18) timeSlot = 'afternoon'
    else if (hour >= 18 && hour < 22) timeSlot = 'evening'
    else timeSlot = 'night'
    
    return {
      hourOfDay: hour,
      dayOfWeek,
      isWorkingHours: hour >= 9 && hour < 18 && dayOfWeek >= 1 && dayOfWeek <= 5,
      timeSlot,
    }
  }
  
  private async getClipboardContext(): Promise<ContextSignal['clipboard']> {
    // 从 clipboard module 获取最新剪贴板内容
    const latest = await clipboardModule.getLatestItem()
    if (!latest) return undefined
    
    // 检查是否在自动粘贴时间窗口内 (5 秒)
    const isRecent = Date.now() - latest.timestamp.getTime() < 5000
    if (!isRecent) return undefined
    
    return {
      type: latest.type,
      content: this.hashContent(latest.content),  // 隐私保护
      timestamp: latest.timestamp.getTime(),
    }
  }
  
  private async getForegroundAppContext(): Promise<ContextSignal['foregroundApp']> {
    // TODO: 通过 native 模块获取前台应用
    // 在 macOS 上可以使用 NSWorkspace.sharedWorkspace().frontmostApplication
    return undefined
  }
  
  private async getSystemContext(): Promise<ContextSignal['systemState']> {
    // TODO: 获取系统状态
    return {
      isOnline: navigator.onLine,
      batteryLevel: 100,  // 需要通过 Electron API 获取
      isDNDEnabled: false,
    }
  }
  
  private hashContent(content: string): string {
    // 简单哈希,保护隐私
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
  }
}
```

#### 5.1.3 `TimeStatsAggregator`

定期聚合时间维度的统计:

```typescript
export class TimeStatsAggregator {
  private dbUtils: DbUtils
  
  constructor(dbUtils: DbUtils) {
    this.dbUtils = dbUtils
  }
  
  /**
   * 从 usage_logs 汇总时间统计到 item_time_stats
   */
  async aggregateTimeStats(): Promise<void> {
    const db = this.dbUtils.getDb()
    
    // 1. 查询所有 usage_logs,按 sourceId + itemId + hour 分组
    const logs = await db
      .select({
        sourceId: schema.usageLogs.source,
        itemId: schema.usageLogs.itemId,
        timestamp: schema.usageLogs.timestamp,
      })
      .from(schema.usageLogs)
      .where(eq(schema.usageLogs.action, 'execute'))
      .all()
    
    // 2. 构建统计数据
    const statsMap = new Map<string, ItemTimeStats>()
    
    for (const log of logs) {
      const key = `${log.sourceId}:${log.itemId}`
      const date = new Date(log.timestamp)
      const hour = date.getHours()
      const dayOfWeek = date.getDay()
      const timeSlot = this.getTimeSlot(hour)
      
      if (!statsMap.has(key)) {
        statsMap.set(key, {
          sourceId: log.sourceId,
          itemId: log.itemId,
          hourDistribution: new Array(24).fill(0),
          dayOfWeekDistribution: new Array(7).fill(0),
          timeSlotDistribution: {
            morning: 0,
            afternoon: 0,
            evening: 0,
            night: 0,
          },
        })
      }
      
      const stats = statsMap.get(key)!
      stats.hourDistribution[hour]++
      stats.dayOfWeekDistribution[dayOfWeek]++
      stats.timeSlotDistribution[timeSlot]++
    }
    
    // 3. 批量写入数据库
    for (const stats of statsMap.values()) {
      await db
        .insert(schema.itemTimeStats)
        .values({
          sourceId: stats.sourceId,
          itemId: stats.itemId,
          hourDistribution: JSON.stringify(stats.hourDistribution),
          dayOfWeekDistribution: JSON.stringify(stats.dayOfWeekDistribution),
          timeSlotDistribution: JSON.stringify(stats.timeSlotDistribution),
          lastUpdated: new Date(),
        })
        .onConflictDoUpdate({
          target: [schema.itemTimeStats.sourceId, schema.itemTimeStats.itemId],
          set: {
            hourDistribution: JSON.stringify(stats.hourDistribution),
            dayOfWeekDistribution: JSON.stringify(stats.dayOfWeekDistribution),
            timeSlotDistribution: JSON.stringify(stats.timeSlotDistribution),
            lastUpdated: new Date(),
          },
        })
    }
  }
  
  private getTimeSlot(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
    if (hour >= 6 && hour < 12) return 'morning'
    if (hour >= 12 && hour < 18) return 'afternoon'
    if (hour >= 18 && hour < 22) return 'evening'
    return 'night'
  }
}
```

### 5.2 集成到 SearchEngineCore

```typescript
// 在 SearchEngineCore 中添加推荐引擎
export class SearchEngineCore {
  private recommendationEngine!: RecommendationEngine
  
  init(ctx: ModuleInitContext<TalexEvents>): void {
    // ... 现有初始化代码
    
    // 初始化推荐引擎
    this.recommendationEngine = new RecommendationEngine(this.dbUtils)
    
    // 注册 IPC 通道
    channel.regChannel(ChannelType.MAIN, 'core-box:get-recommendations', async ({ data }) => {
      const options: RecommendationOptions = {
        limit: data.limit || 10,
        includeTypes: data.includeTypes,
        excludeTypes: data.excludeTypes,
      }
      
      const items = await this.recommendationEngine.recommend(options)
      return { items }
    })
  }
  
  // 修改 search 方法,支持空查询推荐
  async search(query: TuffQuery): Promise<TuffSearchResult> {
    // 如果是空查询,返回推荐
    if (!query.text && (!query.inputs || query.inputs.length === 0)) {
      const recommendedItems = await this.recommendationEngine.recommend({
        limit: 10,
      })
      
      return {
        items: recommendedItems,
        query,
        duration: 0,
        sources: [],
        sessionId: crypto.randomUUID(),
        isRecommendation: true,  // 标记为推荐结果
      }
    }
    
    // ... 现有搜索逻辑
  }
}
```

### 5.3 定时任务

```typescript
// 在 UsageSummaryService 中添加时间统计汇总
export class UsageSummaryService {
  private timeStatsAggregator: TimeStatsAggregator
  
  async start() {
    // ... 现有定时任务
    
    // 每天凌晨 3 点汇总时间统计
    cron.schedule('0 3 * * *', async () => {
      try {
        await this.timeStatsAggregator.aggregateTimeStats()
        console.log('[TimeStatsAggregator] Aggregation completed')
      } catch (error) {
        console.error('[TimeStatsAggregator] Aggregation failed:', error)
      }
    })
  }
}
```

## 6. 用户界面集成

### 6.1 前端展示

```typescript
// 在 useSearch.ts 中
export function useSearch() {
  const [recommendations, setRecommendations] = useState<TuffItem[]>([])
  const [isShowingRecommendations, setIsShowingRecommendations] = useState(false)
  
  // 监听查询变化
  useEffect(() => {
    if (!query || query.trim() === '') {
      // 空查询时显示推荐
      loadRecommendations()
    } else {
      // 有查询时清空推荐
      setIsShowingRecommendations(false)
    }
  }, [query])
  
  async function loadRecommendations() {
    const result = await channel.invoke('core-box:get-recommendations', {
      limit: 10,
    })
    
    setRecommendations(result.items)
    setIsShowingRecommendations(true)
  }
  
  return {
    // ... 现有返回值
    recommendations,
    isShowingRecommendations,
  }
}
```

### 6.2 UI 标识

推荐列表应该有明显的视觉区分:
- 顶部显示 "💡 为你推荐" 或 "⭐ 常用项目"
- 推荐项右上角显示推荐理由标签:
  - `🔥 常用` - 高频使用
  - `🕐 此时常用` - 时段匹配
  - `📋 剪贴板相关` - 上下文匹配
  - `📈 最近热门` - 趋势上升
  - `⏰ 最近使用` - 时间最近

## 7. 隐私与设置

### 7.1 用户设置

提供设置面板:

```typescript
interface RecommendationSettings {
  enabled: boolean                    // 是否启用推荐
  limit: number                       // 推荐数量 (4-20)
  
  // 各维度开关
  enableTimeBasedRecommendation: boolean
  enableContextBasedRecommendation: boolean
  enableTrendingRecommendation: boolean
  
  // 隐私设置
  trackClipboardContext: boolean      // 是否追踪剪贴板上下文
  trackForegroundApp: boolean         // 是否追踪前台应用
  
  // 权重调整 (高级)
  weights: {
    contextMatch: number      // 默认 1.0
    timeRelevance: number     // 默认 0.8
    frequency: number         // 默认 0.6
    recency: number           // 默认 0.4
    trend: number             // 默认 0.3
  }
  
  // 排除列表
  excludedSources: string[]   // 排除的 source.type
  excludedItems: string[]     // 排除的具体项目 (sourceId:itemId)
}
```

### 7.2 隐私保护

- 剪贴板内容只存储哈希值,不存原文
- 前台应用只记录 Bundle ID,不记录窗口标题
- 提供一键清除所有统计数据功能
- 上下文数据保留期限:30 天(可配置)

## 8. 性能优化

### 8.1 缓存策略

```typescript
// 多级缓存
class RecommendationCache {
  private l1Cache: LRUCache<string, RecommendationResult>  // 内存缓存,5 分钟
  private l2Cache: Database                                // 数据库缓存,1 小时
  
  async get(key: string): Promise<RecommendationResult | null> {
    // 1. 检查 L1 缓存
    const l1Result = this.l1Cache.get(key)
    if (l1Result) {
      return l1Result
    }
    
    // 2. 检查 L2 缓存(数据库)
    const l2Result = await this.getFromDatabase(key)
    if (l2Result && !this.isExpired(l2Result)) {
      // 回填 L1 缓存
      this.l1Cache.set(key, l2Result)
      return l2Result
    }
    
    return null
  }
  
  async set(key: string, value: RecommendationResult): Promise<void> {
    // 同时写入 L1 和 L2
    this.l1Cache.set(key, value)
    await this.saveToDatabase(key, value)
  }
}
```

### 8.2 增量计算

```typescript
// 只在必要时重新计算推荐
class IncrementalRecommendationEngine {
  private lastRecommendation?: {
    context: ContextSignal
    items: TuffItem[]
    timestamp: number
  }
  
  async recommend(options: RecommendationOptions): Promise<TuffItem[]> {
    const currentContext = await this.contextProvider.getCurrentContext()
    
    // 如果上下文没有显著变化,返回缓存结果
    if (this.lastRecommendation && this.isContextSimilar(currentContext, this.lastRecommendation.context)) {
      // 只更新分数,不重新获取候选
      return this.refreshScores(this.lastRecommendation.items, currentContext)
    }
    
    // 上下文有变化,完整计算
    const items = await this.fullRecommend(options, currentContext)
    
    this.lastRecommendation = {
      context: currentContext,
      items,
      timestamp: Date.now(),
    }
    
    return items
  }
  
  private isContextSimilar(a: ContextSignal, b: ContextSignal): boolean {
    // 时段相同 && 剪贴板没变 && 前台应用没变
    return (
      a.time.timeSlot === b.time.timeSlot &&
      a.clipboard?.content === b.clipboard?.content &&
      a.foregroundApp?.bundleId === b.foregroundApp?.bundleId
    )
  }
}
```

### 8.3 异步加载

```typescript
// 后台预加载推荐
class RecommendationPreloader {
  private engine: RecommendationEngine
  
  // 监听用户行为,提前预加载
  onUserActivity(event: 'app-switched' | 'clipboard-changed' | 'time-slot-changed') {
    // 防抖,避免频繁计算
    this.debouncedPreload()
  }
  
  private debouncedPreload = debounce(async () => {
    // 后台异步计算,不阻塞主流程
    await this.engine.recommend({ limit: 10 })
  }, 1000)
}
```

## 9. 测试计划

### 9.1 单元测试

- [x] 推荐分数计算公式
- [x] 时间上下文提取
- [x] 候选项去重逻辑
- [ ] 多样性过滤算法
- [ ] 缓存键生成

### 9.2 集成测试

- [ ] 推荐引擎端到端流程
- [ ] 上下文变化触发重新推荐
- [ ] 空查询返回推荐结果
- [ ] 统计数据汇总定时任务

### 9.3 性能测试

- [ ] 推荐计算延迟 < 50ms (P95)
- [ ] 10k 项目池推荐性能
- [ ] 缓存命中率 > 80%
- [ ] 内存占用 < 50MB

### 9.4 用户测试

- [ ] A/B 测试:推荐 vs 无推荐的用户体验
- [ ] 推荐准确率:用户实际选择推荐项的比例
- [ ] 多样性评估:推荐列表的类型分布

## 10. 实施里程碑

| 阶段 | 交付内容 | 说明 |
| --- | --- | --- |
| **Phase 1** | 数据模型 \& 统计聚合 | 新表、迁移脚本、时间统计汇总 |
| **Phase 2** | 推荐引擎核心 | RecommendationEngine、ContextProvider、基础算法 |
| **Phase 3** | 缓存与性能优化 | 多级缓存、增量计算、预加载 |
| **Phase 4** | 前端集成 | UI 展示、IPC 通道、设置面板 |
| **Phase 5** | 测试与调优 | 单元测试、性能测试、A/B 测试 |
| **Phase 6** | 文档与发布 | 用户文档、开发者文档、发布说明 |

## 11. 风险与对策

### 11.1 推荐不准确
- **风险**: 推荐的项目与用户需求不匹配
- **对策**: 
  - 提供"不再推荐"按钮,收集负反馈
  - 支持手动调整权重
  - A/B 测试不同算法

### 11.2 性能影响
- **风险**: 推荐计算影响启动速度
- **对策**: 
  - 异步计算,先展示空列表
  - 预加载 + 缓存
  - 降级策略:只推荐高频项目

### 11.3 隐私担忧
- **风险**: 用户担心数据被收集
- **对策**: 
  - 明确告知数据本地存储
  - 提供详细的隐私设置
  - 支持完全禁用推荐

### 11.4 冷启动问题
- **风险**: 新用户没有历史数据
- **对策**: 
  - 预置热门推荐(通用工具)
  - 快速学习:前 10 次使用加权
  - 提供引导流程,让用户选择偏好

## 12. 后续增强方向

1. **协同过滤**: 基于相似用户的推荐(需要云同步)
2. **意图识别**: 结合剪贴板内容,推测用户意图
3. **工作流推荐**: 识别常用操作序列,推荐下一步(如:打开 VSCode → 打开 iTerm)
4. **自然语言理解**: 支持 "我想编辑图片" → 推荐图片编辑器
5. **个性化主题**: 根据时段切换推荐策略(工作 vs 娱乐)
6. **社交推荐**: 团队共享热门工具和配置

## 13. 成功指标

- **采纳率**: 推荐功能的开启比例 > 70%
- **准确率**: 用户选择推荐项的比例 > 40%
- **效率提升**: 使用推荐比手动搜索节省 30% 时间
- **多样性**: 推荐列表中不同类型项目 ≥ 5 种
- **性能**: P95 延迟 < 50ms,缓存命中率 > 80%

---

## 附录

### A. 相关文档
- [Search Optimization Summary](./search-optimization-implementation-summary.md)
- [Search Source ID Ranking Plan](./search-source-id-ranking-plan.md)
- [Usage Tracking PRD](./TUFF_USAGE_TRACKING_PRD.md)

### B. 依赖项
- 现有的 `item_usage_stats` 表
- `usage_logs` 表
- `query_completions` 表
- `clipboardModule`
- `SearchEngineCore`

### C. 名词解释
- **推荐系统**: 主动向用户推荐可能感兴趣的项目的系统
- **上下文感知**: 根据当前环境(时间、剪贴板、前台应用等)调整推荐
- **时间衰减**: 距离当前时间越远,权重越低的计算方式
- **多样性**: 推荐列表中不同类型项目的分布均衡程度
- **冷启动**: 新用户或新项目缺少历史数据的情况
