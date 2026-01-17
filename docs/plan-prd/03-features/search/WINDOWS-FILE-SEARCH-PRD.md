# Windows 文件搜索 PRD

## 背景与问题

### 当前问题

1. **Windows 权限导致闪退**
   - `FileProvider` 启动时递归扫描用户目录（documents、downloads、desktop 等）
   - Windows 某些目录存在权限限制，导致 `fs.readdir` / `fs.stat` 失败
   - 错误处理不完善，触发应用闪退

2. **问题代码位置**
   - `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
   - `onLoad()` → `_initialize()` → `scanDirectory()` 递归扫描

3. **影响范围**
   - Windows 用户首次启动或索引重建时闪退
   - 无法正常使用应用

## 解决方案

### 实现: 禁用 Windows 文件索引

**目标**: 阻止 Windows 上的文件扫描，避免闪退

#### 修改点

1. **`onLoad()` - 跳过初始化**
```typescript
async onLoad(context: ProviderContext): Promise<void> {
  if (process.platform === 'win32') {
    this.logInfo('File indexing disabled on Windows')
    // 只初始化必要的引用，不启动扫描
    this.dbUtils = createDbUtils(context.databaseManager.getDb())
    this.searchIndex = context.searchIndex
    this.touchApp = context.touchApp
    this.initializationContext = context
    this.registerOpenersChannel(context)
    this.registerIndexingChannels(context)
    return
  }
  // macOS/Linux 原有逻辑...
}
```

2. **`onSearch()` - 返回空结果**
```typescript
async onSearch(query: TuffQuery, _signal: AbortSignal): Promise<TuffSearchResult> {
  if (process.platform === 'win32') {
    return new TuffSearchResultBuilder(query).build()
  }
  // 原有搜索逻辑...
}
```

#### 任务清单

**FileProvider:**
- [x] `onLoad()` 添加 Windows 平台检测，跳过 `_initialize()`
- [x] `onLoad()` 跳过 `ensureFileSystemWatchers()` 文件监听
- [x] `onSearch()` Windows 上直接返回空结果
- [x] 保留 channel 注册（openers、indexing）以避免其他模块报错

**AppProvider:**
- [x] `_subscribeToFSEvents()` Windows 上跳过事件订阅
- [x] `_registerWatchPaths()` Windows 上跳过目录监视

## 相关文件

- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `packages/utils/common/file-scan-utils.ts`
- `packages/utils/common/file-scan-constants.ts`
