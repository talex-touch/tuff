import type { ITouchChannel } from '@talex-touch/utils/channel'
import path from 'node:path'
import process from 'node:process'
import { StorageList } from '@talex-touch/utils'
import { app, BrowserWindow, dialog, screen } from 'electron'
import fse from 'fs-extra'
import { MainWindowOption } from '../config/default'
import { getMainConfig, saveMainConfig } from '../modules/storage'
import { TalexTouch } from '../types'
import { checkDirWithCreate } from '../utils/common-util'
import { devProcessManager } from '../utils/dev-process-manager'
import { mainLog } from '../utils/logger'
import { getAppVersionSafe } from '../utils/version-util'
import { genTouchChannel } from './channel-core'
import { AppStartEvent, TalexEvents, touchEventBus } from './eventbus/touch-event'
import {
  getDisplayLayoutSignature,
  normalizeBoundsToDisplays,
  pickBestMainWindowBounds,
  upsertMainWindowStateProfile
} from './main-window-state'
import { ModuleManager } from './module-manager'
import { innerRootPath } from './precore'
import { TouchConfig } from './touch-config'
import { TouchWindow } from './touch-window'

interface RendererOverrideState {
  version: string
  path: string
  coreRange?: string
  enabled: boolean
  updatedAt: number
  lastError?: string
  sourceTag?: string
  sha256?: string
}

export class TouchApp implements TalexTouch.TouchApp {
  readonly rootPath: string = innerRootPath

  app: Electron.App

  window: TalexTouch.ITouchWindow

  config: TalexTouch.IConfiguration

  version: TalexTouch.AppVersion

  moduleManager: TalexTouch.IModuleManager<TalexEvents>

  channel: ITouchChannel

  public isQuitting = false

  private _startSilent = false

  private mainWindowBoundsSaveTimer: NodeJS.Timeout | null = null

  /**
   * Read app-setting.ini directly from disk before StorageModule is initialized.
   */
  private readAppSettingsConfigFromDisk(): Record<string, unknown> {
    try {
      const configPath = path.join(this.rootPath, 'modules', 'config', 'app-setting.ini')
      if (fse.existsSync(configPath)) {
        const content = fse.readFileSync(configPath, 'utf-8')
        if (content.length > 0) {
          const parsed: unknown = JSON.parse(content)
          if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
        }
      }
    } catch (error) {
      mainLog.warn('Failed to read app-setting.ini from disk', { error })
    }
    return {}
  }

  private resolveRendererOverrideStatePath(): string {
    return path.join(this.rootPath, 'config', 'renderer-override.json')
  }

  private readRendererOverrideState(): RendererOverrideState | null {
    const statePath = this.resolveRendererOverrideStatePath()
    try {
      if (!fse.existsSync(statePath)) {
        return null
      }
      const content = fse.readFileSync(statePath, 'utf-8')
      const parsed = JSON.parse(content) as RendererOverrideState
      if (parsed && typeof parsed === 'object') {
        return parsed
      }
      return null
    } catch (error) {
      mainLog.warn('Failed to read renderer override state', { error })
      return null
    }
  }

  private disableRendererOverride(state: RendererOverrideState, reason: string): void {
    const updated: RendererOverrideState = {
      ...state,
      enabled: false,
      lastError: reason,
      updatedAt: Date.now()
    }
    try {
      fse.ensureDirSync(path.dirname(this.resolveRendererOverrideStatePath()))
      fse.writeFileSync(this.resolveRendererOverrideStatePath(), JSON.stringify(updated, null, 2))
      mainLog.warn('Renderer override disabled', {
        meta: { reason, path: state.path }
      })
    } catch (error) {
      mainLog.warn('Failed to persist renderer override state', { error })
    }
  }

  private resolveRendererOverridePath(): string | null {
    const state = this.readRendererOverrideState()
    if (!state?.enabled) {
      return null
    }

    const indexPath = path.join(state.path, 'index.html')
    if (!fse.existsSync(indexPath)) {
      this.disableRendererOverride(state, 'override index.html missing')
      return null
    }

    if (state.coreRange && !this.isCoreRangeCompatible(state.coreRange)) {
      this.disableRendererOverride(state, `coreRange mismatch: ${state.coreRange}`)
      return null
    }

    return indexPath
  }

  private isCoreRangeCompatible(coreRange: string): boolean {
    const version = getAppVersionSafe()
    return this.satisfiesVersionRange(version, coreRange)
  }

  private satisfiesVersionRange(version: string, range: string): boolean {
    const normalized = range.trim()
    if (!normalized) return false

    const orGroups = normalized
      .split('||')
      .map((part) => part.trim())
      .filter(Boolean)

    if (!orGroups.length) return false

    return orGroups.some((group) => {
      const tokens = group.split(/\s+/).filter(Boolean)
      if (!tokens.length) return false
      return tokens.every((token) => this.evaluateRangeToken(version, token))
    })
  }

  private evaluateRangeToken(version: string, token: string): boolean {
    const match = token.match(/^(>=|<=|>|<|=)?\s*(.+)$/)
    if (!match) return false

    const operator = match[1] ?? '='
    const target = match[2]?.trim()
    if (!target) return false

    const comparison = this.compareVersions(version, target)

    switch (operator) {
      case '>':
        return comparison === 1
      case '>=':
        return comparison === 1 || comparison === 0
      case '<':
        return comparison === -1
      case '<=':
        return comparison === -1 || comparison === 0
      case '=':
      default:
        return comparison === 0
    }
  }

  private compareVersions(a: string | undefined, b: string | undefined): -1 | 0 | 1 {
    if (!a && !b) return 0
    if (!a) return -1
    if (!b) return 1

    const parsedA = this.parseComparableVersion(a)
    const parsedB = this.parseComparableVersion(b)

    if (parsedA.major !== parsedB.major) {
      return parsedA.major < parsedB.major ? -1 : 1
    }
    if (parsedA.minor !== parsedB.minor) {
      return parsedA.minor < parsedB.minor ? -1 : 1
    }
    if (parsedA.patch !== parsedB.patch) {
      return parsedA.patch < parsedB.patch ? -1 : 1
    }

    return this.comparePrereleases(parsedA.prerelease, parsedB.prerelease)
  }

  private parseComparableVersion(version: string): {
    major: number
    minor: number
    patch: number
    prerelease: string[]
  } {
    const cleaned = version.replace(/^v/i, '').trim()
    const [main, prerelease] = cleaned.split('-', 2)
    const [major = 0, minor = 0, patch = 0] = (main || '')
      .split('.')
      .map((value) => Number.parseInt(value, 10) || 0)

    return {
      major,
      minor,
      patch,
      prerelease: prerelease ? prerelease.split('.') : []
    }
  }

  private comparePrereleases(a: string[], b: string[]): -1 | 0 | 1 {
    if (a.length === 0 && b.length > 0) return 1
    if (a.length > 0 && b.length === 0) return -1
    if (a.length === 0 && b.length === 0) return 0

    const maxLen = Math.max(a.length, b.length)
    for (let index = 0; index < maxLen; index += 1) {
      const aPart = a[index]
      const bPart = b[index]

      if (aPart === undefined) return -1
      if (bPart === undefined) return 1

      const aNum = Number.parseInt(aPart, 10)
      const bNum = Number.parseInt(bPart, 10)
      const aIsNum = !Number.isNaN(aNum)
      const bIsNum = !Number.isNaN(bNum)

      if (aIsNum && !bIsNum) return -1
      if (!aIsNum && bIsNum) return 1

      if (aIsNum && bIsNum) {
        if (aNum < bNum) return -1
        if (aNum > bNum) return 1
        continue
      }

      if (aPart < bPart) return -1
      if (aPart > bPart) return 1
    }

    return 0
  }

  private resolveInitialMainWindowBounds(
    appSettings: Record<string, unknown>
  ): Electron.Rectangle | null {
    try {
      const displays = screen.getAllDisplays()
      const primary = screen.getPrimaryDisplay()

      const defaultSize = {
        width: typeof MainWindowOption.width === 'number' ? MainWindowOption.width : 1100,
        height: typeof MainWindowOption.height === 'number' ? MainWindowOption.height : 680
      }
      const minSize = {
        width: typeof MainWindowOption.minWidth === 'number' ? MainWindowOption.minWidth : 0,
        height: typeof MainWindowOption.minHeight === 'number' ? MainWindowOption.minHeight : 0
      }

      const layoutSignature = getDisplayLayoutSignature(displays)
      const state = (appSettings as { window?: { mainWindowState?: unknown } }).window
        ?.mainWindowState
      const picked = pickBestMainWindowBounds(
        state,
        layoutSignature,
        displays,
        primary,
        defaultSize,
        minSize
      )

      if (picked.reason !== 'default') {
        mainLog.debug('Restoring main window bounds', {
          meta: { reason: picked.reason, layout: layoutSignature }
        })
      }

      return picked.bounds as Electron.Rectangle
    } catch (error) {
      mainLog.warn('Failed to resolve initial main window bounds', { error })
      return null
    }
  }

  private async showFileNotFoundDialog(filePath: string, triedPaths: string[]): Promise<void> {
    const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]

    const triedPathsText = triedPaths.join('\n')
    const detail = `Cannot find renderer entry file:\n${filePath}\n\nPlease check if the application installation is complete.\n\nDebug information:\n- app.getAppPath(): ${app.getAppPath()}\n- __dirname: ${__dirname}\n- process.resourcesPath: ${process.resourcesPath || 'N/A'}\n- Tried paths:\n${triedPathsText}`

    await dialog.showMessageBox(window || undefined, {
      type: 'error',
      title: 'File Not Found',
      message: 'Cannot find this file.',
      detail,
      buttons: ['OK'],
      defaultId: 0,
      noLink: true
    })
  }

  constructor(app: Electron.App) {
    mainLog.info('Running under application root', {
      meta: { root: this.rootPath }
    })
    checkDirWithCreate(this.rootPath, true)

    const appSettingsFromDisk = this.readAppSettingsConfigFromDisk()

    this._startSilent =
      (appSettingsFromDisk as { window?: { startSilent?: boolean } }).window?.startSilent === true
    const initialBounds = this.resolveInitialMainWindowBounds(appSettingsFromDisk)

    const _windowOptions: TalexTouch.TouchWindowConstructorOptions = {
      ...MainWindowOption,
      autoShow: !this._startSilent,
      ...(initialBounds ?? {})
    }

    this.app = app
    this.version = app.isPackaged ? TalexTouch.AppVersion.RELEASE : TalexTouch.AppVersion.DEV

    if (!app.isPackaged) {
      devProcessManager.init()
      mainLog.debug('Development process manager initialized')
    }

    if (this._startSilent) {
      mainLog.info('Silent start mode enabled, window will not auto-show')
    }

    this.window = new TouchWindow(_windowOptions)
    this.registerMainWindowBoundsPersistence()
    this.channel = genTouchChannel(this)
    this.moduleManager = new ModuleManager(this, this.channel)
    this.config = new TouchConfig(this)

    // Disable Ctrl+R / Cmd+R reload in production
    this.window.window.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'r' && (input.control || input.meta)) {
        if (app.isPackaged) {
          event.preventDefault()
        }
      }
    })

    app.setAppUserModelId('com.tagzxia.talex-touch')

    this.__init__().then(() => {
      mainLog.success('TouchApp runtime initialized')
    })
  }

  private registerMainWindowBoundsPersistence(): void {
    const win = this.window.window

    const scheduleSave = () => {
      if (this.mainWindowBoundsSaveTimer) {
        clearTimeout(this.mainWindowBoundsSaveTimer)
      }

      this.mainWindowBoundsSaveTimer = setTimeout(() => {
        this.mainWindowBoundsSaveTimer = null
        this.persistMainWindowBounds()
      }, 320)
    }

    win.on('resize', scheduleSave)
    win.on('move', scheduleSave)

    touchEventBus.on(TalexEvents.ALL_MODULES_LOADED, () => {
      scheduleSave()
    })
  }

  private persistMainWindowBounds(): void {
    const win = this.window.window
    if (win.isDestroyed()) return

    const rawBounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds()

    const displays = screen.getAllDisplays()
    const primary = screen.getPrimaryDisplay()
    const minSize = {
      width: typeof MainWindowOption.minWidth === 'number' ? MainWindowOption.minWidth : 0,
      height: typeof MainWindowOption.minHeight === 'number' ? MainWindowOption.minHeight : 0
    }

    const layoutSignature = getDisplayLayoutSignature(displays)
    const bounds = normalizeBoundsToDisplays(rawBounds, displays, primary, minSize)

    try {
      const appSettings = getMainConfig(StorageList.APP_SETTING)
      upsertMainWindowStateProfile(appSettings, layoutSignature, bounds)
      saveMainConfig(StorageList.APP_SETTING, appSettings)
    } catch (error) {
      mainLog.warn('Failed to persist main window bounds', { error })
    }
  }

  async __init__(): Promise<void> {
    const renderTimer = mainLog.time('Renderer boot', 'success')

    touchEventBus.emit(TalexEvents.APP_START, new AppStartEvent())

    checkDirWithCreate(this.rootPath, true)

    const startSilent = this._startSilent

    if (app.isPackaged || this.version === TalexTouch.AppVersion.RELEASE) {
      mainLog.info('Booting packaged build', {
        meta: { appPath: app.getAppPath() }
      })

      // Try multiple paths for index.html
      const appPath = app.getAppPath()
      const overridePath = this.resolveRendererOverridePath()
      const possiblePaths = [
        ...(overridePath ? [overridePath] : []),
        path.join(__dirname, '..', 'renderer', 'index.html'),
        path.join(appPath, 'renderer', 'index.html'),
        ...(process.resourcesPath
          ? [
              path.join(process.resourcesPath, 'app', 'renderer', 'index.html'),
              path.join(process.resourcesPath, 'renderer', 'index.html')
            ]
          : []),
        // Additional macOS-specific paths
        ...(process.platform === 'darwin'
          ? [
              path.resolve(appPath, '..', '..', '..', 'Resources', 'app', 'renderer', 'index.html'),
              path.resolve(__dirname, '..', '..', 'renderer', 'index.html')
            ]
          : [])
      ]

      mainLog.info('Checking for index.html', {
        meta: {
          __dirname: String(__dirname),
          appPath,
          resourcesPath: process.resourcesPath || 'N/A',
          possiblePaths: possiblePaths.join(', ')
        }
      })

      if (!startSilent) {
        this.window.window.show()
      } else {
        mainLog.info('Starting in silent mode (hidden to tray)')
      }

      let loaded = false
      let lastTriedPath = possiblePaths[0] ?? ''
      let lastError: unknown

      for (const testPath of possiblePaths) {
        const exists = fse.existsSync(testPath)
        mainLog.debug(`Checking path: ${testPath}`, {
          meta: { exists }
        })

        if (!exists) continue

        lastTriedPath = testPath
        mainLog.info('Loading renderer from file', {
          meta: { url: testPath }
        })

        try {
          await this.window.loadFile(testPath, {
            devtools: this.version === TalexTouch.AppVersion.DEV
          })
          loaded = true
          mainLog.info(`Found index.html at: ${testPath}`)
          break
        } catch (error) {
          lastError = error
          const errorMsg = error instanceof Error ? error.message : String(error)
          mainLog.error('Failed to load renderer file', {
            meta: { url: testPath, error: errorMsg }
          })

          if (overridePath && testPath === overridePath) {
            const state = this.readRendererOverrideState()
            if (state?.enabled) {
              this.disableRendererOverride(state, 'override load failed')
            }
          }
        }
      }

      if (!loaded) {
        // Log all debug information before showing dialog
        mainLog.error('[TouchApp] index.html not found!')
        mainLog.error('[TouchApp] __dirname:', { meta: { __dirname: String(__dirname) } })
        mainLog.error('[TouchApp] app.getAppPath():', { meta: { appPath } })
        mainLog.error('[TouchApp] process.resourcesPath:', {
          meta: { resourcesPath: process.resourcesPath || 'N/A' }
        })
        mainLog.error('[TouchApp] Tried paths:')
        possiblePaths.forEach((p, i) => {
          mainLog.error(`[TouchApp]   ${i + 1}. ${p} (exists: ${fse.existsSync(p)})`)
        })

        const errorMsg = `index.html not found. Tried paths:\n${possiblePaths.join('\n')}`
        mainLog.error('Renderer file not found', {
          meta: {
            triedPaths: possiblePaths.join(', '),
            appPath: app.getAppPath(),
            __dirname: String(__dirname),
            resourcesPath: process.resourcesPath || 'N/A',
            lastError: lastError instanceof Error ? lastError.message : undefined
          }
        })

        await this.showFileNotFoundDialog(lastTriedPath, possiblePaths)
        throw new Error(errorMsg)
      }
    } else {
      const url = process.env.ELECTRON_RENDERER_URL as string
      if (!url) {
        throw new Error('ELECTRON_RENDERER_URL is not set')
      }

      if (!startSilent) {
        this.window.window.show()
      } else {
        mainLog.info('Starting in silent mode (hidden to tray)')
      }
      mainLog.info('Loading renderer from dev server', {
        meta: { url }
      })

      await this.window.loadURL(url, { devtools: this.version === TalexTouch.AppVersion.DEV })
    }

    renderTimer.end('Renderer ready', {
      meta: { mode: app.isPackaged ? 'file' : 'dev-server' }
    })
  }

  /**
   * 完全退出应用
   */
  public quit(): void {
    this.isQuitting = true
    this.app.quit()
  }
}
