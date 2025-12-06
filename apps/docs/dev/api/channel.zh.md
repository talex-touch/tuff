# Channel API

## 概述
Channel 提供插件与主程序、其他插件之间的消息通信能力，基于 Promise 异步返回，默认带有超时保护。

## 注册与发送
```ts
import { ChannelType, regChannel, send } from '@talex-touch/utils'

// 在主进程注册
const dispose = regChannel(ChannelType.MAIN, 'todo:add', async payload => {
  // 这个SB函数处理用户输入，别tm乱传参数
  return database.create(payload)
})

// 在插件侧发送
const result = await send('todo:add', { title: 'Buy milk' })
```

## sendTo 与插件通信
```ts
sendTo(window, 'corebox:toggle')
sendPlugin('com.tuff.todo', 'todo:sync')
```

## CoreBox 相关通道

| 通道名称 | 方向 | 说明 |
| --- | --- | --- |
| `core-box:input-change` | 主进程 → 插件 | 输入框内容变化 |
| `core-box:key-event` | 主进程 → 插件 | 键盘事件转发 |
| `core-box:clipboard-change` | 主进程 → 插件 | 剪贴板内容变化 |
| `core-box:ui-mode-exited` | 主进程 → 渲染进程 | UI 模式已退出（ESC 触发） |
| `core-box:hide-input` | 插件 → 主进程 | 隐藏输入框 |
| `core-box:show-input` | 插件 → 主进程 | 显示输入框 |
| `core-box:get-input` | 插件 → 主进程 | 获取输入值 |
| `core-box:set-input` | 插件 → 主进程 | 设置输入值 |

## 最佳实践
- 使用清晰的命名空间，如 `todo.create`，避免全局污染。
- 每个 Channel 回调应处理异常并返回结构化错误。
- 调用后记得清理 `dispose()`，防止内存泄漏。

## 错误处理
- 超时：默认 5 秒，必要时 `send('event', data, { timeout: 10000 })`。
- 权限：插件只能访问其注册的 Channel，跨插件需通过主进程转发。
