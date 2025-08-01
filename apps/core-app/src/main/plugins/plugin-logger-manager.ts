import { TalexTouch } from '../types'
import { LoggerManager } from '@talex-touch/utils/plugin/log/logger-manager'

let pluginLogger: LoggerManager | null = null
let loggerManager: LoggerManager | null = null

export function genLoggerManager(loggerPath: string): LoggerManager {
  if (loggerPath && !loggerManager) loggerManager = new LoggerManager(loggerPath)

  return loggerManager!
}

export function genPluginLogger(app?: TalexTouch.TouchApp): LoggerManager {
  if (app && !pluginLogger) pluginLogger = new LoggerManager(app.rootPath)

  return pluginLogger!
}

export default {
  name: Symbol('PluginLoggerManager'),
  filePath: 'plugin-logger',
  init(touchApp: TalexTouch.TouchApp) {
    console.log("PluginLoggerManager", this)

    genLoggerManager(this['modulePath'])
    genPluginLogger(touchApp)
  },
  destroy() {}
}
