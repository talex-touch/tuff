# MetaSDK / QuickActions SDK 使用文档

MetaSDK 允许插件在 MetaOverlay（MetaK / Quick Actions）中注册全局操作，这些操作会出现在所有 item 的操作面板中。`context.utils.meta` 是兼容别名，新增代码优先使用 `context.utils.quickActions`。

## 快速开始

```typescript
export default {
  onInit(context) {
    const { quickActions } = context.utils

    // 注册一个全局操作
    const unregister = quickActions.registerAction({
      id: 'my-plugin-action',
      render: {
        basic: {
          title: '我的操作',
          subtitle: '执行我的插件功能',
          icon: { type: 'class', value: 'i-ri-star-line' }
        },
        shortcut: '⌘M',
        group: '插件操作'
      },
      priority: 100
    })

    // 监听操作执行
    quickActions.onActionExecute((data) => {
      if (data.actionId === 'my-plugin-action') {
        console.log('操作被执行，item:', data.item.id)
        // 处理操作
      }
    })

    // 插件卸载时清理
    return () => {
      unregister()
      quickActions.unregisterAll()
    }
  }
}
```

## API 参考

### `registerAction(action: MetaAction): () => void`

注册一个全局操作。

**参数**:
- `action`: 操作定义

**返回**: 清理函数，调用后取消注册

**示例**:
```typescript
const unregister = plugin.meta.registerAction({
  id: 'custom-action',
  render: {
    basic: {
      title: '自定义操作',
      subtitle: '操作描述',
      icon: { type: 'emoji', value: '🚀' }
    },
    shortcut: '⌘K',
    group: '自定义'
  },
  priority: 100
})
```

### `unregisterAll(): void`

取消注册该插件的所有操作。

**示例**:
```typescript
// 插件卸载时
plugin.meta.unregisterAll()
```

### `onActionExecute(handler: ActionExecuteHandler): () => void`

注册操作执行监听器。

**参数**:
- `handler`: 处理函数，接收 `{ actionId: string, item: TuffItem }`

**返回**: 清理函数

**示例**:
```typescript
const unsubscribe = plugin.meta.onActionExecute((data) => {
  console.log(`操作 ${data.actionId} 被执行`)
  console.log('目标 item:', data.item.id)
})
```

### `getNativeShareTargets(payloadType?: FlowPayloadType): Promise<FlowTargetInfo[]>`

查询当前平台真实暴露的原生分享目标。该方法复用 FlowBus 的 native share registry，只返回 `isNativeShare === true` 的目标。

**平台边界**:
- macOS: `system-share`、`airdrop`、`mail`、`messages`
- Windows / Linux: 当前仅暴露明确的 `mail` fallback，不伪装系统分享面板

**示例**:
```typescript
const targets = await plugin.quickActions.getNativeShareTargets('files')
const canAirDrop = targets.some((target) => target.id === 'airdrop')
```

### `nativeShare(payload: FlowPayload, options?: { target?: string }): Promise<NativeShareResult>`

通过平台原生分享桥发送结构化 payload。底层使用现有 `flow:native:share` 通道，因此权限、平台降级和错误语义与 Flow Transfer 保持一致。

**示例**:
```typescript
await plugin.quickActions.nativeShare(
  {
    type: 'text',
    data: 'Hello from Tuff',
    context: {
      sourcePluginId: 'my-plugin',
      metadata: { title: 'Share text' }
    }
  },
  { target: 'mail' }
)
```

### `createSharePayloadFromItem(item: TuffItem, options?: QuickActionItemSharePayloadOptions): FlowPayload`

把当前 CoreBox item 转成原生分享可消费的 Flow payload：
- 文件 item 优先输出 `{ type: 'files', data: [path] }`
- 链接 / 普通 item 输出 `{ type: 'text', data: title + subtitle + url }`
- `metadata` 会保留 `itemId`、`itemKind`、`sourceId` 和 `sourceType`

**示例：在 MetaK 动作里使用 AirDrop 或系统分享**
```typescript
export default {
  onInit(context) {
    const { quickActions } = context.utils

    quickActions.registerAction({
      id: 'share-current-item',
      render: {
        basic: {
          title: 'Share with native target',
          subtitle: 'Use AirDrop, Mail, Messages, or the current platform fallback',
          icon: { type: 'class', value: 'i-ri-share-line' }
        },
        shortcut: '⌘⇧S',
        group: 'Share'
      },
      priority: 120
    })

    quickActions.onActionExecute(async ({ actionId, item }) => {
      if (actionId !== 'share-current-item') return

      const payload = quickActions.createSharePayloadFromItem(item)
      const targets = await quickActions.getNativeShareTargets(payload.type)
      const target = targets.some((candidate) => candidate.id === 'airdrop')
        ? 'airdrop'
        : 'system-share'

      const result = await quickActions.nativeShare(payload, { target })
      if (!result.success) {
        console.warn('Native share failed:', result.error)
      }
    })
  }
}
```

## MetaAction 类型

```typescript
interface MetaAction {
  id: string                    // 唯一标识
  render: {
    basic: {
      title: string            // 操作标题
      subtitle?: string        // 操作描述
      icon?: ITuffIcon         // 图标
    }
    shortcut?: string          // 快捷键，如 '⌘C'
    group?: string             // 分组标题
    disabled?: boolean         // 是否禁用
    danger?: boolean           // 危险操作（红色）
  }
  priority?: number            // 优先级（默认 100）
}
```

## 完整示例

```typescript
export default {
  onInit(context) {
    const { meta } = context.utils

    // 注册多个操作
    meta.registerAction({
      id: 'analyze-item',
      render: {
        basic: {
          title: '分析项目',
          subtitle: '使用 AI 分析当前项目',
          icon: { type: 'class', value: 'i-ri-brain-line' }
        },
        shortcut: '⌘A',
        group: 'AI 操作'
      }
    })

    meta.registerAction({
      id: 'share-item',
      render: {
        basic: {
          title: '分享项目',
          subtitle: '分享到其他应用',
          icon: { type: 'class', value: 'i-ri-share-line' }
        },
        shortcut: '⌘S',
        group: '分享'
      }
    })

    // 监听所有操作
    meta.onActionExecute((data) => {
      switch (data.actionId) {
        case 'analyze-item':
          // 处理分析
          break
        case 'share-item':
          // 处理分享
          break
      }
    })
  },

  onDestroy() {
    // 清理所有操作
    this.context.utils.meta.unregisterAll()
  }
}
```

## 注意事项

1. **优先级**: 插件操作的默认优先级是 100，高于内置操作（0）和 item 操作（50）
2. **唯一性**: 操作 ID 必须在插件内唯一
3. **清理**: 插件卸载时应该调用 `unregisterAll()` 清理所有操作
4. **快捷键**: 快捷键仅在 MetaOverlay 打开时有效
5. **平台分享**: 不要自行猜测 AirDrop 或系统分享是否可用，先调用 `getNativeShareTargets()`；不可用时回退到 `mail`、复制或插件自定义流程

## 后续可开放能力

- **动作可见性配置**: 基于 item kind、source、permission、platform 的显示/禁用规则。
- **动作分组排序配置**: 允许插件声明 group order、默认展开状态和常用动作 pin 策略。
- **原生分享目标偏好**: 允许用户按插件或 item kind 记住首选目标，例如文件默认 AirDrop、文本默认 Mail。
- **动作确认与危险操作审计**: 对删除、外发、自动化类动作提供统一确认与审计字段。
- **批量 item 操作**: 支持多选 item 的 MetaK 动作和原生分享文件集合。
- **平台能力诊断**: 在 SDK 返回值中暴露 unsupported/degraded reason，方便插件显示精确 fallback。
