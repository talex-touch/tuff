# Widget API

## Types
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
  "entry": "src/widget/index.ts"
}
```

## Render Entry
`src/widget/index.ts`
```ts
import { createApp } from 'vue'
import Widget from './Widget.vue'

const app = createApp(Widget)
app.mount('#app')
```

## Communication
- Use Channels to sync with the main process.
- `ctx.widget.send` exchanges size, theme, or focus signals.

## Craft Guidelines
- Respect light/dark mode automatically.
- Keep animations subtle; re-render within 16 ms.
- Provide empty states and clear error hints.
