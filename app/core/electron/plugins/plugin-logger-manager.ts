import path from 'path';
import { TalexTouch } from "../types";
import { LoggerManager } from '@talex-touch/utils/plugin/log/logger-manager'

let pluginLogger: LoggerManager | null = null

export function genPluginLogger(app?: TalexTouch.TouchApp): LoggerManager {
  if (app && !pluginLogger)
    pluginLogger = new LoggerManager(path.join(app.rootPath, 'modules', 'plugin-logger'))

  return pluginLogger!
}


export const loggerManager = new LoggerManager(__dirname)

export default {
  name: Symbol("PluginLoggerManager"),
  filePath: "plugin-logger",
  init(touchApp: TalexTouch.TouchApp) {
    genPluginLogger(touchApp)
  },
  destroy() { }
}