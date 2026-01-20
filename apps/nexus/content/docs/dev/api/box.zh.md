# Box SDK

## 概述

Box SDK 提供插件控制 CoreBox 窗口行为的能力，包括显示/隐藏、大小调整、输入框控制等。

## 介绍

**快速开始**

```typescript
import { useBox } from '@talex-touch/utils/plugin/sdk'

const box = useBox()

// 隐藏 CoreBox
box.hide()

// 展开 CoreBox 显示 10 个结果
await box.expand({ length: 10 })

// 获取当前输入
const input = await box.getInput()
```

---

## API 参考

**useBox()**

获取 Box SDK 实例。

```typescript
import { useBox } from '@talex-touch/utils/plugin/sdk'

const box = useBox()
```

> **注意**：必须在插件渲染器上下文中调用。

---

## 窗口控制

**`hide()`**

隐藏 CoreBox 窗口。

```typescript
box.hide()
```

**`show()`**

显示 CoreBox 窗口。

```typescript
box.show()
```

**`expand(options?)`**

展开 CoreBox 窗口以显示更多结果。

```typescript
// 展开显示 10 个项目
await box.expand({ length: 10 })

// 强制最大展开
await box.expand({ forceMax: true })

// 默认展开
await box.expand()
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `length` | `number` | 要显示的项目数量 |
| `forceMax` | `boolean` | 强制最大展开 |

**`shrink()`**

收缩 CoreBox 窗口到紧凑模式。

```typescript
await box.shrink()
```

---

## 输入框控制

**`hideInput()`**

隐藏搜索输入框。

```typescript
await box.hideInput()
```

**`showInput()`**

显示搜索输入框。

```typescript
await box.showInput()
```

**`getInput()`**

获取当前输入框的值。

```typescript
const input = await box.getInput()
console.log('当前输入:', input)
```

**`setInput(value)`**

设置输入框的值。

```typescript
await box.setInput('hello world')
```

**`clearInput()`**

清空输入框。

```typescript
await box.clearInput()
```

---

## 监听功能

**`allowInput()`**

启用输入监听，允许插件接收输入变化事件。

```typescript
import { useBox, useChannel } from '@talex-touch/utils/plugin/sdk'

const box = useBox()
const channel = useChannel()

// 启用输入监听
await box.allowInput()

// 监听输入变化
channel.regChannel('core-box:input-change', ({ data }) => {
  console.log('输入变化:', data.input)
})
```

**`allowClipboard(types)`**

启用剪贴板监听，允许插件接收剪贴板变化事件。

```typescript
import { useBox, ClipboardType, ClipboardTypePresets } from '@talex-touch/utils/plugin/sdk'

const box = useBox()

// 监听文本和图片
await box.allowClipboard(ClipboardType.TEXT | ClipboardType.IMAGE)

// 或使用预设
await box.allowClipboard(ClipboardTypePresets.ALL)
```

**ClipboardType 枚举**

| 值 | 二进制 | 说明 |
|------|------|------|
| `TEXT` | `0b0001` | 文本 |
| `IMAGE` | `0b0010` | 图片 |
| `FILE` | `0b0100` | 文件 |

**预设组合**

```typescript
import { ClipboardTypePresets } from '@talex-touch/utils/plugin/sdk'

// 仅文本
ClipboardTypePresets.TEXT_ONLY

// 文本和图片
ClipboardTypePresets.TEXT_AND_IMAGE

// 所有类型
ClipboardTypePresets.ALL
```

---

## 完整示例

**翻译插件示例**

```typescript
import { useBox, useClipboard, ClipboardType } from '@talex-touch/utils/plugin/sdk'

const box = useBox()
const clipboard = useClipboard()

// 初始化
async function init() {
  // 启用剪贴板监听
  await box.allowClipboard(ClipboardType.TEXT)
  
  // 监听剪贴板变化
  clipboard.history.onDidChange(async (item) => {
    if (item.type === 'text') {
      // 自动翻译新复制的文本
      const translated = await translate(item.content)
      console.log('翻译结果:', translated)
    }
  })
}

// 输出翻译结果
async function outputTranslation(text: string) {
  // 隐藏 CoreBox 并粘贴结果
  await clipboard.copyAndPaste({ text })
}
```

**搜索插件示例**

```typescript
import { useBox, useChannel } from '@talex-touch/utils/plugin/sdk'

const box = useBox()
const channel = useChannel()

async function init() {
  // 启用输入监听
  await box.allowInput()
  
  // 监听输入变化
  channel.regChannel('core-box:input-change', async ({ data }) => {
    const results = await search(data.input)
    
    // 根据结果数量调整窗口大小
    await box.expand({ length: Math.min(results.length, 10) })
  })
}
```

---

## 类型定义

```typescript
interface BoxSDK {
  hide(): void
  show(): void
  expand(options?: BoxExpandOptions): Promise<void>
  shrink(): Promise<void>
  hideInput(): Promise<void>
  showInput(): Promise<void>
  getInput(): Promise<string>
  setInput(value: string): Promise<void>
  clearInput(): Promise<void>
  allowInput(): Promise<void>
  allowClipboard(types: number): Promise<void>
}

interface BoxExpandOptions {
  length?: number
  forceMax?: boolean
}

enum ClipboardType {
  TEXT = 0b0001,
  IMAGE = 0b0010,
  FILE = 0b0100,
}
```

## 最佳实践

- 在输入监听或剪贴板监听不再需要时及时停用，减少事件噪音。
- 根据结果数量调用 `expand`/`shrink`，保持 UI 反馈节奏一致。
- 监听回调中避免重计算，必要时做节流处理。

## 技术原理

- Box SDK 通过 IPC 请求主进程执行窗口与输入控制，避免渲染进程直接操作窗口状态。
- 监听能力由 CoreBox 主进程统一管理，按授权类型筛选后向插件分发事件。
