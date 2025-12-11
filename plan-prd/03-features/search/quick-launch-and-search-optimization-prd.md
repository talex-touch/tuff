# 快速启动与搜索优化 PRD

> **版本**: v1.0
> **创建时间**: 2024-12
> **状态**: Draft

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

#### 2.3.1 分层搜索架构

**核心思路**: 将搜索分为 **快速层** 和 **延迟层**

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

#### 2.3.2 Provider 优先级配置

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

#### 2.3.3 Gather 聚合器改造

**修改文件**: `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.ts`

```typescript
export interface ITuffGatherOptions {
  // ... 现有配置 ...
  
  /**
   * 快速层 Provider 的最大等待时间
   * 超时后立即返回已有结果
   * @default 80
   */
  fastLayerTimeoutMs?: number
  
  /**
   * 延迟层的启动延迟
   * 避免与快速层竞争资源
   * @default 50
   */
  deferredLayerDelayMs?: number
}

const defaultTuffGatherOptions: Required<ITuffGatherOptions> = {
  concurrency: 4,
  coalesceGapMs: 50,
  firstBatchGraceMs: 20,
  debouncePushMs: 8,
  taskTimeoutMs: 3000,
  fastLayerTimeoutMs: 80,      // 新增
  deferredLayerDelayMs: 50     // 新增
}
```

**新搜索流程**:

```typescript
async function handleGather(
  signal: AbortSignal,
  resolve: (value: number) => void
): Promise<number> {
  // 1. 分离快速层和延迟层
  const fastProviders = providers.filter(p => p.priority === 'fast')
  const deferredProviders = providers.filter(p => p.priority !== 'fast')
  
  // 2. 快速层并行执行，带超时
  const fastResults = await Promise.race([
    runProviderPool(fastProviders, signal),
    timeout(fastLayerTimeoutMs)
  ])
  
  // 3. 立即返回快速层结果
  onUpdate({
    newResults: fastResults,
    totalCount: countItems(fastResults),
    isDone: deferredProviders.length === 0,
    sourceStats: buildStats(fastResults)
  })
  
  // 4. 如果有延迟层，异步执行
  if (deferredProviders.length > 0 && !signal.aborted) {
    // 延迟启动，避免资源竞争
    await delay(deferredLayerDelayMs)
    
    // 在后台执行延迟层搜索
    runDeferredLayer(deferredProviders, signal, onUpdate)
  }
}
```

#### 2.3.4 渲染层优化

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

#### 2.3.5 输入防抖策略优化

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

| 指标 | 当前 | 目标 |
|------|------|------|
| 输入响应延迟 | 100-200ms | < 50ms |
| 首批结果时间 | 150-300ms | < 100ms |
| 完整结果时间 | 500-1000ms | < 500ms |
| 输入丢帧 | 明显 | 无感知 |

### 2.5 实现步骤

| 阶段 | 任务 | 预期时间 |
|------|------|----------|
| **Phase 1** | Provider 优先级属性定义 | 0.5d |
| **Phase 1** | search-gather.ts 分层改造 | 1d |
| **Phase 2** | 渲染层 shallowRef 优化 | 0.5d |
| **Phase 2** | 动态防抖策略 | 0.5d |
| **Phase 3** | 性能测试与调优 | 1d |

### 2.6 风险与降级

| 风险 | 影响 | 降级方案 |
|------|------|----------|
| 分层导致结果不一致 | 用户看到结果跳动 | 延迟层结果合并时重新排序 |
| 快速层超时过短 | 首批结果不完整 | 监控 P95 延迟，动态调整阈值 |
| 复杂度增加 | 维护成本 | 保留单层模式作为 fallback |

### 2.7 监控指标

```typescript
interface SearchMetrics {
  sessionId: string
  query: string
  fastLayerDuration: number      // 快速层耗时
  fastLayerResultCount: number   // 快速层结果数
  deferredLayerDuration: number  // 延迟层耗时
  deferredLayerResultCount: number
  totalDuration: number
  inputToFirstResultMs: number   // 输入到首批结果的延迟
  wasAborted: boolean
}
```

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
