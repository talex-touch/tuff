import type { MainRuntimeContext, ModuleBaseContext } from '@talex-touch/utils'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import type { TouchApp } from './touch-app'

type RuntimeChannel = {
  keyManager?: unknown
  [key: string]: any
}

export interface MainRuntimeAccessor<E = unknown> {
  app: TouchApp
  window: MainRuntimeContext<E>['window']
  channel: RuntimeChannel
  transport: ITuffTransportMain
  moduleManager?: MainRuntimeContext<E>['moduleManager']
  logger?: MainRuntimeContext<E>['logger']
}

const runtimeRegistry = new Map<string, MainRuntimeAccessor>()

function resolveChannel(channel: unknown, site: string): RuntimeChannel {
  if (!channel || typeof channel !== 'object') {
    throw new Error(`[RuntimeAccessor] Channel not available at ${site}`)
  }
  return channel as RuntimeChannel
}

function resolveKeyManager(channel: RuntimeChannel): unknown {
  return channel.keyManager ?? channel
}

export function resolveMainRuntime<E>(
  ctx: Pick<ModuleBaseContext<E>, 'app' | 'runtime'>,
  site: string
): MainRuntimeAccessor<E> {
  const app = (ctx.runtime?.app ?? ctx.app) as TouchApp
  const channel = resolveChannel(
    ctx.runtime?.channel ?? (app as { channel?: unknown } | null | undefined)?.channel ?? undefined,
    site
  )

  return {
    app,
    window: ctx.runtime?.window ?? (app as { window?: MainRuntimeContext<E>['window'] }).window,
    channel,
    transport: getTuffTransportMain(channel, resolveKeyManager(channel)),
    moduleManager: ctx.runtime?.moduleManager,
    logger: ctx.runtime?.logger
  }
}

export function registerMainRuntime<E>(
  key: string,
  runtime: MainRuntimeAccessor<E>
): MainRuntimeAccessor<E> {
  runtimeRegistry.set(key, runtime as MainRuntimeAccessor)
  return runtime
}

export function getRegisteredMainRuntime<E = unknown>(key: string): MainRuntimeAccessor<E> {
  const runtime = runtimeRegistry.get(key)
  if (!runtime) {
    throw new Error(`[RuntimeAccessor] Runtime "${key}" not registered`)
  }
  return runtime as MainRuntimeAccessor<E>
}

export function clearRegisteredMainRuntime(key: string): void {
  runtimeRegistry.delete(key)
}
