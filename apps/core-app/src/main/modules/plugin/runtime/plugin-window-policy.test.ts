import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createPluginViewNavigationPolicy,
  executePluginWindowCommand,
  isPluginViewNavigationAllowed,
  isPluginViewResourceAllowed,
  normalizePluginWindowCommand,
  normalizePluginWindowOptions,
  normalizePluginWindowRequest,
  resolveLocalPluginWindowTarget,
  translateLegacyWindowProperty
} from './plugin-window-policy'

const tempDirs: string[] = []

async function createPluginRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-window-policy-'))
  tempDirs.push(root)
  await fs.writeFile(path.join(root, 'index.html'), '<html></html>')
  return root
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('plugin window policy', () => {
  it('resolves only canonical local HTML files inside the plugin root', async () => {
    const root = await createPluginRoot()
    const canonicalTarget = await fs.realpath(path.join(root, 'index.html'))

    await expect(resolveLocalPluginWindowTarget(root, 'index.html')).resolves.toBe(canonicalTarget)
    for (const remoteTarget of [
      'https://example.test',
      'http://example.test',
      '//example.test/view',
      'javascript:alert(1)'
    ]) {
      await expect(resolveLocalPluginWindowTarget(root, remoteTarget)).rejects.toMatchObject({
        code: 'PLUGIN_WINDOW_REMOTE_URL_DENIED'
      })
    }
    await expect(resolveLocalPluginWindowTarget(root, '../index.html')).rejects.toMatchObject({
      code: 'PLUGIN_WINDOW_PATH_OUTSIDE_ROOT'
    })
    await fs.writeFile(path.join(root, 'notes.txt'), 'not html')
    await fs.mkdir(path.join(root, 'view-dir'))
    await expect(resolveLocalPluginWindowTarget(root, 'notes.txt')).rejects.toMatchObject({
      code: 'PLUGIN_WINDOW_TARGET_INVALID'
    })
    await expect(resolveLocalPluginWindowTarget(root, 'view-dir')).rejects.toMatchObject({
      code: 'PLUGIN_WINDOW_TARGET_INVALID'
    })
  })

  it('rejects symlink escapes', async () => {
    const root = await createPluginRoot()
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-window-outside-'))
    tempDirs.push(outside)
    const outsideFile = path.join(outside, 'outside.html')
    await fs.writeFile(outsideFile, '<html></html>')
    await fs.symlink(outsideFile, path.join(root, 'linked.html'))

    await expect(resolveLocalPluginWindowTarget(root, 'linked.html')).rejects.toMatchObject({
      code: 'PLUGIN_WINDOW_PATH_OUTSIDE_ROOT'
    })
  })

  it('accepts only the reviewed BrowserWindow option subset', () => {
    expect(
      normalizePluginWindowOptions({
        width: 640,
        height: 480,
        x: 10,
        y: 20,
        title: 'Plugin',
        resizable: true,
        alwaysOnTop: false,
        visible: true
      })
    ).toEqual({
      width: 640,
      height: 480,
      x: 10,
      y: 20,
      title: 'Plugin',
      resizable: true,
      alwaysOnTop: false,
      visible: true
    })

    for (const unsafeOptions of [
      { webPreferences: {} },
      { preload: '/tmp/evil.js' },
      { partition: 'persist:evil' },
      { session: {} },
      { kiosk: true },
      { fullscreen: true },
      { parent: {} },
      { modal: true },
      { unknownOption: true }
    ]) {
      expect(() => normalizePluginWindowOptions(unsafeOptions)).toThrowError(
        expect.objectContaining({ code: 'PLUGIN_WINDOW_OPTIONS_INVALID' })
      )
    }
  })

  it('rejects legacy top-level URLs and Electron constructor options', () => {
    expect(() => normalizePluginWindowRequest({ url: 'https://example.test' })).toThrowError(
      expect.objectContaining({ code: 'PLUGIN_WINDOW_REMOTE_URL_DENIED' })
    )
    expect(() =>
      normalizePluginWindowRequest({ file: 'index.html', webPreferences: {} })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_WINDOW_OPTIONS_INVALID' }))
  })

  it('validates and executes only the typed command union', () => {
    const calls: unknown[][] = []
    const win = {
      focus: (...args: unknown[]) => calls.push(['focus', ...args]),
      close: (...args: unknown[]) => calls.push(['close', ...args]),
      setBounds: (...args: unknown[]) => calls.push(['setBounds', ...args]),
      setAlwaysOnTop: (...args: unknown[]) => calls.push(['setAlwaysOnTop', ...args])
    }

    const command = normalizePluginWindowCommand({
      type: 'setBounds',
      bounds: { x: 12, width: 600, height: 400 }
    })
    executePluginWindowCommand(win, command)

    expect(calls).toEqual([['setBounds', { x: 12, width: 600, height: 400 }]])
    expect(() => normalizePluginWindowCommand({ type: 'openDevTools' })).toThrowError(
      expect.objectContaining({ code: 'PLUGIN_WINDOW_COMMAND_REMOVED' })
    )
  })

  it('translates only exact legacy command shapes', () => {
    expect(translateLegacyWindowProperty({ window: { setAlwaysOnTop: [true] } })).toEqual({
      type: 'setAlwaysOnTop',
      value: true
    })
    expect(() => translateLegacyWindowProperty({ window: { focus: [], close: [] } })).toThrowError(
      expect.objectContaining({ code: 'PLUGIN_WINDOW_COMMAND_REMOVED' })
    )
    expect(() => translateLegacyWindowProperty({ webContents: { openDevTools: [] } })).toThrowError(
      expect.objectContaining({ code: 'PLUGIN_WINDOW_COMMAND_REMOVED' })
    )
  })

  it('allows local navigation only to the canonical entry and local resources inside root', async () => {
    const root = await createPluginRoot()
    await fs.mkdir(path.join(root, 'assets'))
    await fs.writeFile(path.join(root, 'assets', 'app.js'), 'export {}')
    const entry = await fs.realpath(path.join(root, 'index.html'))
    const policy = await createPluginViewNavigationPolicy({
      pluginRoot: root,
      targetUrl: pathToFileURL(entry).href,
      securityProfile: 'trusted-plugin-view',
      allowLegacyWebview: false
    })

    expect(isPluginViewNavigationAllowed(policy, `${policy.entryUrl}#route`)).toBe(true)
    expect(
      isPluginViewNavigationAllowed(policy, new URL('file:///tmp/outside.html').toString())
    ).toBe(false)
    expect(
      isPluginViewResourceAllowed(policy, pathToFileURL(path.join(root, 'assets/app.js')).href)
    ).toBe(true)
    expect(isPluginViewResourceAllowed(policy, 'https://example.test/app.js')).toBe(false)
  })

  it('allows development navigation and resources only on the configured loopback origin', async () => {
    const root = await createPluginRoot()
    const policy = await createPluginViewNavigationPolicy({
      pluginRoot: root,
      targetUrl: 'http://127.0.0.1:5173/view',
      securityProfile: 'trusted-plugin-view',
      devAddress: 'http://127.0.0.1:5173/',
      appIsPackaged: false,
      pluginDevEnabled: true,
      pluginDevSource: true,
      allowLegacyWebview: false
    })

    expect(isPluginViewNavigationAllowed(policy, 'http://127.0.0.1:5173/other')).toBe(true)
    expect(isPluginViewNavigationAllowed(policy, 'http://localhost:5173/other')).toBe(false)
    expect(isPluginViewResourceAllowed(policy, 'ws://127.0.0.1:5173/hmr')).toBe(true)
    expect(isPluginViewResourceAllowed(policy, 'https://example.test/app.js')).toBe(false)
  })

  it('keeps compatibility views local-only even in plugin development mode', async () => {
    const root = await createPluginRoot()

    await expect(
      createPluginViewNavigationPolicy({
        pluginRoot: root,
        targetUrl: 'http://127.0.0.1:5173/view',
        securityProfile: 'compat-plugin-view',
        devAddress: 'http://127.0.0.1:5173/',
        appIsPackaged: false,
        pluginDevEnabled: true,
        pluginDevSource: true,
        allowLegacyWebview: true
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_WINDOW_REMOTE_URL_DENIED' })
  })
})
