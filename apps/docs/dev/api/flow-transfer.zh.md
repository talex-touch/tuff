# Flow Transfer API

Flow Transfer 是一个插件间数据流转系统，允许插件将结构化数据传递给其他插件进行处理。类似于移动端的"分享"功能，但更加强大和灵活。

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

### 接收 Flow（接收方）

当你的插件是 Flow 目标时，Flow 数据会通过 Feature 的 `query` 参数传递：

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

## 最佳实践

1. **声明支持的类型**：在 manifest 中准确声明 `supportedTypes`，避免接收无法处理的数据
2. **提供有意义的名称**：Flow 目标的 `name` 和 `description` 会显示在选择面板中
3. **及时响应**：收到 Flow 后尽快调用 `acknowledge` 或 `reportError`
4. **处理超时**：设置合理的 `timeout`，并提供 `fallbackAction`
5. **验证数据**：接收方应验证 payload 数据的完整性和有效性

## 相关文档

- [DivisionBox API](./division-box.zh.md) - 独立窗口系统
- [Plugin Manifest](../manifest.zh.md) - 插件配置
- [Feature SDK](./feature-sdk.zh.md) - Feature 开发
