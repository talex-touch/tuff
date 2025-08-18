import * as vm from 'vm'
import * as fse from 'fs-extra'
import path from 'path'
import type { ITouchPlugin } from '@talex-touch/utils/plugin'

/**
 * Creates a VM context for a plugin and injects a wrapped console
 * @param pluginName Plugin's unique name
 * @param featurePath Path to plugin's entry file
 * @returns The sandboxed plugin lifecycle object
 */
export function loadPluginFeatureContext(
  plugin: ITouchPlugin,
  featurePath: string,
  addonContext: any
): any {
  const pluginLogger = plugin.logger

  const sandboxConsole = {
    log: (...args: any[]) => {
      console.log(...args)
      pluginLogger.info(...args)
    },
    info: (...args: any[]) => {
      console.info(...args)
      pluginLogger.info(...args)
    },
    warn: (...args: any[]) => {
      console.warn(...args)
      pluginLogger.warn(...args)
    },
    error: (...args: any[]) => {
      console.error(...args)
      pluginLogger.error(...args)
    },
    debug: (...args: any[]) => {
      console.debug(...args)
      pluginLogger.debug?.(...args) ?? pluginLogger.info(...args)
    }
  }

  const context = vm.createContext({
    ...addonContext,
    console: sandboxConsole,
    require,
    module,
    exports,
    __dirname: path.dirname(featurePath),
    __filename: featurePath
  })

  const featureCode = fse.readFileSync(featurePath, 'utf-8')
  const script = new vm.Script(featureCode)

  const result = script.runInContext(context)
  return result
}
