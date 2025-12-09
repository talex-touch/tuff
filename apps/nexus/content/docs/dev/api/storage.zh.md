# Storage API

插件存储 SDK 提供基于文件的持久化存储能力，数据在应用重启后仍然保留。

## 快速开始

```ts
import { usePluginStorage } from '@talex-touch/utils/plugin/sdk'

const storage = usePluginStorage()

// 保存配置
await storage.setFile('settings.json', { theme: 'dark', fontSize: 14 })

// 读取配置
const settings = await storage.getFile('settings.json')
console.log(settings) // { theme: 'dark', fontSize: 14 }
```

---

## 容量限制

- **每个插件 10MB**，超出后写入会被拒绝
- 数据存储在 `<userData>/config/plugins/<pluginName>/` 目录下
- 系统自动处理文件名清理，防止路径遍历攻击

---

## API 参考

### 获取 Storage 实例

```ts
import { usePluginStorage } from '@talex-touch/utils/plugin/sdk'

const storage = usePluginStorage()
```

> **注意**：必须在插件渲染器上下文中调用。

### 文件操作

#### `getFile(fileName)`

读取存储文件内容。

```ts
const config = await storage.getFile('config.json')
// 如果文件不存在，返回 null
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `fileName` | `string` | 文件名（支持子目录如 `data/cache.json`） |
| 返回值 | `Promise<any>` | 文件内容（自动 JSON 解析），不存在返回 `null` |

#### `setFile(fileName, content)`

写入存储文件。

```ts
await storage.setFile('settings.json', { 
  theme: 'dark',
  shortcuts: ['Cmd+K']
})
// 返回 { success: true }
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `fileName` | `string` | 文件名 |
| `content` | `any` | 要存储的内容（自动 JSON 序列化） |
| 返回值 | `Promise<{ success: boolean, error?: string }>` | 操作结果 |

#### `deleteFile(fileName)`

删除存储文件。

```ts
await storage.deleteFile('old-cache.json')
```

#### `listFiles()`

列出插件所有存储文件。

```ts
const files = await storage.listFiles()
// ['settings.json', 'data/cache.json']
```

#### `clearAll()`

清空插件所有存储数据。

```ts
await storage.clearAll()
// ⚠️ 此操作不可逆
```

---

### 高级功能

#### `getStats()`

获取存储统计信息。

```ts
const stats = await storage.getStats()
// {
//   totalSize: 1024,      // 总大小（字节）
//   fileCount: 3,         // 文件数量
//   limit: 10485760,      // 容量限制（10MB）
//   usagePercent: 0.01    // 使用率
// }
```

#### `getTree()`

获取存储目录树结构。

```ts
const tree = await storage.getTree()
// [
//   { name: 'settings.json', type: 'file', size: 256 },
//   { name: 'data', type: 'directory', children: [...] }
// ]
```

#### `getFileDetails(fileName)`

获取文件详细信息。

```ts
const details = await storage.getFileDetails('settings.json')
// {
//   name: 'settings.json',
//   size: 256,
//   createdAt: 1702123456789,
//   modifiedAt: 1702123456789
// }
```

#### `openFolder()`

在系统文件管理器中打开插件存储目录。

```ts
await storage.openFolder()
// 打开 Finder/Explorer
```

---

### 监听变更

监听存储文件的变化，适用于多窗口同步场景。

```ts
const unsubscribe = storage.onDidChange('settings.json', (data) => {
  console.log('配置已更新:', data)
  // 重新加载配置
})

// 停止监听
unsubscribe()
```

---

## 最佳实践

### 1. 结构化配置管理

```ts
interface PluginSettings {
  theme: 'light' | 'dark'
  language: string
  shortcuts: Record<string, string>
}

async function loadSettings(): Promise<PluginSettings> {
  const defaults: PluginSettings = {
    theme: 'dark',
    language: 'zh-CN',
    shortcuts: {}
  }
  
  const saved = await storage.getFile('settings.json')
  return { ...defaults, ...saved }
}

async function saveSettings(settings: PluginSettings) {
  await storage.setFile('settings.json', settings)
}
```

### 2. 缓存过期处理

```ts
interface CacheEntry<T> {
  data: T
  expiresAt: number
}

async function getCached<T>(key: string): Promise<T | null> {
  const entry = await storage.getFile(`cache/${key}.json`) as CacheEntry<T> | null
  
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    await storage.deleteFile(`cache/${key}.json`)
    return null
  }
  
  return entry.data
}

async function setCache<T>(key: string, data: T, ttlMs: number = 3600000) {
  const entry: CacheEntry<T> = {
    data,
    expiresAt: Date.now() + ttlMs
  }
  await storage.setFile(`cache/${key}.json`, entry)
}
```

### 3. 容量监控

```ts
async function checkStorageQuota() {
  const stats = await storage.getStats()
  
  if (stats.usagePercent > 0.8) {
    console.warn('[Plugin] 存储空间使用超过 80%，考虑清理旧数据')
    // 清理过期缓存
    await cleanExpiredCache()
  }
}
```

---

## 调试技巧

1. **查看当前存储内容**：使用 `openFolder()` 直接查看文件
2. **DevTools 调试**：`pnpm core:dev` 模式下会在 Console 打印存储变更日志
3. **IPC 命令**：使用 `plugin:storage:get-file` 直接查询

---

## 类型定义

```ts
interface StorageStats {
  totalSize: number
  fileCount: number
  limit: number
  usagePercent: number
}

interface StorageTreeNode {
  name: string
  type: 'file' | 'directory'
  size?: number
  children?: StorageTreeNode[]
}

interface FileDetails {
  name: string
  size: number
  createdAt: number
  modifiedAt: number
}
```
