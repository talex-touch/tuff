# Event API

## TouchEventBus
Broadcasts app-wide lifecycle events to plugins so they can react without polling.

### Event Enum
| Event | Trigger |
| --- | --- |
| `APP_READY` | App boot complete |
| `APP_START` | All modules started |
| `ALL_MODULES_LOADED` | Extension set finished loading |
| `WINDOW_ALL_CLOSED` | Every window closed |
| `PLUGIN_STORAGE_UPDATED` | Plugin storage mutated |

### Subscribe
```ts
const dispose = ctx.events.on('APP_READY', () => {
  ctx.logger.info('App ready')
})

ctx.events.emit('PLUGIN_STORAGE_UPDATED', { pluginId: ctx.meta.id })
```

## Custom Namespaces
- `ctx.events.createNamespace('todo')` keeps plugin events isolated.
- Always release handlers in `onDestroy`.

## Debugging
- Log payloads with `ctx.logger.debug`.
- Turn on DevTools Performance to visualize the event timeline.
