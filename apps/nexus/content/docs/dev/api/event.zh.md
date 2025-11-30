# Event API

## TouchEventBus
`TouchEventBus` 将应用内关键节点统一广播，插件可以订阅以便响应系统事件。

### 事件枚举
| 事件 | 触发时机 |
| --- | --- |
| `APP_READY` | 主应用初始化完毕 |
| `APP_START` | 所有模块启动完成 |
| `ALL_MODULES_LOADED` | 扩展模块加载结束 |
| `WINDOW_ALL_CLOSED` | 所有窗口关闭 |
| `PLUGIN_STORAGE_UPDATED` | 插件存储变更 |

### 插件订阅
```ts
const dispose = ctx.events.on('APP_READY', () => {
  ctx.logger.info('应用已就绪')
})

ctx.events.emit('PLUGIN_STORAGE_UPDATED', { pluginId: ctx.meta.id })
```

## 自定义事件
- 插件可创建内部事件 `ctx.events.createNamespace('todo')`，避免冲突。
- 所有事件都返回取消句柄，记得在 `onDestroy` 中释放。

## 调试建议
- 使用 `ctx.logger.debug` 打印事件 payload。
- 开启 DevTools Performance 后可看到事件时间线。
