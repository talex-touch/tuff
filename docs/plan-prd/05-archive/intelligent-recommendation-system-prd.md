# 智能推荐系统 PRD (精简版)

## 1. 概要

### 背景
当前搜索引擎已具备组合键统计、时间衰减、查询补全,但缺少**主动推荐**能力。

### 目标
在用户打开 CoreBox 时(空查询状态),基于上下文智能推荐最相关项目,无需输入即可快速执行。

### 核心价值
- 减少重复输入,提升效率
- 主动发现使用习惯,智能辅助
- 提供个性化体验

---

## 2. 核心功能

### 2.1 推荐触发
- **触发时机**: 打开 CoreBox 且输入为空
- **推荐数量**: 默认 8-12 个项目
- **展示位置**: 搜索框下方独立区域,标题"为你推荐"

> 实现落地：渲染进程在推荐请求期间保持 pending 状态，避免窗口/高度在推荐返回前出现闪烁收起。

### 2.2 上下文感知

#### 时间上下文
- **时段**: 工作时间(9-18点) vs 休闲时间 vs 深夜
- **星期**: 工作日 vs 周末
- **特殊时间**: 早晨起床、午餐、下班时段

#### 历史行为
- 基于 `item_usage_stats` 统计
- 区分不同时段的使用习惯
- 识别项目组合(例如: VSCode → iTerm)

#### 实时上下文
- **剪贴板智能**: 检测内容类型,推荐相关操作
  - 链接 → 浏览器/下载/笔记
  - 代码 → IDE/编辑器
  - 图片 → 图片处理工具
- **前台应用**: 根据当前活动应用推荐相关工具
- **系统状态**: 电池低/网络状态/存储空间

---

## 3. 推荐算法

### 3.1 评分公式
```
score = timeWeight * 0.4 + frequencyWeight * 0.3 
        + contextWeight * 0.2 + diversityPenalty * 0.1

其中:
- timeWeight: 时段匹配度 + 时间衰减
- frequencyWeight: 使用频率 + 最近使用
- contextWeight: 剪贴板匹配 + 前台应用关联
- diversityPenalty: 避免同类型项目扎堆
```

### 3.2 时间权重计算
```typescript
function calculateTimeWeight(item: UsageStats, now: Date): number {
  const currentHour = now.getHours()
  const currentDay = now.getDay() // 0-6
  
  // 时段匹配: 根据历史在当前时段的使用频率
  const hourlyScore = item.hourlyDistribution[currentHour] || 0
  
  // 星期匹配: 工作日/周末模式
  const isWeekend = currentDay === 0 || currentDay === 6
  const dayScore = isWeekend 
    ? item.weekendUsageRatio 
    : (1 - item.weekendUsageRatio)
  
  // 时间衰减: 最近使用优先
  const daysSince = (now.getTime() - item.lastExecuted) / (1000 * 60 * 60 * 24)
  const recencyScore = Math.exp(-0.1 * daysSince)
  
  return (hourlyScore * 0.5 + dayScore * 0.2 + recencyScore * 0.3)
}
```

### 3.3 上下文权重
```typescript
function calculateContextWeight(item: Item, context: Context): number {
  let score = 0
  
  // 剪贴板匹配
  if (context.clipboard) {
    if (item.supportedInputTypes?.includes(context.clipboard.type)) {
      score += 0.6
    }
  }
  
  // 前台应用关联
  if (context.frontApp && item.relatedApps?.includes(context.frontApp)) {
    score += 0.3
  }
  
  // 系统状态
  if (context.batteryLow && item.tags?.includes('power-efficient')) {
    score += 0.1
  }
  
  return Math.min(score, 1.0)
}
```

---

## 4. 数据结构

### 4.1 扩展统计表
```sql
-- 扩展 item_usage_stats
ALTER TABLE item_usage_stats ADD COLUMN hourly_distribution TEXT; -- JSON: {0-23: count}
ALTER TABLE item_usage_stats ADD COLUMN weekend_usage_ratio REAL DEFAULT 0.5;
ALTER TABLE item_usage_stats ADD COLUMN related_items TEXT; -- JSON: [itemId]

-- 新增推荐日志表
CREATE TABLE recommendation_logs (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  context TEXT NOT NULL, -- JSON: {hour, day, clipboard, frontApp}
  recommended_items TEXT NOT NULL, -- JSON: [itemId]
  clicked_item TEXT,
  clicked_position INTEGER,
  session_id TEXT
);

CREATE INDEX idx_recommendation_timestamp ON recommendation_logs(timestamp DESC);
```

### 4.2 缓存结构
```typescript
interface RecommendationCache {
  timestamp: number
  context: ContextSnapshot
  recommendations: Array<{
    item: TuffItem
    score: number
    reason: string // 推荐理由
  }>
}

// LRU缓存: Map<contextHash, RecommendationCache>
// TTL: 5分钟
```

---

## 5. 技术实现

### 5.1 推荐服务
```typescript
class RecommendationService {
  async getRecommendations(context: Context): Promise<RecommendedItem[]> {
    // 1. 检查缓存
    const cached = this.cache.get(this.hashContext(context))
    if (cached && Date.now() - cached.timestamp < 300000) {
      return cached.recommendations
    }
    
    // 2. 获取候选项 (最近30天有使用记录)
    const candidates = await this.getCandidates()
    
    // 3. 计算分数
    const scored = candidates.map(item => ({
      item,
      score: this.calculateScore(item, context)
    }))
    
    // 4. 排序 + 多样性调整
    const ranked = this.rankWithDiversity(scored)
    
    // 5. 取Top 12
    const recommendations = ranked.slice(0, 12)
    
    // 6. 缓存结果
    this.cache.set(this.hashContext(context), {
      timestamp: Date.now(),
      context,
      recommendations
    })
    
    return recommendations
  }
  
  private rankWithDiversity(items: ScoredItem[]): ScoredItem[] {
    const result: ScoredItem[] = []
    const sourceTypes = new Set<string>()
    
    for (const item of items.sort((a, b) => b.score - a.score)) {
      // 避免连续3个同源类型
      if (result.length >= 3) {
        const lastThree = result.slice(-3).map(r => r.item.source.type)
        if (lastThree.every(t => t === item.item.source.type)) {
          item.score *= 0.8 // 降权
        }
      }
      result.push(item)
    }
    
    return result.sort((a, b) => b.score - a.score)
  }
}
```

### 5.2 上下文采集
```typescript
class ContextCollector {
  async collect(): Promise<Context> {
    return {
      timestamp: Date.now(),
      hour: new Date().getHours(),
      day: new Date().getDay(),
      clipboard: await this.getClipboardContext(),
      frontApp: await this.getFrontApp(),
      battery: await this.getBatteryStatus(),
      network: await this.getNetworkStatus()
    }
  }
  
  private async getClipboardContext(): Promise<ClipboardContext | null> {
    const content = await clipboard.readText()
    if (!content) return null
    
    return {
      type: this.detectType(content), // 'url' | 'code' | 'text' | 'path'
      preview: content.slice(0, 100),
      hash: this.hashContent(content)
    }
  }
}
```

---

## 6. 界面与体验（UI/UX）

### 6.1 展示形式
```
┌─────────────────────────────────────┐
│ CoreBox 搜索框                      │
├─────────────────────────────────────┤
│ 为你推荐 ✨                         │
│                                     │
│ 🕐 常用此时段                       │
│  • VSCode          最近用于编辑配置 │
│  • iTerm           每天早上使用     │
│                                     │
│ 📋 剪贴板智能                       │
│  • Chrome          打开链接         │
│  • 下载中心         保存资源         │
│                                     │
│ ⭐ 高频项目                         │
│  • Notion          工作日常用       │
│  • Figma           设计工作         │
└─────────────────────────────────────┘
```

### 6.2 推荐理由
每个推荐项显示简短理由:
- "工作日 9:00 常用"
- "检测到链接,可快速打开"
- "与 VSCode 配合使用"
- "最近频繁使用"

---

## 7. 性能优化

### 7.1 缓存策略
- **推荐结果缓存**: 5分钟 TTL
- **统计数据缓存**: 1小时后台刷新
- **上下文哈希**: 仅当关键上下文变化才重算

### 7.2 异步计算
- 推荐计算放入 Worker 线程
- UI 先展示历史推荐,后台更新
- 计算超时 50ms 直接返回 fallback

### 7.3 数据预热
- App 启动时预计算常见时段推荐
- 缓存到内存,CoreBox 打开即取

---

## 8. 隐私与控制

### 8.1 隐私保护
- 所有数据本地存储,不上传云端
- 推荐日志可完全禁用
- 上下文采集最小化原则

### 8.2 用户控制
- **设置选项**:
  - 启用/禁用推荐功能
  - 推荐数量: 4/8/12
  - 禁用特定上下文感知(如剪贴板)
  - 重置推荐学习数据
- **手动调整**:
  - 推荐项右键"不再推荐"
  - "告诉我们原因"反馈入口

---

## 9. 实施计划

### Phase 1: 基础推荐 (5-7天)
- [ ] 时间上下文推荐
- [ ] 基于频率的简单推荐
- [ ] UI 集成与展示

### Phase 2: 上下文感知 (5-7天)
- [ ] 剪贴板智能
- [ ] 前台应用关联
- [ ] 推荐理由展示

### Phase 3: 优化迭代 (3-5天)
- [ ] 多样性调整
- [ ] 性能优化与缓存
- [ ] 推荐日志分析

### Phase 4: 用户控制 (2-3天)
- [ ] 设置面板
- [ ] 数据重置
- [ ] 反馈机制

**总工期**: 15-22 天

---

## 10. 成功指标

- **采用率**: 30%+ 用户启用推荐功能
- **点击率**: 推荐项平均点击率 > 15%
- **节省时间**: 平均减少 1.5 次输入/会话
- **满意度**: NPS > 40

---

## 11. 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| 推荐不准确 | A/B 测试,持续优化算法 |
| 性能影响 | 异步计算,缓存优化 |
| 隐私顾虑 | 明确说明,提供完全禁用选项 |
| 用户反感 | 默认可关闭,不强制推荐 |

---

## 附录: 参考实现

### Raycast 推荐机制
- 基于使用频率的简单推荐
- 无上下文感知
- 推荐项较少(3-5个)

### Alfred 工作流
- 通过 Workflow 实现推荐逻辑
- 依赖用户配置
- 缺乏自动学习

### Tuff 优势
- 原生集成,性能更优
- 多维度上下文感知
- 自动学习,无需配置

---

**文档版本**: v2.0 (精简版,从1016行压缩到400行)
**生成时间**: 2025-11-20
**负责人**: Search Team
