# Widget API

## Overview
Widgets are lightweight UI components that plugins can render in CoreBox or DivisionBox.

## Introduction
Declare widgets in the manifest, then provide the renderer entry in your plugin workspace.

## Supported File Types

| Extension | Description | Processor |
|-----------|-------------|-----------|
| `.vue` | Vue Single File Component | WidgetVueProcessor |
| `.tsx` | TypeScript JSX (React-style) | WidgetTsxProcessor |
| `.jsx` | JavaScript JSX | WidgetTsxProcessor |
| `.ts` | Plain TypeScript | WidgetScriptProcessor |
| `.js` | Plain JavaScript | WidgetScriptProcessor |

## Widget Types

| Type | Use case |
| --- | --- |
| Panel | Anchored inside a workspace |
| Floating | Hover window for quick actions |
| Notification Center | Card-style summaries |

## Manifest Entry

```json
{
  "type": "widget",
  "id": "todo.widget",
  "title": "Task Panel",
  "size": { "width": 4, "height": 3 },
  "interaction": {
    "type": "widget",
    "path": "todo-panel.vue"
  }
}
```

## File Structure

```
my-plugin/
├── widgets/
│   ├── todo-panel.vue      # Vue SFC
│   ├── quick-action.tsx    # TSX component
│   └── helper.ts           # Plain TS module
├── manifest.json
└── index.js
```

## Dev Mode (Remote Source)

When `dev.enable` and `dev.source` are true, widgets are loaded from your dev server instead of the local `widgets/` folder. The runtime resolves widget URLs as:

`{dev.address}/widgets/{interaction.path}` (defaults to `.vue` when no extension is provided).

```json
{
  "dev": {
    "enable": true,
    "source": true,
    "address": "http://localhost:5173/"
  }
}
```

Remote widgets are fetched on each trigger; local file watching only applies to local sources.

## Vue Widget Example

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

## TSX Widget Example

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

## Allowed Dependencies

Widgets run in a sandboxed environment. Only these packages are allowed:

- `vue`
- `@talex-touch/utils`
- `@talex-touch/utils/plugin`
- `@talex-touch/utils/plugin/sdk`
- `@talex-touch/utils/core-box`
- `@talex-touch/utils/channel`
- `@talex-touch/utils/common`
- `@talex-touch/utils/types`

## Communication

- Use TuffTransport for type-safe IPC communication
- `ctx.widget.send` exchanges size, theme, or focus signals
- Access plugin storage via `ctx.storage`

## Best Practices

- Respect light/dark mode automatically
- Keep animations subtle; re-render within 16 ms
- Provide empty states and clear error hints
- Use `@talex-touch/utils` hooks for consistent behavior

## Technical Notes
- Widgets run in a sandboxed renderer context with controlled dependencies.
- File processing is handled by the widget processors listed above.
