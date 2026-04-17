import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'
import fse from 'fs-extra'
import * as log4js from 'log4js'
import packageJson from '../../../../package.json'

globalThis.$pkg = packageJson

if (!app.isPackaged) {
  const devUserDataPath = path.join(app.getPath('appData'), `${packageJson.name}-dev`)
  if (app.getPath('userData') !== devUserDataPath) {
    app.setPath('userData', devUserDataPath)
  }
}

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

const runtimeLogger = log4js.getLogger('runtime')

// check debug settings
if (fse.existsSync(path.join(app.getPath('userData'), 'debug.talex'))) {
  process.env.DEBUG = 'true'
  runtimeLogger.level = 'debug'
} else {
  runtimeLogger.level = app.isPackaged ? 'warn' : 'info'
}

// Remove electron security warnings
// This warning only shows adopters development mode
// Read more on https://www.electronjs.org/docs/latest/tutorial/security
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
