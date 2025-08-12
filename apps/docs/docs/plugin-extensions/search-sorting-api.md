# Search Sorting API Extension

> **⚠️ INTERNAL BETA - NOT YET AVAILABLE**  
> This API is currently in internal beta testing and is not available for public plugin development. It will be released in a future version.

## Overview

The Search Sorting API allows plugins to customize how search results are ranked and sorted in Tuff. This powerful extension enables plugins to influence the search experience by adjusting type weights, adding dynamic rules, and creating custom sorting behaviors.

## Core Concepts

### Weight System

Each item type has a base weight that determines its priority in search results:

- **app**: 10 (Applications)
- **feature**: 5 (Feature plugins)
- **cmd**: 5 (Commands)
- **plugin**: 3 (Plugins)
- **file**: 2 (Files)
- **text**: 1 (Text content)

### Dynamic Rules

Dynamic rules allow conditional weight adjustments based on item properties or context:

- **feature-high-amo**: When feature type has amo > 10, weight is boosted to 10

### Scoring Algorithm

Final sorting score calculation:
```
Score = Match Score × 100000 + Weight × 1000 + Usage Frequency (amo)
```

This ensures:
1. **Match relevance** has highest priority
2. **Type weight** has secondary priority
3. **Usage frequency** has lowest priority

## API Reference

### SortConfigManager

Main interface for managing sorting configuration.

#### Basic Weight Management

```typescript
// Note: Advanced configuration management is planned for future releases
// Currently, the system uses built-in default weights and dynamic rules

import { calculateSortScore } from '@tuff/core/search-sorter'

// Calculate score for an item
const score = calculateSortScore(item, searchKeyword)
```

#### Current Implementation

The current implementation uses a simplified approach with built-in logic:

```typescript
// Built-in weights (not configurable in current version)
const DEFAULT_WEIGHTS = {
  app: 10,
  feature: 5,
  cmd: 5,
  plugin: 3,
  file: 2,
  text: 1
}

// Built-in dynamic rule: feature with high usage gets boosted
// if (item.pluginType === 'feature' && item.amo > 10) weight = 10
```

### Future Configuration API

Advanced configuration management is planned for future releases:

```typescript
// Planned API (not yet available)
import { SortConfigManager } from '@tuff/core/search-sorter-config'

// These features will be available in future versions:
// - Custom weight configuration
// - Dynamic rule management
// - Preset configurations
// - Persistent settings
```

## Plugin Integration Examples

### Example 1: Development Tools Plugin

```typescript
export class DevToolsPlugin {
  onActivate() {
    // Boost development-related items during work hours
    const hour = new Date().getHours()
    
    if (hour >= 9 && hour <= 17) {
      SortConfigManager.addDynamicRule(
        'dev-tools-work-boost',
        (item: SearchItem) => {
          const devKeywords = ['code', 'git', 'terminal', 'editor', 'ide']
          return devKeywords.some(keyword => 
            item.name.toLowerCase().includes(keyword) ||
            item.keyWords.some(kw => kw.toLowerCase().includes(keyword))
          )
        },
        15
      )
    }
  }
  
  onDeactivate() {
    SortConfigManager.removeDynamicRule('dev-tools-work-boost')
  }
}
```

### Example 2: Productivity Plugin

```typescript
export class ProductivityPlugin {
  onActivate() {
    // Boost frequently used productivity tools
    SortConfigManager.addDynamicRule(
      'productivity-boost',
      (item: SearchItem) => {
        const productivityApps = ['calendar', 'notes', 'todo', 'task']
        return productivityApps.some(app => 
          item.name.toLowerCase().includes(app)
        ) && (item.amo || 0) > 5
      },
      12
    )
    
    // Apply feature-first preset for productivity focus
    applyPresetConfig('featureFirst')
  }
  
  onDeactivate() {
    SortConfigManager.removeDynamicRule('productivity-boost')
    applyPresetConfig('default')
  }
}
```

### Example 3: Context-Aware Plugin

```typescript
export class ContextAwarePlugin {
  onActivate() {
    // Adjust weights based on current context
    this.setupContextRules()
  }
  
  private setupContextRules() {
    // Boost items based on current application context
    SortConfigManager.addDynamicRule(
      'context-aware-boost',
      (item: SearchItem) => {
        const currentApp = this.getCurrentActiveApp()
        
        // If user is in a code editor, boost development tools
        if (currentApp.includes('code') || currentApp.includes('editor')) {
          return item.keyWords.some(kw => 
            ['debug', 'compile', 'build', 'test'].includes(kw.toLowerCase())
          )
        }
        
        // If user is in a browser, boost web-related tools
        if (currentApp.includes('browser') || currentApp.includes('chrome')) {
          return item.keyWords.some(kw => 
            ['web', 'http', 'url', 'bookmark'].includes(kw.toLowerCase())
          )
        }
        
        return false
      },
      14
    )
  }
  
  private getCurrentActiveApp(): string {
    // Implementation to get current active application
    return ''
  }
}
```

## Advanced Usage

### Custom Scoring Logic

```typescript
import { calculateSortScore } from '@tuff/core/search-sorter'

// Calculate score for an item
const score = calculateSortScore(item, searchKeyword)

// Custom scoring with additional factors
function customCalculateScore(item: SearchItem, keyword: string): number {
  const baseScore = calculateSortScore(item, keyword)
  
  // Add custom factors
  let customBoost = 0
  
  // Boost recently used items
  if (item.lastUsed && Date.now() - item.lastUsed < 3600000) { // 1 hour
    customBoost += 500
  }
  
  // Boost items with high rating
  if (item.rating && item.rating > 4) {
    customBoost += 200
  }
  
  return baseScore + customBoost
}
```

### Batch Operations

```typescript
// Update multiple configurations at once
function setupGameModeConfiguration() {
  const gameWeights = {
    app: 15,      // Prioritize game applications
    feature: 3,   // Lower feature priority
    cmd: 2,       // Lower command priority
    plugin: 8,    // Medium plugin priority
    file: 1,      // Lowest file priority
    text: 1       // Lowest text priority
  }
  
  SortConfigManager.updateTypeWeights(gameWeights)
  
  // Add game-specific rules
  SortConfigManager.addDynamicRule(
    'game-mode-boost',
    (item: SearchItem) => {
      const gameKeywords = ['game', 'steam', 'epic', 'launcher']
      return gameKeywords.some(keyword => 
        item.name.toLowerCase().includes(keyword)
      )
    },
    20
  )
}
```

## Configuration Schema

```typescript
interface SortWeightConfig {
  default: {
    [type: string]: number
  }
  dynamicRules: {
    name: string
    condition: (item: SearchItem) => boolean
    weight: number
  }[]
}
```

## Best Practices

1. **Rule Naming**: Use descriptive names with plugin prefix (e.g., `my-plugin-boost-rule`)
2. **Cleanup**: Always remove rules when plugin is deactivated
3. **Performance**: Keep rule conditions lightweight to avoid search delays
4. **User Experience**: Provide configuration options for users to customize behavior
5. **Persistence**: Configuration changes are automatically saved to localStorage

## Limitations

- Maximum weight value: 50
- Maximum number of dynamic rules: 20 per plugin
- Rule conditions should execute in < 1ms for optimal performance

## Future Enhancements

- Plugin-specific weight profiles
- Time-based automatic rule activation
- Machine learning-based weight optimization
- Cross-plugin rule coordination

---

*This API is part of the Tuff Plugin Extension System and is currently in internal beta testing.*
