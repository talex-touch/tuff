import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const coreAppRoot = path.resolve(__dirname, '../../../../..')

function read(relativePath: string): string {
  return fs.readFileSync(path.join(coreAppRoot, relativePath), 'utf-8')
}

describe('plugin window boundary contract', () => {
  const pluginModuleSource = read('src/main/modules/plugin/plugin-module.ts')
  const coreBoxSource = read('src/main/modules/box-tool/core-box/window.ts')
  const divisionBoxSource = read('src/main/modules/division-box/session.ts')
  const preloadSource = read('src/preload/plugin-view.ts')

  it('registers every privileged public window event through the protected register', () => {
    for (const event of ['new', 'visible', 'command', 'property']) {
      expect(pluginModuleSource).toMatch(
        new RegExp(`registerProtectedWindowChannel[\\s\\S]{0,160}PluginEvents\\.window\\.${event}`)
      )
      expect(pluginModuleSource).not.toContain(`transport.on(PluginEvents.window.${event}`)
    }
  })

  it('validates and canonicalizes the request before constructing a window', () => {
    const start = pluginModuleSource.indexOf('PluginEvents.window.new')
    const end = pluginModuleSource.indexOf('PluginEvents.window.visible', start)
    const handler = pluginModuleSource.slice(start, end)

    expect(handler.indexOf('normalizePluginWindowRequest')).toBeGreaterThan(-1)
    expect(handler.indexOf('resolveLocalPluginWindowTarget')).toBeGreaterThan(
      handler.indexOf('normalizePluginWindowRequest')
    )
    expect(handler.indexOf('new TouchWindow')).toBeGreaterThan(
      handler.indexOf('resolveLocalPluginWindowTarget')
    )
    expect(handler).not.toContain('.loadURL(')
  })

  it('contains all plugin view surfaces with the shared host and navigation policy', () => {
    for (const source of [pluginModuleSource, coreBoxSource, divisionBoxSource]) {
      expect(source).toContain('buildPluginViewWebPreferences')
      expect(source).toContain('installPluginViewNavigationPolicy')
    }
    expect(coreBoxSource).toContain("securityProfile.effectiveProfile === 'compat-plugin-view'")
    expect(divisionBoxSource).toContain("securityProfile.effectiveProfile === 'compat-plugin-view'")
  })

  it('removes reflective BrowserWindow and WebContents member invocation', () => {
    expect(pluginModuleSource).not.toContain('const applyProps =')
    expect(pluginModuleSource).not.toContain('browserWindow.webContents as unknown')
    expect(pluginModuleSource).not.toMatch(/target\[key\]/)
  })

  it('resolves control ids only through the owning plugin window registry', () => {
    const start = pluginModuleSource.indexOf('PluginEvents.window.visible')
    const end = pluginModuleSource.indexOf('PluginEvents.communicate.index', start)
    const controls = pluginModuleSource.slice(start, end)

    expect(controls.match(/touchPlugin\._windows\.get\(id\)/g)).toHaveLength(3)
    expect(controls).not.toContain('BrowserWindow.fromId')
  })

  it('exposes only plugin metadata, config, and the async channel to page context', () => {
    const exposedNames = Array.from(
      preloadSource.matchAll(/exposeInMainWorld\(\s*['"]([^'"]+)['"]/g),
      (match) => match[1]
    )

    expect(exposedNames).toEqual(['$plugin', '$config', '$channel'])
    expect(preloadSource).not.toContain("exposeInMainWorld('electron'")
    expect(preloadSource).not.toContain("exposeInMainWorld('ipcRenderer'")
    expect(preloadSource).not.toContain("exposeInMainWorld('process'")
    expect(preloadSource).not.toContain("exposeInMainWorld('require'")
  })
})
