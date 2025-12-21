# Dialog Manager

用于管理多个对话框/覆盖层实例的互斥显示：**同一时间只显示一个（栈顶）**。当顶部对话框关闭后，会自动恢复显示下一个。

## Guarantees

- **Mutual exclusion**: 注册新对话框时会隐藏当前可见对话框
- **Stack behavior**: 仅堆栈最顶层可见
- **Auto resume**: 顶层注销后自动显示下一个

## API

从 `@talex-touch/tuff-ui/utils` 引入：

```ts
import { getDialogManager } from '@talex-touch/tuff-ui/utils'
```

### `getDialogManager()`

返回一个单例 `DialogManager`。

### `DialogManager.register(config)`

注册对话框并让它成为“当前可见”。

- `id`: 唯一标识
- `container?`: 直接传 DOM 容器（内部通过 `display: none` 控制显隐）
- `setVisible?`: 自定义显隐控制（优先于 `container`）
- `cleanup?`: 彻底销毁时调用

### `DialogManager.unregister(id)`

注销并移除对话框。

### `DialogManager.getVisibleDialog()`

获取当前可见（栈顶）对话框。

### `DialogManager.clearAll()`

清空所有对话框并调用 `cleanup`。

## Usage

### 1) DOM Container 模式（最简单）

```ts
import { getDialogManager } from '@talex-touch/tuff-ui/utils'

const manager = getDialogManager()

const root = document.createElement('div')
root.id = `dialog-${Date.now()}`
document.body.appendChild(root)

manager.register({
  id: root.id,
  container: root,
  cleanup: () => {
    document.body.removeChild(root)
  },
})

// close
manager.unregister(root.id)
```

### 2) setVisible 模式（更适合与组件状态联动）

```ts
import { getDialogManager } from '@talex-touch/tuff-ui/utils'

const manager = getDialogManager()

let visible = false

manager.register({
  id: 'my-dialog',
  setVisible(v) {
    visible = v
  },
  cleanup() {
    visible = false
  },
})

manager.unregister('my-dialog')
```

## Notes

- 这个管理器只负责“互斥显示/恢复显示”的状态流转，并不限制你具体使用 `Teleport`、`Modal`、`Dialog` 还是自定义挂载逻辑。
