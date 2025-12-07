# CoreBox Layout System

## Overview
CoreBox supports two layout modes, controlled by backend via `TuffSearchResult.containerLayout`:
- **list** - Default list mode, vertical arrangement
- **grid** - Grid mode, supports horizontal selection

## DSL Type Definitions

### TuffContainerLayout
```typescript
interface TuffContainerLayout {
  mode: 'list' | 'grid'
  grid?: {
    columns: number      // Number of columns, default 5
    gap?: number         // Gap in px, default 8
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

### TuffMeta Extensions
```typescript
interface TuffMeta {
  // Pin configuration
  pinned?: {
    isPinned: boolean
    pinnedAt?: number
    order?: number
  }
  // Recommendation source marker
  recommendation?: {
    source: 'frequent' | 'recent' | 'time-based' | 'trending' | 'pinned' | 'context'
    score?: number
  }
}
```

## Keyboard Navigation

| Mode | Key | Behavior |
|------|-----|----------|
| list | ArrowUp/Down | Move up/down |
| grid | ArrowUp/Down | Move across rows |
| grid | ArrowLeft/Right | Move within row |

## Recommendation Engine

The recommendation engine generates recommendations based on:
- **frequent** - Global high-frequency items
- **recent** - Recently used
- **time-based** - Time-slot popular
- **trending** - Trending up
- **pinned** - User pinned
- **context** - Context matching (clipboard, foreground app)

## Usage Examples

### Plugin Returns Grid Layout
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

### Mark Pinned Item
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
