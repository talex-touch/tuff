/**
 * Plugin host process — utilityProcess entry (C1-B experimental core).
 *
 * Runs the Prelude in a process isolated from main, so a `vm` escape only
 * reaches this child. Flag-gated and off by default. Scope (see protocol):
 * load + lifecycle over the control port, invoke-style SDK calls forwarded to
 * main. Event-style callback registration is intentionally not handled here.
 */
import type { MessagePortMain } from 'electron'
import vm from 'node:vm'
import { TuffItemBuilder } from '@talex-touch/utils/core-box'
import { createPluginRequire } from '../runtime/plugin-require'
import type { HostLifecycle, HostLoad, HostMessage } from './plugin-host-protocol'

let controlPort: MessagePortMain | null = null
let sdkRequestSeq = 0
const pendingSdk = new Map<
  number,
  { resolve: (v: unknown) => void; reject: (e: unknown) => void }
>()
const loaded = new Map<string, Record<string, (...args: unknown[]) => unknown>>()

// Pure-logic globals provided locally in the child; they must NOT round-trip.
const LOCAL_CONTEXT_KEYS = new Set(['TuffItemBuilder'])

function post(msg: HostMessage): void {
  controlPort?.postMessage(msg)
}

// A recursive proxy: any invoke-style call on an injected SDK object is
// forwarded to the main process (which holds the real SDK) and awaited.
function createSdkProxy(pluginName: string, chain: string[]): unknown {
  const target = (...args: unknown[]): Promise<unknown> => {
    const requestId = ++sdkRequestSeq
    return new Promise((resolve, reject) => {
      pendingSdk.set(requestId, { resolve, reject })
      post({ type: 'sdk-call', requestId, pluginName, chain, args })
    })
  }
  return new Proxy(target, {
    get(_t, prop) {
      if (typeof prop !== 'string' || prop === 'then') {
        return undefined
      }
      return createSdkProxy(pluginName, [...chain, prop])
    }
  })
}

function buildSandbox(msg: HostLoad): Record<string, unknown> {
  const sandbox: Record<string, unknown> = {
    exports: {},
    module: { exports: {} },
    require: createPluginRequire(msg.pluginName),
    __dirname: msg.pluginPath,
    __filename: 'index.js',
    console,
    fetch,
    URL,
    URLSearchParams,
    crypto,
    performance,
    TextEncoder,
    TextDecoder,
    Headers,
    Request,
    Response,
    FormData,
    Blob,
    AbortController,
    AbortSignal,
    btoa,
    atob,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    clearImmediate,
    queueMicrotask,
    TuffItemBuilder
  }
  for (const key of msg.contextKeys) {
    if (LOCAL_CONTEXT_KEYS.has(key)) {
      continue
    }
    sandbox[key] = createSdkProxy(msg.pluginName, [key])
  }
  return sandbox
}

function handleLoad(msg: HostLoad): void {
  try {
    const sandbox = buildSandbox(msg)
    vm.createContext(sandbox)
    vm.runInContext(msg.scriptContent, sandbox)
    const exported = (sandbox.module as { exports: unknown }).exports
    const lifecycle = (typeof exported === 'object' && exported ? exported : {}) as Record<
      string,
      (...args: unknown[]) => unknown
    >
    loaded.set(msg.pluginName, lifecycle)
    post({
      type: 'load-result',
      requestId: msg.requestId,
      ok: true,
      methods: Object.keys(lifecycle)
    })
  } catch (err) {
    post({
      type: 'load-result',
      requestId: msg.requestId,
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    })
  }
}

async function handleLifecycle(msg: HostLifecycle): Promise<void> {
  const lifecycle = loaded.get(msg.pluginName)
  const fn = lifecycle?.[msg.method]
  if (typeof fn !== 'function') {
    post({ type: 'lifecycle-result', requestId: msg.requestId, ok: true, result: undefined })
    return
  }
  try {
    let result: unknown = fn(...msg.args)
    if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
      result = await result
    }
    post({ type: 'lifecycle-result', requestId: msg.requestId, ok: true, result })
  } catch (err) {
    post({
      type: 'lifecycle-result',
      requestId: msg.requestId,
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    })
  }
}

interface ParentPortLike {
  once: (
    event: 'message',
    listener: (e: { data: unknown; ports: MessagePortMain[] }) => void
  ) => void
}
const parentPort = (process as unknown as { parentPort?: ParentPortLike }).parentPort

parentPort?.once('message', (event) => {
  controlPort = event.ports?.[0] ?? null
  if (!controlPort) {
    return
  }

  controlPort.on('message', (message: { data: unknown }) => {
    const data = message.data as HostMessage
    switch (data?.type) {
      case 'ping':
        post({ type: 'pong', id: data.id })
        break
      case 'load':
        handleLoad(data)
        break
      case 'lifecycle':
        void handleLifecycle(data)
        break
      case 'sdk-result': {
        const pending = pendingSdk.get(data.requestId)
        if (pending) {
          pendingSdk.delete(data.requestId)
          if (data.ok) {
            pending.resolve(data.result)
          } else {
            pending.reject(new Error(data.error))
          }
        }
        break
      }
      default:
        break
    }
  })
  controlPort.start()
  post({ type: 'ready' })
})
