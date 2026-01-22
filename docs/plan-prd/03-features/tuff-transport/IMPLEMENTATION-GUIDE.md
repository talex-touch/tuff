# TuffTransport 实现指南

## 1. 实现顺序

```
阶段 1：核心类型和 Event Builder（第 1 周）
    ↓
阶段 2：BatchManager 实现（第 2 周）
    ↓
阶段 3：MessagePort Stream 实现（第 3 周）
    ↓
阶段 4：SDK 封装（第 4 周）
    ↓
阶段 5：兼容层和迁移（第 5-6 周）
```

---

## 2. 阶段 1：核心类型和 Event Builder

### 2.1 目录结构

```
packages/utils/transport/
├── index.ts
├── event/
│   ├── types.ts
│   └── builder.ts
└── events/
    └── index.ts
```

### 2.2 核心类型实现

```typescript
// packages/utils/transport/event/types.ts

/**
 * TuffEvent 品牌类型 - 确保类型安全
 */
declare const TuffEventBrand: unique symbol

/**
 * 批量配置
 */
export interface BatchConfig {
  enabled: boolean
  windowMs?: number
  maxSize?: number
  mergeStrategy?: 'queue' | 'dedupe' | 'latest'
}

/**
 * 流式配置
 */
export interface StreamConfig {
  enabled: boolean
  bufferSize?: number
  backpressure?: 'drop' | 'buffer' | 'error'
}

/**
 * 事件选项
 */
export interface EventOptions {
  batch?: BatchConfig
  stream?: StreamConfig
}

/**
 * TuffEvent 核心接口
 */
export interface TuffEvent<
  TRequest = void,
  TResponse = void,
  TNamespace extends string = string,
  TModule extends string = string,
  TAction extends string = string
> {
  /** 品牌标识 - 运行时检查 */
  readonly __brand: 'TuffEvent'
  
  /** 命名空间 */
  readonly namespace: TNamespace
  
  /** 模块 */
  readonly module: TModule
  
  /** 动作 */
  readonly action: TAction
  
  /** 批量配置 */
  readonly _batch?: BatchConfig
  
  /** 流式配置 */
  readonly _stream?: StreamConfig
  
  /** 请求类型标记（仅类型系统使用） */
  readonly _request: TRequest
  
  /** 响应类型标记（仅类型系统使用） */
  readonly _response: TResponse
  
  /** 转换为事件名字符串 */
  toString(): string
  
  /** 获取完整事件名 */
  toEventName(): string
}

/**
 * 提取事件请求类型
 */
export type EventRequest<E> = E extends TuffEvent<infer R, any> ? R : never

/**
 * 提取事件响应类型
 */
export type EventResponse<E> = E extends TuffEvent<any, infer R> ? R : never

/**
 * 检查是否为流式事件
 */
export type IsStreamEvent<E> = E extends TuffEvent<any, AsyncIterable<any>> ? true : false

/**
 * 提取流式数据块类型
 */
export type StreamChunk<E> = E extends TuffEvent<any, AsyncIterable<infer C>> ? C : never
```

### 2.3 Event Builder 实现

```typescript
// packages/utils/transport/event/builder.ts

import type { TuffEvent, BatchConfig, StreamConfig, EventOptions } from './types'

/**
 * 命名空间构建器
 */
export class TuffEventBuilder<TNamespace extends string> {
  private readonly _namespace: TNamespace
  
  private constructor(namespace: TNamespace) {
    this._namespace = namespace
  }
  
  /**
   * 创建命名空间
   * @example
   * defineEvent('core-box')
   */
  static namespace<T extends string>(ns: T): TuffEventBuilder<T> {
    if (!ns || typeof ns !== 'string') {
      throw new Error('[TuffEvent] Namespace must be a non-empty string')
    }
    return new TuffEventBuilder(ns)
  }
  
  /**
   * 定义模块
   * @example
   * defineEvent('core-box').module('search')
   */
  module<TModule extends string>(module: TModule): TuffModuleBuilder<TNamespace, TModule> {
    if (!module || typeof module !== 'string') {
      throw new Error('[TuffEvent] Module must be a non-empty string')
    }
    return new TuffModuleBuilder(this._namespace, module)
  }
}

/**
 * 模块构建器
 */
export class TuffModuleBuilder<
  TNamespace extends string,
  TModule extends string
> {
  constructor(
    private readonly _namespace: TNamespace,
    private readonly _module: TModule
  ) {}
  
  /**
   * 定义事件动作
   * @example
   * defineEvent('core-box').module('search').event('query')
   */
  event<TAction extends string>(action: TAction): TuffActionBuilder<TNamespace, TModule, TAction> {
    if (!action || typeof action !== 'string') {
      throw new Error('[TuffEvent] Action must be a non-empty string')
    }
    return new TuffActionBuilder(this._namespace, this._module, action)
  }
}

/**
 * 动作构建器
 */
export class TuffActionBuilder<
  TNamespace extends string,
  TModule extends string,
  TAction extends string
> {
  constructor(
    private readonly _namespace: TNamespace,
    private readonly _module: TModule,
    private readonly _action: TAction
  ) {}
  
  /**
   * 定义请求/响应类型，完成事件构建
   * @example
   * defineEvent('core-box')
   *   .module('search')
   *   .event('query')
   *   .define<{ text: string }, SearchResult[]>()
   */
  define<TRequest = void, TResponse = void>(
    options?: EventOptions
  ): TuffEvent<TRequest, TResponse, TNamespace, TModule, TAction> {
    const namespace = this._namespace
    const module = this._module
    const action = this._action
    const eventName = `${namespace}:${module}:${action}`
    
    // 创建不可变事件对象
    const event: TuffEvent<TRequest, TResponse, TNamespace, TModule, TAction> = Object.freeze({
      __brand: 'TuffEvent' as const,
      namespace,
      module,
      action,
      _batch: options?.batch,
      _stream: options?.stream,
      _request: undefined as unknown as TRequest,
      _response: undefined as unknown as TResponse,
      
      toString() {
        return eventName
      },
      
      toEventName() {
        return eventName
      }
    })
    
    return event
  }
}

/**
 * 快捷方法 - 创建事件定义
 * @example
 * const event = defineEvent('core-box').module('ui').event('hide').define()
 */
export const defineEvent = TuffEventBuilder.namespace

/**
 * 运行时检查是否为有效的 TuffEvent
 */
export function isTuffEvent(value: unknown): value is TuffEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as any).__brand === 'TuffEvent' &&
    typeof (value as any).toString === 'function'
  )
}

/**
 * 断言为 TuffEvent，否则抛出错误
 */
export function assertTuffEvent(value: unknown, context?: string): asserts value is TuffEvent {
  if (!isTuffEvent(value)) {
    const prefix = context ? `[${context}] ` : ''
    throw new TypeError(
      `${prefix}Invalid event. Expected TuffEvent from defineEvent(), got ${typeof value}`
    )
  }
}
```

### 2.4 预定义事件

```typescript
// packages/utils/transport/events/index.ts

import { defineEvent } from '../event/builder'

// ============ App Events ============

export const AppEvents = {
  window: {
    close: defineEvent('app')
      .module('window')
      .event('close')
      .define<void, void>(),
      
    minimize: defineEvent('app')
      .module('window')
      .event('minimize')
      .define<void, void>(),
      
    hide: defineEvent('app')
      .module('window')
      .event('hide')
      .define<void, void>(),
      
    focus: defineEvent('app')
      .module('window')
      .event('focus')
      .define<void, void>(),
  },
  
  system: {
    getOS: defineEvent('app')
      .module('system')
      .event('get-os')
      .define<void, OSInfo>(),
      
    getPackage: defineEvent('app')
      .module('system')
      .event('get-package')
      .define<void, PackageInfo>(),
      
    openExternal: defineEvent('app')
      .module('system')
      .event('open-external')
      .define<{ url: string }, void>(),
  },
  
  devTools: defineEvent('app')
    .module('debug')
    .event('open-devtools')
    .define<void, void>(),
} as const

// ============ CoreBox Events ============

export const CoreBoxEvents = {
  ui: {
    show: defineEvent('core-box')
      .module('ui')
      .event('show')
      .define<void, void>(),
      
    hide: defineEvent('core-box')
      .module('ui')
      .event('hide')
      .define<void, void>(),
      
    expand: defineEvent('core-box')
      .module('ui')
      .event('expand')
      .define<ExpandOptions, void>(),
      
    focusWindow: defineEvent('core-box')
      .module('ui')
      .event('focus-window')
      .define<void, { focused: boolean }>(),
  },
  
  search: {
    query: defineEvent('core-box')
      .module('search')
      .event('query')
      .define<TuffQuery, TuffSearchResult>({
        stream: { enabled: true, bufferSize: 100 }
      }),
      
    cancel: defineEvent('core-box')
      .module('search')
      .event('cancel')
      .define<{ searchId: string }, { cancelled: boolean }>(),
  },
  
  input: {
    get: defineEvent('core-box')
      .module('input')
      .event('get')
      .define<void, { input: string }>(),
      
    set: defineEvent('core-box')
      .module('input')
      .event('set')
      .define<{ value: string }, { value: string }>(),
      
    clear: defineEvent('core-box')
      .module('input')
      .event('clear')
      .define<void, { cleared: boolean }>(),
      
    setVisibility: defineEvent('core-box')
      .module('input')
      .event('set-visibility')
      .define<{ visible: boolean }, void>(),
  },
  
  provider: {
    deactivate: defineEvent('core-box')
      .module('provider')
      .event('deactivate')
      .define<{ id: string }, ActivationState>(),
      
    deactivateAll: defineEvent('core-box')
      .module('provider')
      .event('deactivate-all')
      .define<void, ActivationState>(),
      
    getDetails: defineEvent('core-box')
      .module('provider')
      .event('get-details')
      .define<{ providerIds: string[] }, ProviderDetail[]>({
        batch: { enabled: true, windowMs: 50, mergeStrategy: 'dedupe' }
      }),
  },
  
  uiMode: {
    enter: defineEvent('core-box')
      .module('ui-mode')
      .event('enter')
      .define<{ url: string }, void>(),
      
    exit: defineEvent('core-box')
      .module('ui-mode')
      .event('exit')
      .define<void, void>(),
  },
  
  clipboard: {
    allow: defineEvent('core-box')
      .module('clipboard')
      .event('allow')
      .define<{ types: number }, { enabled: boolean; types: number }>(),
  },
  
  inputMonitoring: {
    allow: defineEvent('core-box')
      .module('input-monitoring')
      .event('allow')
      .define<void, { enabled: boolean }>(),
  },
} as const

// ============ Storage Events ============

export const StorageEvents = {
  app: {
    get: defineEvent('storage')
      .module('app')
      .event('get')
      .define<{ key: string }, unknown>({
        batch: { enabled: true, windowMs: 16, maxSize: 20 }
      }),
      
    set: defineEvent('storage')
      .module('app')
      .event('set')
      .define<{ key: string; value: unknown }, void>({
        batch: { enabled: true, windowMs: 100, mergeStrategy: 'latest' }
      }),
      
    delete: defineEvent('storage')
      .module('app')
      .event('delete')
      .define<{ key: string }, void>(),
  },
  
  plugin: {
    get: defineEvent('storage')
      .module('plugin')
      .event('get')
      .define<{ pluginName: string; key: string }, unknown>({
        batch: { enabled: true, windowMs: 16 }
      }),
      
    set: defineEvent('storage')
      .module('plugin')
      .event('set')
      .define<{ pluginName: string; key: string; value: unknown }, void>({
        batch: { enabled: true, windowMs: 100 }
      }),
      
    delete: defineEvent('storage')
      .module('plugin')
      .event('delete')
      .define<{ pluginName: string; key: string }, void>(),
  },
} as const

// ============ Plugin Events ============

export const PluginEvents = {
  lifecycle: {
    load: defineEvent('plugin')
      .module('lifecycle')
      .event('load')
      .define<{ name: string }, PluginInfo>(),
      
    unload: defineEvent('plugin')
      .module('lifecycle')
      .event('unload')
      .define<{ name: string }, void>(),
      
    reload: defineEvent('plugin')
      .module('lifecycle')
      .event('reload')
      .define<{ name: string }, PluginInfo>(),
      
    enable: defineEvent('plugin')
      .module('lifecycle')
      .event('enable')
      .define<{ name: string }, void>(),
      
    disable: defineEvent('plugin')
      .module('lifecycle')
      .event('disable')
      .define<{ name: string }, void>(),
  },
  
  feature: {
    trigger: defineEvent('plugin')
      .module('feature')
      .event('trigger')
      .define<FeatureTriggerRequest, FeatureTriggerResponse>(),
  },
  
  log: {
    write: defineEvent('plugin')
      .module('log')
      .event('write')
      .define<PluginLogEntry, void>({
        batch: { enabled: true, windowMs: 100, maxSize: 50 }
      }),
  },
} as const

// ============ BoxItem Events ============

export const BoxItemEvents = {
  crud: {
    create: defineEvent('box-item')
      .module('crud')
      .event('create')
      .define<BoxItemCreateRequest, BoxItem>(),
      
    update: defineEvent('box-item')
      .module('crud')
      .event('update')
      .define<BoxItemUpdateRequest, BoxItem>(),
      
    upsert: defineEvent('box-item')
      .module('crud')
      .event('upsert')
      .define<BoxItemUpsertRequest, BoxItem>({
        batch: { enabled: true, windowMs: 50, maxSize: 100 }
      }),
      
    delete: defineEvent('box-item')
      .module('crud')
      .event('delete')
      .define<{ id: string }, void>({
        batch: { enabled: true, windowMs: 50 }
      }),
  },
  
  batch: {
    upsert: defineEvent('box-item')
      .module('batch')
      .event('upsert')
      .define<BoxItem[], BoxItem[]>(),
      
    delete: defineEvent('box-item')
      .module('batch')
      .event('delete')
      .define<string[], void>(),
      
    clear: defineEvent('box-item')
      .module('batch')
      .event('clear')
      .define<{ source?: string }, void>(),
  },
  
  sync: {
    request: defineEvent('box-item')
      .module('sync')
      .event('request')
      .define<void, void>(),
      
    response: defineEvent('box-item')
      .module('sync')
      .event('response')
      .define<BoxItem[], void>({
        stream: { enabled: true }
      }),
  },
} as const

// ============ Download Events ============

export const DownloadEvents = {
  task: {
    create: defineEvent('download')
      .module('task')
      .event('create')
      .define<DownloadRequest, DownloadTask>(),
      
    pause: defineEvent('download')
      .module('task')
      .event('pause')
      .define<{ taskId: string }, void>(),
      
    resume: defineEvent('download')
      .module('task')
      .event('resume')
      .define<{ taskId: string }, void>(),
      
    cancel: defineEvent('download')
      .module('task')
      .event('cancel')
      .define<{ taskId: string }, void>(),
      
    getProgress: defineEvent('download')
      .module('task')
      .event('get-progress')
      .define<{ taskId: string }, DownloadProgress>(),
  },
  
  progress: {
    stream: defineEvent('download')
      .module('progress')
      .event('stream')
      .define<{ taskId: string }, AsyncIterable<DownloadProgress>>({
        stream: { enabled: true }
      }),
  },
} as const

// ============ Terminal Events ============

export const TerminalEvents = {
  session: {
    create: defineEvent('terminal')
      .module('session')
      .event('create')
      .define<TerminalCreateRequest, TerminalSession>(),
      
    destroy: defineEvent('terminal')
      .module('session')
      .event('destroy')
      .define<{ sessionId: string }, void>(),
      
    resize: defineEvent('terminal')
      .module('session')
      .event('resize')
      .define<{ sessionId: string; cols: number; rows: number }, void>(),
  },
  
  io: {
    write: defineEvent('terminal')
      .module('io')
      .event('write')
      .define<{ sessionId: string; data: string }, void>(),
      
    output: defineEvent('terminal')
      .module('io')
      .event('output')
      .define<{ sessionId: string }, AsyncIterable<string>>({
        stream: { enabled: true, bufferSize: 1000 }
      }),
  },
} as const

// ============ AI Events ============

export const AIEvents = {
  chat: {
    send: defineEvent('ai')
      .module('chat')
      .event('send')
      .define<AIChatRequest, AsyncIterable<AIChatChunk>>({
        stream: { enabled: true }
      }),
      
    cancel: defineEvent('ai')
      .module('chat')
      .event('cancel')
      .define<{ chatId: string }, void>(),
  },
  
  config: {
    get: defineEvent('ai')
      .module('config')
      .event('get')
      .define<void, AIConfig>(),
      
    set: defineEvent('ai')
      .module('config')
      .event('set')
      .define<Partial<AIConfig>, AIConfig>(),
  },
} as const

// ============ 统一导出 ============

export const TuffEvents = {
  app: AppEvents,
  coreBox: CoreBoxEvents,
  storage: StorageEvents,
  plugin: PluginEvents,
  boxItem: BoxItemEvents,
  download: DownloadEvents,
  terminal: TerminalEvents,
  ai: AIEvents,
} as const

// ============ 类型定义占位 ============
// 这些类型应该从各自模块导入，这里仅作占位

interface OSInfo {
  platform: string
  arch: string
  version: string
}

interface PackageInfo {
  name: string
  version: string
}

interface ExpandOptions {
  mode?: 'collapse' | 'max'
  length?: number
}

interface TuffQuery {
  text: string
  inputs?: any[]
}

interface TuffSearchResult {
  items: any[]
  providers: string[]
}

interface ActivationState {
  activeProviders: string[]
}

interface ProviderDetail {
  id: string
  name: string
  icon?: any
}

interface PluginInfo {
  name: string
  version: string
  status: string
}

interface FeatureTriggerRequest {
  pluginName: string
  featureId: string
  query?: any
}

interface FeatureTriggerResponse {
  success: boolean
}

interface PluginLogEntry {
  level: string
  message: string
  timestamp: number
}

interface BoxItem {
  id: string
  [key: string]: any
}

interface BoxItemCreateRequest {
  item: Omit<BoxItem, 'id'>
}

interface BoxItemUpdateRequest {
  id: string
  updates: Partial<BoxItem>
}

interface BoxItemUpsertRequest {
  item: BoxItem
}

interface DownloadRequest {
  url: string
  destination?: string
}

interface DownloadTask {
  id: string
  url: string
  status: string
}

interface DownloadProgress {
  taskId: string
  progress: number
  speed: number
}

interface TerminalCreateRequest {
  shell?: string
  cwd?: string
  env?: Record<string, string>
}

interface TerminalSession {
  id: string
  pid: number
}

interface AIChatRequest {
  messages: Array<{ role: string; content: string }>
  model?: string
}

interface AIChatChunk {
  content: string
  done: boolean
}

interface AIConfig {
  model: string
  apiKey?: string
}
```

### 2.5 主入口导出

```typescript
// packages/utils/transport/index.ts

// Event Builder
export { defineEvent, isTuffEvent, assertTuffEvent } from './event/builder'
export type { TuffEvent, BatchConfig, StreamConfig, EventOptions } from './event/types'
export type { EventRequest, EventResponse, IsStreamEvent, StreamChunk } from './event/types'

// 预定义事件
export * from './events'

// SDK (Phase 4 实现)
// export { useTuffTransport, createTuffTransport } from './sdk/use-transport'
// export { getTuffTransportMain, TuffTransportMain } from './sdk/main-transport'
// export { usePluginTransport, createPluginTransport } from './sdk/plugin-transport'

// 类型
// export type { TuffTransport, PluginTuffTransport } from './sdk/types'
// export type { SendOptions, StreamOptions, StreamController } from './sdk/types'
// export type { HandlerContext, StreamContext } from './sdk/types'
```

---

## 3. 测试用例

### 3.1 Event Builder 测试

```typescript
// packages/utils/transport/__tests__/event-builder.test.ts

import { describe, it, expect } from 'vitest'
import { defineEvent, isTuffEvent, assertTuffEvent } from '../event/builder'

describe('TuffEventBuilder', () => {
  it('should create valid event', () => {
    const event = defineEvent('test')
      .module('module')
      .event('action')
      .define<{ id: string }, { success: boolean }>()
    
    expect(event.__brand).toBe('TuffEvent')
    expect(event.namespace).toBe('test')
    expect(event.module).toBe('module')
    expect(event.action).toBe('action')
    expect(event.toString()).toBe('test:module:action')
  })
  
  it('should be immutable', () => {
    const event = defineEvent('test').module('m').event('a').define()
    
    expect(() => {
      (event as any).namespace = 'changed'
    }).toThrow()
  })
  
  it('should include batch config', () => {
    const event = defineEvent('test')
      .module('m')
      .event('a')
      .define<void, void>({
        batch: { enabled: true, windowMs: 100 }
      })
    
    expect(event._batch?.enabled).toBe(true)
    expect(event._batch?.windowMs).toBe(100)
  })
  
  it('should validate with isTuffEvent', () => {
    const event = defineEvent('test').module('m').event('a').define()
    
    expect(isTuffEvent(event)).toBe(true)
    expect(isTuffEvent(null)).toBe(false)
    expect(isTuffEvent('string')).toBe(false)
    expect(isTuffEvent({ __brand: 'TuffEvent' })).toBe(false) // missing toString
  })
  
  it('should throw on invalid namespace', () => {
    expect(() => defineEvent('')).toThrow()
    expect(() => defineEvent(null as any)).toThrow()
  })
})
```

---

## 4. 下一步

完成阶段 1 后，继续实现：

1. **阶段 2**：BatchManager - 批量请求合并
2. **阶段 3**：StreamServer/StreamClient - MessagePort 流式传输
3. **阶段 4**：SDK 封装 - useTuffTransport 等
4. **阶段 5**：兼容层 - 旧 Channel API 适配

是否开始实现代码？
