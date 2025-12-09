# Feature SDK

Feature SDK 提供插件管理 CoreBox 搜索结果项（TuffItem）的能力。

## 快速开始

```typescript
import { useFeature } from '@talex-touch/utils/plugin/sdk'

const feature = useFeature()

// 推送搜索结果
feature.pushItems([
  {
    id: 'result-1',
    title: { text: '搜索结果 1' },
    subtitle: { text: '描述信息' },
    source: { id: 'my-plugin', name: 'My Plugin' }
  }
])

// 监听输入变化
feature.onInputChange((input) => {
  console.log('用户输入:', input)
})
```

---

## API 参考

### useFeature()

获取 Feature SDK 实例。

```typescript
import { useFeature } from '@talex-touch/utils/plugin/sdk'

const feature = useFeature()
```

> **注意**：必须在插件渲染器上下文中调用，且需要 `$boxItems` API 可用。

---

## 搜索结果管理

### `pushItems(items)`

推送多个项目到 CoreBox 搜索结果。

```typescript
feature.pushItems([
  {
    id: 'calc-result',
    title: { text: '42' },
    subtitle: { text: '计算结果' },
    source: { id: 'calculator', name: 'Calculator' },
    icon: 'ri:calculator-line'
  }
])
```

### `updateItem(id, updates)`

更新指定项目。

```typescript
feature.updateItem('result-1', {
  title: { text: '更新后的标题' },
  subtitle: { text: '新的描述' }
})
```

### `removeItem(id)`

移除指定项目。

```typescript
feature.removeItem('result-1')
```

### `clearItems()`

清除当前插件的所有项目。

```typescript
feature.clearItems()
```

### `getItems()`

获取当前插件的所有项目。

```typescript
const items = feature.getItems()
console.log(`当前显示 ${items.length} 个项目`)
```

---

## 事件监听

### `onInputChange(handler)`

监听搜索输入变化。

```typescript
const unsubscribe = feature.onInputChange((input) => {
  console.log('用户输入:', input)
  
  // 执行实时搜索
  const results = await search(input)
  feature.pushItems(results)
})

// 停止监听
unsubscribe()
```

### `onKeyEvent(handler)`

监听键盘事件。当插件 UI 附加到 CoreBox 时，某些按键事件会被转发。

```typescript
const unsubscribe = feature.onKeyEvent((event) => {
  if (event.key === 'Enter') {
    // 处理回车键
    submitSelection()
  } else if (event.key === 'ArrowDown') {
    // 向下导航
    selectNext()
  } else if (event.metaKey && event.key === 'k') {
    // 处理 Cmd+K
    openSearch()
  }
})

unsubscribe()
```

**ForwardedKeyEvent 结构**：

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

## TuffItem 结构

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

## 完整示例

### 实时搜索插件

```typescript
import { useFeature, useBox } from '@talex-touch/utils/plugin/sdk'
import { debounce } from 'lodash-es'

const feature = useFeature()
const box = useBox()

// 防抖搜索
const debouncedSearch = debounce(async (query: string) => {
  if (!query.trim()) {
    feature.clearItems()
    return
  }
  
  const results = await fetchSearchResults(query)
  
  feature.clearItems()
  feature.pushItems(results.map((r, i) => ({
    id: `result-${i}`,
    title: { text: r.title },
    subtitle: { text: r.description },
    source: { id: 'my-search', name: 'Search' },
    icon: r.icon
  })))
  
  // 调整窗口大小
  await box.expand({ length: results.length })
}, 300)

// 监听输入
feature.onInputChange(debouncedSearch)

// 监听键盘
feature.onKeyEvent((event) => {
  if (event.key === 'Enter') {
    const items = feature.getItems()
    if (items.length > 0) {
      openItem(items[0])
      box.hide()
    }
  }
})
```

---

## 类型定义

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
