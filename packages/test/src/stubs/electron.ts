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
 * bind. Every export here throws: this file is a resolution target, not a
 * substitute implementation. A test that reaches one of these has forgotten to
 * mock the surface it actually uses, and should be told so directly rather than
 * silently receiving an empty object.
 */

function unmocked(name: string): never {
  throw new Error(
    `electron.${name} was used without being mocked. packages/test aliases 'electron' to a stub; `
    + `provide the surface you need via vi.mock('electron', () => ({ ${name}: ... })).`,
  )
}

export const app = new Proxy({}, { get: (_t, key) => unmocked(`app.${String(key)}`) })
export const shell = new Proxy({}, { get: (_t, key) => unmocked(`shell.${String(key)}`) })
export const ipcMain = new Proxy({}, { get: (_t, key) => unmocked(`ipcMain.${String(key)}`) })
export const ipcRenderer = new Proxy({}, { get: (_t, key) => unmocked(`ipcRenderer.${String(key)}`) })
export const clipboard = new Proxy({}, { get: (_t, key) => unmocked(`clipboard.${String(key)}`) })
export const nativeImage = new Proxy({}, { get: (_t, key) => unmocked(`nativeImage.${String(key)}`) })
export const screen = new Proxy({}, { get: (_t, key) => unmocked(`screen.${String(key)}`) })
export const dialog = new Proxy({}, { get: (_t, key) => unmocked(`dialog.${String(key)}`) })
export const globalShortcut = new Proxy({}, { get: (_t, key) => unmocked(`globalShortcut.${String(key)}`) })

export class BrowserWindow {
  constructor() {
    unmocked('BrowserWindow')
  }
}

export class Notification {
  constructor() {
    unmocked('Notification')
  }
}

export class Tray {
  constructor() {
    unmocked('Tray')
  }
}

export class Menu {
  constructor() {
    unmocked('Menu')
  }
}

export default { app, shell, ipcMain, ipcRenderer, clipboard, nativeImage, screen, dialog, globalShortcut, BrowserWindow, Notification, Tray, Menu }
