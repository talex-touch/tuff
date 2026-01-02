# CoreBox 剪贴板机制与 AutoPaste 完整梳理

## 一、重复 Pin 项目问题分析

### 问题根源

在 `recommendation-engine.ts` 中存在逻辑问题，导致 pinned 项目可能重复出现：

**问题代码位置**: `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.ts`

```typescript
// 第 79-91 行：获取 pinned 项目
const pinnedItems = await this.getPinnedItems()
const pinnedTuffItems = await this.itemRebuilder.rebuildItems(
  pinnedItems.map((item) => ({
    ...item,
    source: 'pinned' as const,
    score: Number.MAX_SAFE_INTEGER
  }))
)
for (const item of pinnedTuffItems) {
  if (!item.meta) item.meta = {}
  item.meta.pinned = { isPinned: true, pinnedAt: Date.now() }
  item.meta.recommendation = { source: 'pinned' }
}

// 第 138-148 行：过滤和合并
const pinnedKeys = new Set(pinnedItems.map((p) => `${p.sourceId}:${p.itemId}`))
const filteredItems = items.filter((item) => !pinnedKeys.has(`${item.source.id}:${item.id}`))
// ...
const combinedItems = [...filteredItems, ...pinnedTuffItems].slice(0, limit)
```

**问题分析**:

1. `pinnedKeys` 使用 `sourceId:itemId` 格式构建
2. `filteredItems` 过滤时使用 `item.source.id:item.id` 格式
3. **关键问题**: `ItemRebuilder.rebuildItems()` 返回的 `TuffItem.id` 和 `TuffItem.source.id` 可能与原始 `pinnedItems` 的 `itemId` 和 `sourceId` 格式不一致

例如：
- 数据库中 pinned 记录: `sourceId: "app-provider"`, `itemId: "/Applications/Safari.app"`
- 重建后的 TuffItem: `source.id: "app-provider"`, `id: "safari"` (经过 `processSearchResults` 转换)

这导致 `pinnedKeys.has()` 检查失败，同一个应用既出现在 `filteredItems` 中，又出现在 `pinnedTuffItems` 中。

### 修复建议

在 `mergeAndEnrichItems` 或过滤逻辑中，需要使用更健壮的匹配策略：

```typescript
// 建议修复：使用多种 key 格式进行匹配
const pinnedKeySet = new Set<string>()
for (const p of pinnedItems) {
  pinnedKeySet.add(`${p.sourceId}:${p.itemId}`)
  // 也添加可能的变体格式
  if (p.itemId.startsWith('/')) {
    // 对于路径类型的 itemId，也添加文件名作为 key
    const basename = p.itemId.split('/').pop()
    if (basename) pinnedKeySet.add(`${p.sourceId}:${basename}`)
  }
}
```

---

## 二、剪贴板机制完整梳理

### 2.1 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        主进程 (Main Process)                      │
├─────────────────────────────────────────────────────────────────┤
│  ClipboardModule (clipboard.ts)                                  │
│  ├── ClipboardHelper: 检测剪贴板变化                              │
│  ├── memoryCache: 内存缓存最近 100 条记录                         │
│  ├── 数据库持久化: clipboardHistory 表                            │
│  └── IPC 通道注册                                                │
├─────────────────────────────────────────────────────────────────┤
│  CoreBox WindowManager (window.ts)                               │
│  ├── clipboardAllowedTypes: 插件剪贴板监听类型                    │
│  ├── shouldForwardClipboardChange(): 判断是否转发给插件           │
│  └── enableClipboardMonitoring(): 启用剪贴板监听                  │
├─────────────────────────────────────────────────────────────────┤
│  RecommendationEngine (recommendation-engine.ts)                 │
│  └── ContextProvider.getClipboardContext(): 获取剪贴板上下文      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ IPC Channel
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       渲染进程 (Renderer Process)                 │
├─────────────────────────────────────────────────────────────────┤
│  useClipboard.ts                                                 │
│  ├── clipboardOptions: 当前剪贴板状态                             │
│  ├── autoPastedTimestamps: 已自动粘贴的时间戳集合                 │
│  ├── handlePaste(): 处理粘贴事件                                  │
│  ├── handleAutoFill(): 自动填充逻辑                               │
│  └── clearClipboard(): 清除剪贴板状态                             │
├─────────────────────────────────────────────────────────────────┤
│  useClipboardChannel.ts                                          │
│  ├── CLIPBOARD_CHANNELS: 通道名称常量                             │
│  ├── getLatestClipboardSync(): 同步获取最新剪贴板                 │
│  └── applyClipboardToActiveApp(): 应用到活动窗口                  │
├─────────────────────────────────────────────────────────────────┤
│  useClipboardState.ts                                            │
│  ├── hasActiveClipboard: 是否有活动剪贴板内容                     │
│  ├── clipboardType: 当前剪贴板类型                                │
│  └── buildQueryInputs(): 构建查询输入                             │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 主进程剪贴板模块 (`clipboard.ts`)

#### 2.2.1 核心类结构

```typescript
// ClipboardHelper - 剪贴板变化检测
class ClipboardHelper {
  private lastText: string           // 上次文本内容
  private lastImageHash: string      // 上次图片哈希
  private lastFiles: string[]        // 上次文件列表
  public lastFormats: string[]       // 上次格式列表
  public lastChangeHash: string      // 上次变化哈希

  readClipboardFiles(): string[]     // 读取剪贴板文件
  didTextChange(text: string): boolean
  didImageChange(image: NativeImage): boolean
  didFilesChange(files: string[]): boolean
  markText(text: string): void       // 标记文本已处理
  primeImage(image: NativeImage): void
  primeFiles(files: string[]): void
}

// ClipboardModule - 主模块
class ClipboardModule extends BaseModule {
  private memoryCache: IClipboardItem[]  // 内存缓存
  private clipboardHelper: ClipboardHelper
  private db: LibSQLDatabase

  // 核心方法
  checkClipboard(): Promise<void>        // 检测剪贴板变化
  applyToActiveApp(item, payload): Promise<void>  // 应用到活动窗口
  saveCustomEntry(entry): Promise<IClipboardItem> // 保存自定义条目
  getLatestItem(): IClipboardItem | null
}
```

#### 2.2.2 IPC 通道列表

| 通道名称 | 功能 | 参数 |
|---------|------|------|
| `clipboard:get-latest` | 获取最新剪贴板项 | - |
| `clipboard:get-history` | 获取历史记录 | `{ page, pageSize, keyword, startTime, endTime, itemType, isFavorite, sourceApp, sortOrder }` |
| `clipboard:set-favorite` | 设置收藏状态 | `{ id, isFavorite }` |
| `clipboard:delete-item` | 删除单条记录 | `{ id }` |
| `clipboard:clear-history` | 清空历史 | - |
| `clipboard:apply-to-active-app` | 应用到活动窗口 | `{ item, payload }` |
| `clipboard:write-text` | 写入文本 | `{ text }` |
| `clipboard:write` | 写入内容 | `{ text, html, image, files }` |
| `clipboard:read` | 读取当前内容 | - |
| `clipboard:read-image` | 读取图片 | - |
| `clipboard:read-files` | 读取文件 | - |
| `clipboard:clear` | 清空系统剪贴板 | - |
| `clipboard:copy-and-paste` | 复制并粘贴 | `{ text, html, image, files }` |
| `clipboard:query` | 查询（支持 meta 过滤） | `{ source, category, metaFilter, limit }` |

#### 2.2.3 剪贴板检测流程

```
每 500ms 执行 checkClipboard()
        │
        ▼
┌───────────────────────┐
│ 获取 availableFormats │
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│ 格式是否变化？         │──否──▶ 快速检查 text/files
└───────────────────────┘
        │是
        ▼
┌───────────────────────┐
│ 检测文件类型           │
│ (public.file-url 等)  │
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│ 检测图片类型           │
│ (image/png 等)        │
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│ 检测文本类型           │
│ (text/plain 等)       │
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│ 写入数据库             │
│ 更新内存缓存           │
│ 广播 clipboard:new-item│
│ 触发 OCR (如果是图片)  │
└───────────────────────┘
```

### 2.3 CoreBox 窗口剪贴板管理 (`window.ts`)

#### 2.3.1 插件剪贴板监听

```typescript
// 剪贴板类型位掩码
const ClipboardType = {
  TEXT: 0b0001,   // 1
  IMAGE: 0b0010,  // 2
  FILE: 0b0100    // 4
}

// WindowManager 中的剪贴板相关属性
class WindowManager {
  private clipboardAllowedTypes = 0  // 允许的剪贴板类型

  // 启用剪贴板监听
  enableClipboardMonitoring(types: number): void {
    this.clipboardAllowedTypes = types
  }

  // 判断是否应该转发剪贴板变化给插件
  shouldForwardClipboardChange(itemType: 'text' | 'image' | 'files'): boolean {
    if (!this.attachedPlugin || this.clipboardAllowedTypes === 0) {
      return false
    }
    const typeMap = { text: 0b0001, image: 0b0010, files: 0b0100 }
    return (this.clipboardAllowedTypes & typeMap[itemType]) !== 0
  }
}
```

#### 2.3.2 IPC 通道 (`ipc.ts`)

```typescript
// core-box:allow-clipboard - 插件请求剪贴板监听权限
channel.regChannel(ChannelType.PLUGIN, 'core-box:allow-clipboard', ({ data, reply }) => {
  const types = data?.types ?? 0
  windowManager.enableClipboardMonitoring(types)
  reply(DataCode.SUCCESS, { enabled: true, types })
})
```

### 2.4 渲染进程剪贴板 Hooks

#### 2.4.1 `useClipboard.ts` - 核心剪贴板逻辑

```typescript
interface IClipboardOptions {
  last: IClipboardItem | null           // 当前剪贴板内容
  detectedAt: number | null             // 检测时间
  lastClearedTimestamp: string | Date | null  // 上次清除的时间戳
}

// 自动粘贴相关常量
const AUTOFILL_INPUT_TEXT_LIMIT = 80    // 自动填充到输入框的文本长度限制
const AUTOFILL_TIMESTAMP_TTL = 60 * 60 * 1000  // 1小时过期
const autoPastedTimestamps = new Set<number>()  // 已自动粘贴的时间戳

// 核心函数
function useClipboard(
  boxOptions: IBoxOptions,
  clipboardOptions: IClipboardOptions,
  onPasteCallback?: () => void,
  searchVal?: Ref<string>
) {
  // 判断是否可以自动粘贴
  function canAutoPaste(): boolean {
    if (!clipboardOptions.last?.timestamp) return false
    if (!appSetting.tools.autoPaste.enable) return false
    if (appSetting.tools.autoPaste.time === -1) return false
    // 检查是否已经自动粘贴过
    const timestamp = normalizeTimestamp(clipboardOptions.last.timestamp)
    return timestamp && !autoPastedTimestamps.has(timestamp)
  }

  // 自动填充文件
  function autoFillFiles(data: IClipboardItem, timestamp: number): boolean {
    if (data.type !== 'files') return false
    const pathList = JSON.parse(data.content)
    boxOptions.file = { iconPath: pathList[0], paths: pathList }
    boxOptions.mode = BoxMode.FILE
    markAsAutoPasted(timestamp)
    return true
  }

  // 自动填充文本
  function autoFillText(data: IClipboardItem, timestamp: number, forceFill = false): boolean {
    if (!isTextType(data) || !searchVal) return false
    const content = data.content || ''
    // 短文本或强制填充：填入输入框
    if (forceFill || content.length <= AUTOFILL_INPUT_TEXT_LIMIT) {
      searchVal.value = content
      markAsAutoPasted(timestamp)
      return true
    }
    // 长文本：仅显示为标签
    autoPastedTimestamps.add(timestamp)
    return true
  }

  // 处理粘贴事件
  function handlePaste(options?: { overrideDismissed?: boolean; triggerSearch?: boolean }): void {
    const clipboard = getLatestClipboardSync()
    // ... 检查是否是新的剪贴板内容
    // ... 执行自动填充
  }

  // 清除剪贴板状态
  function clearClipboard(options?: { remember?: boolean }): void {
    if (remember) {
      clipboardOptions.lastClearedTimestamp = clipboardOptions.last.timestamp
      autoPastedTimestamps.add(timestamp)
    }
    clipboardOptions.last = null
    clipboardOptions.detectedAt = null
  }
}
```

#### 2.4.2 `useClipboardChannel.ts` - 通道通信

```typescript
const CLIPBOARD_CHANNELS = {
  NEW_ITEM: 'clipboard:new-item',
  GET_LATEST: 'clipboard:get-latest',
  META_UPDATED: 'clipboard:meta-updated',
  APPLY_TO_ACTIVE_APP: 'clipboard:apply-to-active-app',
  GET_HISTORY: 'clipboard:get-history',
  SET_FAVORITE: 'clipboard:set-favorite',
  DELETE_ITEM: 'clipboard:delete-item',
  CLEAR_HISTORY: 'clipboard:clear-history',
  WRITE_TEXT: 'clipboard:write-text',
  QUERY: 'clipboard:query',
}

// 同步获取最新剪贴板
function getLatestClipboardSync(): IClipboardItem | null {
  return touchChannel.sendSync(CLIPBOARD_CHANNELS.GET_LATEST)
}

// 应用到活动窗口
async function applyClipboardToActiveApp(item: IClipboardItem): Promise<boolean> {
  return touchChannel.send(CLIPBOARD_CHANNELS.APPLY_TO_ACTIVE_APP, { item })
}
```

#### 2.4.3 `useClipboardState.ts` - 状态管理

```typescript
function useClipboardState(options: UseClipboardStateOptions) {
  const { boxOptions, clipboardOptions } = options

  // 是否有活动剪贴板内容
  const hasActiveClipboard = computed(() => {
    if (boxOptions.mode === BoxMode.FILE && boxOptions.file?.paths?.length) {
      return false  // 文件模式覆盖剪贴板
    }
    return clipboardOptions.last !== null
  })

  // 当前剪贴板类型
  const clipboardType = computed(() => {
    if (boxOptions.mode === BoxMode.FILE) return 'files'
    if (!clipboardOptions.last) return null
    const type = clipboardOptions.last.type
    if (type === 'text' && clipboardOptions.last.rawContent) return 'html'
    return type
  })

  // 构建查询输入
  function buildQueryInputs(): TuffQueryInput[] {
    const inputs: TuffQueryInput[] = []
    // 优先级: 图片 > 文件模式 > 剪贴板文件 > 文本/HTML
    if (clipboardOptions.last?.type === 'image') {
      inputs.push({ type: TuffInputType.Image, content: clipboardOptions.last.content })
    }
    // ... 其他类型处理
    return inputs
  }
}
```

### 2.5 AutoPaste 流程

```
┌─────────────────────────────────────────────────────────────────┐
│                     AutoPaste 完整流程                           │
└─────────────────────────────────────────────────────────────────┘

1. 用户复制内容到系统剪贴板
        │
        ▼
2. ClipboardModule.checkClipboard() 检测到变化
        │
        ▼
3. 写入数据库，广播 clipboard:new-item
        │
        ▼
4. 渲染进程 useClipboardChannel 接收事件
        │
        ▼
5. 更新 clipboardOptions.last
        │
        ▼
6. 用户打开 CoreBox (快捷键触发)
        │
        ▼
7. useVisibility.handleShow() 调用
        │
        ├──▶ isClipboardRecent() 检查剪贴板是否新鲜
        │    (根据 appSetting.tools.autoPaste.time 判断)
        │
        ▼
8. handleAutoFill() 执行自动填充
        │
        ├──▶ canAutoPaste() 检查
        │    - autoPaste.enable 是否开启
        │    - autoPaste.time 是否 >= 0
        │    - 是否已经自动粘贴过 (autoPastedTimestamps)
        │
        ▼
9. 根据类型执行填充
        │
        ├──▶ autoFillFiles(): 设置 boxOptions.file, mode = FILE
        │
        ├──▶ autoFillText(): 
        │    - 短文本 (<=80字符): 填入 searchVal
        │    - 长文本: 仅显示为标签
        │
        └──▶ autoFillImage(): 显示为标签

10. 用户按 ESC 或执行操作
        │
        ▼
11. clearClipboard({ remember: true })
        │
        ├──▶ 记录 lastClearedTimestamp
        ├──▶ 添加到 autoPastedTimestamps
        └──▶ 清空 clipboardOptions.last
```

### 2.6 配置项

```typescript
// AppSetting.tools.autoPaste
interface AutoPasteConfig {
  enable: boolean   // 是否启用自动粘贴
  time: number      // 剪贴板有效时间（秒）
                    // -1: 禁用
                    // 0: 使用默认 5 分钟限制
                    // >0: 指定秒数内有效
}

// AppSetting.tools.autoClear
// -1: 禁用自动清除
// >0: 隐藏后指定秒数清除搜索框
```

---

## 三、AutoClear 机制

### 3.1 触发条件

AutoClear 在 CoreBox 从隐藏状态重新显示时触发检查：

```typescript
// useVisibility.ts
function checkAutoClear(): void {
  if (appSetting.tools.autoClear === -1 || boxOptions.lastHidden <= 0) return

  const timeSinceHidden = Date.now() - boxOptions.lastHidden
  const autoClearMs = appSetting.tools.autoClear * 1000

  if (timeSinceHidden > autoClearMs) {
    // 清除所有状态
    searchVal.value = ''
    boxOptions.mode = BoxMode.INPUT
    boxOptions.data = {}
    boxOptions.file = { buffer: null, paths: [] }
    boxOptions.layout = undefined
    clipboardOptions.last = null
    clipboardOptions.detectedAt = null
    clipboardOptions.lastClearedTimestamp = null
    deactivateAllProviders()
  }
}
```

### 3.2 流程

```
CoreBox 隐藏
    │
    ▼
记录 boxOptions.lastHidden = Date.now()
    │
    ▼
用户重新打开 CoreBox
    │
    ▼
checkAutoClear() 检查
    │
    ├──▶ autoClear === -1 → 跳过
    │
    ├──▶ timeSinceHidden > autoClearMs
    │    │
    │    ▼
    │    清除: searchVal, mode, data, file, layout, clipboard
    │
    └──▶ timeSinceHidden <= autoClearMs → 保留状态
```

### 3.3 清除的状态

| 状态 | 清除后的值 |
|------|-----------|
| `searchVal` | `''` |
| `boxOptions.mode` | `BoxMode.INPUT` |
| `boxOptions.data` | `{}` |
| `boxOptions.file` | `{ buffer: null, paths: [] }` |
| `boxOptions.layout` | `undefined` |
| `clipboardOptions.last` | `null` |
| `clipboardOptions.detectedAt` | `null` |
| `clipboardOptions.lastClearedTimestamp` | `null` |

### 3.4 与 AutoPaste 的交互

AutoClear 在 `onShow()` 中先于 AutoPaste 执行：

```typescript
function onShow(): void {
  checkAutoClear()  // 先检查是否需要清除

  if (wasTriggeredByShortcut.value && isClipboardFreshForAutoPaste()) {
    handlePaste({ triggerSearch: true })
    handleAutoFill()
  }
}
```

这意味着：
- 如果 AutoClear 触发，剪贴板状态会被清除
- 但如果有新的剪贴板内容且满足 AutoPaste 条件，会重新填充

---

## 四、相关文件索引

| 文件路径 | 功能 |
|---------|------|
| `apps/core-app/src/main/modules/clipboard.ts` | 主进程剪贴板模块 |
| `apps/core-app/src/main/modules/box-tool/core-box/window.ts` | CoreBox 窗口管理 |
| `apps/core-app/src/main/modules/box-tool/core-box/ipc.ts` | CoreBox IPC 通道 |
| `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/context-provider.ts` | 推荐引擎上下文 |
| `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useClipboard.ts` | 渲染进程剪贴板 Hook |
| `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useClipboardChannel.ts` | 剪贴板通道通信 |
| `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useClipboardState.ts` | 剪贴板状态管理 |
| `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useVisibility.ts` | CoreBox 可见性管理 |
| `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts` | 搜索逻辑（构建 TuffQuery） |
| `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useKeyboard.ts` | 键盘事件处理 |
| `apps/core-app/src/main/db/schema.ts` | 数据库 Schema (clipboardHistory) |