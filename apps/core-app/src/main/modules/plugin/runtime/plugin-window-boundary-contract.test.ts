import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))
const pluginModuleSource = readFileSync(join(currentDir, '../plugin-module.ts'), 'utf8')
const windowTransportSource = readFileSync(
  join(currentDir, '../services/plugin-window-transport-service.ts'),
  'utf8'
)

describe('plugin window transport boundary', () => {
  it('delegates protected window handler registration from the module facade to the transport service', () => {
    expect(pluginModuleSource).toMatch(
      /import\s+\{\s*registerPluginWindowTransportHandlers\s*\}\s+from\s+'\.\/services\/plugin-window-transport-service'/
    )
    expect(pluginModuleSource).toMatch(
      /\.\.\.registerPluginWindowTransportHandlers\(\{\s*manager,\s*transport,\s*requiresLegacyWindowRuntime,\s*ipcLog:\s*pluginIpcLog,\s*logHandlerError:\s*logIpcHandlerError,\s*toErrorMessage\s*}\)/s
    )
    expect(pluginModuleSource).not.toMatch(/transport\.on\(PluginEvents\.window\./)
    expect(windowTransportSource).toMatch(
      /transport\.on\(PluginEvents\.window\.new,\s*async \(data: WindowNewPayload, context\)/
    )
    expect(windowTransportSource).toMatch(
      /transport\.on\(PluginEvents\.window\.visible,\s*async \(payload: WindowVisiblePayload, context\)/
    )
    expect(windowTransportSource).toMatch(
      /transport\.on\(PluginEvents\.window\.property,\s*async \(payload: WindowPropertyPayload, context\)/
    )
  })

  it('canonicalizes creation payloads before applying the shared window host and navigation policy', () => {
    expect(windowTransportSource).toContain('const { file, url, ...windowOptions } = data')
    expect(windowTransportSource).toContain(
      "import { TouchWindow } from '../../../core/touch-window'"
    )
    expect(windowTransportSource).toContain('const win = new TouchWindow({')
    expect(windowTransportSource).toContain('...windowOptions,')
    expect(windowTransportSource).toContain(
      'webPreferences: buildWindowWebPreferences(securityProfile.effectiveProfile, {'
    )
    expect(windowTransportSource).toContain('webContents = await win.loadFile(file)')
    expect(windowTransportSource).toContain('webContents = await win.loadURL(url)')
    expect(windowTransportSource).toContain("return { error: 'No file or url provided!' }")
    expect(windowTransportSource).not.toMatch(/new\s+BrowserWindow\s*\(/)
  })

  it('registers and controls windows only through the requesting plugin registry', () => {
    expect(windowTransportSource).toMatch(
      /const pluginName = context\.plugin\?\.name\s+const touchPlugin = pluginName \? \(manager\.plugins\.get\(pluginName\) as TouchPlugin\) : undefined\s+if \(!touchPlugin\) \{\s+return \{ error: 'Plugin not found!' \}\s+\}/s
    )
    expect(windowTransportSource).toContain('touchPlugin._windows.set(webContents.id, win)')
    expect(windowTransportSource).toContain('touchPlugin._windows.delete(webContents.id)')

    const owningWindowLookups = windowTransportSource.match(
      /const win = touchPlugin\._windows\.get\(id\)\s+const browserWindow = useAliveTarget\(win\?\.window\)/g
    )
    expect(owningWindowLookups).toHaveLength(2)
    expect(windowTransportSource).not.toContain('BrowserWindow.fromId')
    expect(pluginModuleSource).not.toContain('BrowserWindow.fromId')
  })
})
