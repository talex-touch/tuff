import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TuffInputType, type IExecuteArgs } from '@talex-touch/utils'
import type { PreviewSdk } from '@talex-touch/utils/core-box/preview'

const electronMocks = vi.hoisted(() => ({
  readText: vi.fn(),
  writeText: vi.fn()
}))

const clipboardModuleMock = vi.hoisted(() => ({
  saveCustomEntry: vi.fn()
}))

const i18nHelperMock = vi.hoisted(() => ({
  getLocale: vi.fn(() => 'zh-CN')
}))

vi.mock('electron', () => ({
  clipboard: {
    readText: electronMocks.readText,
    writeText: electronMocks.writeText
  }
}))

vi.mock('../../../clipboard', () => ({
  clipboardModule: clipboardModuleMock
}))

vi.mock('../../../../utils/i18n-helper', () => ({
  getLocale: i18nHelperMock.getLocale
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
    electronMocks.readText.mockReturnValue('')
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
      locale: 'zh-CN',
      signal: expect.any(AbortSignal)
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.render?.mode).toBe('custom')
    expect(result.items[0]?.meta?.preview).toEqual({
      abilityId: 'preview.expression.basic',
      confidence: 0.6
    })
  })

  it('exposes a host copy action for the preview primary value', async () => {
    const sdk = createSdk()
    const provider = new PreviewProvider(sdk)

    const result = await provider.onSearch(
      { text: '2 + 2', inputs: [] },
      new AbortController().signal
    )

    expect(result.items[0]?.actions).toContainEqual({
      id: 'preview-copy-primary',
      type: 'copy',
      label: '复制结果',
      icon: { type: 'class', value: 'i-ri-file-copy-line' },
      payload: { text: '4' }
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
      locale: 'zh-CN',
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

  it('passes text clipboard inputs to PreviewSDK abilities', async () => {
    const sdk = createSdk()
    const provider = new PreviewProvider(sdk)
    const query = {
      text: 'json',
      inputs: [{ type: TuffInputType.Text, content: '{"ok":true}' }]
    }

    await provider.onSearch(query, new AbortController().signal)

    expect(sdk.resolve).toHaveBeenCalledWith({
      query,
      locale: 'zh-CN',
      signal: expect.any(AbortSignal)
    })
    expect(provider.supportedInputTypes).toEqual([TuffInputType.Text, TuffInputType.Html])
  })

  it('does not use Electron clipboard text as default developer command input', async () => {
    electronMocks.readText.mockReturnValue('{"ok":true}')
    const sdk = createSdk()
    const provider = new PreviewProvider(sdk)

    await provider.onSearch({ text: 'json', inputs: [] }, new AbortController().signal)

    expect(electronMocks.readText).not.toHaveBeenCalled()
    expect(sdk.resolve).toHaveBeenCalledWith({
      query: { text: 'json', inputs: [] },
      locale: 'zh-CN',
      signal: expect.any(AbortSignal)
    })
  })

  it('does not read Electron clipboard for non-QuickOps previews', async () => {
    const sdk = createSdk()
    const provider = new PreviewProvider(sdk)

    await provider.onSearch({ text: '2 + 2', inputs: [] }, new AbortController().signal)

    expect(electronMocks.readText).not.toHaveBeenCalled()
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

  it('does not expose QuickOps QR save actions from the generic PreviewProvider', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges"><rect width="8" height="8" fill="#fff"/><g fill="#000"><rect x="1" y="1" width="1" height="1"/><rect x="6" y="6" width="1" height="1"/></g></svg>'
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    const sdk = createSdk()
    vi.mocked(sdk.resolve).mockResolvedValue({
      abilityId: 'preview.quickops.developer',
      confidence: 0.8,
      payload: {
        abilityId: 'preview.quickops.developer',
        title: 'QR Code 生成',
        primaryLabel: 'SVG Data URL',
        primaryValue: dataUrl,
        meta: {
          quickOps: {
            operation: 'qr-code',
            render: {
              kind: 'qr-code-svg',
              dataUrl
            }
          }
        }
      }
    })
    const provider = new PreviewProvider(sdk)
    const searchResult = await provider.onSearch(
      { text: 'qr code https://tuff.talex.app', inputs: [] },
      new AbortController().signal
    )
    const item = searchResult.items[0]!

    expect(item.actions).toContainEqual({
      id: 'preview-copy-primary',
      type: 'copy',
      label: '复制结果',
      icon: { type: 'class', value: 'i-ri-file-copy-line' },
      payload: { text: dataUrl }
    })
    expect(item.actions?.map((action) => action.id)).toEqual(['preview-copy-primary'])
  })
})
