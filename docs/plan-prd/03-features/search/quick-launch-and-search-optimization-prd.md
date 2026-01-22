# 快速启动与搜索优化 PRD

> **版本**: v1.0
> **创建时间**: 2024-12
> **状态**: 草案

---

## 目录

1. [需求一：快速启动可执行文件](#需求一快速启动可执行文件)
2. [需求二：搜索性能优化](#需求二搜索性能优化)

---

## 需求一：快速启动可执行文件

### 1.1 背景与问题

当前用户复制可执行文件（如 Windows `.exe`、macOS `.app`、Linux 可执行文件）后，没有便捷的方式将其加入 CoreBox 快速启动列表。用户需要手动配置或等待系统自动索引，体验不够流畅。

### 1.2 目标

- 用户复制可执行文件后，可快速将其加入 CoreBox 搜索/启动列表
- 支持跨平台可执行文件识别
- 提供友好的交互入口

### 1.3 用户场景

1. **场景 A**: 用户在 Finder/Explorer 中复制一个 `.exe` / `.app` 文件
2. **场景 B**: 用户唤起 CoreBox，系统检测到剪贴板包含可执行文件
3. **场景 C**: 系统显示操作选项 "添加到快速启动"
4. **场景 D**: 用户确认后，该程序出现在 CoreBox 搜索结果中

### 1.4 平台可执行文件定义

| 平台 | 可执行文件格式 |
|------|----------------|
| **Windows** | `.exe`, `.msi`, `.bat`, `.cmd`, `.ps1` |
| **macOS** | `.app` (目录), 无扩展名但有执行权限 |
| **Linux** | 无扩展名但有执行权限, `.AppImage`, `.run`, `.sh` |

### 1.5 技术方案

#### 1.5.1 架构概览

```
┌────────────────────────────────────────────────────────────────────┐
│                        ClipboardModule                              │
│  ┌─────────────────┐    ┌───────────────────┐                      │
│  │ checkClipboard  │───▶│ detectExecutable  │                      │
│  └─────────────────┘    └───────────────────┘                      │
│                                  │                                  │
│                                  ▼                                  │
│                    ┌─────────────────────────┐                     │
│                    │  ExecutableDetector     │                     │
│                    │  - isExecutable(path)   │                     │
│                    │  - getMetadata(path)    │                     │
│                    └─────────────────────────┘                     │
└────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────┐
│                       QuickLaunchProvider                           │
│  ┌──────────────────┐    ┌────────────────────┐                    │
│  │ UserAppRegistry  │◀──▶│  Database (files)  │                    │
│  │ - add(app)       │    │  type: 'user-app'  │                    │
│  │ - remove(app)    │    └────────────────────┘                    │
│  │ - list()         │                                              │
│  └──────────────────┘                                              │
└────────────────────────────────────────────────────────────────────┘
```

#### 1.5.2 可执行文件检测服务

**新增文件**: `apps/core-app/src/main/modules/executable-detector.ts`

```typescript
export interface ExecutableInfo {
  path: string
  name: string
  icon?: string      // 提取的图标 (base64 或路径)
  version?: string   // 版本信息 (Windows PE / macOS Info.plist)
  bundleId?: string  // macOS Bundle ID
  platform: 'win32' | 'darwin' | 'linux'
}

export interface IExecutableDetector {
  /**
   * 检测给定路径是否为可执行文件
   */
  isExecutable(filePath: string): Promise<boolean>
  
  /**
   * 获取可执行文件元数据
   */
  getMetadata(filePath: string): Promise<ExecutableInfo | null>
}
```

**平台实现**:

| 平台 | 检测逻辑 |
|------|----------|
| **Windows** | 检查扩展名 `.exe`, `.msi`, `.bat`, `.cmd`, `.ps1`；使用 `pe-parser` 提取版本信息和图标 |
| **macOS** | 检查 `.app` 目录结构 + `Info.plist` 存在；解析 `CFBundleExecutable`, `CFBundleIdentifier`；使用 `file-icon` 提取图标 |
| **Linux** | 检查文件执行权限 (`fs.access(path, fs.constants.X_OK)`)；ELF 魔数检测 |

#### 1.5.3 剪贴板检测增强

**修改文件**: `apps/core-app/src/main/modules/clipboard.ts`

```typescript
// 在 checkClipboard 中增加可执行文件检测
private async checkClipboard(): Promise<void> {
  // ... 现有逻辑 ...
  
  if (item?.type === 'files') {
    const files = JSON.parse(item.content)
    const executableFiles = await this.detectExecutables(files)
    
    if (executableFiles.length > 0) {
      // 标记 meta 包含可执行文件信息
      metaEntries.push({ 
        key: 'executables', 
        value: executableFiles 
      })
    }
  }
}

private async detectExecutables(
  files: string[]
): Promise<ExecutableInfo[]> {
  const results: ExecutableInfo[] = []
  for (const file of files) {
    const info = await executableDetector.getMetadata(file)
    if (info) results.push(info)
  }
  return results
}
```

#### 1.5.4 用户应用注册表

**修改数据库 Schema**: `apps/core-app/src/main/db/schema.ts`

```typescript
// files 表已存在，增加 type: 'user-app'
// 使用 file_extensions 存储额外元数据

// 新增 user_apps 配置表 (可选，如需更细粒度控制)
export const userApps = sqliteTable('user_apps', {
  id: text('id').primaryKey(),           // 唯一 ID
  path: text('path').notNull().unique(), // 可执行文件路径
  name: text('name').notNull(),          // 显示名称
  icon: text('icon'),                     // 图标 (base64 或路径)
  alias: text('alias'),                   // 用户自定义别名
  keywords: text('keywords'),             // 额外关键词 (JSON 数组)
  createdAt: integer('created_at').default(sql`CURRENT_TIMESTAMP`),
  lastUsedAt: integer('last_used_at'),
  useCount: integer('use_count').default(0)
})
```

#### 1.5.5 渲染层交互

**Plugin Feature 方案** (推荐):

使用内置插件提供 "添加到快速启动" 功能入口：

```typescript
// 在 PluginFeaturesAdapter 中注册系统功能
const quickLaunchFeature: TuffItem = {
  id: 'system:quick-launch:add',
  label: '添加到快速启动',
  sublabel: '将当前复制的程序添加到搜索列表',
  icon: { type: 'lucide', name: 'Plus' },
  kind: 'action',
  source: { type: 'system', providerId: 'system-provider' }
}
```

**搜索结果方案**:

当检测到剪贴板包含可执行文件时，在搜索结果中显示操作项：

```typescript
// AppProvider.onSearch 中检测
if (query.inputs?.some(i => i.type === TuffInputType.Files)) {
  const executableInfo = query.inputs
    .filter(i => i.type === TuffInputType.Files)
    .flatMap(i => i.metadata?.executables || [])
  
  if (executableInfo.length > 0) {
    // 插入 "添加到快速启动" 操作项
    items.unshift(createQuickLaunchActionItem(executableInfo))
  }
}
```

#### 1.5.6 IPC 通道

| 通道 | 方向 | 描述 |
|------|------|------|
| `quick-launch:add` | Renderer → Main | 添加可执行文件到快速启动 |
| `quick-launch:remove` | Renderer → Main | 从快速启动移除 |
| `quick-launch:list` | Renderer → Main | 获取用户添加的应用列表 |
| `quick-launch:update` | Renderer → Main | 更新应用信息（别名、关键词等）|

### 1.6 UI/UX 设计

#### 1.6.1 触发入口

1. **剪贴板感知**: 复制可执行文件后唤起 CoreBox，显示 "添加到快速启动" 选项
2. **右键菜单**: 搜索结果中对文件项显示右键菜单选项 (后续迭代)
3. **设置页面**: 管理已添加的用户应用 (后续迭代)

#### 1.6.2 确认弹窗

```
┌─────────────────────────────────────────┐
│  添加到快速启动                           │
├─────────────────────────────────────────┤
│                                          │
│  [Icon]  Visual Studio Code.exe          │
│                                          │
│  路径: C:\Program Files\VSCode\...       │
│                                          │
│  名称: [Visual Studio Code        ]      │
│  别名: [vsc, code                 ]      │
│                                          │
├─────────────────────────────────────────┤
│            [取消]        [添加]          │
└─────────────────────────────────────────┘
```

### 1.7 数据流

```
1. 用户复制可执行文件
   ↓
2. ClipboardModule.checkClipboard() 检测
   ↓
3. ExecutableDetector.getMetadata() 提取信息
   ↓
4. 存入 clipboard_history (带 executables meta)
   ↓
5. 用户唤起 CoreBox
   ↓
6. 搜索系统检测到 query.inputs 包含可执行文件
   ↓
7. 显示 "添加到快速启动" 操作项
   ↓
8. 用户点击确认
   ↓
9. quick-launch:add IPC 调用
   ↓
10. 写入 files 表 (type: 'user-app') + 关键词索引
   ↓
11. 后续搜索可命中该应用
```

### 1.8 Applications 页面集成

#### 1.8.1 现有页面结构

```
views/base/application/
├── ApplicationIndex.vue  # 主容器，左右分栏布局
├── AppList.vue           # 左侧应用列表，支持搜索和排序
├── AppConfigure.vue      # 右侧应用详情/配置
└── ApplicationEmpty.vue  # 空状态占位
```

**现有功能**:
- 通过 `core-box:query` 获取应用列表
- 支持搜索过滤
- 排序方式: 默认 / 字母升序 / 字母降序 / 使用频率
- 详情页: 启动、在资源管理器中打开、卸载、帮助

#### 1.8.2 需要增强的功能

**AppList.vue 改造**:

```typescript
// 新增分类 Tab 或筛选
enum AppCategory {
  ALL = 'all',           // 全部应用
  SYSTEM = 'system',     // 系统应用 (自动索引)
  USER = 'user',         // 用户手动添加
  RECENT = 'recent'      // 最近使用
}

const category = ref<AppCategory>(AppCategory.ALL)

// 请求时传递 category 参数
async function handleSearch(value: string): Promise<void> {
  const res = await touchChannel.send('core-box:query', {
    query: { text: value },
    filter: { category: category.value }  // 新增
  })
}
```

**UI 改造**:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Applications                                                        │
├─────────────────────────────────────────────────────────────────────┤
│  [全部] [系统应用] [手动添加] [最近使用]     [+ 添加应用]            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐  ┌──────────────────────────────────────┐ │
│  │ [搜索...]      [排序]│  │                                      │ │
│  │                      │  │  应用详情                             │ │
│  │ ┌──────────────────┐ │  │                                      │ │
│  │ │ 📱 Visual Studio │ │  │  [图标] Visual Studio Code           │ │
│  │ │    Code          │ │  │  /Applications/Visual Studio...      │ │
│  │ └──────────────────┘ │  │                                      │ │
│  │ ┌──────────────────┐ │  │  ──────────────────────────────────  │ │
│  │ │ 📱 Chrome       ★│ │  │  操作                                │ │
│  │ │    (手动添加)    │ │  │  [启动] [打开目录] [删除]            │ │
│  │ └──────────────────┘ │  │                                      │ │
│  │ ...                  │  │  别名与关键词                         │ │
│  │                      │  │  别名: [vsc, code           ]        │ │
│  └──────────────────────┘  │  关键词: [编辑器, IDE        ]        │ │
│                            └──────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

**AppConfigure.vue 改造** (手动添加的应用):

```vue
<!-- 新增：用户应用专属配置 -->
<t-group-block 
  v-if="isUserApp" 
  :name="t('appConfigure.customize')" 
  icon="edit"
>
  <t-block-slot :title="t('appConfigure.alias')" icon="tag">
    <el-input 
      v-model="appAlias" 
      :placeholder="t('appConfigure.aliasPlaceholder')"
    />
  </t-block-slot>
  <t-block-slot :title="t('appConfigure.keywords')" icon="key">
    <el-input 
      v-model="appKeywords" 
      :placeholder="t('appConfigure.keywordsPlaceholder')"
    />
  </t-block-slot>
  <t-block-slot :title="t('appConfigure.remove')" icon="delete-bin-2">
    <FlatButton hover:bg-red @click="handleRemoveFromQuickLaunch">
      {{ t('appConfigure.removeFromQuickLaunch') }}
    </FlatButton>
  </t-block-slot>
</t-group-block>
```

#### 1.8.3 新增 IPC 通道

| 通道 | 描述 |
|------|------|
| `applications:list` | 获取应用列表 (支持 category 筛选) |
| `applications:get-user-apps` | 获取用户手动添加的应用 |
| `applications:update-user-app` | 更新用户应用配置 (别名、关键词) |
| `applications:remove-user-app` | 从快速启动中移除 |

#### 1.8.4 数据展示区分

| 来源 | 标识 | 可操作 |
|------|------|--------|
| 系统应用 | `source: 'system'` | 启动、打开目录 |
| 用户应用 | `source: 'user'` | 启动、打开目录、编辑别名/关键词、删除 |

**列表项视觉区分**:
- 用户添加的应用显示 ★ 标记
- 悬停时显示 "(手动添加)" 提示

### 1.9 实现优先级

| 阶段 | 功能 | 优先级 |
|------|------|--------|
| **P0** | 可执行文件检测 (基础扩展名检测) | 必须 |
| **P0** | 剪贴板感知 + 操作项显示 | 必须 |
| **P0** | 添加到搜索索引 | 必须 |
| **P0** | Applications 页面展示用户应用 | 必须 |
| **P1** | 图标提取 | 高 |
| **P1** | 版本/元数据提取 | 高 |
| **P1** | Applications 页面分类筛选 | 高 |
| **P2** | 别名/关键词自定义 (AppConfigure) | 中 |
| **P2** | Applications 页面 "添加应用" 入口 | 中 |
| **P3** | 右键菜单入口 | 低 |

---

## 需求二：搜索性能优化

### 2.1 背景与问题

当前搜索架构存在以下问题：

1. **输入卡顿**: 输入 "hello" 时，输入 "h" 触发搜索后，"ello" 的输入会明显卡顿
2. **阻塞感**: 所有 Provider 并行搜索，但 UI 需要等待第一批结果返回
3. **FileProvider 较慢**: 文件搜索涉及数据库查询和 FTS，耗时较长

**当前架构分析**:

```
@/apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts
- debounce: 35ms (无激活 provider) / 100ms (有激活 provider)
- 每次输入变化触发 debouncedSearch

@/apps/core-app/src/main/modules/box-tool/search-engine/search-gather.ts
- 并发度: 4 workers
- 所有 provider 放入同一队列，按注册顺序处理
- firstBatchGraceMs: 20ms (首批结果等待时间)
- coalesceGapMs: 50ms (后续批次合并间隔)
- taskTimeoutMs: 3000ms (单任务超时)
```

### 2.2 目标

- 消除输入卡顿，保持流畅的打字体验
- 优先返回 App 搜索结果 (快速、高优先级)
- File 搜索作为延迟补充，不阻塞主流程
- 保持搜索结果的完整性

### 2.3 技术方案

#### 2.3.1 核心设计原则

1. **非阻塞输入**: 搜索执行不得阻塞 UI 线程和用户输入
2. **渐进式呈现**: 优先展示高优先级结果，低优先级异步追加
3. **资源隔离**: 快速层和延迟层使用独立资源池，避免互相影响
4. **可取消**: 新搜索触发时，旧搜索应立即中止

#### 2.3.2 分层搜索架构

**核心思路**: 将搜索分为 **快速层 (Fast Layer)** 和 **延迟层 (Deferred Layer)**

```
┌────────────────────────────────────────────────────────────────────┐
│                     SearchEngineCore                                │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    Fast Layer (< 50ms)                       │  │
│  │  ┌─────────┐  ┌────────────┐  ┌───────────────────────┐     │  │
│  │  │  App    │  │  System    │  │  PluginFeatures       │     │  │
│  │  │Provider │  │  Provider  │  │  Adapter              │     │  │
│  │  └─────────┘  └────────────┘  └───────────────────────┘     │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              │                                     │
│                              │ 首批结果立即返回                      │
│                              ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                   Deferred Layer (可延迟)                    │  │
│  │  ┌─────────┐  ┌────────────┐  ┌───────────────────────┐     │  │
│  │  │  File   │  │  Preview   │  │  URL Provider         │     │  │
│  │  │Provider │  │  Provider  │  │                       │     │  │
│  │  └─────────┘  └────────────┘  └───────────────────────┘     │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              │                                     │
│                              │ 异步追加到结果                        │
│                              ▼                                     │
│                      core-box:search-update                        │
└────────────────────────────────────────────────────────────────────┘
```

#### 2.3.3 Provider 优先级配置

**修改文件**: `packages/utils/plugin/search-provider.ts`

```typescript
export interface ISearchProvider<TContext = unknown> {
  // ... 现有属性 ...
  
  /**
   * 搜索优先级层级
   * - 'fast': 快速层，阻塞返回
   * - 'deferred': 延迟层，异步追加
   * @default 'deferred'
   */
  priority?: 'fast' | 'deferred'
  
  /**
   * 预期搜索耗时 (ms)，用于排序和超时控制
   * @default 1000
   */
  expectedDuration?: number
}
```

**Provider 优先级配置**:

| Provider | Priority | Expected Duration |
|----------|----------|-------------------|
| `app-provider` | `fast` | 50ms |
| `system-provider` | `fast` | 20ms |
| `plugin-features` | `fast` | 30ms |
| `url-provider` | `deferred` | 100ms |
| `preview-provider` | `deferred` | 200ms |
| `file-provider` | `deferred` | 500ms |

#### 2.3.4 Gather 聚合器改造

**修改文件**: `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.ts`

##### 配置扩展

```typescript
export interface ITuffGatherOptions {
  // 现有配置
  concurrency?: number           // 并发度 (默认 4)
  coalesceGapMs?: number         // 结果合并间隔 (默认 50ms)
  firstBatchGraceMs?: number     // 首批等待时间 (默认 20ms)
  debouncePushMs?: number        // 推送防抖 (默认 8ms)
  taskTimeoutMs?: number         // 单任务超时 (默认 3000ms)
  
  // 新增配置
  /**
   * 快速层 Provider 的最大等待时间
   * 超时后立即返回已有结果，不等待慢 Provider
   * @default 80
   */
  fastLayerTimeoutMs?: number
  
  /**
   * 延迟层的启动延迟
   * 让快速层先完成，避免 CPU 竞争
   * @default 50
   */
  deferredLayerDelayMs?: number
  
  /**
   * 快速层并发度 (独立于 concurrency)
   * @default 3
   */
  fastLayerConcurrency?: number
  
  /**
   * 延迟层并发度
   * @default 2
   */
  deferredLayerConcurrency?: number
}

const defaultTuffGatherOptions: Required<ITuffGatherOptions> = {
  concurrency: 4,
  coalesceGapMs: 50,
  firstBatchGraceMs: 20,
  debouncePushMs: 8,
  taskTimeoutMs: 3000,
  // 新增默认值
  fastLayerTimeoutMs: 80,
  deferredLayerDelayMs: 50,
  fastLayerConcurrency: 3,
  deferredLayerConcurrency: 2
}
```

##### 核心实现改造

```typescript
export function createGatherAggregator(options: ITuffGatherOptions = {}) {
  const config = { ...defaultTuffGatherOptions, ...options }

  return function executeSearch(
    providers: ISearchProvider<ProviderContext>[],
    params: TuffQuery,
    onUpdate: TuffAggregatorCallback,
  ): IGatherController {
    
    async function handleGather(
      signal: AbortSignal,
      resolve: (value: number) => void
    ): Promise<number> {
      const startTime = performance.now()
      
      // 1. 按优先级分组
      const fastProviders = providers.filter(p => p.priority === 'fast')
      const deferredProviders = providers.filter(p => p.priority !== 'fast')
      
      const allResults: TuffSearchResult[] = []
      const sourceStats: ExtendedSourceStat[] = []
      
      // 2. 快速层执行 (带超时保护)
      if (fastProviders.length > 0) {
        const fastResults = await runFastLayer(
          fastProviders, 
          params, 
          signal,
          config.fastLayerTimeoutMs,
          config.fastLayerConcurrency
        )
        
        allResults.push(...fastResults.results)
        sourceStats.push(...fastResults.stats)
        
        // 立即推送快速层结果
        const itemCount = countItems(allResults)
        onUpdate({
          newResults: fastResults.results,
          totalCount: itemCount,
          isDone: deferredProviders.length === 0,
          sourceStats,
          layer: 'fast'  // 新增：标识结果来源层
        })
        
        searchLogger.fastLayerComplete(performance.now() - startTime, itemCount)
      }
      
      // 3. 检查是否已取消
      if (signal.aborted) {
        resolve(countItems(allResults))
        return countItems(allResults)
      }
      
      // 4. 延迟层执行 (不阻塞返回)
      if (deferredProviders.length > 0) {
        // 延迟启动，让 UI 先渲染快速层结果
        await delay(config.deferredLayerDelayMs)
        
        // 异步执行延迟层
        runDeferredLayer(
          deferredProviders,
          params,
          signal,
          config.deferredLayerConcurrency,
          (deferredResult) => {
            if (signal.aborted) return
            
            allResults.push(deferredResult)
            sourceStats.push(deferredResult.stat)
            
            onUpdate({
              newResults: [deferredResult],
              totalCount: countItems(allResults),
              isDone: false,
              sourceStats,
              layer: 'deferred'
            })
          },
          () => {
            // 延迟层全部完成
            onUpdate({
              newResults: [],
              totalCount: countItems(allResults),
              isDone: true,
              sourceStats,
              layer: 'deferred'
            })
            resolve(countItems(allResults))
          }
        )
      } else {
        resolve(countItems(allResults))
      }
      
      return countItems(allResults)
    }
    
    return createGatherController(handleGather)
  }
}

/**
 * 快速层执行器 - 并行执行所有 fast providers，带总体超时
 */
async function runFastLayer(
  providers: ISearchProvider[],
  query: TuffQuery,
  signal: AbortSignal,
  timeoutMs: number,
  concurrency: number
): Promise<{ results: TuffSearchResult[], stats: ExtendedSourceStat[] }> {
  const results: TuffSearchResult[] = []
  const stats: ExtendedSourceStat[] = []
  
  // 使用 Promise.allSettled + 总体超时
  const racePromise = Promise.race([
    runProviderPool(providers, query, signal, concurrency, (result, stat) => {
      results.push(result)
      stats.push(stat)
    }),
    new Promise<void>(resolve => setTimeout(resolve, timeoutMs))
  ])
  
  await racePromise
  return { results, stats }
}

/**
 * 延迟层执行器 - 逐个完成，逐个推送
 */
function runDeferredLayer(
  providers: ISearchProvider[],
  query: TuffQuery,
  signal: AbortSignal,
  concurrency: number,
  onResult: (result: TuffSearchResult & { stat: ExtendedSourceStat }) => void,
  onComplete: () => void
): void {
  const queue = [...providers]
  let completed = 0
  
  const runNext = async () => {
    while (queue.length > 0 && !signal.aborted) {
      const provider = queue.shift()!
      const startTime = performance.now()
      
      try {
        const result = await provider.onSearch(query, signal)
        const duration = performance.now() - startTime
        
        onResult({
          ...result,
          stat: {
            providerId: provider.id,
            providerName: provider.name || provider.id,
            duration,
            resultCount: result.items.length,
            status: 'success'
          }
        })
      } catch (error) {
        // 静默处理延迟层错误，不影响用户体验
        console.warn(`[DeferredLayer] Provider ${provider.id} failed:`, error)
      }
      
      completed++
    }
    
    if (completed >= providers.length) {
      onComplete()
    }
  }
  
  // 启动并发 workers
  for (let i = 0; i < concurrency; i++) {
    runNext()
  }
}
```

##### 关键时序图

```
时间轴 (ms):   0     20    40    60    80   100   150   200   500
              │     │     │     │     │     │     │     │     │
用户输入 "h"  ●─────┐
              │     │
debounce      │     ●────► 触发搜索
              │           │
Fast Layer    │           ├─app-provider──────●(30ms) 结果1
              │           ├─system-provider──●(15ms) 结果2
              │           └─plugin-provider────●(45ms) 结果3
              │           │
首批返回      │           │                    ●═══════════► UI 渲染
              │           │                    │
Deferred      │           │                    ├─50ms delay─┤
Layer Start   │           │                    │            ●
              │           │                    │            ├─url-provider────●(80ms)
              │           │                    │            ├─preview-provider──────●(180ms)
              │           │                    │            └─file-provider──────────────────●(450ms)
              │           │                    │                                              │
增量更新      │           │                    │            ●                ●               ●
              │           │                    │            └────────────────┴───────────────┴──► UI
```

#### 2.3.5 SearchEngineCore 改造

**修改文件**: `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`

```typescript
export class SearchEngineCore {
  private currentController: IGatherController | null = null
  private searchSequence = 0
  
  async search(query: TuffQuery): Promise<TuffSearchResult> {
    // 1. 取消上一次搜索
    this.cancelPreviousSearch()
    
    // 2. 递增序列号，用于结果校验
    const sequence = ++this.searchSequence
    
    // 3. 获取并分类 providers
    const providers = this.getActiveProviders()
    const sortedProviders = this.sortProvidersByPriority(providers)
    
    // 4. 创建新的聚合器实例（使用分层配置）
    const aggregator = createGatherAggregator({
      fastLayerTimeoutMs: 80,
      deferredLayerDelayMs: 50,
      fastLayerConcurrency: 3,
      deferredLayerConcurrency: 2
    })
    
    // 5. 执行搜索
    this.currentController = aggregator(
      sortedProviders,
      query,
      (update) => {
        // 校验序列号，丢弃过期结果
        if (sequence !== this.searchSequence) return
        
        this.broadcastUpdate(update)
      }
    )
    
    // 6. 等待完成或取消
    await this.currentController.promise
    return this.buildFinalResult(query)
  }
  
  private sortProvidersByPriority(
    providers: ISearchProvider[]
  ): ISearchProvider[] {
    // Fast providers 在前，Deferred 在后
    return providers.sort((a, b) => {
      const priorityOrder = { fast: 0, deferred: 1 }
      const aPriority = priorityOrder[a.priority || 'deferred']
      const bPriority = priorityOrder[b.priority || 'deferred']
      
      if (aPriority !== bPriority) return aPriority - bPriority
      
      // 同层内按 expectedDuration 排序
      return (a.expectedDuration || 1000) - (b.expectedDuration || 1000)
    })
  }
  
  private cancelPreviousSearch(): void {
    if (this.currentController && !this.currentController.signal.aborted) {
      this.currentController.abort()
      searchLogger.logSearchPhase('Cancel', 'Previous search cancelled')
    }
  }
}
```

#### 2.3.6 渲染层优化

**修改文件**: `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`

**问题分析**:
当前 `watch([searchVal], handleSearch)` 在每次输入变化时触发，虽然有 35ms debounce，但搜索结果返回后的 Vue 响应式更新可能阻塞 UI 线程。

**优化方案**:

```typescript
// 1. 增加输入节流，避免过快触发
const TYPING_THRESHOLD_MS = 80

let lastInputTime = 0
const throttledInputHandler = (newVal: string) => {
  const now = Date.now()
  if (now - lastInputTime < TYPING_THRESHOLD_MS) {
    // 快速输入中，延迟触发
    return
  }
  lastInputTime = now
  debouncedSearch()
}

// 2. 搜索结果分批渲染
const RENDER_BATCH_SIZE = 10

function appendResults(newItems: TuffItem[]) {
  // 分批添加，避免大数组一次性渲染
  for (let i = 0; i < newItems.length; i += RENDER_BATCH_SIZE) {
    const batch = newItems.slice(i, i + RENDER_BATCH_SIZE)
    requestAnimationFrame(() => {
      searchResults.value.push(...batch)
    })
  }
}

// 3. 使用 shallowRef 减少响应式开销
import { shallowRef } from 'vue'
const searchResults = shallowRef<TuffItem[]>([])
```

#### 2.3.7 输入防抖策略优化

**当前策略**:
```
debounce = 35ms (无激活) / 100ms (有激活)
```

**优化策略**:

```typescript
// 动态防抖：根据输入模式调整
function calculateDebounceMs(input: string, prevInput: string): number {
  const BASE = 35
  const MAX = 150
  
  // 连续输入检测 (字符追加)
  if (input.startsWith(prevInput) && input.length === prevInput.length + 1) {
    // 用户正在快速输入，增加防抖
    return Math.min(BASE * 2, MAX)
  }
  
  // 粘贴或一次性输入
  if (input.length - prevInput.length > 3) {
    return BASE
  }
  
  // 删除操作
  if (input.length < prevInput.length) {
    return BASE * 1.5 // 删除时稍微延迟
  }
  
  return BASE
}
```

### 2.4 性能目标

| 指标 | 当前值 | 目标值 | 测量方法 |
|------|--------|--------|----------|
| 输入响应延迟 | 100-200ms | < 50ms | 从 keydown 到字符显示 |
| 首批结果时间 (P50) | 150ms | < 80ms | Fast Layer 完成时间 |
| 首批结果时间 (P95) | 300ms | < 120ms | - |
| 完整结果时间 (P50) | 500ms | < 300ms | 所有 Provider 完成 |
| 完整结果时间 (P95) | 1000ms | < 600ms | - |
| 输入丢帧率 | ~15% | < 2% | 连续输入时的帧丢失 |
| 内存占用增量 | - | < 5MB | 搜索期间额外内存 |

### 2.5 搜索取消与序列化

**问题**: 快速输入 "hello" 时，每次按键都触发搜索，需要正确处理结果的时序和取消。

```typescript
// 输入序列示例
t=0ms:   输入 "h"   → 搜索 #1 启动
t=50ms:  输入 "e"   → 搜索 #1 取消, 搜索 #2 启动
t=100ms: 输入 "l"   → 搜索 #2 取消, 搜索 #3 启动
t=150ms: 输入 "l"   → 搜索 #3 取消, 搜索 #4 启动
t=200ms: 输入 "o"   → 搜索 #4 取消, 搜索 #5 启动
t=280ms: 搜索 #5 fast layer 完成 → 显示结果
t=500ms: 搜索 #5 deferred layer 完成 → 追加结果
```

**实现要点**:

1. **AbortController 传递**: Signal 传递到每个 Provider，Provider 内部检查 `signal.aborted`
2. **序列号校验**: 渲染层维护 `searchSequence`，丢弃过期结果
3. **资源清理**: 取消时清理定时器、中止网络请求

### 2.6 实现步骤

| 阶段 | 任务 | 文件 | 预期时间 |
|------|------|------|----------|
| **Phase 1** | Provider 优先级属性定义 | `packages/utils/plugin/search-provider.ts` | 0.5d |
| **Phase 1** | ITuffGatherOptions 扩展 | `search-gather.ts` | 0.5d |
| **Phase 1** | runFastLayer / runDeferredLayer 实现 | `search-gather.ts` | 1d |
| **Phase 2** | SearchEngineCore 分层调用改造 | `search-core.ts` | 0.5d |
| **Phase 2** | Provider 优先级配置 | `app-provider.ts`, `file-provider.ts` 等 | 0.5d |
| **Phase 3** | 渲染层 shallowRef 优化 | `useSearch.ts` | 0.5d |
| **Phase 3** | 动态防抖策略 | `useSearch.ts` | 0.5d |
| **Phase 4** | 性能测试与调优 | - | 1d |
| **Phase 4** | 日志与监控埋点 | `search-logger.ts` | 0.5d |

### 2.7 风险与降级

| 风险 | 影响 | 降级方案 |
|------|------|----------|
| 分层导致结果不一致 | 用户看到结果跳动 | 延迟层结果合并时重新排序 |
| 快速层超时过短 | 首批结果不完整 | 监控 P95 延迟，动态调整阈值 |
| 复杂度增加 | 维护成本 | 保留单层模式作为 fallback |

### 2.8 监控指标

```typescript
interface SearchMetrics {
  // 基础信息
  sessionId: string
  query: string
  queryLength: number
  timestamp: number
  
  // 性能指标
  inputTimestamp: number          // 用户输入时间戳
  searchStartTimestamp: number    // 搜索启动时间戳
  debounceDelay: number           // 实际防抖延迟
  
  // 快速层
  fastLayerDuration: number       // 快速层总耗时
  fastLayerResultCount: number    // 快速层结果数
  fastLayerProviderStats: ProviderStat[]
  
  // 延迟层
  deferredLayerDuration: number   // 延迟层总耗时
  deferredLayerResultCount: number
  deferredLayerProviderStats: ProviderStat[]
  
  // 总体
  totalDuration: number
  totalResultCount: number
  inputToFirstResultMs: number    // 输入到首批结果的延迟 (关键指标)
  inputToCompleteMs: number       // 输入到完整结果的延迟
  
  // 状态
  wasAborted: boolean
  abortReason?: 'new-search' | 'user-cancel' | 'timeout'
}

interface ProviderStat {
  providerId: string
  priority: 'fast' | 'deferred'
  duration: number
  resultCount: number
  status: 'success' | 'timeout' | 'error' | 'aborted'
}
```

### 2.9 测试用例

| 场景 | 输入 | 预期行为 | 验收标准 |
|------|------|----------|----------|
| 快速输入 | 连续输入 "hello" (100ms间隔) | 中间搜索被取消，只显示最终结果 | 无结果闪烁，无报错 |
| 慢 Provider | app-provider 正常，file-provider 超时 | 先显示 app 结果，file 超时不影响 | Fast Layer < 100ms 返回 |
| 空查询 | 清空输入框 | 显示推荐结果 | 200ms 内切换到推荐 |
| 长查询 | 输入 50 字符 | 正常搜索 | 无 OOM，结果正常 |
| 并发取消 | 快速输入后立即清空 | 所有搜索被取消 | 无残留结果，无内存泄漏 |
| 激活 Provider | 选中结果后继续输入 | 保持 Provider 激活状态 | 激活态搜索正常 |

---

## 附录

### A. 相关文件

| 文件 | 用途 |
|------|------|
| **主进程** | |
| `apps/core-app/src/main/modules/clipboard.ts` | 剪贴板监听模块 |
| `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts` | 搜索引擎核心 |
| `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.ts` | 搜索聚合器 |
| `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts` | 应用搜索 Provider |
| `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` | 文件搜索 Provider |
| **渲染进程** | |
| `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts` | 渲染层搜索 Hook |
| `apps/core-app/src/renderer/src/views/base/application/ApplicationIndex.vue` | Applications 页面主容器 |
| `apps/core-app/src/renderer/src/views/base/application/AppList.vue` | 应用列表组件 |
| `apps/core-app/src/renderer/src/views/base/application/AppConfigure.vue` | 应用详情/配置组件 |
| `apps/core-app/src/renderer/src/views/base/application/ApplicationEmpty.vue` | 空状态占位组件 |

### B. 参考资料

- [Raycast 搜索性能分析](https://www.raycast.com/blog/performance)
- [Alfred Workflow 设计](https://www.alfredapp.com/help/workflows/)
- [Electron 渲染进程优化](https://www.electronjs.org/docs/latest/tutorial/performance)
