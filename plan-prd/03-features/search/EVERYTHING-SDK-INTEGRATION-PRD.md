# Everything SDK Integration PRD

## Overview

Integrate [Everything SDK](https://www.voidtools.com/support/everything/sdk/) to provide instant file search on Windows. Everything is the fastest file search tool on Windows, using NTFS indexing for sub-millisecond search results.

## Background

### Current Windows File Search Issues

1. **Slow Search**: Native Windows Search API is slow compared to macOS Spotlight
2. **Incomplete Index**: Windows Search Index may not cover all drives
3. **Resource Heavy**: Windows indexing consumes significant resources
4. **Limited Syntax**: No advanced search syntax like macOS mdfind

### Everything SDK Benefits

- **Instant Results**: Sub-millisecond search across entire filesystem
- **Low Resource**: Minimal memory footprint (~50MB for millions of files)
- **Advanced Syntax**: Regex, wildcards, path filters, file type filters
- **Real-time Updates**: NTFS journal monitoring for instant updates
- **IPC Protocol**: Efficient communication via Windows messages or named pipes

## Technical Architecture

### 1. Everything SDK Binding

```
apps/core-app/src/main/modules/box-tool/addon/files/everything/
├── everything-native.ts       # Native bindings via ffi-napi or N-API addon
├── everything-client.ts       # High-level client wrapper
├── everything-provider.ts     # SearchProvider implementation
├── everything-types.ts        # Type definitions
└── index.ts                   # Module exports
```

### 2. Native Binding Options

#### Option A: Node.js FFI (ffi-napi)

```typescript
// everything-native.ts
import ffi from 'ffi-napi'
import ref from 'ref-napi'

const Everything = ffi.Library('Everything64.dll', {
  'Everything_SetSearchW': ['void', ['string']],
  'Everything_SetRequestFlags': ['void', ['uint32']],
  'Everything_SetMax': ['void', ['uint32']],
  'Everything_SetOffset': ['void', ['uint32']],
  'Everything_QueryW': ['bool', ['bool']],
  'Everything_GetNumResults': ['uint32', []],
  'Everything_GetResultFileNameW': ['string', ['uint32']],
  'Everything_GetResultPathW': ['string', ['uint32']],
  'Everything_GetResultSize': ['bool', ['uint32', 'pointer']],
  'Everything_GetResultDateModified': ['bool', ['uint32', 'pointer']],
  'Everything_GetLastError': ['uint32', []],
  'Everything_CleanUp': ['void', []],
})

export { Everything }
```

#### Option B: Native N-API Addon (Recommended)

Build a C++ N-API addon for better performance and type safety:

```cpp
// everything_addon.cpp
#include <napi.h>
#include "Everything.h"

Napi::Value Search(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::string query = info[0].As<Napi::String>().Utf8Value();
  
  Everything_SetSearchW(query.c_str());
  Everything_SetRequestFlags(EVERYTHING_REQUEST_FILE_NAME | 
                              EVERYTHING_REQUEST_PATH |
                              EVERYTHING_REQUEST_SIZE |
                              EVERYTHING_REQUEST_DATE_MODIFIED);
  Everything_QueryW(TRUE);
  
  // Build result array...
  return results;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("search", Napi::Function::New(env, Search));
  return exports;
}

NODE_API_MODULE(everything, Init)
```

### 3. Everything Client API

```typescript
// everything-client.ts

export interface EverythingSearchOptions {
  /** Maximum results to return */
  maxResults?: number
  /** Result offset for pagination */
  offset?: number
  /** Enable regex search */
  regex?: boolean
  /** Match case */
  matchCase?: boolean
  /** Match whole word */
  matchWholeWord?: boolean
  /** Match path */
  matchPath?: boolean
  /** Include file size */
  requestSize?: boolean
  /** Include modification date */
  requestDateModified?: boolean
  /** Sort order */
  sort?: EverythingSortOrder
}

export enum EverythingSortOrder {
  NAME_ASCENDING = 1,
  NAME_DESCENDING = 2,
  PATH_ASCENDING = 3,
  PATH_DESCENDING = 4,
  SIZE_ASCENDING = 5,
  SIZE_DESCENDING = 6,
  DATE_MODIFIED_ASCENDING = 11,
  DATE_MODIFIED_DESCENDING = 12,
}

export interface EverythingResult {
  filename: string
  path: string
  fullPath: string
  size?: number
  dateModified?: Date
  isFolder?: boolean
}

export class EverythingClient {
  private available: boolean = false
  private nativeModule: any = null

  /**
   * Initialize Everything SDK
   */
  async initialize(): Promise<boolean> {
    if (process.platform !== 'win32') {
      console.log('[Everything] Not available on this platform')
      return false
    }

    try {
      // Check if Everything is running
      this.nativeModule = await this.loadNativeModule()
      this.available = this.nativeModule !== null
      
      if (this.available) {
        console.log('[Everything] SDK initialized successfully')
      } else {
        console.log('[Everything] Service not running')
      }
      
      return this.available
    } catch (error) {
      console.error('[Everything] Initialization failed:', error)
      return false
    }
  }

  /**
   * Search files using Everything
   */
  async search(
    query: string,
    options: EverythingSearchOptions = {}
  ): Promise<EverythingResult[]> {
    if (!this.available) {
      throw new Error('Everything SDK not available')
    }

    const {
      maxResults = 100,
      offset = 0,
      regex = false,
      matchCase = false,
      matchPath = false,
      sort = EverythingSortOrder.DATE_MODIFIED_DESCENDING
    } = options

    return this.nativeModule.search(query, {
      maxResults,
      offset,
      regex,
      matchCase,
      matchPath,
      sort
    })
  }

  /**
   * Check if Everything service is running
   */
  isAvailable(): boolean {
    return this.available
  }

  /**
   * Get Everything version
   */
  getVersion(): string | null {
    if (!this.available) return null
    return this.nativeModule.getVersion()
  }

  private async loadNativeModule(): Promise<any> {
    try {
      // Try to load native addon
      const addon = require('./everything.node')
      return addon
    } catch {
      // Fallback to ffi-napi
      return this.loadFFIModule()
    }
  }

  private loadFFIModule(): any {
    // FFI implementation
    return null
  }
}

export const everythingClient = new EverythingClient()
```

### 4. Everything Provider for SearchEngine

```typescript
// everything-provider.ts

import type { BoxItem, SearchProvider, SearchProviderResult } from '@talex-touch/utils'
import { everythingClient, type EverythingResult } from './everything-client'

export class EverythingProvider implements SearchProvider {
  id = 'tuff.provider.everything'
  name = 'Everything'
  icon = 'ri:search-eye-line'
  
  private maxResults = 50
  private enabled = false

  async initialize(): Promise<void> {
    if (process.platform !== 'win32') {
      console.log('[EverythingProvider] Windows only')
      return
    }

    this.enabled = await everythingClient.initialize()
    
    if (this.enabled) {
      console.log('[EverythingProvider] Ready')
    }
  }

  async onSearch(query: string): Promise<SearchProviderResult> {
    if (!this.enabled || !query.trim()) {
      return { items: [] }
    }

    try {
      const results = await everythingClient.search(query, {
        maxResults: this.maxResults,
        matchPath: query.includes('/') || query.includes('\\')
      })

      const items = results.map(r => this.resultToBoxItem(r))

      return { items }
    } catch (error) {
      console.error('[EverythingProvider] Search error:', error)
      return { items: [] }
    }
  }

  private resultToBoxItem(result: EverythingResult): BoxItem {
    const isFolder = result.isFolder ?? !result.filename.includes('.')
    
    return {
      id: `everything:${result.fullPath}`,
      source: 'everything',
      type: isFolder ? 'folder' : 'file',
      title: result.filename,
      subtitle: result.path,
      payload: {
        type: 'file',
        data: result.fullPath
      },
      meta: {
        path: result.fullPath,
        size: result.size,
        modifiedAt: result.dateModified?.getTime()
      }
    }
  }

  isEnabled(): boolean {
    return this.enabled
  }
}
```

## Implementation Plan

### Phase 1: Core Integration (3-4 days)

- [ ] **Day 1-2**: Native binding
  - [ ] Evaluate ffi-napi vs N-API addon
  - [ ] Implement basic search function
  - [ ] Handle DLL loading and errors

- [ ] **Day 3-4**: Client wrapper
  - [ ] EverythingClient class
  - [ ] Search options support
  - [ ] Error handling and fallback

### Phase 2: Provider Integration (2 days)

- [ ] **Day 5**: EverythingProvider
  - [ ] Implement SearchProvider interface
  - [ ] Result conversion to BoxItem
  - [ ] Priority and scoring

- [ ] **Day 6**: SearchEngine integration
  - [ ] Register provider on Windows
  - [ ] Fallback to native search
  - [ ] Performance optimization

### Phase 3: Advanced Features (2-3 days)

- [ ] **Day 7**: Advanced search
  - [ ] Regex support
  - [ ] Path filters
  - [ ] File type filters

- [ ] **Day 8-9**: UX enhancements
  - [ ] Everything status indicator
  - [ ] Settings UI for configuration
  - [ ] Installation guide

## Dependencies

### Required

- **Everything**: Must be installed and running
- **Everything SDK**: Download from voidtools.com

### Optional

- **ffi-napi**: For FFI-based binding
- **node-gyp**: For N-API addon compilation

## Configuration

```typescript
interface EverythingConfig {
  /** Enable Everything integration */
  enabled: boolean
  /** Max results per search */
  maxResults: number
  /** Search timeout in ms */
  timeout: number
  /** Fallback to native search if Everything unavailable */
  fallbackEnabled: boolean
  /** Include hidden files */
  includeHidden: boolean
  /** Excluded paths (glob patterns) */
  excludePaths: string[]
}
```

## Error Handling

### Everything Not Installed

```typescript
if (!everythingClient.isAvailable()) {
  // Show installation prompt
  showEverythingInstallGuide()
  // Fallback to Windows Search
  return windowsSearchProvider.search(query)
}
```

### Everything Service Not Running

```typescript
try {
  await everythingClient.search(query)
} catch (error) {
  if (error.code === 'SERVICE_NOT_RUNNING') {
    // Try to start Everything
    await startEverythingService()
    // Retry
    return everythingClient.search(query)
  }
}
```

## Performance Expectations

| Metric | Target | Everything Typical |
|--------|--------|-------------------|
| Search latency | < 100ms | 1-10ms |
| Results per second | 1000+ | 50000+ |
| Memory usage | < 100MB | ~50MB |
| Index update delay | < 1s | ~0.1s (NTFS) |

## Security Considerations

1. **DLL Loading**: Verify Everything64.dll signature
2. **Path Traversal**: Sanitize paths in results
3. **Privilege Escalation**: Don't expose admin-only files
4. **Resource Limits**: Limit max results to prevent DoS

## Testing Strategy

### Unit Tests

- Search query parsing
- Result conversion
- Error handling

### Integration Tests

- Everything service communication
- Provider registration
- Fallback behavior

### Performance Tests

- Large result sets (10000+ items)
- Concurrent searches
- Memory usage under load

## Acceptance Criteria

- [ ] Everything SDK loads successfully on Windows
- [ ] Search returns results in < 100ms
- [ ] Graceful fallback when Everything unavailable
- [ ] Results correctly displayed in CoreBox
- [ ] File open/reveal actions work correctly

---

**Document Version**: 1.0
**Created**: 2025-12-11
**Author**: Talex Touch Team
