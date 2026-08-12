import { getLogger } from '../../../common/logger'
import { createPluginTuffTransport } from '../../../transport'
import { PluginEvents } from '../../../transport/events'
import { ensureRendererChannel } from '../channel'
import { useTouchSDK } from '../touch-sdk'

const sdkLog = getLogger('plugin-sdk')

export enum LifecycleHooks {
  ENABLE = 'en',
  DISABLE = 'di',
  ACTIVE = 'ac',
  INACTIVE = 'in',
  // FORE_PAUSED = 'fp',
  CRASH = 'cr',
}

type LifecycleHook = (data: unknown) => void
interface HookContext { data: unknown, reply: (result: boolean) => void }
type HookProcessor = (context: HookContext) => void
type LifecycleSignalListener = (data: unknown) => boolean

const lifecycleSignalEvents = {
  [LifecycleHooks.ENABLE]: PluginEvents.lifecycleSignal.enabled,
  [LifecycleHooks.DISABLE]: PluginEvents.lifecycleSignal.disabled,
  [LifecycleHooks.ACTIVE]: PluginEvents.lifecycleSignal.active,
  [LifecycleHooks.INACTIVE]: PluginEvents.lifecycleSignal.inactive,
  [LifecycleHooks.CRASH]: PluginEvents.lifecycleSignal.crashed,
} as const

type SignalRegistry = Partial<Record<LifecycleHooks, () => void>>

/**
 * Per-signal transport subscriptions, kept on the SDK object so they survive across the repeated
 * injectHook calls a plugin makes over its own mount cycles. One listener per lifecycle type for
 * the life of the renderer; the disposers are retained so a host can release them.
 */
function getSignalRegistry(
  sdk: { __hooks: Record<string, unknown>, __signalDisposers?: SignalRegistry },
): SignalRegistry {
  if (!sdk.__signalDisposers || typeof sdk.__signalDisposers !== 'object')
    sdk.__signalDisposers = {}

  return sdk.__signalDisposers
}

export function injectHook(
  type: LifecycleHooks,
  hook: LifecycleHook,
  processFunc: HookProcessor = ({ data, reply }) => {
    const sdk = useTouchSDK('[Lifecycle Hook] TouchSDK not available. Make sure hooks run in plugin renderer context.')
    const hooksMap = (sdk.__hooks ?? {}) as Record<LifecycleHooks, LifecycleHook[]>
    const hooks = hooksMap[type]
    if (hooks) {
      hooks.forEach(hookItem => hookItem(data))
    }
    reply(true)
  },
) {
  const sdk = useTouchSDK('[Lifecycle Hook] TouchSDK not available. Make sure hooks run in plugin renderer context.')
  if (!sdk.__hooks || typeof sdk.__hooks !== 'object') {
    sdk.__hooks = {}
  }
  const hooksMap = sdk.__hooks as Record<LifecycleHooks, LifecycleHook[]>
  const hooks = hooksMap[type] || (hooksMap[type] = [])

  // Registration is tracked explicitly rather than inferred from `hooks.length === 0`. Those two
  // only agreed by accident, and the moment they disagreed - which is exactly what deleting the
  // hook array below used to cause - every re-registration attached another listener for the same
  // signal, with no way to detach any of them.
  const registered = getSignalRegistry(sdk)
  if (!registered[type]) {
    const channel = ensureRendererChannel('[Lifecycle Hook] Channel not available. Make sure hooks run in plugin renderer context.')
    const transport = createPluginTuffTransport(channel as any)
    const listener: LifecycleSignalListener = (data) => {
      let replyResult = true
      processFunc({
        data,
        reply: (result) => {
          replyResult = result
          if (!result)
            sdkLog.warn(`[TouchSDK] ${type} hook requested a negative reply`, { data })
        },
      })

      // The hooks used to be deleted here, which made every lifecycle hook one-shot: the next
      // signal of the same type found an empty array and silently did nothing. Hooks live as long
      // as the plugin renderer does.
      return replyResult
    }

    registered[type] = transport.on(
      lifecycleSignalEvents[type],
      listener as (data: unknown) => void,
    ) ?? (() => {})
  }

  const wrappedHook = (data: any) => {
    try {
      hook(data)
    }
    catch (e) {
      sdkLog.error(`[TouchSDK] ${type} hook error`, { error: e })
    }
  }

  hooks.push(wrappedHook)

  return wrappedHook
}

export function createHook<T extends LifecycleHook = (data: any) => void>(type: LifecycleHooks) {
  return (
    hook: T,
  ) => injectHook(type, hook)
}

/**
 * The plugin is enabled
 * When the plugin is enabled, the plugin can be used
 * @returns void
 */
export const onPluginEnable = createHook(LifecycleHooks.ENABLE)

/**
 * The plugin is disabled
 * When the plugin is disabled, the plugin can not be used
 * @returns void
 */
export const onPluginDisable = createHook(LifecycleHooks.DISABLE)

/**
 * The plugin is activated.
 *
 * The return value is not consulted. The main process sends this through `broadcastPlugin`, which
 * is typed `TuffEvent<TReq, void>` and has no reply channel, and it sets `PluginStatus.ACTIVE`
 * before signalling - so there is nothing for a veto to reach. The JSDoc used to promise
 * "if return false, the plugin will not be activated"; honouring that needs a request/response
 * signal and a main-side gate ahead of the state change, not an SDK-side return value.
 *
 * @returns void
 */
export const onPluginActive = createHook(LifecycleHooks.ACTIVE)

/**
 * The plugin is inactivated.
 *
 * As with {@link onPluginActive}, the return value is not consulted - see the note there.
 *
 * @returns void
 */
export const onPluginInactive = createHook(LifecycleHooks.INACTIVE)

/**
 * When plugin is in foreground (e.g. plugin is using media, camera, microphone, etc.) But paused by user
 * For a detail example: User force to stop music playing
 * @returns void
 */
// export const onForePaused = createHook(LifecycleHooks.FORE_PAUSED)

/**
 * When plugin is crashed
 * data.message Crash message
 * data.extraData Crash data
 * @returns void
 */
export const onCrash = createHook(LifecycleHooks.CRASH)
