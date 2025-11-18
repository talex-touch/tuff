# Storage 同步机制分析报告

## 执行概要

本报告详细分析了项目中两个 Storage 实现之间的数据同步机制，发现**当前同步机制已经完整实现**，包括双向通知和事件订阅系统。两个 Storage 实现使用相同的底层数据源（文件系统），并通过 IPC 消息通道和事件总线实现数据同步。

---

## 1. Storage 实现概览

### 1.1 index.js Storage（主进程 Sandbox 环境）

**位置**: `apps/core-app/src/main/modules/plugin/plugin.ts` (行 514-545)

**用途**: 为插件的 `index.js` 文件提供存储 API，运行在主进程的 Node.js 环境中

**特点**:
- ✅ 必定加载（插件启用时即初始化）
- ✅ 直接文件系统访问
- ✅ 同步和异步操作均支持

#### 1.1.1 数据源
```typescript
// 存储路径
<userDataPath>/modules/plugins/<pluginName>/data/config/
```

#### 1.1.2 初始化时机
- 插件 `enable()` 时通过 `loadPluginFeatureContext()` 加载 index.js
- 在 `getFeatureUtil()` 中注入 storage API
- 插件 lifecycle 的 `onInit()` 被调用前即可使用

#### 1.1.3 对外接口
```typescript
const storage = {
  // 获取文件内容（同步）
  getFile: (fileName: string) => object,
  
  // 保存文件内容（同步）
  setFile: (fileName: string, content: object) => { success: boolean, error?: string },
  
  // 删除文件（同步）
  deleteFile: (fileName: string) => { success: boolean, error?: string },
  
  // 列出所有文件（同步）
  listFiles: () => string[],
  
  // 监听变化（返回取消订阅函数）
  onDidChange: (fileName: string, callback: (newConfig: any) => void) => () => void
}
```

#### 1.1.4 底层实现
- **getFile**: 调用 `plugin.getPluginFile(fileName)` 直接读取文件系统
- **setFile**: 调用 `plugin.savePluginFile(fileName, content)`，保存后触发 `broadcastStorageUpdate(fileName)`
- **deleteFile**: 调用 `plugin.deletePluginFile(fileName)`，删除后触发 `broadcastStorageUpdate(fileName)`
- **onDidChange**: 监听 `TalexEvents.PLUGIN_STORAGE_UPDATED` 事件总线

---

### 1.2 WebView Storage（渲染进程/Vue 环境）

**位置**: `packages/utils/plugin/sdk/storage.ts`

**用途**: 为插件的 WebView UI 提供存储 API，运行在渲染进程的 Vue 环境中

**特点**:
- ⚠️ 可选加载（仅当插件使用 webview 交互时）
- 📡 通过 IPC 与主进程通信
- ✅ 完全异步操作
- ✅ 提供更多高级功能（统计、树形结构等）

#### 1.2.1 数据源
```typescript
// 与 index.js Storage 共享相同数据源
<userDataPath>/modules/plugins/<pluginName>/data/config/
```

#### 1.2.2 初始化时机
- 插件 webview 加载时通过 `<webview>` 标签注入
- 通过 `window.$channel` 和 `window.$plugin` 全局对象访问
- 在 Vue 组件中调用 `usePluginStorage()` 获取实例

#### 1.2.3 对外接口
```typescript
const storage = usePluginStorage()

// 基础操作（全部异步）
await storage.getFile(fileName: string) => Promise<any>
await storage.setFile(fileName: string, content: any) => Promise<{ success: boolean, error?: string }>
await storage.deleteFile(fileName: string) => Promise<{ success: boolean, error?: string }>
await storage.listFiles() => Promise<string[]>

// 高级功能
await storage.getStats() => Promise<StorageStats>
await storage.getTree() => Promise<StorageTreeNode[]>
await storage.getFileDetails(fileName: string) => Promise<FileDetails | null>
await storage.clearAll() => Promise<{ success: boolean, error?: string }>
await storage.openFolder() => Promise<void>

// 监听变化
const unsubscribe = storage.onDidChange(fileName: string, callback: (data) => void)
```

#### 1.2.4 底层实现
所有操作通过 IPC 通道发送到主进程：

| 前端方法 | IPC 通道名称 | 通道类型 |
|---------|------------|---------|
| getFile | `plugin:storage:get-file` | PLUGIN |
| setFile | `plugin:storage:set-file` | PLUGIN |
| deleteFile | `plugin:storage:delete-file` | PLUGIN |
| listFiles | `plugin:storage:list-files` | PLUGIN |
| getStats | `plugin:storage:get-stats` | PLUGIN/MAIN |
| getTree | `plugin:storage:get-tree` | PLUGIN/MAIN |
| getFileDetails | `plugin:storage:get-file-details` | PLUGIN/MAIN |
| clearAll | `plugin:storage:clear` | PLUGIN/MAIN |
| openFolder | `plugin:storage:open-folder` | PLUGIN/MAIN |

---

## 2. 通信机制分析

### 2.1 IPC 消息通道

**注册位置**: `apps/core-app/src/main/modules/plugin/plugin-module.ts` (行 1202-1560)

#### 2.1.1 通道类型说明
- **ChannelType.PLUGIN**: 插件专用通道，自动识别调用者插件名称
- **ChannelType.MAIN**: 主通道，需要显式传递 `pluginName` 参数

#### 2.1.2 核心通道处理流程

```typescript
// WebView → Main Process 流程
touchChannel.regChannel(
  ChannelType.PLUGIN,
  'plugin:storage:set-file',
  async ({ data, reply, plugin: pluginName }) => {
    const { fileName, content } = data
    const plugin = manager.getPluginByName(pluginName)
    
    // 1. 保存文件到磁盘
    const result = plugin.savePluginFile(fileName, content)
    
    // 2. 触发广播更新（内部调用）
    // plugin.savePluginFile 内部会调用 broadcastStorageUpdate(fileName)
    
    return reply(DataCode.SUCCESS, result)
  }
)
```

### 2.2 事件订阅/发布系统

#### 2.2.1 广播机制实现

**位置**: `apps/core-app/src/main/modules/plugin/plugin.ts` (行 1330-1343)

```typescript
private broadcastStorageUpdate(fileName?: string): void {
  // 1. 发送 IPC 消息到所有窗口（包括主窗口和所有插件窗口）
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    $app.channel?.sendTo(win, ChannelType.MAIN, 'plugin:storage:update', {
      name: this.name,           // 插件名称
      fileName: fileName         // 文件名（可选，undefined 表示所有文件）
    })
  }

  // 2. 发送事件总线事件（用于主进程内部监听）
  touchEventBus.emit(
    TalexEvents.PLUGIN_STORAGE_UPDATED,
    new PluginStorageUpdatedEvent(this.name, fileName)
  )
}
```

#### 2.2.2 index.js 监听实现

**位置**: `apps/core-app/src/main/modules/plugin/plugin.ts` (行 527-544)

```typescript
onDidChange: (fileName: string, callback: (newConfig: any) => void) => {
  // 注册事件总线监听器
  const handler = (event: ITouchEvent<TalexEvents>) => {
    const storageEvent = event as PluginStorageUpdatedEvent
    
    // 匹配插件名和文件名
    if (
      storageEvent.pluginName === pluginName &&
      (storageEvent.fileName === fileName || storageEvent.fileName === undefined)
    ) {
      // 重新读取文件并调用回调
      const config = this.getPluginFile(fileName)
      callback(config)
    }
  }

  touchEventBus.on(TalexEvents.PLUGIN_STORAGE_UPDATED, handler)

  // 返回取消订阅函数
  return () => {
    touchEventBus.off(TalexEvents.PLUGIN_STORAGE_UPDATED, handler)
  }
}
```

#### 2.2.3 WebView 监听实现

**位置**: `packages/utils/plugin/sdk/storage.ts` (行 104-117)

```typescript
onDidChange: (fileName: string, callback: (newConfig: any) => void) => {
  // 注册 IPC 通道监听器
  const listener = (data: { name: string, fileName?: string }) => {
    // 匹配插件名和文件名
    if (data.name === pluginName &&
        (data.fileName === fileName || data.fileName === undefined)) {
      callback(data)
    }
  }

  channel.regChannel('plugin:storage:update', listener)

  // 返回取消订阅函数
  return () => {
    channel.unRegChannel('plugin:storage:update', listener)
  }
}
```

### 2.3 同步流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                         数据更新流程                              │
└─────────────────────────────────────────────────────────────────┘

场景 1: index.js 更新数据
─────────────────────────
index.js Storage
    │
    ├─> storage.setFile(fileName, content)
    │
    ├─> plugin.savePluginFile(fileName, content)
    │   │
    │   ├─> fse.writeFileSync(path, content)  // 写入磁盘
    │   │
    │   └─> broadcastStorageUpdate(fileName)
    │       │
    │       ├─> BrowserWindow.getAllWindows().forEach(win =>
    │       │       sendTo(win, 'plugin:storage:update', { name, fileName })
    │       │   )
    │       │   └──> 通知所有 WebView 窗口
    │       │
    │       └─> touchEventBus.emit(PLUGIN_STORAGE_UPDATED, event)
    │           └──> 通知其他 index.js 监听器
    │
    └─> ✅ 同步完成


场景 2: WebView 更新数据
─────────────────────────
WebView Storage
    │
    ├─> await storage.setFile(fileName, content)
    │
    ├─> channel.send('plugin:storage:set-file', { fileName, content })
    │   │
    │   └─> [IPC 传输到主进程]
    │
    ├─> TouchChannel.regChannel('plugin:storage:set-file', handler)
    │   │
    │   ├─> plugin.savePluginFile(fileName, content)
    │   │   │
    │   │   ├─> fse.writeFileSync(path, content)  // 写入磁盘
    │   │   │
    │   │   └─> broadcastStorageUpdate(fileName)
    │   │       │
    │   │       ├─> BrowserWindow.getAllWindows().forEach(win =>
    │   │       │       sendTo(win, 'plugin:storage:update', { name, fileName })
    │   │       │   )
    │   │       │   └──> 通知所有 WebView 窗口（包括当前窗口）
    │   │       │
    │   │       └─> touchEventBus.emit(PLUGIN_STORAGE_UPDATED, event)
    │   │           └──> 通知 index.js 监听器
    │   │
    │   └─> reply(DataCode.SUCCESS, result)
    │
    └─> ✅ 同步完成


监听流程
────────
index.js 监听:
    storage.onDidChange(fileName, callback)
    └─> touchEventBus.on(PLUGIN_STORAGE_UPDATED, handler)
        └─> 收到更新 → getPluginFile(fileName) → callback(newConfig)

WebView 监听:
    storage.onDidChange(fileName, callback)
    └─> channel.regChannel('plugin:storage:update', listener)
        └─> 收到更新 → callback(data)
```

---

## 3. 数据源共享验证

### 3.1 存储路径分析

两个 Storage 实现使用**完全相同**的底层存储路径：

```typescript
// plugin.ts 中定义
private getDataPath(): string {
  const userDataPath = $app.rootPath
  return path.join(userDataPath, 'modules', 'plugins', this.name, 'data')
}

getConfigPath(): string {
  return path.join(this.getDataPath(), 'config')
}
```

**实际路径示例**:
```
<用户数据目录>/modules/plugins/<插件名>/data/config/<文件名>.json
```

### 3.2 文件操作验证

**index.js Storage 读取**:
```typescript
getPluginFile(fileName: string): object {
  const configPath = this.getConfigPath()
  const p = path.resolve(configPath, fileName)
  const file = fse.existsSync(p) ? JSON.parse(fse.readFileSync(p, 'utf-8')) : {}
  return file
}
```

**WebView Storage 读取**（通过 IPC）:
```typescript
touchChannel.regChannel(ChannelType.PLUGIN, 'plugin:storage:get-file', 
  async ({ data, reply, plugin: pluginName }) => {
    const plugin = manager.getPluginByName(pluginName)
    const content = plugin.getPluginFile(fileName)  // 调用相同方法
    return reply(DataCode.SUCCESS, content)
  }
)
```

**结论**: ✅ 两者读取相同的文件，数据源完全共享

---

## 4. 问题诊断

### 4.1 是否存在同步问题？

经过详细代码分析，**当前实现的同步机制是完整且正确的**：

✅ **通知机制完整**
- index.js 更新 → 广播到所有窗口 + 事件总线
- WebView 更新 → 广播到所有窗口 + 事件总线

✅ **事件订阅完整**
- index.js 可以通过 `onDidChange` 监听 → 订阅事件总线
- WebView 可以通过 `onDidChange` 监听 → 订阅 IPC 通道

✅ **数据库连接共享**
- 两者使用相同文件系统路径
- 没有数据库连接隔离问题

✅ **初始化顺序正确**
- index.js 先加载（插件 enable 时）
- WebView 后加载（feature 触发时）
- 两者可以独立工作，互不依赖

### 4.2 可能的问题场景

虽然同步机制完整，但在某些边缘情况下可能出现问题：

#### 场景 A: 未使用 onDidChange 监听

**问题**: 如果插件代码没有主动调用 `onDidChange` 注册监听器，则不会收到更新通知

**示例**:
```javascript
// ❌ 错误做法：缓存数据但不监听更新
const myData = storage.getFile('data.json')
// ... 使用 myData，但 myData 永远不会更新

// ✅ 正确做法：监听更新
let myData = storage.getFile('data.json')
storage.onDidChange('data.json', (newData) => {
  myData = newData
  // 重新处理数据
})
```

#### 场景 B: 文件系统延迟

**问题**: 在高并发场景下，文件写入和读取之间可能存在极短的延迟

**当前保护措施**:
```typescript
// plugin.ts (行 1016)
fse.writeFileSync(p, configData)  // 同步写入，确保立即完成

// plugin-module.ts 中的 IPC 处理是异步的
async ({ data, reply, plugin: pluginName }) => {
  const result = plugin.savePluginFile(fileName, content)  // 同步写入
  return reply(DataCode.SUCCESS, result)  // 写入完成后才回复
}
```

**结论**: ✅ 使用同步写入，问题风险极低

#### 场景 C: 多窗口并发写入

**问题**: 如果多个 WebView 窗口同时写入同一文件，可能导致数据竞争

**当前状态**: ⚠️ 无并发控制机制

**风险评估**: 
- 中等风险：取决于插件使用场景
- 大多数插件只有一个 UI 窗口，风险较低
- 需要文件锁或队列机制来完全避免

#### 场景 D: onDidChange 在更新前缓存数据

**问题**: 如果 `onDidChange` 回调中调用 `getFile` 时文件还未写入完成

**当前保护**:
```typescript
// broadcastStorageUpdate 在文件写入后立即调用
fse.writeFileSync(p, configData)  // 同步写入
this.broadcastStorageUpdate(fileName)  // 写入完成后才广播
```

**结论**: ✅ 广播前文件已写入完成，无竞态问题

---

## 5. 改进方案建议

虽然当前同步机制已经完整，但仍可进一步优化：

### 5.1 短期优化（低成本）

#### 5.1.1 添加并发写入保护

```typescript
// 在 plugin.ts 中添加文件锁映射
private fileLocks: Map<string, Promise<void>> = new Map()

async savePluginFile(fileName: string, content: object): Promise<{ success: boolean; error?: string }> {
  // 等待前一个写入操作完成
  const existingLock = this.fileLocks.get(fileName)
  if (existingLock) {
    await existingLock
  }

  // 创建新的锁
  const lock = (async () => {
    const configPath = this.getConfigPath()
    const configData = JSON.stringify(content)

    if (Buffer.byteLength(configData, 'utf-8') > this.PLUGIN_CONFIG_MAX_SIZE) {
      throw new Error(`File size exceeds limit`)
    }

    const p = path.join(configPath, fileName)
    fse.ensureDirSync(configPath)
    fse.writeFileSync(p, configData)

    this.broadcastStorageUpdate(fileName)
  })()

  this.fileLocks.set(fileName, lock)

  try {
    await lock
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  } finally {
    this.fileLocks.delete(fileName)
  }
}
```

#### 5.1.2 增强错误处理和日志

```typescript
private broadcastStorageUpdate(fileName?: string): void {
  const updateInfo = {
    plugin: this.name,
    fileName: fileName || 'all',
    timestamp: Date.now()
  }

  this.logger.debug('Broadcasting storage update', updateInfo)

  try {
    const windows = BrowserWindow.getAllWindows()
    let successCount = 0

    for (const win of windows) {
      try {
        if (!win.isDestroyed()) {
          $app.channel?.sendTo(win, ChannelType.MAIN, 'plugin:storage:update', {
            name: this.name,
            fileName: fileName
          })
          successCount++
        }
      } catch (error) {
        this.logger.warn('Failed to send storage update to window', { 
          windowId: win.id, 
          error 
        })
      }
    }

    this.logger.debug(`Storage update sent to ${successCount}/${windows.length} windows`)

    touchEventBus.emit(
      TalexEvents.PLUGIN_STORAGE_UPDATED,
      new PluginStorageUpdatedEvent(this.name, fileName)
    )
  } catch (error) {
    this.logger.error('Failed to broadcast storage update', { error })
  }
}
```

#### 5.1.3 添加调试工具

```typescript
// 在 storage API 中添加调试方法
const storage = {
  // ... 现有方法 ...
  
  // 调试：获取当前监听器数量
  getListenerCount: (fileName: string) => {
    const listeners = touchEventBus.map.get(TalexEvents.PLUGIN_STORAGE_UPDATED)
    return listeners ? listeners.size : 0
  },
  
  // 调试：手动触发重新加载
  forceReload: (fileName: string) => {
    const config = this.getPluginFile(fileName)
    touchEventBus.emit(
      TalexEvents.PLUGIN_STORAGE_UPDATED,
      new PluginStorageUpdatedEvent(this.name, fileName)
    )
    return config
  }
}
```

### 5.2 中期优化（中等成本）

#### 5.2.1 实现文件监视器

```typescript
// 使用 chokidar 监视文件系统变化
import chokidar from 'chokidar'

class PluginStorageWatcher {
  private watcher: FSWatcher | null = null
  
  watch(plugin: TouchPlugin): void {
    const configPath = plugin.getConfigPath()
    
    this.watcher = chokidar.watch(configPath, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    })
    
    this.watcher.on('change', (filePath) => {
      const fileName = path.basename(filePath)
      plugin.broadcastStorageUpdate(fileName)
    })
  }
  
  unwatch(): void {
    this.watcher?.close()
  }
}
```

**优势**: 可以检测外部程序修改文件的情况

#### 5.2.2 添加版本控制

```typescript
interface StorageMetadata {
  version: number
  lastModified: number
  modifiedBy: 'index' | 'webview'
}

// 在每个文件旁边保存 .meta.json
private saveWithMetadata(fileName: string, content: object, source: 'index' | 'webview'): void {
  const metadata: StorageMetadata = {
    version: this.getFileVersion(fileName) + 1,
    lastModified: Date.now(),
    modifiedBy: source
  }
  
  // 保存数据文件
  fse.writeFileSync(path.join(configPath, fileName), JSON.stringify(content))
  
  // 保存元数据
  fse.writeFileSync(
    path.join(configPath, `${fileName}.meta.json`),
    JSON.stringify(metadata)
  )
  
  this.broadcastStorageUpdate(fileName)
}
```

### 5.3 长期优化（高成本）

#### 5.3.1 迁移到数据库存储

```typescript
// 使用 Drizzle ORM 统一存储
export const pluginStorage = sqliteTable('plugin_storage', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pluginName: text('plugin_name').notNull(),
  fileName: text('file_name').notNull(),
  content: text('content').notNull(),
  version: integer('version').default(1),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
  updatedBy: text('updated_by')  // 'index' | 'webview'
})

// 优势：
// - 事务支持，避免并发问题
// - 更好的性能（索引、查询优化）
// - 版本历史记录
// - 更容易实现备份和恢复
```

#### 5.3.2 实现 CRDTs（冲突无关复制数据类型）

```typescript
// 用于多客户端协同编辑
import { Y } from 'yjs'

class CollaborativeStorage {
  private ydoc: Y.Doc
  
  constructor(pluginName: string) {
    this.ydoc = new Y.Doc()
    
    // 监听变化
    this.ydoc.on('update', (update: Uint8Array) => {
      this.broadcastUpdate(update)
    })
  }
  
  // 自动解决冲突的数据结构
  getMap(key: string): Y.Map<any> {
    return this.ydoc.getMap(key)
  }
}
```

---

## 6. 最佳实践建议

### 6.1 插件开发者指南

#### ✅ 推荐做法

```javascript
// 1. 始终使用 onDidChange 监听更新
const unsubscribe = storage.onDidChange('settings.json', (newSettings) => {
  console.log('Settings updated:', newSettings)
  // 重新应用配置
  applySettings(newSettings)
})

// 2. 在插件禁用时取消订阅
export function onDestroy() {
  unsubscribe()
}

// 3. 使用专用文件名避免冲突
storage.setFile('myFeature-config.json', data)  // ✅ 好
storage.setFile('config.json', data)            // ⚠️ 可能与其他功能冲突

// 4. 处理并发更新
let isUpdating = false
async function updateSettings(newData) {
  if (isUpdating) {
    console.warn('Update already in progress')
    return
  }
  
  isUpdating = true
  try {
    await storage.setFile('settings.json', newData)
  } finally {
    isUpdating = false
  }
}
```

#### ❌ 避免的做法

```javascript
// 1. 不要缓存数据而不监听更新
const cachedData = storage.getFile('data.json')  // ❌ 永远不会更新

// 2. 不要在循环中快速写入同一文件
for (let i = 0; i < 100; i++) {
  storage.setFile('counter.json', { count: i })  // ❌ 可能丢失更新
}

// 3. 不要假设写入立即可见
storage.setFile('data.json', { value: 1 })
const data = storage.getFile('data.json')  // ⚠️ 可能还是旧值（虽然当前实现是同步的）
```

### 6.2 测试同步机制

```javascript
// 测试脚本示例
async function testStorageSync() {
  console.log('=== Storage Sync Test ===')
  
  // 1. 测试 index.js → WebView 同步
  console.log('Test 1: index.js writes, WebView reads')
  storage.setFile('test.json', { source: 'index', timestamp: Date.now() })
  
  // 等待广播
  await new Promise(resolve => setTimeout(resolve, 100))
  
  // 在 WebView 中应该能看到更新
  
  // 2. 测试监听器
  console.log('Test 2: onDidChange listener')
  let receivedUpdate = false
  const unsubscribe = storage.onDidChange('test.json', (newData) => {
    console.log('Received update:', newData)
    receivedUpdate = true
  })
  
  storage.setFile('test.json', { source: 'index', timestamp: Date.now() })
  
  await new Promise(resolve => setTimeout(resolve, 100))
  console.log('Listener triggered:', receivedUpdate)
  
  unsubscribe()
  
  // 3. 测试并发写入（需要在两个窗口中运行）
  console.log('Test 3: Concurrent writes')
  // ... 并发测试逻辑
  
  console.log('=== Test Complete ===')
}
```

---

## 7. 结论

### 7.1 问题根本原因

**核心发现**: 当前代码中**不存在结构性的同步问题**。同步机制已经完整实现：

1. ✅ 数据源共享（相同文件系统路径）
2. ✅ 双向通知机制（IPC + 事件总线）
3. ✅ 完整的事件订阅系统
4. ✅ 正确的初始化顺序

如果在实际使用中遇到"一方更新，另一方收不到"的问题，最可能的原因是：

1. **插件代码未调用 `onDidChange`** 注册监听器
2. **监听器注册时机不当**（例如在数据更新之后才注册）
3. **文件名不匹配**（监听 'config.json' 但更新的是 'settings.json'）
4. **监听器被错误取消订阅**
5. **窗口已销毁**但仍在尝试接收更新

### 7.2 建议优先级

#### 🔴 高优先级（立即执行）
1. **检查插件代码** - 确认是否正确使用 `onDidChange`
2. **添加调试日志** - 在 `broadcastStorageUpdate` 中添加详细日志
3. **编写测试用例** - 验证实际同步是否正常工作

#### 🟡 中优先级（规划执行）
1. **添加并发控制** - 防止多窗口同时写入
2. **增强错误处理** - 更好的错误提示和恢复机制
3. **文档完善** - 为插件开发者提供清晰的存储使用指南

#### 🟢 低优先级（未来考虑）
1. **迁移到数据库** - 如果需要更强的一致性保证
2. **实现文件监视器** - 检测外部修改
3. **版本控制系统** - 历史记录和回滚功能

### 7.3 监控指标

建议在生产环境中监控以下指标：

```typescript
// 添加到 plugin.ts
private storageMetrics = {
  updateCount: 0,           // 更新次数
  broadcastFailures: 0,      // 广播失败次数
  listenerCount: 0,          // 当前监听器数量
  lastUpdateTimestamp: 0,    // 最后更新时间
  averageBroadcastTime: 0    // 平均广播耗时
}
```

---

## 8. 附录

### 8.1 关键文件位置汇总

| 组件 | 文件路径 | 关键代码行 |
|------|---------|----------|
| index.js Storage API | `apps/core-app/src/main/modules/plugin/plugin.ts` | 514-545 |
| WebView Storage API | `packages/utils/plugin/sdk/storage.ts` | 全文件 |
| IPC 通道注册 | `apps/core-app/src/main/modules/plugin/plugin-module.ts` | 1202-1560 |
| 广播机制 | `apps/core-app/src/main/modules/plugin/plugin.ts` | 1330-1343 |
| 文件操作实现 | `apps/core-app/src/main/modules/plugin/plugin.ts` | 985-1325 |
| 事件定义 | `apps/core-app/src/main/core/eventbus/touch-event.ts` | 327-336 |

### 8.2 相关 IPC 通道汇总

**Plugin Storage 相关通道**:
- `plugin:storage:get-file` - 获取文件
- `plugin:storage:set-file` - 保存文件
- `plugin:storage:delete-file` - 删除文件
- `plugin:storage:list-files` - 列出文件
- `plugin:storage:get-stats` - 获取统计信息
- `plugin:storage:get-tree` - 获取目录树
- `plugin:storage:get-file-details` - 获取文件详情
- `plugin:storage:clear` - 清空存储
- `plugin:storage:open-folder` - 打开文件夹
- `plugin:storage:update` - 更新通知（广播）

### 8.3 事件总线事件

```typescript
enum TalexEvents {
  PLUGIN_STORAGE_UPDATED = 'plugin/storage-updated'
}

class PluginStorageUpdatedEvent implements ITouchEvent<TalexEvents> {
  name: TalexEvents = TalexEvents.PLUGIN_STORAGE_UPDATED
  pluginName: string      // 触发更新的插件名称
  fileName?: string       // 更新的文件名（undefined 表示所有文件）
}
```

### 8.4 数据流向图

```
┌──────────────────────────────────────────────────────────────────┐
│                      Storage 数据流向                               │
└──────────────────────────────────────────────────────────────────┘

数据层:
    ┌─────────────────────────────────────────────────────┐
    │  文件系统                                            │
    │  <userDataPath>/modules/plugins/<name>/data/config/ │
    └─────────────────────────────────────────────────────┘
                          ▲           ▲
                          │           │
                    [同步读写]    [同步读写]
                          │           │
    ┌─────────────────────┴───────────┴─────────────────┐
    │           TouchPlugin 文件操作方法                  │
    │  - getPluginFile(fileName)                        │
    │  - savePluginFile(fileName, content)              │
    │  - deletePluginFile(fileName)                     │
    │  - broadcastStorageUpdate(fileName)               │
    └───────────┬─────────────────────────┬─────────────┘
                │                         │
          [直接调用]                 [IPC 调用]
                │                         │
    ┌───────────▼─────────┐   ┌───────────▼─────────┐
    │  index.js Storage   │   │  IPC Channel        │
    │  - getFile()        │   │  Handler            │
    │  - setFile()        │   │  (PluginModule)     │
    │  - deleteFile()     │   └───────────┬─────────┘
    │  - onDidChange()    │               │
    └───────────┬─────────┘         [IPC 响应]
                │                         │
          [事件总线监听]          ┌───────▼─────────┐
                │                 │  WebView        │
                │                 │  Storage        │
                │                 │  - getFile()    │
                │                 │  - setFile()    │
                │                 │  - onDidChange()│
                │                 └─────────────────┘
                │
    ┌───────────▼──────────────────────────────────┐
    │  TouchEventBus                                │
    │  - TalexEvents.PLUGIN_STORAGE_UPDATED        │
    └───────────────────────────────────────────────┘
                │
          [广播到所有窗口]
                │
    ┌───────────▼──────────────────────────────────┐
    │  BrowserWindow.getAllWindows()                │
    │  - 主窗口                                      │
    │  - 插件 WebView 窗口 1, 2, 3...               │
    └───────────────────────────────────────────────┘
```

---

## 报告元数据

- **分析日期**: 2024
- **项目**: Talex Touch
- **版本**: 基于当前代码库
- **分析范围**: Storage 同步机制完整架构
- **状态**: ✅ 同步机制已完整实现，无结构性问题

---

**如需进一步分析或实施改进方案，请参考本报告第 5 节的建议。**
