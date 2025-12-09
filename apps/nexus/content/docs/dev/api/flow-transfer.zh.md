# Flow Transfer API

Flow Transfer 是一个插件间数据流转系统，允许插件将结构化数据传递给其他插件进行处理。类似于移动端的"分享"功能，但更加强大和灵活。

> **v2.4.7 新特性**：
> - 插件需要主动注册 `onFlowTransfer` 处理器才能接收 Flow 数据
> - 支持调用系统原生 Share 功能（macOS AirDrop、邮件、信息等）
> - 目标列表按适配状态排序，未适配插件会显示提示

## 核心概念

### Flow Payload（流转载荷）

发起插件提交的标准化数据包：

```typescript
interface FlowPayload {
  /** 载荷类型 */
  type: 'text' | 'image' | 'files' | 'json' | 'html' | 'custom'
  
  /** 主要数据内容 */
  data: string | object
  
  /** 数据的 MIME 类型（可选） */
  mimeType?: string
  
  /** 上下文元信息 */
  context?: {
    sourcePluginId: string
    sourceFeatureId?: string
    originalQuery?: TuffQuery
    metadata?: Record<string, any>
  }
}
```

### Flow Target（流转目标）

接收端在 manifest 中声明的可接收 Flow 的端点：

```typescript
interface FlowTarget {
  /** 目标唯一 ID（插件内唯一） */
  id: string
  
  /** 显示名称 */
  name: string
  
  /** 描述 */
  description?: string
  
  /** 支持的载荷类型 */
  supportedTypes: ('text' | 'image' | 'files' | 'json' | 'html' | 'custom')[]
  
  /** 图标（iconify 格式） */
  icon?: string
  
  /** 关联的 Feature ID */
  featureId?: string
}
```

## 快捷键

Flow Transfer 提供两个全局快捷键（可在设置中自定义）：

| 快捷键 | 功能 | 说明 |
|--------|------|------|
| `Command/Ctrl+D` | 分离到 DivisionBox | 将当前选中项分离到独立窗口 |
| `Command/Ctrl+Shift+D` | Flow 流转 | 打开 Flow 选择面板，将数据发送到其他插件 |

## 插件配置

### 在 manifest.json 中声明 Flow 能力

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  
  "capabilities": {
    "flowSender": true
  },
  
  "flowTargets": [
    {
      "id": "quick-note",
      "name": "快速记录",
      "description": "将内容保存为笔记",
      "supportedTypes": ["text", "html", "image"],
      "icon": "ri:sticky-note-line",
      "featureId": "create-note"
    },
    {
      "id": "translate",
      "name": "翻译",
      "description": "翻译选中的文本",
      "supportedTypes": ["text"],
      "icon": "ri:translate",
      "featureId": "translate-text"
    }
  ]
}
```

## SDK 使用

### 发起 Flow（发送方）

```typescript
import { createFlowSDK } from '@talex-touch/utils/plugin/sdk'

// 创建 Flow SDK 实例
const flow = createFlowSDK(channel, 'my-plugin-id')

// 发起流转
async function shareToOtherPlugin() {
  const result = await flow.dispatch(
    {
      type: 'text',
      data: 'Hello from my plugin!',
      context: {
        sourcePluginId: 'my-plugin-id',
        metadata: { timestamp: Date.now() }
      }
    },
    {
      title: '分享文本',
      description: '将文本发送到其他插件'
    }
  )
  
  console.log('Flow result:', result.state)
}

// 直接发送到指定目标（跳过选择面板）
async function sendToSpecificTarget() {
  const result = await flow.dispatch(
    {
      type: 'json',
      data: { title: 'Note', content: 'Content...' }
    },
    {
      preferredTarget: 'notes-plugin.quick-note',
      skipSelector: true,
      requireAck: true,
      timeout: 10000,
      fallbackAction: 'copy'
    }
  )
  
  if (result.state === 'ACKED') {
    console.log('Acknowledged:', result.ackPayload)
  }
}
```

### 获取可用目标

```typescript
// 获取所有可用目标
const allTargets = await flow.getAvailableTargets()

// 获取支持特定类型的目标
const textTargets = await flow.getAvailableTargets('text')
const imageTargets = await flow.getAvailableTargets('image')
```

### 接收 Flow（接收方）⚡ 重要

**插件必须注册 `onFlowTransfer` 处理器才能接收 Flow 数据。** 未注册的插件仍会在目标列表中显示，但会标记为"未适配"并排在列表末尾。

```typescript
import { createFlowSDK } from '@talex-touch/utils/plugin/sdk'

const flow = createFlowSDK(channel, 'my-plugin-id')

// 注册 Flow 接收处理器（必需！）
const unsubscribe = flow.onFlowTransfer(async (payload, sessionId, sender) => {
  console.log(`收到来自 ${sender.senderName} 的 ${payload.type} 数据`)
  
  try {
    // 处理数据
    const result = await processPayload(payload)
    
    // 发送确认
    await flow.acknowledge(sessionId, { success: true, result })
  } catch (error) {
    // 报告错误
    await flow.reportError(sessionId, error.message)
  }
})

// 组件卸载时取消注册
onUnmounted(() => {
  unsubscribe()
})
```

#### 通过 Feature 触发（备选方式）

你也可以通过 Feature 的 `query` 参数接收 Flow 数据：

```typescript
import { extractFlowData, isFlowTriggered } from '@talex-touch/utils/plugin/sdk'

function onFeatureTriggered(featureId: string, query: TuffQuery) {
  // 检查是否通过 Flow 触发
  if (isFlowTriggered(query)) {
    const flowData = extractFlowData(query)
    if (flowData) {
      console.log('来自:', flowData.senderId)
      console.log('类型:', flowData.payload.type)
      console.log('数据:', flowData.payload.data)
      
      // 处理 Flow 数据
      processFlowPayload(flowData.sessionId, flowData.payload)
    }
  } else {
    // 普通触发（非 Flow）
    console.log('普通查询:', query.text)
  }
}
```

### 发送确认响应

```typescript
async function processFlowPayload(sessionId: string, payload: FlowPayload) {
  try {
    // 处理数据...
    const result = await saveNote(payload.data)
    
    // 发送确认
    await flow.acknowledge(sessionId, {
      success: true,
      noteId: result.id,
      message: '保存成功'
    })
  } catch (error) {
    // 报告错误
    await flow.reportError(sessionId, error.message)
  }
}
```

## Flow 会话状态

```typescript
type FlowSessionState =
  | 'INIT'             // 初始化
  | 'TARGET_SELECTING' // 用户选择目标中
  | 'TARGET_SELECTED'  // 目标已选择
  | 'DELIVERING'       // 投递中
  | 'DELIVERED'        // 已投递
  | 'PROCESSING'       // 目标处理中
  | 'ACKED'            // 已确认完成
  | 'FAILED'           // 失败
  | 'CANCELLED'        // 已取消
```

## 错误处理

```typescript
enum FlowErrorCode {
  SENDER_NOT_ALLOWED = 'SENDER_NOT_ALLOWED',
  TARGET_NOT_FOUND = 'TARGET_NOT_FOUND',
  TARGET_OFFLINE = 'TARGET_OFFLINE',
  PAYLOAD_INVALID = 'PAYLOAD_INVALID',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  TYPE_NOT_SUPPORTED = 'TYPE_NOT_SUPPORTED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  TIMEOUT = 'TIMEOUT',
  CANCELLED = 'CANCELLED',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}
```

## 原生系统分享

Flow Transfer 集成了系统原生分享功能，可以将数据分享到 AirDrop、邮件、信息等系统应用。

### 使用原生分享

```typescript
const flow = createFlowSDK(channel, 'my-plugin-id')

// 使用系统分享
const result = await flow.nativeShare({
  type: 'text',
  data: 'Hello World!'
})

// 指定分享目标
const result = await flow.nativeShare(
  { type: 'text', data: 'Hello!' },
  'airdrop'  // 可选: 'system' | 'airdrop' | 'mail' | 'messages'
)

if (result.success) {
  console.log('分享成功:', result.target)
} else {
  console.error('分享失败:', result.error)
}
```

### 支持的原生目标

| 平台 | 目标 | 说明 |
|------|------|------|
| macOS | `system` | 系统分享面板 |
| macOS | `airdrop` | AirDrop |
| macOS | `mail` | 邮件 |
| macOS | `messages` | 信息 (iMessage) |
| Windows | `system` | Windows 分享 |
| Windows | `mail` | 邮件 |

---

## 目标排序规则

Flow 目标列表按以下优先级排序：

1. **原生分享目标** - 系统分享功能优先显示
2. **已适配插件** - 注册了 `onFlowTransfer` 处理器的插件
3. **未适配插件** - 未注册处理器的插件（显示"未适配"提示）

```typescript
// FlowTargetInfo 中的适配状态字段
interface FlowTargetInfo {
  // ...其他字段
  hasFlowHandler: boolean    // 是否已注册处理器
  isNativeShare?: boolean    // 是否为原生分享目标
  adaptationHint?: string    // 适配提示（如"该插件尚未适配 Flow Transfer"）
}
```

---

## 最佳实践

1. **注册 onFlowTransfer**：始终注册处理器以获得最佳用户体验
2. **声明支持的类型**：在 manifest 中准确声明 `supportedTypes`，避免接收无法处理的数据
3. **提供有意义的名称**：Flow 目标的 `name` 和 `description` 会显示在选择面板中
4. **及时响应**：收到 Flow 后尽快调用 `acknowledge` 或 `reportError`
5. **处理超时**：设置合理的 `timeout`，并提供 `fallbackAction`
6. **验证数据**：接收方应验证 payload 数据的完整性和有效性

## 相关文档

- [DivisionBox API](./division-box.zh.md) - 独立窗口系统
- [Plugin Manifest](../manifest.zh.md) - 插件配置
