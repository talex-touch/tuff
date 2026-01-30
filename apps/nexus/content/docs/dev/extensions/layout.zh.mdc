# CoreBox 布局系统

## 概述
CoreBox 支持两种布局模式，由后端通过 `TuffSearchResult.containerLayout` 控制：
- **list** - 默认列表模式，垂直排列
- **grid** - 宫格模式，支持横向选择

## DSL 类型定义

**TuffContainerLayout**
```typescript
interface TuffContainerLayout {
  mode: 'list' | 'grid'
  grid?: {
    columns: number      // 列数，默认 5
    gap?: number         // 间距(px)，默认 8
    itemSize?: 'small' | 'medium' | 'large'
  }
  sections?: TuffSection[]
}

interface TuffSection {
  id: string
  title?: string
  layout: 'list' | 'grid'
  itemIds: string[]
  collapsed?: boolean
}
```

**TuffMeta 扩展**
```typescript
interface TuffMeta {
  // 固定配置
  pinned?: {
    isPinned: boolean
    pinnedAt?: number
    order?: number
  }
  // 推荐来源标记
  recommendation?: {
    source: 'frequent' | 'recent' | 'time-based' | 'trending' | 'pinned' | 'context'
    score?: number
  }
}
```

## 键盘导航

| 模式 | 按键 | 行为 |
|------|------|------|
| list | ArrowUp/Down | 上下移动 |
| grid | ArrowUp/Down | 跨行移动 |
| grid | ArrowLeft/Right | 同行移动 |

## 推荐引擎

推荐引擎根据以下维度生成推荐列表：
- **frequent** - 全局高频项目
- **recent** - 最近使用
- **time-based** - 时段热门
- **trending** - 趋势上升
- **pinned** - 用户固定
- **context** - 上下文匹配（剪贴板、前台应用）

## 使用示例

**插件返回宫格布局**
```typescript
const result: TuffSearchResult = {
  items: [...],
  query,
  duration: 100,
  sources: [],
  containerLayout: {
    mode: 'grid',
    grid: {
      columns: 5,
      gap: 8,
      itemSize: 'medium'
    }
  }
}
```

**标记固定项目**
```typescript
const item: TuffItem = {
  id: 'my-app',
  source: { type: 'app', id: 'app-provider' },
  render: { mode: 'default', basic: { title: 'My App' } },
  meta: {
    pinned: {
      isPinned: true,
      pinnedAt: Date.now(),
      order: 0
    }
  }
}
```
