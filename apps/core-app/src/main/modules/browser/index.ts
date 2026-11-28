import type { ModuleInitContext } from '@talex-touch/utils'
import type { Event as ElectronEvent, Session } from 'electron'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { BrowserEvents } from '@talex-touch/utils/transport/sdk/domains/browser'
import { app, session, WebContentsView } from 'electron'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { buildWindowWebPreferences } from '../../core/window-security-profile'
import { BaseModule } from '../abstract-base-module'
import { useMainStorage } from '../storage'
import { resolveAppConfigBackend } from '../storage/app-config-repository'
import { BROWSER_WORKSPACE_STORAGE_KEY } from '../storage/main-storage-registry'
import { registerBrowserHandlers } from './handlers'
import { isAllowedGuestNavigationUrl } from './policy'
import { SideBrowserManager } from './side-browser-manager'
import { BrowserWorkspaceManager } from './workspace-manager'

// Local-only: intentionally absent from sync's explicit SYNC_STORAGE_KEYS allowlist.
export { BROWSER_WORKSPACE_STORAGE_KEY } from '../storage/main-storage-registry'
export const TUFF_BROWSER_PARTITION = 'persist:tuff-browser'

/** A fresh, unprivileged session never inherits application protocols, storage or permissions. */
export function secureBrowserSession(browserSession: Session): () => void {
  browserSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false)
  )
  browserSession.setPermissionCheckHandler(() => false)
  browserSession.setDevicePermissionHandler(() => false)
  browserSession.setDisplayMediaRequestHandler((_request, callback) => callback({}))
  browserSession.webRequest.onBeforeRequest((details, callback) => {
    const navigation = details.resourceType === 'mainFrame' || details.resourceType === 'subFrame'
    callback({ cancel: navigation && !isAllowedGuestNavigationUrl(details.url) })
  })
  const download = (event: ElectronEvent) => event.preventDefault()
  browserSession.on('will-download', download)
  return () => {
    browserSession.removeListener('will-download', download)
    browserSession.webRequest.onBeforeRequest(null)
    // Permission callbacks remain deny-by-default until this session is released by Electron.
  }
}

export class BrowserModule extends BaseModule<TalexEvents> {
  static key = Symbol.for('Browser')
  private manager: BrowserWorkspaceManager | null = null
  private sideManager: SideBrowserManager | null = null
  private disposers: Array<() => void> = []

  constructor() {
    super(BrowserModule.key, { create: false })
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): void {
    const runtime = resolveMainRuntime(ctx, 'BrowserModule.onInit')
    const owner = runtime.window?.window
    if (!owner || owner.isDestroyed()) throw new Error('BROWSER_MAIN_WINDOW_UNAVAILABLE')
    if (resolveAppConfigBackend() !== 'sqlite') throw new Error('BROWSER_SQLITE_REQUIRED')
    const storage = useMainStorage()
    // Dedicated persistent browsing partition. Saved pages are in the existing SQLite config;
    // web cookies and permissions stay in this partition and never enter the application session.
    const browserSession = session.fromPartition(TUFF_BROWSER_PARTITION)
    this.disposers.push(secureBrowserSession(browserSession))
    const createView = () =>
      new WebContentsView({
        webPreferences: buildWindowWebPreferences('app', {
          session: browserSession,
          navigateOnDragDrop: false,
          safeDialogs: true
        })
      })
    const manager = new BrowserWorkspaceManager(
      {
        owner,
        createView,
        persist: async (state) => {
          const result = await storage.saveConfigDurable(BROWSER_WORKSPACE_STORAGE_KEY, state, {
            force: true
          })
          if (!result.success) throw new Error('BROWSER_PERSIST_FAILED')
        },
        focusAddress: () => {
          runtime.transport.notifyTo(owner.webContents, BrowserEvents.focusAddress, undefined)
        },
        notify: (state) => {
          runtime.transport.notifyTo(owner.webContents, BrowserEvents.changed, state)
        },
        notifySnapshot: (tabId, snapshot) => {
          runtime.transport.notifyTo(owner.webContents, BrowserEvents.snapshot, { tabId, snapshot })
        }
      },
      storage.getConfig(BROWSER_WORKSPACE_STORAGE_KEY)
    )
    const sideManager = new SideBrowserManager({
      owner,
      createView,
      notify: (state) => {
        runtime.transport.notifyTo(owner.webContents, BrowserEvents.sideChanged, state)
      },
      notifySnapshot: (snapshot) => {
        runtime.transport.notifyTo(owner.webContents, BrowserEvents.sideSnapshot, { snapshot })
      }
    })
    this.manager = manager
    this.sideManager = sideManager
    this.disposers.push(registerBrowserHandlers(runtime.transport, owner, manager, sideManager))
    const quit = () => {
      sideManager.dispose()
      void manager.dispose()
    }
    app.on('before-quit', quit)
    this.disposers.push(() => app.removeListener('before-quit', quit))
  }

  async onDestroy(): Promise<void> {
    for (const dispose of this.disposers.splice(0).reverse()) dispose()
    this.sideManager?.dispose()
    this.sideManager = null
    await this.manager?.dispose()
    this.manager = null
  }
}

export const browserModule = new BrowserModule()
