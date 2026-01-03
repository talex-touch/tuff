# MetaSDK 使用文档

MetaSDK 允许插件在 MetaOverlay 中注册全局操作，这些操作会出现在所有 item 的操作面板中。

## 快速开始

```typescript
export default {
  onInit(context) {
    const { meta } = context.utils

    // 注册一个全局操作
    const unregister = meta.registerAction({
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
    meta.onActionExecute((data) => {
      if (data.actionId === 'my-plugin-action') {
        console.log('操作被执行，item:', data.item.id)
        // 处理操作
      }
    })

    // 插件卸载时清理
    return () => {
      unregister()
      meta.unregisterAll()
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

