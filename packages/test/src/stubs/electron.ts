/**
 * Resolution target for the bare `electron` specifier inside this package.
 *
 * `packages/test` exercises main-process code that imports `electron`, but does
 * not (and should not) depend on the electron package itself -- it needs the
 * module's shape, never its binary. Without an alias the specifier resolves to
 * two different things: unresolvable from a test file, and the real
 * `node_modules/.pnpm/electron/index.js` from the code under test. A
 * `vi.mock('electron', ...)` registered in the test then keys off the former and
 * never matches the latter, so the real package loads, runs its binary probe,
 * and throws "Electron failed to install correctly" -- a message about the
 * environment for what is really a resolution mismatch.
 *
 * Aliasing gives both sides one identity, which is the thing `vi.mock` needs to
 * bind. Every export here throws on use: this file is a resolution target, not a
 * substitute implementation. A test that reaches one of these has forgotten to
 * mock the surface it actually uses, and should be told which one rather than
 * silently receiving an empty object.
 *
 * The export list mirrors what `apps/core-app/src/main` imports from 'electron'.
 * A missing name is not a soft failure: an ES module namespace has no fallback,
 * so an unlisted export makes the whole importing suite fail to collect -- which
 * shows up as a failed *file* with zero failed *tests*, invisible in a summary
 * that counts tests. Keep this list complete.
 */

function unmocked(name: string): never {
  throw new Error(
    `electron.${name} was used without being mocked. packages/test aliases 'electron' to a stub; `
    + `provide the surface you need via vi.mock('electron', () => ({ ... })).`,
  )
}

function namespace(name: string): any {
  return new Proxy({}, { get: (_target, key) => unmocked(`${name}.${String(key)}`) })
}

function constructible(name: string): any {
  return class {
    constructor() {
      unmocked(`new ${name}()`)
    }

    static [Symbol.hasInstance](): boolean {
      return false
    }
  }
}

export const app = namespace('app')
export const clipboard = namespace('clipboard')
export const crashReporter = namespace('crashReporter')
export const dialog = namespace('dialog')
export const globalShortcut = namespace('globalShortcut')
export const ipcMain = namespace('ipcMain')
export const ipcRenderer = namespace('ipcRenderer')
export const nativeImage = namespace('nativeImage')
export const nativeTheme = namespace('nativeTheme')
export const net = namespace('net')
export const powerMonitor = namespace('powerMonitor')
export const powerSaveBlocker = namespace('powerSaveBlocker')
export const protocol = namespace('protocol')
export const screen = namespace('screen')
export const session = namespace('session')
export const shell = namespace('shell')
export const systemPreferences = namespace('systemPreferences')
export const utilityProcess = namespace('utilityProcess')
export const webContents = namespace('webContents')

export const BrowserWindow = constructible('BrowserWindow')
export const Menu = constructible('Menu')
export const MessageChannelMain = constructible('MessageChannelMain')
export const MessagePortMain = constructible('MessagePortMain')
export const Notification = constructible('Notification')
export const Tray = constructible('Tray')
export const WebContentsView = constructible('WebContentsView')

export default {
  app,
  clipboard,
  crashReporter,
  dialog,
  globalShortcut,
  ipcMain,
  ipcRenderer,
  nativeImage,
  nativeTheme,
  net,
  powerMonitor,
  powerSaveBlocker,
  protocol,
  screen,
  session,
  shell,
  systemPreferences,
  utilityProcess,
  webContents,
  BrowserWindow,
  Menu,
  MessageChannelMain,
  MessagePortMain,
  Notification,
  Tray,
  WebContentsView,
}
