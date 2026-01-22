import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'
import fse from 'fs-extra'
import * as log4js from 'log4js'
import packageJson from '../../../../package.json'

globalThis.$pkg = packageJson

// Set APP_VERSION environment variable from package.json if not already set
// This allows runtime access to version while keeping package.json as source of truth
if (!process.env.APP_VERSION) {
  process.env.APP_VERSION = packageJson.version
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

globalThis.__filename = __filename
globalThis.__dirname = __dirname

process.env.DIST = path.join(__dirname, '..')
process.env.PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

globalThis.logger = log4js.getLogger()
globalThis.errLogger = log4js.getLogger('error')
const consoleRef = globalThis.console
consoleRef._log = consoleRef.log
consoleRef.log = (...args: unknown[]) => {
  globalThis.logger.info(args)
}
consoleRef.log = (message: unknown, ...args: unknown[]) => {
  if (args?.length) globalThis.logger.info(message, args)
  else globalThis.logger.info(message)
}

consoleRef._error = consoleRef.error
consoleRef.error = (...args: unknown[]) => {
  globalThis.errLogger.error(args)
}
consoleRef.error = (message: unknown, ...args: unknown[]) => {
  if (args?.length) globalThis.errLogger.error(message, args)
  else globalThis.errLogger.error(message)
}

consoleRef._warn = consoleRef.warn
consoleRef.warn = (...args: unknown[]) => {
  globalThis.logger.warn(args)
}
consoleRef.warn = (message: unknown, ...args: unknown[]) => {
  if (args?.length) globalThis.logger.warn(message, args)
  else globalThis.logger.warn(message)
}

consoleRef._debug = consoleRef.debug
consoleRef.debug = (...args: unknown[]) => {
  globalThis.logger.debug(args)
}
consoleRef.debug = (message: unknown, ...args: unknown[]) => {
  if (args?.length) globalThis.logger.debug(message, args)
  else globalThis.logger.debug(message)
}

// check debug settings
if (fse.existsSync(path.join(app.getPath('userData'), 'debug.talex'))) {
  process.env.DEBUG = 'true'
  globalThis.logger.level = 'debug'
} else {
  globalThis.logger.level = app.isPackaged ? 'warn' : 'info'
}

// Remove electron security warnings
// This warning only shows adopters development mode
// Read more on https://www.electronjs.org/docs/latest/tutorial/security
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
process.env['trace-warnings'] = 'true'
process.env.unhandledrejections = 'strict'
