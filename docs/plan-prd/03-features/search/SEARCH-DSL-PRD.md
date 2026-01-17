# Search DSL Enhancement PRD

## 概述

本文档描述 CoreBox 搜索增强功能：
1. **DSL 置顶排序** - 强制将特定项目排到最前
2. **Provider 过滤语法** - `@xxx` 语法过滤特定插件/provider

---

## Feature 1: DSL Item Pinning

### Problem Statement
When a search query highly matches a specific item (e.g., URL detection), users may want that item to appear at the top of all results, regardless of other scoring factors.

### Solution
Add a `pinned` field to TuffItem that forces the item to the top of search results.

### API Design

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

### Sorting Implementation

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

### UI Animation

When a pinned item appears, animate it sliding to the top:

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

### Usage Guidelines

> ⚠️ **Use with caution**: Pinning items disrupts the natural search order and may confuse users. Only use when:
> - The match is extremely high confidence (e.g., exact URL match)
> - The action is time-sensitive or critical
> - The user explicitly requested this behavior

### Example Use Cases

1. **URL Detection**: When clipboard contains a URL and user searches for browser actions
2. **File Path Match**: When search matches an exact file path
3. **Command Prefix**: When search starts with a known command prefix

---

## Feature 2: Provider Filter Syntax (@xxx)

### Problem Statement
Users want to quickly filter search results to a specific plugin or provider without scrolling through all results.

### Solution
Support `@provider` syntax in the search query to lock search to a specific provider.

### Syntax

```
@<provider-id> <query>
```

Examples:
- `@file document.pdf` - Search only in file provider
- `@touch-translation hello` - Search only in translation plugin
- `@app chrome` - Search only in applications

### Implementation

#### Query Parsing

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

#### Provider Matching

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

#### Search Engine Integration

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

### UI Feedback

When filter is active, show a badge in the input:

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

### Autocomplete

Show available providers when user types `@`:

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

### Built-in Aliases

| Alias | Matches |
|-------|---------|
| `@file` | file-provider, file-index |
| `@app` | app-provider, applications |
| `@plugin` | plugin-features |
| `@system` | system-provider |
| `@calc` | calculator |
| `@web` | web-search |

### Plugin Registration

Plugins can register custom aliases:

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

## Implementation Priority

1. **Phase 1**: Provider Filter Syntax (@xxx)
   - Query parsing
   - Basic provider filtering
   - UI feedback

2. **Phase 2**: DSL Item Pinning
   - TuffItem pinned field
   - Sorting implementation
   - Animation

3. **Phase 3**: Enhancements
   - Provider autocomplete
   - Custom aliases
   - Plugin alias registration

---

## Documentation

Add to user documentation:

### Search Syntax

| Syntax | Description | Example |
|--------|-------------|---------|
| `@provider query` | Filter to specific provider | `@file report.pdf` |
| `@app name` | Search applications only | `@app chrome` |
| `@plugin query` | Search plugin features only | `@plugin translate` |

---

## Changelog

- **v2.5.0**: Initial DSL search enhancement PRD
