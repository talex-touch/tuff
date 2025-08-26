# Core Box Package

The Core Box package provides unified type definitions and utility functions for the TUFF search box system. This package contains the foundational types and tools used across the entire project for search result management and plugin integration.

## Features

### 🎯 Unified Type System
- **ISearchItem**: Universal search result item interface
- **IRenderConfig**: Flexible rendering configuration with multiple modes
- **IDataItem**: Extended interface for data processing results
- **IAppItem**: Specialized interface for application results
- **IFileItem**: Specialized interface for file results
- **IFeatureItem**: Specialized interface for plugin feature results

### 🎨 Render Modes
The package supports multiple rendering modes for search results:

- **STANDARD**: Default text-based rendering
- **URL**: URL rendering - loads and displays remote URL content
- **HTML**: Rich HTML content rendering
- **JAVASCRIPT**: JavaScript code with syntax highlighting
- **JSX**: React JSX component rendering
- **VUE_SFC**: Vue Single File Component rendering

### 🛠️ Utility Functions
Comprehensive set of utility functions for creating and managing search results:

- `SearchUtils.createSearchItem()`: Create basic search items
- `SearchUtils.createDataItem()`: Create data processing results
- `SearchUtils.createAppItem()`: Create application results
- `SearchUtils.createFileItem()`: Create file results
- `SearchUtils.createFeatureItem()`: Create plugin feature results
- `SearchUtils.createErrorItem()`: Create error state items
- `SearchUtils.sortByPriority()`: Sort results by relevance
- `SearchUtils.removeDuplicates()`: Remove duplicate results
- `SearchUtils.filterByConfidence()`: Filter by confidence score
- `SearchUtils.groupByPluginType()`: Group results by type

## Usage Examples

### Basic Search Item
```typescript
import { SearchUtils, RenderMode } from '@talex-touch/utils';

const basicItem = SearchUtils.createSearchItem({
  name: "My Feature",
  desc: "A useful plugin feature",
  pluginName: "my-plugin",
  keyWords: ["feature", "utility"],
  render: {
    mode: RenderMode.STANDARD
  }
});
```

### Data Processing Result
```typescript
const dataItem = SearchUtils.createDataItem({
  name: "Translation Result",
  desc: "English to Chinese translation",
  pluginName: "translator",
  source: "google-translate",
  dataType: "translation",
  originalData: "Hello World",
  processedData: "你好世界",
  confidence: 95,
  duration: 120,
  render: {
    mode: RenderMode.STANDARD
  }
});
```

### HTML Rendering
```typescript
const htmlItem = SearchUtils.createSearchItem({
  name: "Rich Content",
  desc: "HTML formatted result",
  pluginName: "content-plugin",
  render: {
    mode: RenderMode.HTML,
    content: "<div><h3>Title</h3><p>Content</p></div>",
    options: {
      trusted: true,
      className: "custom-content"
    }
  }
});
```

### Code Rendering
```typescript
const codeItem = SearchUtils.createDataItem({
  name: "JavaScript Function",
  desc: "Generated code snippet",
  pluginName: "code-generator",
  dataType: "javascript",
  processedData: "function hello() { return 'world'; }",
  render: {
    mode: RenderMode.JAVASCRIPT,
    content: "function hello() { return 'world'; }",
    options: {
      syntaxHighlight: true,
      showLineNumbers: true,
      theme: "dark"
    }
  }
});
```

### URL Rendering with Preview
```typescript
const urlItem = SearchUtils.createSearchItem({
  name: "GitHub Repository",
  desc: "TUFF project",
  pluginName: "web-search",
  render: {
    mode: RenderMode.URL,
    content: "https://github.com/talex-touch/talex-touch", // The actual URL to load
    preview: {
      enabled: true,
      title: "Tuff",                                // Preview metadata
      description: "Modern desktop application framework", // Preview description
      image: "https://github.com/talex-touch.png"         // Preview image
    }
  }
});
```

**Note**:
- `content`: The remote URL that will be loaded and displayed
- `preview`: Metadata shown before/alongside the loaded URL content

## Type Definitions

### ISearchItem
The core interface for all search results:

```typescript
interface ISearchItem {
  name: string;                    // Display name
  desc: string;                    // Description
  icon: IPluginIcon;              // Icon configuration
  push: boolean;                   // Push mode support
  names: string[];                 // Searchable names
  keyWords: string[];             // Search keywords
  pluginType: string;             // Plugin type
  type: string;                   // General type
  value: string;                  // Associated value
  render?: IRenderConfig;         // Render configuration
  // ... additional properties
}
```

### IRenderConfig
Configuration for custom rendering:

```typescript
interface IRenderConfig {
  mode: RenderMode;               // Rendering mode
  content?: string;               // Content to render
  options?: {                     // Render options
    syntaxHighlight?: boolean;
    theme?: string;
    showLineNumbers?: boolean;
    className?: string;
    style?: Record<string, string>;
    trusted?: boolean;
  };
  preview?: {                     // URL preview config
    enabled?: boolean;
    image?: string;
    title?: string;
    description?: string;
  };
}
```

## Integration

This package is automatically exported from `@talex-touch/utils`:

```typescript
import {
  ISearchItem,
  IDataItem,
  SearchUtils,
  RenderMode
} from '@talex-touch/utils';
```

## Best Practices

1. **Always specify render mode**: Even for standard rendering, explicitly set the render mode
2. **Use appropriate specialized interfaces**: Use IDataItem for data processing, IAppItem for applications, etc.
3. **Include confidence scores**: For data processing results, always include confidence levels
4. **Sanitize HTML content**: When using HTML render mode, ensure content is safe
5. **Provide meaningful keywords**: Include relevant search terms in the keyWords array
6. **Use consistent naming**: Follow established naming conventions for plugin types

## Migration Guide

If you're migrating from the old type system:

1. Replace `ITranslationItem` with `IDataItem`
2. Update render configurations to use the new `IRenderConfig` interface
3. Use `SearchUtils` functions instead of manual object creation
4. Update import paths to use `@talex-touch/utils`

## Contributing

When adding new types or utilities:

1. Add comprehensive TSDoc comments in English
2. Include usage examples in documentation
3. Follow the established naming conventions
4. Add appropriate unit tests
5. Update this README with new features
