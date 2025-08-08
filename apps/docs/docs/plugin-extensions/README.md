# Tuff Plugin Extension APIs

This directory contains documentation for advanced plugin extension APIs that allow deep integration with Tuff core functionality.

## Available Extensions

### 🔍 Search Sorting API
**Status**: 🚧 Internal Beta - Not Yet Available

Allows plugins to customize search result ranking and sorting behavior.

- **File**: [search-sorting-api.md](./search-sorting-api.md)
- **Features**:
  - Custom type weight configuration
  - Dynamic sorting rules
  - Context-aware result prioritization
  - Preset configuration management
- **Use Cases**:
  - Development tools that boost code-related results
  - Productivity plugins that prioritize task management
  - Context-aware plugins that adapt to current workflow

### 🎨 Theme Engine API
**Status**: 📋 Planned

Enables plugins to create and manage custom themes.

- **Features** (Planned):
  - Custom color schemes
  - Dynamic theme switching
  - Component styling overrides
  - Animation customization

### 🔌 Core Integration API
**Status**: 📋 Planned

Provides deep integration with Tuff core systems.

- **Features** (Planned):
  - Custom search providers
  - System event hooks
  - Window management
  - Keyboard shortcut registration

### 📊 Analytics API
**Status**: 📋 Planned

Allows plugins to access usage analytics and metrics.

- **Features** (Planned):
  - Usage pattern analysis
  - Performance metrics
  - User behavior insights
  - Custom event tracking

## Development Status

| API | Status | Availability | Documentation |
|-----|--------|--------------|---------------|
| Search Sorting | Internal Beta | Not Available | ✅ Complete |
| Theme Engine | Planned | TBD | 📝 In Progress |
| Core Integration | Planned | TBD | 📋 Planned |
| Analytics | Planned | TBD | 📋 Planned |

## Getting Started

### Prerequisites

- Tuff Core v2.0+
- Plugin Development Kit
- TypeScript knowledge

### Beta Access

Currently, all extension APIs are in internal beta or planning phase. To request beta access:

1. Contact the development team
2. Provide your plugin use case
3. Sign beta testing agreement
4. Receive beta SDK and documentation

### Basic Integration

```typescript
// Example plugin with extension API usage
import { Plugin } from '@tuff/plugin-sdk'
import { SortConfigManager } from '@tuff/core/search-sorter-config' // Beta only

export class MyAdvancedPlugin extends Plugin {
  async onActivate() {
    // Extension API usage (when available)
    if (this.hasExtensionAccess('search-sorting')) {
      this.setupCustomSorting()
    }
  }

  private setupCustomSorting() {
    // Custom sorting logic
    SortConfigManager.addDynamicRule(
      'my-plugin-boost',
      (item) => this.shouldBoostItem(item),
      15
    )
  }

  private shouldBoostItem(item: any): boolean {
    // Custom logic to determine if item should be boosted
    return false
  }
}
```

## API Design Principles

### 1. Non-Intrusive
Extension APIs are designed to enhance functionality without breaking existing behavior.

### 2. Performance First
All APIs are optimized for minimal performance impact on core search and UI operations.

### 3. Backward Compatible
APIs maintain backward compatibility across minor version updates.

### 4. Secure by Default
Extension APIs include built-in security measures and permission systems.

### 5. Developer Friendly
Clear documentation, TypeScript support, and comprehensive examples.

## Beta Testing Program

### Current Beta APIs
- **Search Sorting API**: Limited to internal testing

### How to Join Beta
1. **Application**: Submit beta application with plugin concept
2. **Review**: Development team reviews application
3. **Agreement**: Sign beta testing agreement
4. **Access**: Receive beta SDK and documentation
5. **Feedback**: Provide regular feedback and bug reports

### Beta Requirements
- Active plugin development
- Regular feedback submission
- Bug reporting and testing
- NDA compliance

## Roadmap

### Q1 2024
- [ ] Search Sorting API public release
- [ ] Theme Engine API beta
- [ ] Core Integration API planning

### Q2 2024
- [ ] Theme Engine API public release
- [ ] Core Integration API beta
- [ ] Analytics API planning

### Q3 2024
- [ ] Core Integration API public release
- [ ] Analytics API beta
- [ ] Advanced extension APIs planning

## Support

### Documentation
- API reference documentation
- Code examples and tutorials
- Best practices guides
- Migration guides

### Community
- Developer Discord channel
- GitHub discussions
- Monthly developer calls
- Beta tester forums

### Direct Support
- Email: plugin-dev@talextouch.com
- GitHub Issues: Feature requests and bugs
- Developer Portal: Documentation and resources

## Contributing

Extension API development is currently internal, but we welcome:

- Feature requests and suggestions
- Use case documentation
- Beta testing feedback
- Community plugin showcases

---

*Extension APIs are part of Tuff's commitment to providing powerful, flexible plugin development while maintaining system stability and performance.*
