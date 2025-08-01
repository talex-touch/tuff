import fse from 'fs-extra'
import path from 'node:path'
import { app } from 'electron'
import log4js from 'log4js'
import { fileURLToPath } from 'url'

globalThis.__filename = fileURLToPath(import.meta.url)
globalThis.__dirname = path.dirname(__filename)

process.env.DIST = path.join(__dirname, '..')
process.env.PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

globalThis.logger = log4js.getLogger()
globalThis.errLogger = log4js.getLogger('error')
console._log = console.log
console.log = (...args: any[]) => {
  globalThis.logger.info(args)
}
console.log = (message: any, ...args: any[]) => {
  if (args?.length) globalThis.logger.info(message, args)
  else globalThis.logger.info(message)
}

console._error = console.error
console.error = (...args: any[]) => {
  globalThis.errLogger.error(args)
}
console.error = (message: any, ...args: any[]) => {
  if (args?.length) globalThis.errLogger.error(message, args)
  else globalThis.errLogger.error(message)
}

console._warn = console.warn
console.warn = (...args: any[]) => {
  globalThis.logger.warn(args)
}
console.warn = (message: any, ...args: any[]) => {
  if (args?.length) globalThis.logger.warn(message, args)
  else globalThis.logger.warn(message)
}

console._debug = console.debug
console.debug = (...args: any[]) => {
  globalThis.logger.debug(args)
}
console.debug = (message: any, ...args: any[]) => {
  if (args?.length) globalThis.logger.debug(message, args)
  else globalThis.logger.debug(message)
}

// check debug settings
if (fse.existsSync(path.join(app.getPath('userData'), 'debug.talex'))) {
  process.env.DEBUG = 'true'
  globalThis.logger.level = 'debug'
} else globalThis.logger.level = app.isPackaged ? 'info' : 'debug'

// Remove electron security warnings
// This warning only shows adopters development mode
// Read more on https://www.electronjs.org/docs/latest/tutorial/security
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'
process.env['trace-warnings'] = 'true'
process.env['unhandledrejections'] = 'strict'
