import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IExecuteArgs } from '@talex-touch/utils'
import type { PreviewSdk } from '@talex-touch/utils/core-box/preview'

const electronMocks = vi.hoisted(() => ({
  writeText: vi.fn()
}))

const clipboardModuleMock = vi.hoisted(() => ({
  saveCustomEntry: vi.fn()
}))

vi.mock('electron', () => ({
  clipboard: {
    writeText: electronMocks.writeText
  }
}))

vi.mock('../../../clipboard', () => ({
  clipboardModule: clipboardModuleMock
}))

import { PreviewProvider } from './preview-provider'

function createSdk(): PreviewSdk {
  return {
    register: vi.fn(),
    listAbilities: vi.fn(() => []),
    listInventory: vi.fn(() => []),
    resolveWithDiagnostics: vi.fn(async () => ({
      result: {
        abilityId: 'preview.expression.basic',
        confidence: 0.6,
        durationMs: 1,
        payload: {
          abilityId: 'preview.expression.basic',
          title: '2 + 2',
          primaryLabel: '结果',
          primaryValue: '4'
        }
      },
      diagnostics: {
        status: 'success' as const,
        durationMs: 1,
        inputLength: 5,
        maxInputLength: 500,
        checkedAbilityCount: 1,
        executedAbilityCount: 1,
        errorCount: 0,
        exceededBudget: false,
        matchedAbilityId: 'preview.expression.basic'
      }
    })),
    resolve: vi.fn(async () => ({
      abilityId: 'preview.expression.basic',
      confidence: 0.6,
      durationMs: 1,
      payload: {
        abilityId: 'preview.expression.basic',
        title: '2 + 2',
        primaryLabel: '结果',
        primaryValue: '4'
      }
    }))
  }
}

describe('PreviewProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clipboardModuleMock.saveCustomEntry.mockResolvedValue({ id: 1 })
  })

  it('uses PreviewSDK resolve and builds a CoreBox preview item', async () => {
    const sdk = createSdk()
    const provider = new PreviewProvider(sdk)

    const result = await provider.onSearch(
      { text: '2 + 2', inputs: [] },
      new AbortController().signal
    )

    expect(sdk.resolve).toHaveBeenCalledWith({
      query: { text: '2 + 2', inputs: [] },
      signal: expect.any(AbortSignal)
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.render?.mode).toBe('custom')
    expect(result.items[0]?.meta?.preview).toEqual({
      abilityId: 'preview.expression.basic',
      confidence: 0.6
    })
  })

  it('supports explicit calculator command prefixes through PreviewSDK', async () => {
    const sdk = createSdk()
    const provider = new PreviewProvider(sdk)

    const result = await provider.onSearch(
      { text: 'calc: 2 + 2', inputs: [] },
      new AbortController().signal
    )

    expect(sdk.resolve).toHaveBeenCalledWith({
      query: { text: '2 + 2', inputs: [] },
      signal: expect.any(AbortSignal)
    })
    expect(result.query.text).toBe('calc: 2 + 2')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.meta?.preview).toEqual({
      abilityId: 'preview.expression.basic',
      confidence: 0.6,
      expression: '2 + 2'
    })
    expect(result.items[0]?.render.custom?.data).toEqual(
      expect.objectContaining({
        badges: ['Calculator'],
        meta: expect.objectContaining({
          explicitCommand: 'calc',
          rawQuery: 'calc: 2 + 2',
          resolvedQuery: '2 + 2'
        })
      })
    )
  })

  it('copies primary value and records preview history on execute', async () => {
    const provider = new PreviewProvider(createSdk())
    const searchResult = await provider.onSearch(
      { text: '2 + 2', inputs: [] },
      new AbortController().signal
    )

    const executeArgs: IExecuteArgs = {
      item: searchResult.items[0]!,
      searchResult
    }

    await provider.onExecute(executeArgs)

    expect(electronMocks.writeText).toHaveBeenCalledWith('4')
    expect(clipboardModuleMock.saveCustomEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '4',
        rawContent: '2 + 2',
        category: 'preview'
      })
    )
  })
})
