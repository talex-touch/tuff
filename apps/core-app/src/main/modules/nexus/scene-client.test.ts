import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  getAuthToken: vi.fn()
}))

const networkMocks = vi.hoisted(() => ({
  request: vi.fn()
}))

vi.mock('../auth', () => authMocks)
vi.mock('../network', () => ({
  getNetworkService: () => networkMocks
}))

vi.mock('@talex-touch/utils/env', () => ({
  getTuffBaseUrl: () => 'https://nexus.example.com'
}))

import {
  extractFxConvertFromSceneRun,
  extractFxRateSnapshotFromSceneRun,
  extractTranslatedImageFromSceneRun,
  extractTranslatedTextFromSceneRun,
  runNexusScene
} from './scene-client'

describe('runNexusScene', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.getAuthToken.mockReturnValue('app-token')
    networkMocks.request.mockResolvedValue({
      data: {
        run: {
          runId: 'scene_run_1',
          sceneId: 'corebox.selection.translate',
          status: 'completed',
          mode: 'execute',
          output: { translatedText: '你好' }
        }
      }
    })
  })

  it('calls Nexus runtime scene API with app bearer token', async () => {
    const run = await runNexusScene('corebox.selection.translate', {
      input: { text: 'hello', targetLang: 'zh' },
      capability: 'text.translate'
    })

    expect(networkMocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://nexus.example.com/api/v1/scenes/corebox.selection.translate/run',
        headers: expect.objectContaining({
          Authorization: 'Bearer app-token',
          'Content-Type': 'application/json'
        }),
        body: {
          input: { text: 'hello', targetLang: 'zh' },
          capability: 'text.translate',
          providerId: undefined,
          dryRun: undefined
        }
      })
    )
    expect(run?.output).toEqual({ translatedText: '你好' })
  })

  it('returns null when user is not signed in', async () => {
    authMocks.getAuthToken.mockReturnValue(null)

    await expect(runNexusScene('corebox.selection.translate', {})).resolves.toBeNull()
    expect(networkMocks.request).not.toHaveBeenCalled()
  })
})

describe('extractTranslatedTextFromSceneRun', () => {
  it('extracts translatedText only from completed run output', () => {
    expect(
      extractTranslatedTextFromSceneRun({
        runId: 'scene_run_1',
        sceneId: 'corebox.selection.translate',
        status: 'completed',
        mode: 'execute',
        output: { translatedText: '你好' }
      })
    ).toBe('你好')

    expect(
      extractTranslatedTextFromSceneRun({
        runId: 'scene_run_1',
        sceneId: 'corebox.selection.translate',
        status: 'failed',
        mode: 'execute',
        output: { translatedText: '你好' }
      })
    ).toBeNull()
  })
})

describe('extractTranslatedImageFromSceneRun', () => {
  it('extracts translated image payload from completed run output', () => {
    expect(
      extractTranslatedImageFromSceneRun({
        runId: 'scene_run_1',
        sceneId: 'corebox.screenshot.translate',
        status: 'completed',
        mode: 'execute',
        output: {
          translatedImageBase64: 'aW1hZ2U=',
          sourceText: 'hello',
          targetText: '你好'
        }
      })
    ).toEqual({
      translatedImageBase64: 'aW1hZ2U=',
      sourceText: 'hello',
      targetText: '你好'
    })

    expect(
      extractTranslatedImageFromSceneRun({
        runId: 'scene_run_1',
        sceneId: 'corebox.screenshot.translate',
        status: 'planned',
        mode: 'dry_run',
        output: { translatedImageBase64: 'aW1hZ2U=' }
      })
    ).toBeNull()
  })

  it('extracts translated image payload from composed overlay output', () => {
    expect(
      extractTranslatedImageFromSceneRun({
        runId: 'scene_run_1',
        sceneId: 'corebox.screenshot.translate',
        status: 'completed',
        mode: 'execute',
        output: {
          'vision.ocr': { text: 'hello' },
          'text.translate': { translatedText: '你好' },
          'overlay.render': {
            translatedImageBase64: 'aW1hZ2U=',
            imageMimeType: 'image/png',
            sourceText: 'hello',
            targetText: '你好',
            overlay: { mode: 'client-render' }
          }
        }
      })
    ).toEqual({
      translatedImageBase64: 'aW1hZ2U=',
      imageMimeType: 'image/png',
      sourceText: 'hello',
      targetText: '你好',
      overlay: { mode: 'client-render' }
    })
  })
})

describe('extractFxConvertFromSceneRun', () => {
  it('extracts normalized FX convert output from completed scene run', () => {
    expect(
      extractFxConvertFromSceneRun({
        runId: 'scene_run_1',
        sceneId: 'corebox.fx.convert',
        status: 'completed',
        mode: 'execute',
        output: {
          base: 'usd',
          target: 'cny',
          amount: 10,
          rate: 7.1,
          converted: 71,
          source: 'live',
          updatedAt: '2026-05-10T00:00:00.000Z'
        }
      })
    ).toMatchObject({
      base: 'USD',
      target: 'CNY',
      amount: 10,
      rate: 7.1,
      converted: 71,
      source: 'live',
      updatedAt: '2026-05-10T00:00:00.000Z'
    })

    expect(
      extractFxConvertFromSceneRun({
        runId: 'scene_run_1',
        sceneId: 'corebox.fx.convert',
        status: 'failed',
        mode: 'execute',
        output: {
          base: 'USD',
          target: 'CNY',
          amount: 10,
          rate: 7.1,
          converted: 71
        }
      })
    ).toBeNull()
  })
})

describe('extractFxRateSnapshotFromSceneRun', () => {
  it('extracts normalized FX latest snapshot from completed scene run', () => {
    expect(
      extractFxRateSnapshotFromSceneRun({
        runId: 'scene_run_1',
        sceneId: 'corebox.fx.latest',
        status: 'completed',
        mode: 'execute',
        output: {
          base: 'usd',
          rates: {
            usd: 1,
            cny: '7.1',
            invalid: Number.NaN
          },
          source: 'cache',
          asOf: '2026-05-10T00:00:00.000Z'
        }
      })
    ).toEqual({
      base: 'USD',
      rates: {
        USD: 1,
        CNY: 7.1
      },
      source: 'cache',
      asOf: '2026-05-10T00:00:00.000Z',
      providerUpdatedAt: undefined,
      fetchedAt: undefined,
      providerNextUpdateAt: undefined
    })
  })
})
