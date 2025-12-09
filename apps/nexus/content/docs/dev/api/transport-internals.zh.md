# TuffTransport 技术内幕

本文档深入介绍 TuffTransport 的架构设计，解释技术决策和实现细节。

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        TuffTransport 架构                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   插件渲染进程                               主进程                       │
│   ┌─────────────────────┐                  ┌─────────────────────┐      │
│   │  useTuffTransport() │                  │  TuffTransportMain  │      │
│   │  ┌───────────────┐  │                  │  ┌───────────────┐  │      │
│   │  │ Event Builder │  │                  │  │ Event Router  │  │      │
│   │  └───────┬───────┘  │                  │  └───────┬───────┘  │      │
│   │          │          │                  │          │          │      │
│   │  ┌───────▼───────┐  │   ipc.invoke    │  ┌───────▼───────┐  │      │
│   │  │ BatchManager  │──┼──────────────────┼──│ BatchHandler  │  │      │
│   │  └───────────────┘  │                  │  └───────────────┘  │      │
│   │                     │                  │                     │      │
│   │  ┌───────────────┐  │   MessagePort   │  ┌───────────────┐  │      │
│   │  │ StreamClient  │◄─┼──────────────────┼─►│ StreamServer  │  │      │
│   │  └───────────────┘  │                  │  └───────────────┘  │      │
│   └─────────────────────┘                  └─────────────────────┘      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. 事件系统设计

### 为什么不用字符串？

传统 Channel API 使用字符串事件名：

```ts
// 字符串事件的问题：
channel.send('core-box:serch:query', data)  // 拼写错误："serch" - 没有报错！
channel.send('core-box:search:query', { txt: 'hi' })  // 字段错误 - 没有报错！
```

**问题：**
1. **无自动补全** - 必须记住准确的事件名
2. **无类型检查** - 编译时不知道参数类型
3. **重构风险** - 重命名事件需要手动查找替换
4. **运行时错误** - 拼写错误只能在运行时发现

### TuffEvent 解决方案

TuffEvent 使用 TypeScript 类型系统强制正确性：

```ts
// TuffEvent 定义（简化版）
interface TuffEvent<TRequest, TResponse, TNamespace, TModule, TAction> {
  readonly __brand: 'TuffEvent'  // 用于运行时检查的品牌标识
  readonly namespace: TNamespace
  readonly module: TModule
  readonly action: TAction
  readonly _request: TRequest    // 请求的幻影类型
  readonly _response: TResponse  // 响应的幻影类型
  toString(): string
}
```

**关键设计决策：**

1. **品牌类型** - `__brand: 'TuffEvent'` 支持运行时类型检查
2. **幻影类型** - `_request` 和 `_response` 仅存在于类型层面
3. **不可变** - 事件使用 `Object.freeze()` 冻结
4. **字符串转换** - `toString()` 返回事件名用于 IPC

### Event Builder 模式

构建器模式确保事件正确构造：

```ts
defineEvent('namespace')     // 返回 TuffEventBuilder<'namespace'>
  .module('module')          // 返回 TuffModuleBuilder<'namespace', 'module'>
  .event('action')           // 返回 TuffActionBuilder<'namespace', 'module', 'action'>
  .define<Req, Res>(opts)    // 返回 TuffEvent<Req, Res, 'namespace', 'module', 'action'>
```

**为什么用构建器？**
- 强制完整的事件定义
- 提供清晰、可读的 API
- 每一步都支持 IDE 自动补全
- 编译时验证

---

## 2. 批量系统设计

### 问题

每次 IPC 调用都有开销（约 1-5ms）。多次顺序调用会累积：

```ts
// 无批量：3 次 IPC 调用 = 3-15ms 开销
const a = await channel.send('storage:get', { key: 'a' })  // IPC #1
const b = await channel.send('storage:get', { key: 'b' })  // IPC #2
const c = await channel.send('storage:get', { key: 'c' })  // IPC #3
```

### 批量流程

```
请求 1 ─┐
请求 2 ─┼─► BatchManager ─► [窗口期 50ms] ─► 单次 IPC
请求 3 ─┘       │                              │
                │                              ▼
         windowMs 定时器              主进程处理器
                │                              │
                ▼                              ▼
         强制刷新条件：                处理所有请求
         - 定时器到期                       │
         - 达到最大数量                     ▼
         - 调用 flush()               返回所有结果
                                            │
响应 1 ◄─┐                                  │
响应 2 ◄─┼─ 分发结果 ◄─────────────────────┘
响应 3 ◄─┘
```

### BatchManager 实现

```ts
class BatchManager {
  private groups: Map<string, BatchGroup> = new Map()
  
  async add<TReq, TRes>(event: TuffEvent<TReq, TRes>, payload: TReq): Promise<TRes> {
    const config = event._batch
    
    // 如果未启用批量，直接发送
    if (!config?.enabled) {
      return this.sendSingle(event, payload)
    }
    
    return new Promise((resolve, reject) => {
      const group = this.getOrCreateGroup(event)
      
      // 应用合并策略
      this.applyStrategy(group, { payload, resolve, reject }, config)
      
      // 检查刷新条件
      if (group.requests.length >= config.maxSize) {
        this.flush(event.toString())
      } else if (!group.timer) {
        group.timer = setTimeout(() => this.flush(event.toString()), config.windowMs)
      }
    })
  }
}
```

### 合并策略

**1. Queue（默认）**
所有请求按顺序保留并处理：
```
[{key:'a'}, {key:'b'}, {key:'a'}] → 处理全部 3 个
```

**2. Dedupe**
相同参数共享一个请求：
```
[{key:'a'}, {key:'b'}, {key:'a'}] → 处理 2 个，两个 'a' 获得相同结果
```

**3. Latest**
相同 key 只保留最新请求：
```
[{key:'a',v:1}, {key:'b'}, {key:'a',v:2}] → 处理 [{key:'a',v:2}, {key:'b'}]
```

---

## 3. 流式系统设计

### 为什么用 MessagePort？

常规 IPC 对流式传输有限制：
- 请求-响应模式不适合连续数据
- 大数据包阻塞 IPC 通道
- 无背压处理

**MessagePort 优势：**
- 每个流独立通道
- 非阻塞数据传输
- 原生背压支持
- 对二进制数据高效

### 流式流程

```
渲染进程                                主进程
   │                                       │
   │─── 1. 请求流 ─────────────────────►  │
   │    (通过 ipc.invoke)                  │
   │                                       │
   │◄── 2. 返回 { streamId, port2 } ──────│
   │    (port2 被传递)                     │
   │                                       │
   │◄══ 3. 数据块 ═════════════════════════│
   │    (通过 MessagePort)                 │
   │                                       │
   │◄══ 4. 更多数据... ════════════════════│
   │                                       │
   │◄══ 5. 结束信号 ═══════════════════════│
   │                                       │
   │─── 6. 关闭端口 ──────────────────────►│
```

### StreamServer（主进程）

```ts
class StreamServer {
  async handleStreamRequest(eventName: string, payload: any, webContents: WebContents) {
    const { port1, port2 } = new MessageChannelMain()
    const streamId = generateId()
    
    // 发送 port2 给渲染进程
    webContents.postMessage('@tuff:stream:port', { streamId }, [port2])
    
    // 创建处理器上下文
    const context: StreamContext = {
      emit: (chunk) => port1.postMessage({ type: 'data', chunk }),
      error: (err) => port1.postMessage({ type: 'error', message: err.message }),
      end: () => port1.postMessage({ type: 'end' }),
      isCancelled: () => this.cancelled.has(streamId)
    }
    
    // 执行处理器
    await this.handlers.get(eventName)?.(payload, context)
    
    return { streamId }
  }
}
```

### 背压处理

当消费者处理不过来时：

```ts
const config: StreamConfig = {
  enabled: true,
  bufferSize: 100,
  backpressure: 'buffer' // 'drop' | 'buffer' | 'error'
}
```

- **drop** - 缓冲区满时丢弃新数据
- **buffer** - 缓冲数据（有内存风险）
- **error** - 缓冲区满时抛出错误

---

## 4. 插件安全

### Key 机制

插件运行在隔离的 WebContentsView 中。为防止未授权访问：

```
┌─────────────────────────────────────────────────────────────────┐
│                    插件安全流程                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. 插件加载                                                      │
│     │                                                            │
│     ▼                                                            │
│  2. 主进程生成唯一 key                                            │
│     key = randomString() → 存入 keyToNameMap                     │
│     │                                                            │
│     ▼                                                            │
│  3. Key 注入插件的 preload                                        │
│     window.$plugin.uniqueKey = key                               │
│     │                                                            │
│     ▼                                                            │
│  4. 所有插件消息在 header 中包含 key                              │
│     { header: { uniqueKey: key }, ... }                          │
│     │                                                            │
│     ▼                                                            │
│  5. 主进程验证 key                                                │
│     pluginName = keyToNameMap.get(key)                          │
│     if (!pluginName) reject()                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### PluginKeyManager

```ts
interface PluginKeyManager {
  requestKey(pluginName: string): string   // 生成新 key
  revokeKey(key: string): boolean          // 使 key 失效
  resolveKey(key: string): string | undefined  // 获取插件名
  isValidKey(key: string): boolean         // 验证 key
}
```

### 安全上下文

每个处理器都接收安全上下文：

```ts
transport.on(SomeEvent, (payload, context) => {
  if (context.plugin) {
    console.log(`请求来自插件: ${context.plugin.name}`)
    console.log(`Key 已验证: ${context.plugin.verified}`)
  }
})
```

---

## 5. 错误处理

### 错误流程

```
渲染进程                                主进程
   │                                       │
   │─── 请求 ─────────────────────────────►│
   │                                       │
   │                               处理器抛出错误
   │                                       │
   │◄── TuffTransportError ────────────────│
   │    { code, message, eventName }       │
   │                                       │
   ▼
catch (err) {
  if (err instanceof TuffTransportError) {
    // 结构化错误处理
  }
}
```

### 错误序列化

错误被序列化用于 IPC：

```ts
class TuffTransportError extends Error {
  toJSON() {
    return {
      name: 'TuffTransportError',
      code: this.code,
      message: this.message,
      eventName: this.eventName,
      timestamp: this.timestamp
    }
  }
  
  static fromJSON(obj) {
    return new TuffTransportError(obj.code, obj.message, {
      eventName: obj.eventName
    })
  }
}
```

---

## 6. 性能考量

### IPC 开销

| 操作 | 大约耗时 |
|------|----------|
| 单次 IPC 调用 | 1-5ms |
| 序列化（小数据） | 0.1ms |
| 序列化（大数据） | 1-10ms |
| MessagePort 建立 | 2-5ms |
| MessagePort 消息 | 0.1-0.5ms |

### 优化策略

1. **默认批量** - 为频繁事件启用批量
2. **大数据用流** - >100KB 用 MessagePort
3. **尽量去重** - 相同请求共享响应
4. **延迟求值** - 只在刷新批量时序列化

### 内存管理

```ts
// 清理模式
onUnmounted(() => {
  // 取消待处理请求
  controller.cancel()
  
  // 移除处理器
  cleanup()
  
  // 刷新批量
  transport.flush()
})
```

---

## 7. 与传统 Channel 对比

| 方面 | 传统 Channel | TuffTransport |
|------|-------------|---------------|
| 事件定义 | 字符串 | TuffEvent 对象 |
| 类型安全 | 无 | 完整 TypeScript |
| 自动补全 | 无 | 完整 IDE 支持 |
| 批量处理 | 手动 | 自动 |
| 流式传输 | 不支持 | MessagePort |
| 错误类型 | 通用 Error | TuffTransportError |
| 插件安全 | uniqueKey header | PluginKeyManager |
| 向后兼容 | N/A | 完全兼容 |

### 迁移路径

```ts
// 传统代码继续工作
channel.send('event', data)

// 新代码使用 TuffTransport
transport.send(TuffEvent, data)

// 它们共享相同的 IPC 基础设施
```

---

## 总结

TuffTransport 提供：

1. **类型安全** - 通过 TuffEvent 进行编译时事件验证
2. **性能** - 自动批量处理减少 IPC 开销
3. **流式传输** - MessagePort 用于大/连续数据
4. **安全** - 通过 key 机制进行插件隔离
5. **人体工学** - 简洁 API 配合完整 IDE 支持
6. **兼容性** - 与传统 Channel API 并行工作
