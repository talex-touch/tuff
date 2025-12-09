# Feature SDK

The Feature SDK provides plugins with the ability to manage CoreBox search result items (TuffItems).

## Quick Start

```typescript
import { useFeature } from '@talex-touch/utils/plugin/sdk'

const feature = useFeature()

// Push search results
feature.pushItems([
  {
    id: 'result-1',
    title: { text: 'Search Result 1' },
    subtitle: { text: 'Description' },
    source: { id: 'my-plugin', name: 'My Plugin' }
  }
])

// Listen to input changes
feature.onInputChange((input) => {
  console.log('User typed:', input)
})
```

---

## API Reference

### useFeature()

Get Feature SDK instance.

```typescript
import { useFeature } from '@talex-touch/utils/plugin/sdk'

const feature = useFeature()
```

> **Note**: Must be called within plugin renderer context with `$boxItems` API available.

---

## Search Result Management

### `pushItems(items)`

Push multiple items to CoreBox search results.

```typescript
feature.pushItems([
  {
    id: 'calc-result',
    title: { text: '42' },
    subtitle: { text: 'Calculation result' },
    source: { id: 'calculator', name: 'Calculator' },
    icon: 'ri:calculator-line'
  }
])
```

### `updateItem(id, updates)`

Update a specific item.

```typescript
feature.updateItem('result-1', {
  title: { text: 'Updated Title' },
  subtitle: { text: 'New description' }
})
```

### `removeItem(id)`

Remove a specific item.

```typescript
feature.removeItem('result-1')
```

### `clearItems()`

Clear all items from current plugin.

```typescript
feature.clearItems()
```

### `getItems()`

Get all items from current plugin.

```typescript
const items = feature.getItems()
console.log(`Currently showing ${items.length} items`)
```

---

## Event Listening

### `onInputChange(handler)`

Listen to search input changes.

```typescript
const unsubscribe = feature.onInputChange((input) => {
  console.log('User typed:', input)
  
  // Perform real-time search
  const results = await search(input)
  feature.pushItems(results)
})

// Stop listening
unsubscribe()
```

### `onKeyEvent(handler)`

Listen to keyboard events. When plugin UI is attached to CoreBox, certain key events are forwarded.

```typescript
const unsubscribe = feature.onKeyEvent((event) => {
  if (event.key === 'Enter') {
    // Handle Enter key
    submitSelection()
  } else if (event.key === 'ArrowDown') {
    // Navigate down
    selectNext()
  } else if (event.metaKey && event.key === 'k') {
    // Handle Cmd+K
    openSearch()
  }
})

unsubscribe()
```

**ForwardedKeyEvent structure**:

```typescript
interface ForwardedKeyEvent {
  key: string
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat: boolean
}
```

---

## TuffItem Structure

```typescript
interface TuffItem {
  id: string
  
  title: {
    text: string
    highlight?: boolean
  }
  
  subtitle?: {
    text: string
    highlight?: boolean
  }
  
  source: {
    id: string
    name: string
  }
  
  icon?: string
  
  actions?: TuffAction[]
  
  meta?: Record<string, any>
}
```

---

## Type Definitions

```typescript
interface FeatureSDK {
  pushItems(items: TuffItem[]): void
  updateItem(id: string, updates: Partial<TuffItem>): void
  removeItem(id: string): void
  clearItems(): void
  getItems(): TuffItem[]
  onInputChange(handler: InputChangeHandler): () => void
  onKeyEvent(handler: KeyEventHandler): () => void
}

type InputChangeHandler = (input: string) => void
type KeyEventHandler = (event: ForwardedKeyEvent) => void
```
