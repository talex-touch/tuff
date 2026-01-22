# Everything SDK 集成 PRD

## 概述

集成 [Everything SDK](https://www.voidtools.com/support/everything/sdk/) 为 Windows 提供即时文件搜索。Everything 是 Windows 上最快的文件搜索工具，基于 NTFS 索引可实现亚毫秒级查询。

## 背景

### Windows 文件搜索现状问题

1. **搜索慢**：原生 Windows Search API 相比 macOS Spotlight 明显更慢  
2. **索引不完整**：Windows 搜索索引可能无法覆盖所有磁盘  
3. **资源占用高**：Windows 索引过程消耗大量资源  
4. **语法受限**：缺少 macOS `mdfind` 这类高级搜索语法

### Everything SDK 优势

- **瞬时返回**：全盘检索亚毫秒级结果
- **低资源**：内存占用极小（百万文件约 ~50MB）
- **高级语法**：Regex、通配符、路径过滤、文件类型过滤
- **实时更新**：基于 NTFS 日志实时同步
- **IPC 协议**：通过 Windows 消息或命名管道高效通信

## 技术架构

### 1. Everything SDK 绑定

```
apps/core-app/src/main/modules/box-tool/addon/files/everything/
├── everything-native.ts       # Native bindings via ffi-napi or N-API addon
├── everything-client.ts       # High-level client wrapper
├── everything-provider.ts     # SearchProvider implementation
├── everything-types.ts        # Type definitions
└── index.ts                   # Module exports
```

### 2. 原生绑定方案

#### 方案 A：Node.js FFI（ffi-napi）

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

#### 方案 B：原生 N-API 插件（推荐）

构建 C++ N-API 插件以获得更好的性能与类型安全：

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

### 4. SearchEngine 的 Everything Provider

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

## 实施计划

### 阶段 1：核心集成（3-4 天）

- [ ] **第 1-2 天**：原生绑定
  - [ ] 评估 ffi-napi vs N-API 插件
  - [ ] 实现基础搜索函数
  - [ ] 处理 DLL 加载与错误

- [ ] **第 3-4 天**：客户端封装
  - [ ] EverythingClient 类
  - [ ] 搜索选项支持
  - [ ] 错误处理与 fallback

### 阶段 2：Provider 集成（2 天）

- [ ] **第 5 天**：EverythingProvider
  - [ ] 实现 SearchProvider 接口
  - [ ] 结果转换为 BoxItem
  - [ ] 权重与评分策略

- [ ] **第 6 天**：SearchEngine 集成
  - [ ] Windows 上注册 provider
  - [ ] 无 Everything 时回退到原生搜索
  - [ ] 性能优化

### 阶段 3：增强特性（2-3 天）

- [ ] **第 7 天**：高级搜索
  - [ ] Regex 支持
  - [ ] 路径过滤
  - [ ] 文件类型过滤

- [ ] **第 8-9 天**：体验优化
  - [ ] Everything 状态指示
  - [ ] 设置 UI 用于配置
  - [ ] 安装引导

## 依赖

### 必需

- **Everything**：必须已安装并运行
- **Everything SDK**：从 voidtools.com 下载

### 可选

- **ffi-napi**：用于 FFI 绑定
- **node-gyp**：用于 N-API 插件编译

## 配置

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

## 错误处理

### Everything 未安装

```typescript
if (!everythingClient.isAvailable()) {
  // Show installation prompt
  showEverythingInstallGuide()
  // Fallback to Windows Search
  return windowsSearchProvider.search(query)
}
```

### Everything 服务未运行

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

## 性能预期

| 指标 | 目标 | Everything 典型值 |
|--------|--------|-------------------|
| 搜索延迟 | < 100ms | 1-10ms |
| 每秒结果数 | 1000+ | 50000+ |
| 内存占用 | < 100MB | ~50MB |
| 索引更新延迟 | < 1s | ~0.1s（NTFS） |

## 安全考虑

1. **DLL 加载**：校验 Everything64.dll 签名  
2. **路径遍历**：结果路径需净化  
3. **权限提升**：避免暴露管理员级文件  
4. **资源限制**：限制最大返回数避免 DoS  

## 测试策略

### 单元测试

- 搜索查询解析
- 结果转换
- 错误处理

### 集成测试

- Everything 服务通信
- Provider 注册
- 回退行为

### 性能测试

- 大结果集（10000+ 项）
- 并发搜索
- 负载下内存占用

## 验收标准

- [ ] Everything SDK 在 Windows 上成功加载
- [ ] 搜索结果 < 100ms 返回
- [ ] Everything 不可用时平滑回退
- [ ] 结果在 CoreBox 正确展示
- [ ] 文件打开/定位动作可用

---

**文档版本**：1.0  
**创建时间**：2025-12-11  
**作者**：Talex Touch Team
