import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * What preload bridges into the renderer world (#693).
 *
 * @electron-toolkit/preload's electronAPI wraps send/on/once/invoke/sendSync/
 * removeAllListeners for *any* channel name. contextIsolation stayed on, but the thing behind
 * it was the whole IPC primitive: any script in the renderer world could address any
 * main-process handler by name, and preload had nowhere to enforce an allowlist.
 *
 * The preload module runs Electron APIs at import time, so it cannot be imported here; the
 * shape of what it exposes is asserted against source.
 */

const source = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf8')

const types = readFileSync(fileURLToPath(new URL('./index.d.ts', import.meta.url)), 'utf8')

describe('preload ipc bridge', () => {
  it('no longer bridges the toolkit helper wholesale', () => {
    // The regression. Both the isolated and non-isolated paths used it.
    expect(source).not.toContain("exposeInMainWorld('electron', electronAPI)")
    expect(source).not.toContain('window.electron = electronAPI')
    expect(source).not.toContain("from '@electron-toolkit/preload'")
  })

  it('exposes the narrow shim on both paths', () => {
    // The non-isolated fallback is the one that gets forgotten; it is the same object.
    expect(source).toContain("exposeInMainWorld('electron', bridgedElectronAPI)")
    expect(source).toContain('window.electron = bridgedElectronAPI')
  })

  it('does not bridge invoke or sendSync at all', () => {
    // Absent rather than allowlisted: nothing calls them, so restoring them should be a
    // decision rather than something inherited from a helper.
    const shim = source.slice(source.indexOf('const bridgedElectronAPI'))
    expect(shim).not.toMatch(/\binvoke\s*\(/)
    expect(shim).not.toMatch(/\bsendSync\s*\(/)
  })

  it('checks the channel on every bridged method', () => {
    const shim = source.slice(
      source.indexOf('const bridgedElectronAPI'),
      source.indexOf('if (process.contextIsolated)')
    )
    const methods = shim.match(/^\s{4}(send|on|removeListener)\(/gm) ?? []
    // Asserted, because with zero matches the loop below would pass by not running.
    expect(methods.length).toBeGreaterThanOrEqual(3)
    expect((shim.match(/assertBridgedChannel\(channel\)/g) ?? []).length).toBe(methods.length)
  })

  it('allows exactly the two raw transport channels', () => {
    // These are the envelopes the channel system routes inside; authorisation belongs there,
    // not in a list of every event name.
    const channelSet = source.slice(
      source.indexOf('const BRIDGED_IPC_CHANNELS'),
      source.indexOf('function assertBridgedChannel')
    )
    expect(channelSet).toContain('RAW_MAIN_PROCESS_CHANNEL')
    expect(channelSet).toContain('RAW_PLUGIN_PROCESS_CHANNEL')
  })
})

describe('preload type declaration', () => {
  it('describes the narrow surface rather than the toolkit type', () => {
    // A wide type would let `window.electron.ipcRenderer.invoke(...)` typecheck and then fail
    // at runtime — the type is where the narrowing has to be visible.
    // `BridgedElectronAPI` contains the substring, so the toolkit import is what to assert
    // against — the first version of this test failed on its own naming.
    expect(types).not.toContain('@electron-toolkit/preload')
    expect(types).toContain('BridgedElectronAPI')
  })

  it('does not advertise the methods that are gone', () => {
    for (const method of ['invoke', 'sendSync', 'once', 'removeAllListeners'])
      expect(types, method).not.toContain(`${method}:`)
  })
})
