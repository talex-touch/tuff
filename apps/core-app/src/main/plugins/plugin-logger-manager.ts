import path from 'path'
import { TalexTouch } from '../types'
import { LoggerManager } from '@talex-touch/utils/plugin/log/logger-manager'

let pluginLogger: LoggerManager | null = null
let loggerManager: LoggerManager | null = null

export function genLoggerManager(app?: TalexTouch.TouchApp): LoggerManager {
  if (app && !loggerManager) loggerManager = new LoggerManager(app.rootPath)

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
    genLoggerManager(this['modulePath'])
    genPluginLogger(touchApp)
  },
  destroy() {}
}
