import { afterEach, describe, expect, it } from 'vitest'
import {
  NEXUS_BASE_URL,
  NEXUS_LOCAL_BASE_URL,
  resolveTuffNexusBaseUrl,
  TUFF_NEXUS_BASE_URL_ENV,
  isElectronRenderer
} from '../env'

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

describe('resolveTuffNexusBaseUrl', () => {
  it('uses official Nexus by default', () => {
    expect(resolveTuffNexusBaseUrl({ env: {} })).toBe(NEXUS_BASE_URL)
  })

  it('uses local Nexus only for explicit local runtime mode', () => {
    expect(resolveTuffNexusBaseUrl({ runtimeServer: 'local', env: {} })).toBe(
      NEXUS_LOCAL_BASE_URL
    )
  })

  it('prefers TUFF_NEXUS_BASE_URL and normalizes trailing slashes', () => {
    expect(
      resolveTuffNexusBaseUrl({
        runtimeServer: 'local',
        env: {
          [TUFF_NEXUS_BASE_URL_ENV]: 'https://runtime.example.test///'
        }
      })
    ).toBe('https://runtime.example.test')
  })

  it('ignores removed Nexus env aliases', () => {
    const removedEnvAliases = {
      [['VITE', 'NEXUS', 'URL'].join('_')]: 'http://old-vite.test',
      [['NEXUS', 'API', 'BASE'].join('_')]: 'http://old-api.test',
      [['NEXUS', 'API', 'BASE', 'LOCAL'].join('_')]: 'http://old-local.test',
      [['TPEX', 'API', 'BASE'].join('_')]: 'http://old-tpex.test',
      [['AUTH', 'ORIGIN'].join('_')]: 'http://old-auth.test',
      [['TUFF', 'LOCAL', 'BASE', 'URL'].join('_')]: 'http://old-local-base.test'
    }

    expect(
      resolveTuffNexusBaseUrl({
        env: removedEnvAliases
      })
    ).toBe(NEXUS_BASE_URL)
  })
})
