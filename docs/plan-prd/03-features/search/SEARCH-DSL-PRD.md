# 搜索 DSL 增强 PRD

## 概述

本文档描述 CoreBox 搜索增强功能：
1. **DSL 置顶排序** - 强制将特定项目排到最前
2. **Provider 过滤语法** - `@xxx` 语法过滤特定插件/provider

---

## 功能 1：DSL 项目置顶

### 问题陈述
当搜索查询与某个特定项目高度匹配（例如 URL 检测）时，用户可能希望该项目不受其他评分因素影响，始终排在结果最前。

### 方案
在 TuffItem 上新增 `pinned` 字段，用于强制将该项目置顶。

### API 设计

```typescript
interface TuffItem {
  // ... existing fields
  
  /**
   * If true, this item will be pinned to the top of search results.
   * Use sparingly - may interrupt user's expected result order.
   * @warning This overrides normal sorting and may cause unexpected UX.
   */
  pinned?: boolean
  
  /**
   * Pin priority when multiple items are pinned (higher = higher position)
   * Default: 0
   */
  pinPriority?: number
}
```

### TuffItemBuilder API

```typescript
class TuffItemBuilder {
  /**
   * Pin this item to the top of search results.
   * @warning Use sparingly - may interrupt user's expected result order.
   */
  setPinned(pinned: boolean, priority?: number): TuffItemBuilder
}
```

### 排序实现

```typescript
// In tuff-sorter.ts
function sortItems(items: TuffItem[]): TuffItem[] {
  return items.sort((a, b) => {
    // Pinned items always come first
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    
    // Among pinned items, sort by pinPriority
    if (a.pinned && b.pinned) {
      return (b.pinPriority ?? 0) - (a.pinPriority ?? 0)
    }
    
    // Normal scoring for unpinned items
    return b.scoring.final - a.scoring.final
  })
}
```

### UI 动画

当置顶项目出现时，增加向上滑入的动画：

```scss
.BoxItem.is-pinned {
  animation: pin-slide-in 0.3s cubic-bezier(0.22, 0.61, 0.36, 1);
}

@keyframes pin-slide-in {
  0% {
    transform: translateY(20px);
    opacity: 0.5;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}
```

### 使用规范

> ⚠️ **谨慎使用**：置顶会打破自然排序，可能让用户困惑。仅在以下情况使用：
> - 匹配置信度极高（例如 URL 精确匹配）
> - 行为具有强时效性或关键性
> - 用户明确请求该行为

### 示例用例

1. **URL 检测**：剪贴板包含 URL，用户搜索浏览器动作
2. **文件路径匹配**：搜索命中精确文件路径
3. **命令前缀**：搜索以已知命令前缀开头

---

## 功能 2：Provider 过滤语法（@xxx）

### 问题陈述
用户希望快速将搜索结果限定到某个插件或 provider，无需在全部结果中滚动筛选。

### 方案
在搜索查询中支持 `@provider` 语法，将搜索锁定到指定 provider。

### 语法

```
@<provider-id> <query>
```

示例：
- `@file document.pdf` - 仅在文件 provider 中搜索
- `@touch-translation hello` - 仅在翻译插件中搜索
- `@app chrome` - 仅在应用中搜索

### 实现

#### 查询解析

```typescript
interface ParsedQuery {
  raw: string
  text: string
  providerFilter?: string
}

function parseSearchQuery(input: string): ParsedQuery {
  const filterMatch = input.match(/^@([\w-]+)\s*(.*)$/)
  
  if (filterMatch) {
    return {
      raw: input,
      providerFilter: filterMatch[1].toLowerCase(),
      text: filterMatch[2].trim()
    }
  }
  
  return { raw: input, text: input }
}
```

#### Provider 匹配

```typescript
function matchProvider(providerId: string, filter: string): boolean {
  const normalizedId = providerId.toLowerCase()
  const normalizedFilter = filter.toLowerCase()
  
  // Exact match
  if (normalizedId === normalizedFilter) return true
  
  // Partial match (e.g., @file matches file-provider)
  if (normalizedId.includes(normalizedFilter)) return true
  
  // Alias match
  const aliases: Record<string, string[]> = {
    'file': ['files', 'fs', 'document'],
    'app': ['apps', 'application', 'applications'],
    'plugin': ['plugins', 'extension', 'extensions'],
    // ... provider-specific aliases
  }
  
  return aliases[normalizedFilter]?.some(alias => 
    normalizedId.includes(alias)
  ) ?? false
}
```

#### 搜索引擎集成

```typescript
// In search-core.ts
async function search(query: TuffQuery): Promise<TuffSearchResult> {
  const parsed = parseSearchQuery(query.text)
  
  // Filter providers if @xxx syntax used
  const activeProviders = parsed.providerFilter
    ? this.providers.filter(p => matchProvider(p.id, parsed.providerFilter!))
    : this.providers
  
  // Search with filtered providers
  const results = await Promise.all(
    activeProviders.map(p => p.onSearch({
      ...query,
      text: parsed.text
    }, signal))
  )
  
  return mergeResults(results)
}
```

### UI 反馈

当过滤器生效时，在输入框中展示徽标：

```vue
<template>
  <div class="BoxInput">
    <span v-if="activeFilter" class="filter-badge">
      <i class="i-carbon-filter" />
      {{ activeFilter }}
      <button @click="clearFilter">×</button>
    </span>
    <input v-model="searchVal" />
  </div>
</template>
```

### 自动补全

当用户输入 `@` 时展示可用的 providers：

```typescript
const providerSuggestions = computed(() => {
  if (!searchVal.value.startsWith('@')) return []
  
  const partial = searchVal.value.slice(1).toLowerCase()
  return providers
    .filter(p => p.id.toLowerCase().includes(partial))
    .map(p => ({
      id: p.id,
      name: p.name,
      icon: p.icon
    }))
})
```

### 内置别名

| 别名 | 匹配 |
|-------|---------|
| `@file` | file-provider, file-index |
| `@app` | app-provider, applications |
| `@plugin` | plugin-features |
| `@system` | plugin-features(system.actions) |
| `@calc` | calculator |
| `@web` | web-search |

### 插件注册

插件可注册自定义别名：

```typescript
// In manifest.json
{
  "features": [{
    "id": "translate",
    "searchAliases": ["trans", "fanyi", "翻译"]
  }]
}
```

---

## 实施优先级

1. **阶段 1**：Provider 过滤语法（@xxx）
   - 查询解析
   - 基础 provider 过滤
   - UI 反馈

2. **阶段 2**：DSL 项目置顶
   - TuffItem pinned 字段
   - 排序实现
   - 动画

3. **阶段 3**：增强项
   - Provider 自动补全
   - 自定义别名
   - 插件别名注册

---

## 文档补充

用户文档需补充：

### 搜索语法

| 语法 | 说明 | 示例 |
|--------|-------------|---------|
| `@provider query` | 过滤到指定 provider | `@file report.pdf` |
| `@app name` | 仅搜索应用 | `@app chrome` |
| `@plugin query` | 仅搜索插件能力 | `@plugin translate` |

---

## 变更记录

- **v2.5.0**：DSL 搜索增强 PRD 初版
