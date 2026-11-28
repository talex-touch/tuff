import type {
  WidgetSandboxAuditEntry,
  WidgetSandboxDecision,
  WidgetSandboxEvidence,
  WidgetSandboxOperation
} from '@talex-touch/utils/plugin/widget'

export const WIDGET_SANDBOX_QUOTA_WINDOW_MS = 10_000
export const WIDGET_SANDBOX_QUOTA_MAX_CALLS = 120
export const WIDGET_SANDBOX_AUDIT_MAX_ENTRIES = 2_048
export const WIDGET_SANDBOX_SOURCE_MAX_CHARS = 1_048_576

const LOCAL_EVENT_TYPES = new Set(['message', 'popstate', 'hashchange'])
const FORBIDDEN_MEMBER_NAMES = new Set([
  'constructor',
  '__proto__',
  'ownerDocument',
  'defaultView',
  'parentWindow',
  'contentWindow',
  'contentDocument',
  'frameElement',
  '__lookupGetter__',
  '__lookupSetter__',
  '__defineGetter__',
  '__defineSetter__'
])
const auditEntries: WidgetSandboxAuditEntry[] = []
const policies = new Map<string, WidgetSandboxPolicy>()
const disposedWidgetIds = new Set<string>()
let nextAuditSequence = 1

export class WidgetSandboxError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'WIDGET_SANDBOX_CAPABILITY_DENIED'
      | 'WIDGET_SANDBOX_QUOTA_EXCEEDED'
      | 'WIDGET_SANDBOX_DYNAMIC_CODE_BLOCKED'
  ) {
    super(message)
    this.name = 'WidgetSandboxError'
  }
}

function appendAuditEntry(
  widgetId: string,
  pluginName: string,
  operation: WidgetSandboxOperation,
  decision: WidgetSandboxDecision,
  reason?: string
): void {
  auditEntries.push({
    sequence: nextAuditSequence,
    timestamp: Date.now(),
    widgetId,
    pluginName,
    operation,
    decision,
    reason
  })
  nextAuditSequence += 1
  if (auditEntries.length > WIDGET_SANDBOX_AUDIT_MAX_ENTRIES) {
    auditEntries.splice(0, auditEntries.length - WIDGET_SANDBOX_AUDIT_MAX_ENTRIES)
  }
}

function makeCapabilityError(
  operation: WidgetSandboxOperation,
  reason: string
): WidgetSandboxError {
  return new WidgetSandboxError(
    `[WidgetSandbox] ${operation} denied: ${reason}`,
    'WIDGET_SANDBOX_CAPABILITY_DENIED'
  )
}

function cloneForSandbox<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value)) as T
}

type VirtualHistoryEntry = {
  state: unknown
  url: URL
}

export interface WidgetSandboxPolicyContext {
  navigator: Navigator
  history: History
  location: Location
  postMessage: Window['postMessage']
  Worker: typeof Worker
  SharedWorker: typeof SharedWorker
  fetch: typeof fetch
  XMLHttpRequest: typeof XMLHttpRequest
  WebSocket: typeof WebSocket
  EventSource: typeof EventSource
  Function: FunctionConstructor
  eval: typeof eval
  WebAssembly: typeof WebAssembly
  importScripts: (...urls: string[]) => void
  open: Window['open']
  addEventListener: Window['addEventListener']
  removeEventListener: Window['removeEventListener']
  dispatchEvent: Window['dispatchEvent']
  getOnMessage: () => ((this: Window, ev: MessageEvent) => unknown) | null
  setOnMessage: (handler: ((this: Window, ev: MessageEvent) => unknown) | null) => void
  deny: (operation: WidgetSandboxOperation, reason: string) => WidgetSandboxError
  allow: (operation: WidgetSandboxOperation, reason?: string) => void
  dispose: () => void
}

class WidgetSandboxPolicy {
  readonly context: WidgetSandboxPolicyContext
  private windowStartedAt = Date.now()
  private usedCalls = 0
  private blockedCalls = 0
  private disposed = false
  private readonly events = new EventTarget()
  private onMessage: ((this: Window, ev: MessageEvent) => unknown) | null = null
  private sandboxWindow: Window | undefined
  private readonly historyEntries: VirtualHistoryEntry[]
  private historyIndex = 0

  constructor(
    private readonly pluginName: string,
    private readonly widgetId: string,
    private readonly evidence: WidgetSandboxEvidence
  ) {
    const initialUrl = new URL(
      `https://widget.invalid/${encodeURIComponent(pluginName)}/${encodeURIComponent(widgetId)}/`
    )
    this.historyEntries = [{ state: null, url: initialUrl }]
    this.context = this.buildContext()
    this.syncQuotaEvidence()
  }

  setSandboxWindow(value: Window): void {
    this.sandboxWindow = value
  }

  assertDynamicSource(code: string): void {
    const violation = findDynamicSourceViolation(code)
    if (!violation) {
      this.allow('dynamicExecution', 'source-preflight-passed')
      return
    }
    const error = this.deny('dynamicExecution', violation)
    throw new WidgetSandboxError(error.message, 'WIDGET_SANDBOX_DYNAMIC_CODE_BLOCKED')
  }

  private buildContext(): WidgetSandboxPolicyContext {
    const clipboard = this.createClipboard()
    const navigatorFacade = this.createNavigator(clipboard)
    const history = this.createHistory()
    const location = this.createLocation()
    const blockedWorker = this.createBlockedConstructor(
      'worker.create',
      'Worker is unavailable; use a typed host action'
    )
    const blockedSharedWorker = this.createBlockedConstructor(
      'sharedWorker.create',
      'SharedWorker is unavailable in widgets'
    )
    const blockedXhr = this.createBlockedConstructor(
      'network.access',
      'XMLHttpRequest must use a typed host action'
    )
    const blockedWebSocket = this.createBlockedConstructor(
      'network.access',
      'WebSocket must use a typed host action'
    )
    const blockedEventSource = this.createBlockedConstructor(
      'network.access',
      'EventSource must use a typed host action'
    )
    const blockedDynamic = new Proxy(function widgetDynamicExecutionBlocked() {}, {
      apply: () => {
        throw this.deny('dynamicExecution', 'dynamic code constructors are blocked')
      },
      construct: () => {
        throw this.deny('dynamicExecution', 'dynamic code constructors are blocked')
      }
    }) as unknown as FunctionConstructor
    const blockedWebAssembly = new Proxy({} as typeof WebAssembly, {
      get: () => blockedDynamic,
      getPrototypeOf: () => null
    })

    const postMessage = ((
      message: unknown,
      targetOriginOrOptions?: string | WindowPostMessageOptions
    ) => {
      const targetOrigin =
        typeof targetOriginOrOptions === 'string'
          ? targetOriginOrOptions
          : targetOriginOrOptions?.targetOrigin
      if (targetOrigin && targetOrigin !== '*' && targetOrigin !== 'null') {
        throw this.deny('postMessage', 'only the isolated null origin is addressable')
      }
      let cloned: unknown
      try {
        cloned = cloneForSandbox(message)
      } catch {
        throw this.deny('postMessage', 'message is not structured-cloneable')
      }
      this.allow('postMessage', 'widget-local-message-target')
      queueMicrotask(() => {
        const event = new MessageEvent('message', {
          data: cloned,
          origin: 'null',
          source: this.sandboxWindow ?? null
        })
        this.events.dispatchEvent(event)
        this.onMessage?.call(this.sandboxWindow ?? window, event)
      })
    }) as Window['postMessage']

    const addEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: AddEventListenerOptions | boolean
    ) => {
      if (!listener || !LOCAL_EVENT_TYPES.has(type)) return
      this.events.addEventListener(type, listener, options)
    }) as Window['addEventListener']
    const removeEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: EventListenerOptions | boolean
    ) => {
      if (!listener || !LOCAL_EVENT_TYPES.has(type)) return
      this.events.removeEventListener(type, listener, options)
    }) as Window['removeEventListener']
    const dispatchEvent = ((event: Event) => {
      if (!LOCAL_EVENT_TYPES.has(event.type)) {
        throw this.deny('postMessage', `event type ${event.type} cannot reach the host window`)
      }
      return this.events.dispatchEvent(event)
    }) as Window['dispatchEvent']

    return {
      navigator: navigatorFacade,
      history,
      location,
      postMessage,
      Worker: blockedWorker as typeof Worker,
      SharedWorker: blockedSharedWorker as typeof SharedWorker,
      fetch: (async () => {
        throw this.deny('network.access', 'fetch must use a typed host action')
      }) as typeof fetch,
      XMLHttpRequest: blockedXhr as typeof XMLHttpRequest,
      WebSocket: blockedWebSocket as typeof WebSocket,
      EventSource: blockedEventSource as typeof EventSource,
      Function: blockedDynamic,
      eval: blockedDynamic as typeof eval,
      WebAssembly: blockedWebAssembly,
      importScripts: () => {
        throw this.deny('dynamicExecution', 'importScripts is unavailable in the widget realm')
      },
      open: (() => {
        throw this.deny('window.open', 'window creation must use a host action')
      }) as Window['open'],
      addEventListener,
      removeEventListener,
      dispatchEvent,
      getOnMessage: () => this.onMessage,
      setOnMessage: (handler) => {
        this.onMessage = typeof handler === 'function' ? handler : null
      },
      deny: (operation, reason) => this.deny(operation, reason),
      allow: (operation, reason) => this.allow(operation, reason),
      dispose: () => this.dispose()
    }
  }

  private createClipboard(): Clipboard {
    return {
      read: async () => {
        throw this.deny('clipboard.read', 'use a typed clipboard host action')
      },
      readText: async () => {
        throw this.deny('clipboard.read', 'use a typed clipboard host action')
      },
      write: async () => {
        throw this.deny('clipboard.write', 'use a typed clipboard host action')
      },
      writeText: async () => {
        throw this.deny('clipboard.write', 'use a typed clipboard host action')
      },
      addEventListener() {},
      dispatchEvent: () => false,
      removeEventListener() {}
    } as Clipboard
  }

  private createNavigator(clipboard: Clipboard): Navigator {
    const blockedProperties = new Set([
      'bluetooth',
      'geolocation',
      'hid',
      'mediaDevices',
      'permissions',
      'serial',
      'usb'
    ])
    return new Proxy(window.navigator, {
      get: (target, prop) => {
        if (prop === 'clipboard') return clipboard
        if (prop === 'serviceWorker') {
          throw this.deny('serviceWorker.access', 'service workers are unavailable in widgets')
        }
        if (prop === 'sendBeacon') {
          return () => {
            throw this.deny('network.access', 'sendBeacon must use a typed host action')
          }
        }
        if (prop === 'constructor' || prop === '__proto__') return undefined
        if (typeof prop === 'string' && blockedProperties.has(prop)) return undefined
        const value = Reflect.get(target, prop, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
      getPrototypeOf: () => null,
      set: () => false
    })
  }

  private createHistory(): History {
    const policy = this
    return {
      get length() {
        return policy.historyEntries.length
      },
      get state() {
        return cloneForSandbox(policy.historyEntries[policy.historyIndex]?.state ?? null)
      },
      scrollRestoration: 'auto',
      back() {
        policy.moveHistory(-1)
      },
      forward() {
        policy.moveHistory(1)
      },
      go(delta = 0) {
        policy.moveHistory(Number.isFinite(delta) ? Math.trunc(delta) : 0)
      },
      pushState(data: unknown, _unused: string, url?: string | URL | null) {
        policy.writeHistory('history.pushState', data, url, false)
      },
      replaceState(data: unknown, _unused: string, url?: string | URL | null) {
        policy.writeHistory('history.replaceState', data, url, true)
      }
    } as History
  }

  private createLocation(): Location {
    const policy = this
    const facade: Record<string, unknown> = {
      assign(url: string | URL) {
        throw policy.deny('location.assign', `navigation to ${safeUrlLabel(url)} is blocked`)
      },
      replace(url: string | URL) {
        throw policy.deny('location.replace', `navigation to ${safeUrlLabel(url)} is blocked`)
      },
      reload() {
        throw policy.deny('location.reload', 'host reload is blocked')
      },
      toString() {
        return policy.currentUrl().href
      }
    }
    for (const key of [
      'href',
      'origin',
      'protocol',
      'host',
      'hostname',
      'port',
      'pathname',
      'search',
      'hash'
    ] as const) {
      Object.defineProperty(facade, key, {
        enumerable: true,
        get: () => policy.currentUrl()[key],
        set: () => {
          throw policy.deny('location.write', `${key} is read-only`)
        }
      })
    }
    Object.defineProperty(facade, 'ancestorOrigins', {
      enumerable: true,
      get: () => Object.freeze({ length: 0, item: () => null, contains: () => false })
    })
    return Object.freeze(facade) as unknown as Location
  }

  private createBlockedConstructor(operation: WidgetSandboxOperation, reason: string): Function {
    const policy = this
    return class WidgetBlockedConstructor {
      constructor() {
        throw policy.deny(operation, reason)
      }
    }
  }

  private writeHistory(
    operation: 'history.pushState' | 'history.replaceState',
    data: unknown,
    url: string | URL | null | undefined,
    replace: boolean
  ): void {
    let state: unknown
    let nextUrl = this.currentUrl()
    try {
      state = cloneForSandbox(data)
      if (url !== undefined && url !== null && String(url) !== '') {
        nextUrl = new URL(String(url), nextUrl)
        if (nextUrl.origin !== this.currentUrl().origin) {
          throw new Error('cross-origin URL')
        }
      }
    } catch {
      throw this.deny(operation, 'history state or URL is not isolated and serializable')
    }
    this.allow(operation, 'widget-local-history')
    const entry = { state, url: nextUrl }
    if (replace) {
      this.historyEntries[this.historyIndex] = entry
      return
    }
    this.historyEntries.splice(this.historyIndex + 1, Infinity, entry)
    this.historyIndex = this.historyEntries.length - 1
  }

  private moveHistory(delta: number): void {
    this.allow('history.go', 'widget-local-history')
    const nextIndex = Math.min(
      this.historyEntries.length - 1,
      Math.max(0, this.historyIndex + delta)
    )
    if (nextIndex === this.historyIndex) return
    this.historyIndex = nextIndex
    const event = new PopStateEvent('popstate', {
      state: cloneForSandbox(this.historyEntries[this.historyIndex]?.state ?? null)
    })
    this.events.dispatchEvent(event)
  }

  private currentUrl(): URL {
    return this.historyEntries[this.historyIndex]!.url
  }

  private allow(operation: WidgetSandboxOperation, reason?: string): void {
    this.consume(operation)
    appendAuditEntry(this.widgetId, this.pluginName, operation, 'allowed', reason)
  }

  private deny(operation: WidgetSandboxOperation, reason: string): WidgetSandboxError {
    this.consume(operation)
    this.blockedCalls += 1
    this.syncQuotaEvidence()
    appendAuditEntry(this.widgetId, this.pluginName, operation, 'denied', reason)
    return makeCapabilityError(operation, reason)
  }

  private consume(operation: WidgetSandboxOperation): void {
    if (this.disposed) {
      appendAuditEntry(
        this.widgetId,
        this.pluginName,
        operation,
        'denied',
        'sandbox-policy-disposed'
      )
      throw new WidgetSandboxError(
        `[WidgetSandbox] ${operation} denied: sandbox policy disposed`,
        'WIDGET_SANDBOX_CAPABILITY_DENIED'
      )
    }

    const now = Date.now()
    if (now - this.windowStartedAt >= WIDGET_SANDBOX_QUOTA_WINDOW_MS) {
      this.windowStartedAt = now
      this.usedCalls = 0
      this.blockedCalls = 0
    }
    if (this.usedCalls >= WIDGET_SANDBOX_QUOTA_MAX_CALLS) {
      this.blockedCalls += 1
      this.syncQuotaEvidence()
      appendAuditEntry(
        this.widgetId,
        this.pluginName,
        operation,
        'quota-exceeded',
        'fixed-window-call-budget-exhausted'
      )
      throw new WidgetSandboxError(
        `[WidgetSandbox] ${operation} denied: call budget exhausted`,
        'WIDGET_SANDBOX_QUOTA_EXCEEDED'
      )
    }
    this.usedCalls += 1
    this.syncQuotaEvidence()
  }

  private syncQuotaEvidence(): void {
    this.evidence.quota.usedCalls = this.usedCalls
    this.evidence.quota.blockedCalls = this.blockedCalls
    this.evidence.quota.resetsAt = this.windowStartedAt + WIDGET_SANDBOX_QUOTA_WINDOW_MS
  }

  private dispose(): void {
    this.disposed = true
    this.onMessage = null
  }
}

function safeUrlLabel(value: string | URL): string {
  try {
    const url = new URL(String(value), 'https://widget.invalid/')
    return `${url.protocol}//${url.host}${url.pathname}`
  } catch {
    return 'invalid URL'
  }
}

function decodeJsStringEscape(
  code: string,
  slashIndex: number
): { decoded: string; consumed: number } {
  const next = code[slashIndex + 1]
  if (next === undefined) return { decoded: '', consumed: 1 }
  if (next === '\n') return { decoded: '', consumed: 2 }
  if (next === '\r') {
    return { decoded: '', consumed: code[slashIndex + 2] === '\n' ? 3 : 2 }
  }
  switch (next) {
    case 'n':
      return { decoded: '\n', consumed: 2 }
    case 'r':
      return { decoded: '\r', consumed: 2 }
    case 't':
      return { decoded: '\t', consumed: 2 }
    case 'b':
      return { decoded: '\b', consumed: 2 }
    case 'f':
      return { decoded: '\f', consumed: 2 }
    case 'v':
      return { decoded: '\v', consumed: 2 }
    case '\\':
    case "'":
    case '"':
    case '`':
      return { decoded: next, consumed: 2 }
    case 'x': {
      const hex = code.slice(slashIndex + 2, slashIndex + 4)
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        return { decoded: String.fromCharCode(Number.parseInt(hex, 16)), consumed: 4 }
      }
      return { decoded: next, consumed: 2 }
    }
    case 'u': {
      if (code[slashIndex + 2] === '{') {
        const endBrace = code.indexOf('}', slashIndex + 3)
        if (endBrace > slashIndex + 3) {
          const hex = code.slice(slashIndex + 3, endBrace)
          if (/^[0-9a-fA-F]+$/.test(hex)) {
            const point = Number.parseInt(hex, 16)
            if (point <= 0x10ffff) {
              return { decoded: String.fromCodePoint(point), consumed: endBrace - slashIndex + 1 }
            }
          }
        }
      } else {
        const hex = code.slice(slashIndex + 2, slashIndex + 6)
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          return { decoded: String.fromCharCode(Number.parseInt(hex, 16)), consumed: 6 }
        }
      }
      return { decoded: next, consumed: 2 }
    }
    default: {
      if (next >= '0' && next <= '7') {
        const match = /^[0-7]{1,3}/.exec(code.slice(slashIndex + 1))
        if (match) {
          const value = Number.parseInt(match[0], 8)
          if (value <= 0xff) {
            return { decoded: String.fromCharCode(value), consumed: 1 + match[0].length }
          }
        }
      }
      return { decoded: next, consumed: 2 }
    }
  }
}

type StringToken =
  | { kind: 'str'; value: string }
  | { kind: 'op'; value: '+' | '(' | ')' | '[' | ']' | ',' | '.join' | 'other' }

function foldStringTokens(tokens: StringToken[]): string[] {
  const folded: string[] = []
  let current: StringToken[] = tokens.slice()

  // Iteratively fold:
  //   (str) -> str
  //   str + str -> str
  //   [str, str, ...].join(sep) -> str
  for (let pass = 0; pass < 8; pass += 1) {
    const next: StringToken[] = []
    let changed = false
    let i = 0
    while (i < current.length) {
      const tok = current[i]!
      // (str) -> str
      if (
        tok.kind === 'op' &&
        tok.value === '(' &&
        current[i + 1]?.kind === 'str' &&
        current[i + 2]?.kind === 'op' &&
        current[i + 2]?.value === ')'
      ) {
        next.push(current[i + 1]!)
        i += 3
        changed = true
        continue
      }
      // str + str -> str
      if (
        tok.kind === 'str' &&
        current[i + 1]?.kind === 'op' &&
        current[i + 1]?.value === '+' &&
        current[i + 2]?.kind === 'str'
      ) {
        const combined = tok.value + (current[i + 2] as { kind: 'str'; value: string }).value
        folded.push(combined)
        next.push({ kind: 'str', value: combined })
        i += 3
        changed = true
        continue
      }
      // [str, str, ...].join(str) -> str
      if (tok.kind === 'op' && tok.value === '[') {
        let j = i + 1
        const parts: string[] = []
        let validArray = true
        while (j < current.length) {
          const item = current[j]!
          if (item.kind === 'op' && item.value === ']') break
          if (item.kind === 'str') {
            parts.push(item.value)
            j += 1
            if (current[j]?.kind === 'op' && current[j]?.value === ',') {
              j += 1
            }
          } else {
            validArray = false
            break
          }
        }
        if (
          validArray &&
          parts.length > 0 &&
          current[j]?.kind === 'op' &&
          current[j]?.value === ']' &&
          current[j + 1]?.kind === 'op' &&
          current[j + 1]?.value === '.join' &&
          current[j + 2]?.kind === 'op' &&
          current[j + 2]?.value === '('
        ) {
          let sep = ','
          let closeIdx = j + 3
          if (current[closeIdx]?.kind === 'str') {
            sep = (current[closeIdx] as { kind: 'str'; value: string }).value
            closeIdx += 1
          }
          if (current[closeIdx]?.kind === 'op' && current[closeIdx]?.value === ')') {
            const joined = parts.join(sep)
            folded.push(joined)
            next.push({ kind: 'str', value: joined })
            i = closeIdx + 1
            changed = true
            continue
          }
        }
      }
      next.push(tok)
      i += 1
    }
    current = next
    if (!changed) break
  }

  for (const tok of current) {
    if (tok.kind === 'str') folded.push(tok.value)
  }
  return folded
}

function maskNonExecutableText(code: string): {
  executable: string
  stringValues: string[]
  hasStringTimerCall: boolean
} {
  let executable = ''
  const stringValues: string[] = []
  const tokens: StringToken[] = []
  let index = 0
  let state: 'code' | 'single' | 'double' | 'template' | 'line-comment' | 'block-comment' = 'code'
  let value = ''
  const templateExpressionDepth: number[] = []
  let hasStringTimerCall = false

  const checkTimerStringArg = () => {
    if (/\b(?:setTimeout|setInterval)\s*\(\s*$/u.test(executable)) {
      hasStringTimerCall = true
    }
  }

  while (index < code.length) {
    const char = code[index]!
    const next = code[index + 1]

    if (state === 'line-comment') {
      if (char === '\n') {
        state = 'code'
        executable += '\n'
      } else executable += ' '
      index += 1
      continue
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        executable += '  '
        index += 2
        state = 'code'
      } else {
        executable += char === '\n' ? '\n' : ' '
        index += 1
      }
      continue
    }
    if (state === 'single' || state === 'double') {
      const quote = state === 'single' ? "'" : '"'
      if (char === '\\' && next !== undefined) {
        const { decoded, consumed } = decodeJsStringEscape(code, index)
        value += decoded
        for (let k = 0; k < consumed; k += 1) {
          executable += code[index + k] === '\n' ? '\n' : ' '
        }
        index += consumed
        continue
      }
      executable += char === '\n' ? '\n' : ' '
      index += 1
      if (char === quote) {
        stringValues.push(value)
        tokens.push({ kind: 'str', value })
        value = ''
        state = 'code'
      } else value += char
      continue
    }
    if (state === 'template') {
      if (char === '\\' && next !== undefined) {
        const { decoded, consumed } = decodeJsStringEscape(code, index)
        value += decoded
        for (let k = 0; k < consumed; k += 1) {
          executable += code[index + k] === '\n' ? '\n' : ' '
        }
        index += consumed
        continue
      }
      if (char === '`' && templateExpressionDepth.length === 0) {
        stringValues.push(value)
        tokens.push({ kind: 'str', value })
        tokens.push({ kind: 'op', value: ')' })
        value = ''
        executable += ' '
        index += 1
        state = 'code'
        continue
      }
      if (char === '$' && next === '{') {
        stringValues.push(value)
        tokens.push({ kind: 'str', value })
        tokens.push({ kind: 'op', value: '+' })
        tokens.push({ kind: 'op', value: '(' })
        value = ''
        executable += '  '
        index += 2
        templateExpressionDepth.push(1)
        state = 'code'
        continue
      }
      value += char
      executable += char === '\n' ? '\n' : ' '
      index += 1
      continue
    }

    if (templateExpressionDepth.length > 0) {
      if (char === '{') templateExpressionDepth[templateExpressionDepth.length - 1]! += 1
      if (char === '}') {
        const top = templateExpressionDepth.length - 1
        templateExpressionDepth[top]! -= 1
        if (templateExpressionDepth[top] === 0) {
          templateExpressionDepth.pop()
          tokens.push({ kind: 'op', value: ')' })
          tokens.push({ kind: 'op', value: '+' })
          executable += ' '
          index += 1
          value = ''
          state = 'template'
          continue
        }
      }
    }
    if (char === '/' && next === '/') {
      executable += '  '
      index += 2
      state = 'line-comment'
      continue
    }
    if (char === '/' && next === '*') {
      executable += '  '
      index += 2
      state = 'block-comment'
      continue
    }
    if (char === "'" || char === '"') {
      checkTimerStringArg()
      executable += ' '
      index += 1
      state = char === "'" ? 'single' : 'double'
      value = ''
      continue
    }
    if (char === '`') {
      checkTimerStringArg()
      tokens.push({ kind: 'op', value: '(' })
      executable += ' '
      index += 1
      value = ''
      state = 'template'
      continue
    }
    if (char === '.' && /^\.\s*join\b/.test(code.slice(index))) {
      const match = /^\.\s*join\b/.exec(code.slice(index))!
      tokens.push({ kind: 'op', value: '.join' })
      executable += match[0]
      index += match[0].length
      continue
    }
    if (
      char === '+' ||
      char === '(' ||
      char === ')' ||
      char === '[' ||
      char === ']' ||
      char === ','
    ) {
      tokens.push({ kind: 'op', value: char })
    } else if (!/\s/.test(char)) {
      tokens.push({ kind: 'op', value: 'other' })
    }
    executable += char
    index += 1
  }

  const folded = foldStringTokens(tokens)
  for (const entry of folded) {
    stringValues.push(entry)
  }

  return { executable, stringValues, hasStringTimerCall }
}

function hasUnsafeDefaultViewAccess(executable: string): boolean {
  const re = /\.\s*defaultView\b/gu
  let match: RegExpExecArray | null
  while ((match = re.exec(executable)) !== null) {
    const before = executable.slice(0, match.index)
    // Only direct `document.defaultView` (bound to the sandbox document proxy) is permitted.
    if (!/(?:^|[^.\w$])document\s*$/u.test(before)) {
      return true
    }
  }
  return false
}

function findDynamicSourceViolation(code: string): string | null {
  if (code.length > WIDGET_SANDBOX_SOURCE_MAX_CHARS) return 'source-size-limit-exceeded'
  const { executable, stringValues, hasStringTimerCall } = maskNonExecutableText(code)
  if (/\\u(?:\{|[0-9a-f])/iu.test(executable)) return 'escaped-identifiers-are-blocked'
  if (/\beval\s*\(/u.test(executable)) return 'eval-call-blocked'
  if (/\b(?:Async|Generator|AsyncGenerator)?Function\s*\(/u.test(executable))
    return 'Function-constructor-blocked'
  if (/\bimport\s*\(/u.test(executable)) return 'dynamic-import-blocked'
  if (/\bimportScripts\s*\(/u.test(executable)) return 'importScripts-blocked'
  if (/\bWebAssembly\b/u.test(executable)) return 'WebAssembly-blocked'
  if (hasStringTimerCall) return 'string-timer-callback-blocked'
  if (
    /\.\s*(?:constructor|__proto__|ownerDocument|parentWindow|contentWindow|contentDocument|frameElement|__lookupGetter__|__lookupSetter__|__defineGetter__|__defineSetter__)\b/u.test(
      executable
    ) ||
    hasUnsafeDefaultViewAccess(executable)
  ) {
    return 'intrinsic-constructor-escape-blocked'
  }
  if (
    /\b(?:Object\s*\.\s*(?:getPrototypeOf|setPrototypeOf|getOwnPropertyDescriptor)|Reflect\s*\.\s*(?:get|getPrototypeOf|setPrototypeOf|construct)|String\s*\.\s*(?:fromCharCode|fromCodePoint))\s*\(/u.test(
      executable
    )
  ) {
    return 'reflective-escape-blocked'
  }
  if (/\b(?:constructor|__proto__)\s*:/u.test(executable))
    return 'intrinsic-member-definition-blocked'
  if (stringValues.some((value) => FORBIDDEN_MEMBER_NAMES.has(value))) {
    return 'computed-intrinsic-member-blocked'
  }
  return null
}

export function recordWidgetSandboxDenial(
  widgetId: string,
  pluginName: string,
  operation: WidgetSandboxOperation,
  reason: string
): WidgetSandboxError {
  appendAuditEntry(widgetId, pluginName, operation, 'denied', reason)
  return makeCapabilityError(operation, reason)
}

export function createWidgetSandboxPolicy(
  pluginName: string,
  widgetId: string,
  evidence: WidgetSandboxEvidence
): WidgetSandboxPolicyContext {
  policies.get(widgetId)?.context.dispose()
  disposedWidgetIds.delete(widgetId)
  const policy = new WidgetSandboxPolicy(pluginName, widgetId, evidence)
  policies.set(widgetId, policy)
  return policy.context
}

export function setWidgetSandboxWindow(widgetId: string, value: Window): void {
  policies.get(widgetId)?.setSandboxWindow(value)
}

export function assertWidgetDynamicSource(widgetId: string, code: string): void {
  const policy = policies.get(widgetId)
  if (!policy) {
    throw new WidgetSandboxError(
      `[WidgetSandbox] policy missing for ${widgetId}`,
      'WIDGET_SANDBOX_DYNAMIC_CODE_BLOCKED'
    )
  }
  policy.assertDynamicSource(code)
}

export function disposeWidgetSandboxPolicy(widgetId: string): void {
  policies.get(widgetId)?.context.dispose()
  policies.delete(widgetId)
  disposedWidgetIds.add(widgetId)
  if (disposedWidgetIds.size > WIDGET_SANDBOX_AUDIT_MAX_ENTRIES) {
    const oldest = disposedWidgetIds.values().next().value
    if (typeof oldest === 'string') disposedWidgetIds.delete(oldest)
  }
}

export function guardWidgetDomNavigation(widgetId: string, event: Event): boolean {
  const policy = policies.get(widgetId)
  if (!policy && !disposedWidgetIds.has(widgetId)) return false
  const path =
    typeof event.composedPath === 'function' ? event.composedPath() : [event.target].filter(Boolean)
  const target = path.find(
    (node) => node instanceof HTMLAnchorElement || node instanceof HTMLFormElement
  )
  if (!target) return false
  event.preventDefault()
  event.stopImmediatePropagation()
  try {
    policy?.context.deny('dom.navigation', 'anchor and form navigation must use a host action')
  } catch {
    // The navigation is already blocked; quota errors remain represented in audit evidence.
  }
  return true
}

export function runWidgetHostAction(
  widgetId: string,
  operation: 'clipboard.hostAction' | 'hostAction.invoke',
  callback: () => void
): boolean {
  const policy = policies.get(widgetId)
  if (!policy && disposedWidgetIds.has(widgetId)) return false
  if (policy) {
    try {
      policy.context.allow(operation, 'typed-host-action')
    } catch {
      return false
    }
  }
  callback()
  return true
}

export function getWidgetSandboxAuditLog(widgetId?: string): WidgetSandboxAuditEntry[] {
  return auditEntries
    .filter((entry) => !widgetId || entry.widgetId === widgetId)
    .map((entry) => ({ ...entry }))
}

export function clearWidgetSandboxAuditLog(widgetId?: string): void {
  if (!widgetId) {
    auditEntries.length = 0
    return
  }
  for (let index = auditEntries.length - 1; index >= 0; index -= 1) {
    if (auditEntries[index]?.widgetId === widgetId) auditEntries.splice(index, 1)
  }
}
