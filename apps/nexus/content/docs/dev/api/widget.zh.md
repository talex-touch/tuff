# Widget API

## 概述
Widgets 是插件在 CoreBox 或 DivisionBox 中渲染的轻量 UI 组件。

## 介绍
在 manifest 中声明 widget，并在插件目录提供对应的渲染入口。

## 支持的文件类型

| 扩展名 | 说明 | 处理器 |
| --- | --- | --- |
| `.vue` | Vue 单文件组件 | WidgetVueProcessor |
| `.tsx` | TypeScript JSX | WidgetTsxProcessor |
| `.jsx` | JavaScript JSX | WidgetTsxProcessor |
| `.ts` | 纯 TypeScript | WidgetScriptProcessor |
| `.js` | 纯 JavaScript | WidgetScriptProcessor |

## Widget 类型
| 类型 | 使用场景 |
| --- | --- |
| 面板型 | 固定在 Workspace，展示复杂 UI |
| 浮动型 | 悬浮窗，适合快速操作 |
| 通知中心型 | 以卡片形式展示摘要 |

## Manifest 配置

```json
{
  "type": "widget",
  "id": "todo.widget",
  "title": "任务面板",
  "size": { "width": 4, "height": 3 },
  "interaction": {
    "type": "widget",
    "path": "todo-panel.vue"
  }
}
```

## 文件结构

```
my-plugin/
├── widgets/
│   ├── todo-panel.vue      # Vue SFC
│   ├── quick-action.tsx    # TSX component
│   └── helper.ts           # Plain TS module
├── manifest.json
└── index.js
```

## Vue Widget 示例

`widgets/todo-panel.vue`
```vue
<template>
  <div class="todo-panel">
    <h3>{{ title }}</h3>
    <ul>
      <li v-for="item in items" :key="item.id">{{ item.text }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { usePluginContext } from '@talex-touch/utils/plugin/sdk'

const ctx = usePluginContext()
const title = ref('My Tasks')
const items = ref([{ id: 1, text: 'Learn Widgets' }])
</script>

<style scoped>
.todo-panel { padding: 16px; }
</style>
```

## TSX Widget 示例

`widgets/quick-action.tsx`
```tsx
import { defineComponent, ref } from 'vue'

export default defineComponent({
  setup() {
    const count = ref(0)
    return () => (
      <div class="action-panel">
        <button onClick={() => count.value++}>
          Clicked {count.value} times
        </button>
      </div>
    )
  }
})
```

## 允许的依赖

Widgets 运行在受控环境，仅允许以下包：

- `vue`
- `@talex-touch/utils`
- `@talex-touch/utils/plugin`
- `@talex-touch/utils/plugin/sdk`
- `@talex-touch/utils/core-box`
- `@talex-touch/utils/channel`
- `@talex-touch/utils/common`
- `@talex-touch/utils/types`

## 通信

- 使用 TuffTransport 进行类型安全的 IPC 通信
- `ctx.widget.send` 与宿主交换尺寸、主题等信息
- 可通过 `ctx.storage` 访问插件存储

## 最佳实践

- UI 与交互遵循系统暗/亮模式
- 避免复杂动画，确保在 16ms 内完成重绘
- 提供空状态与错误提示，保持体验一致
- 优先使用 `@talex-touch/utils` 的 hooks

## Dev 模式（远程源码）

当 `dev.enable` 与 `dev.source` 为 true 时，Widget 源码从 dev server 拉取，而不是本地 `widgets/` 目录。解析规则为：

`{dev.address}/widgets/{interaction.path}`（未提供扩展名时默认 `.vue`）。

```json
{
  "dev": {
    "enable": true,
    "source": true,
    "address": "http://localhost:5173/"
  }
}
```

远程源码会在每次触发时拉取；文件监听只对本地路径生效。

## 技术说明

- Widget 运行在渲染进程的沙箱环境，依赖受限。
- 文件处理由 Widget processor 负责。
