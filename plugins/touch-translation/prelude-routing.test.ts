import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { TuffItemBuilder } from '@talex-touch/utils'
import { describe, expect, it, vi } from 'vitest'

function loadPrelude(overrides: {
  clipboardWriteText?: ReturnType<typeof vi.fn>
} = {}) {
  const source = readFileSync(path.resolve(__dirname, 'index.js'), 'utf8')
  const featureItems: any[] = []
  const widgetItems: any[] = []
  const clipboardWriteText = overrides.clipboardWriteText ?? vi.fn().mockResolvedValue(undefined)

  const sandbox: Record<string, any> = {
    module: { exports: {} },
    exports: {},
    TextEncoder,
    TuffItemBuilder,
    manifest: { activationGeneration: 1 },
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    clipboard: { writeText: clipboardWriteText },
    plugin: {
      feature: {
        clearItems: vi.fn(async () => {
          featureItems.length = 0
        }),
        pushItems: vi.fn(async (items: any[]) => {
          featureItems.push(...items)
        }),
      },
      widget: {
        pushItems: vi.fn(async (items: any[]) => {
          widgetItems.push(...items)
        }),
      },
      translation: {
        listProviders: vi.fn(async () => [
          {
            providerId: 'host-default',
            providerName: 'Host Translator',
            available: true,
            capabilities: ['text.translate'],
            defaultModel: 'default-model',
          },
        ]),
        translate: vi.fn(async ({ text }: { text: string }) => ({
          result: `translated:${text}`,
          provider: 'host-default',
          model: 'default-model',
          traceId: 'trace-1',
        })),
        ocr: vi.fn(async () => ({ result: { text: 'hello ocr' } })),
      },
    },
  }
  sandbox.globalThis = sandbox

  vm.runInNewContext(source, sandbox, { filename: 'plugins/touch-translation/index.js' })
  return {
    lifecycle: sandbox.module.exports,
    featureItems,
    widgetItems,
    plugin: sandbox.plugin,
    clipboardWriteText,
  }
}

describe('touch-translation prelude routing & permission mapping', () => {
  it('routes screenshot-translate through plugin.widget and touch-translate through plugin.feature', async () => {
    const runtime = loadPrelude()

    await runtime.lifecycle.onFeatureTriggered('screenshot-translate', { text: 'hello world' })
    expect(runtime.plugin.widget.pushItems).toHaveBeenCalledTimes(1)
    expect(runtime.widgetItems[0]?.render?.custom?.content).toBe('touch-translation::screenshot-translate')

    runtime.plugin.widget.pushItems.mockClear()
    runtime.plugin.feature.pushItems.mockClear()

    await runtime.lifecycle.onFeatureTriggered('touch-translate', { text: 'hello world' })
    expect(runtime.plugin.widget.pushItems).not.toHaveBeenCalled()
    expect(runtime.plugin.feature.pushItems).toHaveBeenCalled()
    expect(runtime.featureItems.at(-1)?.actions?.[0]?.id).toBe('copy-translation')
  })

  it('distinguishes permission-unavailable from permission-denied in onItemAction', async () => {
    const clipboardWriteText = vi.fn()
    const runtime = loadPrelude({ clipboardWriteText })

    await runtime.lifecycle.onFeatureTriggered('touch-translate', { text: 'hello world' })
    const item = runtime.featureItems.at(-1)

    clipboardWriteText.mockRejectedValueOnce(
      Object.assign(new Error('unavailable'), { code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE' }),
    )
    const unavailableResult = await runtime.lifecycle.onItemAction(item)
    expect(unavailableResult).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-unavailable',
    })

    clipboardWriteText.mockRejectedValueOnce(
      Object.assign(new Error('denied'), { code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED' }),
    )
    const deniedResult = await runtime.lifecycle.onItemAction(item)
    expect(deniedResult).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
    })
  })
})
