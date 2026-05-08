import { afterEach, describe, expect, it } from 'vitest'
import { isElectronRenderer } from '../env'

const originalProcess = globalThis.process
const originalWindow = globalThis.window
const originalElectron = (globalThis as { electron?: unknown }).electron

function setGlobal<K extends keyof typeof globalThis>(key: K, value: (typeof globalThis)[K]): void {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value
  })
}

describe('env electron renderer detection', () => {
  afterEach(() => {
    setGlobal('process', originalProcess)
    setGlobal('window', originalWindow)
    ;(globalThis as { electron?: unknown }).electron = originalElectron
  })

  it('detects electron renderer from preload-exposed ipcRenderer in sandbox', () => {
    setGlobal('process', { versions: { electron: '37.2.4' } } as NodeJS.Process)
    setGlobal('window', { electron: { ipcRenderer: {} } } as unknown as Window & typeof globalThis)

    expect(isElectronRenderer()).toBe(true)
  })

  it('keeps non-renderer runtimes false without ipcRenderer bridge', () => {
    setGlobal('process', { versions: { electron: '37.2.4' }, type: 'browser' } as NodeJS.Process)
    setGlobal('window', {} as Window & typeof globalThis)
    ;(globalThis as { electron?: unknown }).electron = undefined

    expect(isElectronRenderer()).toBe(false)
  })
})
