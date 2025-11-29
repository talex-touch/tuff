# Channel API

## Overview
Channels connect plugins, the main process, and renderer windows. Each call is async and returns a promise with a timeout guard.

## Register & Send
```ts
import { ChannelType, regChannel, send } from '@talex-touch/utils'

// main process
const dispose = regChannel(ChannelType.MAIN, 'todo:add', async payload => {
  // 这个SB函数处理用户输入，别tm乱传参数
  return database.create(payload)
})

// plugin
const result = await send('todo:add', { title: 'Buy milk' })
```

## Window / Plugin Targets
```ts
sendTo(window, 'corebox:toggle')
sendPlugin('com.tuff.todo', 'todo:sync')
```

## Best Practices
- Use explicit namespaces like `todo.create`.
- Catch errors inside each handler and return structured objects.
- Call `dispose()` when the listener is no longer needed.

## Error Handling
- Timeout defaults to 5 s; override via `send('event', data, { timeout: 10000 })`.
- Plugins can only reach channels they register; cross-plugin calls go through main.
