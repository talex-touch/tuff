# SDK API 概述

Tuff 插件 SDK 提供了一套完整的 API，用于开发 CoreBox 插件。所有 API 都采用函数式设计，通过 `use*` 钩子函数获取实例。

## 安装

```bash
pnpm add @talex-touch/utils
```

## SDK 模块

| 模块 | 导入方式 | 说明 |
|------|----------|------|
| [Plugin Context](./plugin-context.zh.md) | `globalThis` | index.js 全局上下文 API |
| [Box SDK](./box.zh.md) | `useBox()` | 控制 CoreBox 窗口 |
| [Clipboard SDK](./clipboard.zh.md) | `useClipboard()` | 剪贴板读写和历史 |
| [Storage SDK](./storage.zh.md) | `usePluginStorage()` | 插件数据持久化 |
| [**Account SDK**](./account.zh.md) | `accountSDK` | **用户信息、订阅、配额** |
| [**TuffTransport**](./transport.zh.md) | `useTuffTransport()` | **新一代 IPC（推荐）** |
| [Channel SDK](./channel.zh.md) | `useChannel()` | IPC 通信（传统） |
| [Feature SDK](./feature.zh.md) | `useFeature()` | 搜索结果管理 |
| [DivisionBox SDK](./division-box.zh.md) | `useDivisionBox()` | 独立窗口管理 |
| [Flow SDK](./flow-transfer.zh.md) | `createFlowSDK()` | 插件间数据流转 |
| [Intelligence SDK](./intelligence.zh.md) | `useIntelligence()` | AI 能力调用 |

::alert{type="info"}
**新功能：** [TuffTransport](./transport.zh.md) 是新插件推荐使用的 IPC API。它提供类型安全的事件、自动批量处理和流式传输支持。查看 [TuffTransport 技术内幕](./transport-internals.zh.md) 了解技术细节。
::

---

## 快速开始

```typescript
import {
  useBox,
  useClipboard,
  usePluginStorage,
  useChannel,
  useFeature,
  useDivisionBox
} from '@talex-touch/utils/plugin/sdk'

// 初始化 SDK
const box = useBox()
const clipboard = useClipboard()
const storage = usePluginStorage()
const channel = useChannel()
const feature = useFeature()
const divisionBox = useDivisionBox()

// 使用示例
async function init() {
  // 读取配置
  const config = await storage.getFile('config.json')
  
  // 监听输入变化
  feature.onInputChange(async (input) => {
    const results = await search(input)
    feature.pushItems(results)
  })
  
  // 监听剪贴板
  await box.allowClipboard(ClipboardType.TEXT)
  clipboard.history.onDidChange((item) => {
    console.log('剪贴板变化:', item)
  })
}
```

---

## 设计原则

### 1. 函数式 API

所有 SDK 都通过 `use*` 函数获取实例，无需手动传递 context：

```typescript
// ✅ 正确
const storage = usePluginStorage()
await storage.getFile('config.json')

// ❌ 错误（旧版 API，已废弃）
// const storage = ctx.storage
// await storage.getItem('key')
```

### 2. 自动上下文检测

SDK 会自动检测插件上下文，无需手动配置：

```typescript
const storage = usePluginStorage()
// 自动获取当前插件名称，无需传递
```

### 3. 返回 Dispose 函数

所有监听器都返回取消订阅函数：

```typescript
const unsubscribe = feature.onInputChange((input) => {
  // ...
})

// 组件卸载时取消订阅
onUnmounted(() => {
  unsubscribe()
})
```

### 4. Promise 异步

所有异步操作返回 Promise：

```typescript
const config = await storage.getFile('config.json')
await clipboard.copyAndPaste({ text: 'Hello' })
```

---

## 类型导入

```typescript
import type {
  TuffItem,
  TuffQuery,
  ClipboardType,
  DivisionBoxConfig,
  FlowPayload
} from '@talex-touch/utils/plugin/sdk'
```

---

## 相关文档

- [插件开发快速开始](../quickstart.zh.md)
- [Manifest 配置](../manifest.zh.md)
- [构建工具 Unplugin](../extensions/unplugin-export-plugin.zh.md)
