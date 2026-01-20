# Keyboard API

## 概述

当插件的 UI View 附加到 CoreBox 时，系统提供键盘事件的自动处理和转发机制，让插件能够响应用户的键盘操作。

## 介绍
键盘事件适合做快捷操作与导航控制，插件侧可选择 Feature SDK、Bridge Hook 或 Channel 监听。

## ESC 键自动退出

在 UI View 中按下 ESC 键会**自动退出 UI 模式**（deactivate providers），无需插件手动处理。

**行为说明**
- 用户在插件 UI View 中按下 ESC
- 系统自动调用 `exitUIMode()` 退出 UI 模式
- 插件 UI View 被卸载，CoreBox 恢复到搜索状态
- 这与 CoreBox 主界面的 ESC 行为保持一致

**技术实现**
系统通过监听 WebContents 的 `before-input-event` 事件来捕获 ESC 键：

```typescript
// 主进程自动处理（插件无需关心）
uiView.webContents.on('before-input-event', (event, input) => {
  if (input.key === 'Escape' && input.type === 'keyDown') {
    coreBoxManager.exitUIMode()
    event.preventDefault()
  }
})
```

## 键盘事件转发

当焦点在 CoreBox 主输入框时，特定按键会被转发到插件 UI View。

**转发的按键**
| 按键 | 说明 |
| --- | --- |
| `Enter` | 确认/提交操作 |
| `ArrowUp` | 向上导航 |
| `ArrowDown` | 向下导航 |
| `Meta/Ctrl + *` | 快捷键组合（Cmd+V 除外） |

> **注意**：`ArrowLeft` 和 `ArrowRight` 不会被转发，因为它们用于输入框中的文本编辑。如果需要左右导航，请使用 `Meta/Ctrl + ArrowLeft/ArrowRight`。

**监听键盘事件**

**方式一：使用 Feature SDK**

```typescript
import { useFeature } from '@talex-touch/utils/plugin/sdk'

const feature = useFeature()

const unsubscribe = feature.onKeyEvent((event) => {
  if (event.key === 'Enter') {
    // 处理回车键
    submitSelection()
  } else if (event.key === 'ArrowDown') {
    // 向下导航
    selectNext()
  } else if (event.key === 'ArrowUp') {
    // 向上导航
    selectPrev()
  } else if (event.metaKey && event.key === 'k') {
    // 处理 Cmd+K
    openSearch()
  }
})

// 清理时取消监听
onUnmounted(() => {
  unsubscribe()
})
```

**方式二：使用 Bridge Hook**

```typescript
import { onCoreBoxKeyEvent } from '@talex-touch/utils/plugin/sdk/hooks/bridge'

onCoreBoxKeyEvent((event) => {
  console.log('Key pressed:', event.key)
  
  if (event.key === 'Enter' && !event.repeat) {
    handleSubmit()
  }
})
```

**方式三：直接监听 Channel**

```typescript
// 在插件 renderer 中
window.$channel.on('core-box:key-event', (event) => {
  const { key, metaKey, ctrlKey } = event
  // 处理按键
})
```

## 事件数据结构

```typescript
interface ForwardedKeyEvent {
  key: string       // 按键名称，如 'Enter', 'ArrowDown'
  code: string      // 按键代码，如 'Enter', 'ArrowDown'
  metaKey: boolean  // Cmd/Win 键是否按下
  ctrlKey: boolean  // Ctrl 键是否按下
  altKey: boolean   // Alt 键是否按下
  shiftKey: boolean // Shift 键是否按下
  repeat: boolean   // 是否为重复按键（长按）
}
```

## IPC 通道

| 通道名称 | 方向 | 说明 |
| --- | --- | --- |
| `core-box:key-event` | 主进程 → 插件 | 键盘事件转发 |
| `core-box:forward-key-event` | 渲染进程 → 主进程 | 请求转发按键 |
| `core-box:get-ui-view-state` | 渲染进程 → 主进程 | 查询 UI View 状态 |
| `core-box:ui-mode-exited` | 主进程 → 渲染进程 | UI 模式已退出通知 |

## 技术原理
- 主进程监听 `before-input-event` 统一处理 ESC，保证行为一致。
- 键盘事件经由 CoreBox 转发到插件渲染进程，供 SDK/Hook 封装消费。

## 最佳实践

**1. 避免重复处理**
ESC 键已由系统自动处理，插件不应再监听 ESC 来退出 UI 模式。

**2. 检查 repeat 标志**
对于需要单次触发的操作（如提交），应检查 `repeat` 标志：

```typescript
feature.onKeyEvent((event) => {
  if (event.key === 'Enter' && !event.repeat) {
    // 只在首次按下时触发
    submitForm()
  }
})
```

**3. 组合键处理**
处理组合键时，注意平台差异：

```typescript
feature.onKeyEvent((event) => {
  // macOS 使用 metaKey (Cmd)，Windows/Linux 使用 ctrlKey
  const modifier = event.metaKey || event.ctrlKey
  
  if (modifier && event.key === 's') {
    // Cmd+S 或 Ctrl+S 保存
    saveDocument()
  }
})
```

**4. 清理监听器**
在组件卸载时取消监听，避免内存泄漏：

```typescript
const unsubscribe = feature.onKeyEvent(handler)

onUnmounted(() => {
  unsubscribe()
})
```

## 调试

开启 DevTools 后，可以在控制台看到键盘事件日志：

```
[CoreBox] Forwarding key event to UI view: Enter
[CoreBox] ESC pressed in UI view, exiting UI mode
```
