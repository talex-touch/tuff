import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/tuff-test'),
    getVersion: vi.fn(() => '0.0.0-test'),
    isPackaged: false,
    setPath: vi.fn(),
    commandLine: {
      appendArgument: vi.fn(),
      appendSwitch: vi.fn()
    },
    disableHardwareAcceleration: vi.fn()
  },
  BrowserWindow: vi.fn(),
  clipboard: {
    readText: vi.fn(() => ''),
    writeText: vi.fn()
  },
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  },
  MessageChannelMain: vi.fn(() => ({
    port1: {
      close: vi.fn(),
      on: vi.fn(),
      postMessage: vi.fn(),
      start: vi.fn()
    },
    port2: {
      close: vi.fn(),
      on: vi.fn(),
      postMessage: vi.fn(),
      start: vi.fn()
    }
  })),
  crashReporter: {
    start: vi.fn()
  },
  screen: {
    getAllDisplays: vi.fn(() => [])
  }
}))

vi.mock('@sentry/electron/main', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  setContext: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
  withScope: vi.fn((callback: (scope: unknown) => void) => callback({})),
  startSpan: vi.fn((_options: unknown, callback: () => unknown) => callback())
}))

vi.mock('../../../../utils/logger', () => {
  const createMockLogger = () => ({
    child: vi.fn(() => createMockLogger()),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    time: vi.fn(() => ({
      end: vi.fn(),
      split: vi.fn()
    })),
    warn: vi.fn()
  })

  return {
    createLogger: vi.fn(() => createMockLogger()),
    fileProviderLog: createMockLogger(),
    mainLog: createMockLogger(),
    moduleLog: createMockLogger()
  }
})

vi.mock('./abilities/currency-ability', () => ({
  CurrencyPreviewAbility: class CurrencyPreviewAbility {
    readonly id = 'preview.currency'
    readonly label = 'Currency'
    readonly priority = 40
    readonly safety = {
      input: {
        maxLength: 120,
        syntax: 'currency amount conversion, e.g. 10 USD to CNY',
        notes: 'CoreApp realtime currency adapter test double.'
      },
      dependencies: ['parser', 'network', 'cache'],
      usesDynamicExecution: false,
      usesNetwork: true,
      usesCache: true,
      replacementPlan: 'CoreApp realtime adapter retained for Nexus/cache-backed rates.'
    }

    canHandle(): boolean {
      return false
    }

    async execute(): Promise<null> {
      return null
    }
  }
}))

import {
  listPreviewAbilityInventory,
  listPreviewDynamicExecutionInventory
} from './preview-inventory'
import { registerDefaultPreviewAbilities } from './abilities'
import { previewAbilityRegistry, registerPreviewAbility } from './preview-registry'

beforeAll(() => {
  if (previewAbilityRegistry.list().length === 0) {
    registerDefaultPreviewAbilities({ register: registerPreviewAbility })
  }
})

describe('preview inventory', () => {
  it('classifies migrated SDK abilities and CoreApp adapters', () => {
    const inventory = listPreviewAbilityInventory()

    expect(inventory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'preview.expression.basic',
          owner: 'preview-sdk',
          status: 'migrated',
          safety: expect.objectContaining({ usesDynamicExecution: false })
        }),
        expect.objectContaining({
          id: 'preview.expression.advanced',
          owner: 'preview-sdk',
          status: 'migrated'
        }),
        expect.objectContaining({
          id: 'preview.constants.scientific',
          owner: 'preview-sdk',
          status: 'migrated'
        }),
        expect.objectContaining({
          id: 'preview.time',
          owner: 'preview-sdk',
          status: 'migrated'
        }),
        expect.objectContaining({
          id: 'preview.currency',
          owner: 'core-app',
          status: 'adapter',
          safety: expect.objectContaining({ usesNetwork: true, usesCache: true })
        })
      ])
    )
  })

  it('keeps widget runtime sandbox out of PreviewSDK inventory', () => {
    expect(listPreviewDynamicExecutionInventory()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'widget.runtime.sandbox',
          owner: 'core-app',
          boundary: 'sandbox',
          dynamicExecution: true,
          replacementPlan: expect.stringContaining('Keep out of PreviewSDK')
        })
      ])
    )
  })
})
