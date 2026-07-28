import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const coreAppRoot = path.resolve(__dirname, '../../../../..')

function read(relativePath: string): string {
  return fs.readFileSync(path.join(coreAppRoot, relativePath), 'utf-8')
}

describe('plugin window boundary contract', () => {
  const pluginModuleSource = read('src/main/modules/plugin/plugin-module.ts')
  const windowTransportSource = read(
    'src/main/modules/plugin/services/plugin-window-transport-service.ts'
  )
  const coreBoxSource = read('src/main/modules/box-tool/core-box/plugin-view-controller.ts')
  const coreBoxIpcSource = read('src/main/modules/box-tool/core-box/ipc.ts')
  const divisionBoxSource = read('src/main/modules/division-box/session.ts')
  const divisionBoxManagerSource = read('src/main/modules/division-box/manager.ts')
  const preloadSource = read('src/preload/plugin-view.ts')
  const windowDefaultsSource = read('src/main/config/default.ts')
  const protocolHandlerSource = read('src/main/service/protocol-handler.ts')

  it('delegates every privileged public window event to the protected transport service', () => {
    expect(pluginModuleSource).toContain('registerPluginWindowTransportHandlers')
    expect(pluginModuleSource).not.toContain('transport.on(PluginEvents.window.')

    for (const event of ['new', 'visible', 'command', 'property']) {
      expect(windowTransportSource).toMatch(
        new RegExp(`registerProtectedWindowChannel<[\\s\\S]{0,180}PluginEvents\\.window\\.${event}`)
      )
      expect(windowTransportSource).not.toContain(`transport.on(PluginEvents.window.${event}`)
    }
  })

  it('validates and canonicalizes the request before constructing a window', () => {
    const start = windowTransportSource.indexOf('PluginEvents.window.new')
    const end = windowTransportSource.indexOf('PluginEvents.window.visible', start)
    const handler = windowTransportSource.slice(start, end)

    expect(handler.indexOf('normalizePluginWindowRequest')).toBeGreaterThan(-1)
    expect(handler.indexOf('resolveLocalPluginWindowTarget')).toBeGreaterThan(
      handler.indexOf('normalizePluginWindowRequest')
    )
    expect(handler.indexOf('new TouchWindow')).toBeGreaterThan(
      handler.indexOf('resolveLocalPluginWindowTarget')
    )
    expect(handler).toContain('buildPublicPluginWindowOptions')
    expect(handler).toContain('installPluginViewNavigationPolicy')
    expect(handler).toContain('win.loadFile(target)')
    expect(handler).not.toContain('.loadURL(')
  })

  it('contains all plugin view surfaces with the shared host and navigation policy', () => {
    for (const source of [windowTransportSource, coreBoxSource, divisionBoxSource]) {
      expect(source).toContain('buildPluginViewWebPreferences')
      expect(source).toContain('installPluginViewNavigationPolicy')
      expect(source).toContain('registerPluginWebContents')
      expect(source).toContain('unregisterPluginWebContents')
    }
    expect(coreBoxSource).not.toContain('compat-plugin-view')
    expect(divisionBoxSource).not.toContain('compat-plugin-view')
    expect(coreBoxSource).not.toContain('getPluginChannelPreludeCode')
    expect(divisionBoxSource).not.toContain('getPluginChannelPreludeCode')
  })

  it('does not allow unowned URL requests to downgrade into app surfaces', () => {
    expect(coreBoxIpcSource).not.toContain('CoreBoxEvents.uiMode.enter')
    expect(coreBoxIpcSource).not.toContain('coreBoxManager.enterUIMode(url)')

    const ownerGate = divisionBoxManagerSource.indexOf(
      'DivisionBox UI views require an owning plugin.'
    )
    const sessionConstructor = divisionBoxManagerSource.indexOf('new DivisionBoxSession')
    expect(ownerGate).toBeGreaterThan(-1)
    expect(sessionConstructor).toBeGreaterThan(ownerGate)
  })

  it('runs the legacy compatibility gate before every plugin Electron constructor', () => {
    const publicProfile = windowTransportSource.indexOf('resolvePluginViewSecurityProfile')
    const publicConstructor = windowTransportSource.indexOf('new TouchWindow', publicProfile)
    expect(publicProfile).toBeGreaterThan(-1)
    expect(publicConstructor).toBeGreaterThan(publicProfile)

    const coreProfile = coreBoxSource.indexOf('resolvePluginViewSecurityProfile')
    const coreConstructor = coreBoxSource.indexOf('new WebContentsView', coreProfile)
    expect(coreProfile).toBeGreaterThan(-1)
    expect(coreConstructor).toBeGreaterThan(coreProfile)

    const divisionProfile = divisionBoxSource.indexOf('resolvePluginViewSecurityProfile')
    const divisionConstructor = divisionBoxSource.indexOf('new WebContentsView', divisionProfile)
    expect(divisionProfile).toBeGreaterThan(-1)
    expect(divisionConstructor).toBeGreaterThan(divisionProfile)
  })

  it('removes reflective BrowserWindow and WebContents member invocation', () => {
    expect(windowTransportSource).not.toContain('const applyProps =')
    expect(windowTransportSource).not.toContain('browserWindow.webContents as unknown')
    expect(windowTransportSource).not.toMatch(/target\[key\]/)
  })

  it('resolves control ids only through the owning plugin window registry', () => {
    const start = windowTransportSource.indexOf('PluginEvents.window.visible')
    const end = windowTransportSource.indexOf('PluginEvents.communicate.index', start)
    const controls = windowTransportSource.slice(start, end)

    expect(controls.match(/touchPlugin\._windows\.get\(id\)/g)).toHaveLength(3)
    expect(controls).not.toContain('BrowserWindow.fromId')
  })

  it('removes the historical webview and arbitrary atom file-read bypasses', () => {
    expect(windowDefaultsSource).not.toContain('enableWebviewTag')
    expect(windowDefaultsSource).not.toContain('webviewTag: true')
    expect(
      fs.existsSync(path.join(coreAppRoot, 'src/renderer/src/components/plugin/PluginView.vue'))
    ).toBe(false)
    expect(
      fs.existsSync(path.join(coreAppRoot, 'src/renderer/src/views/base/plugin/ViewPlugin.vue'))
    ).toBe(false)
    expect(protocolHandlerSource).toContain('status: 410')
    expect(protocolHandlerSource).not.toContain('net.fetch')
    expect(protocolHandlerSource).not.toContain('pathToFileURL')
  })

  it('exposes only plugin metadata, config, and the async channel to page context', () => {
    const exposedNames = Array.from(
      preloadSource.matchAll(/exposeInMainWorld\(\s*['"]([^'"]+)['"]/g),
      (match) => match[1]
    )

    expect(exposedNames).toEqual(['$plugin', '$config', '$channel'])
    expect(preloadSource).toContain('bridgeVersion: bootstrap.bridgeVersion')
    expect(preloadSource).not.toContain("exposeInMainWorld('electron'")
    expect(preloadSource).not.toContain("exposeInMainWorld('ipcRenderer'")
    expect(preloadSource).not.toContain("exposeInMainWorld('process'")
    expect(preloadSource).not.toContain("exposeInMainWorld('require'")
  })
})
