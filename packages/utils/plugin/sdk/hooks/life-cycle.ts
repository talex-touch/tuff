import { getLogger } from '../../../common/logger'
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

  if (hooks.length === 0) {
    const channel = ensureRendererChannel('[Lifecycle Hook] Channel not available. Make sure hooks run in plugin renderer context.')
    channel.regChannel(`@lifecycle:${type}`, (obj: any) => {
      processFunc(obj)

      if (sdk?.__hooks) {
        delete sdk.__hooks[type]
      }
    })
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
 * The plugin is activated
 * @returns boolean If return false, the plugin will not be activated (User can force to activate the plugin)
 */
export const onPluginActive = createHook(LifecycleHooks.ACTIVE)

/**
 * The plugin is inactivated
 * @returns boolean If return false, the plugin will not be inactivated (User can force to inactivate the plugin)
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
