import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'
import fse from 'fs-extra'
import * as log4js from 'log4js'
import packageJson from '../../package.json'

globalThis.$pkg = packageJson

const isolatedUserDataPath = process.env.TUFF_STARTUP_BENCHMARK_USER_DATA_DIR?.trim()
if (isolatedUserDataPath) {
  const isolatedRoot = path.resolve(isolatedUserDataPath)
  fse.ensureDirSync(isolatedRoot)
  // Session paths are captured before precore runs; changing only userData there
  // isolates SQLite but leaves Chromium writing the real dev profile.
  app.setPath('userData', isolatedRoot)
  app.setPath('sessionData', isolatedRoot)
} else if (!app.isPackaged) {
  const devUserDataPath = path.join(app.getPath('appData'), `${packageJson.name}-dev`)
  if (app.getPath('userData') !== devUserDataPath) {
    app.setPath('userData', devUserDataPath)
  }
}

// Set APP_VERSION from the CoreApp package when the host has not provided one.
// This keeps the main-process runtime version aligned with the packaged app metadata.
if (!process.env.APP_VERSION) {
  process.env.APP_VERSION = packageJson.version
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

globalThis.__filename = __filename
globalThis.__dirname = __dirname

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
