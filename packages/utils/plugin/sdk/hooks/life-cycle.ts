export enum LifecycleHooks {
  ENABLE = 'en',
  DISABLE = 'di',
  ACTIVE = 'ac',
  INACTIVE = 'in',
  // FORE_PAUSED = 'fp',
  CRASH = 'cr'
}

// @ts-ignore
export function injectHook(type: LifecycleHooks, hook: Function, processFunc = ({ data, reply }) => {
  // @ts-ignore
  const hooks: Array<Function> = window.$touchSDK.__hooks[type]
  if (hooks) {
    hooks.forEach(hook => hook(data))
  }
  reply(true)
}) {
  // @ts-ignore
  const __hooks = window.$touchSDK.__hooks
  // @ts-ignore
  const hooks: Array<Function> = __hooks[type] || (__hooks[type] = [])

  if (hooks.length === 0) {

    window.$channel.regChannel("@lifecycle:" + type, (obj: any) => {

      processFunc(obj)

      // @ts-ignore
      delete window.$touchSDK.__hooks[type]
    })

  }

  const wrappedHook = (data: any) => {

    try {

      hook(data)

    } catch (e) {
      console.error(`[TouchSDK] ${type} hook error: `, e)
    }

  }

  hooks.push(wrappedHook)

  return wrappedHook
}

export const createHook = <T extends Function = (data: any) => any>(type: LifecycleHooks) => (hook: T) => injectHook(type, hook)

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
