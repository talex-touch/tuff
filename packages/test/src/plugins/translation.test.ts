import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { loadPluginModule } from './plugin-loader'

const preludeUrl = new URL('../../../../plugins/touch-translation/index.js', import.meta.url)

class TestTuffItemBuilder {
  private readonly item: Record<string, any>
  private readonly basic: Record<string, any> = {}

  constructor(id: string) {
    this.item = { id, actions: [], meta: {}, render: { mode: 'default', basic: this.basic } }
  }

  setSource(type: string, id: string, name: string) {
    this.item.source = { type, id, name }
    return this
  }

  setTitle(title: string) {
    this.basic.title = title
    return this
  }

  setSubtitle(subtitle: string) {
    this.basic.subtitle = subtitle
    return this
  }

  setIcon(icon: unknown) {
    this.basic.icon = icon
    return this
  }

  setMeta(meta: Record<string, unknown>) {
    this.item.meta = { ...this.item.meta, ...meta }
    return this
  }

  createAndAddAction(id: string, type: string, label: string, payload?: unknown) {
    this.item.actions.push({ id, type, label, primary: this.item.actions.length === 0, payload })
    return this
  }

  build() {
    return structuredClone(this.item)
  }
}

interface HarnessOptions {
  providers?: Array<Record<string, unknown>>
  translate?: (payload: any, options: any) => Promise<Record<string, unknown>>
  ocr?: (payload: any, options: any) => Promise<Record<string, unknown>>
  clipboardWrite?: (text: string) => Promise<void>
  clearItems?: () => Promise<void>
}

function createHarness(options: HarnessOptions = {}) {
  const pushes: any[][] = []
  const calls: Array<{ kind: string, payload?: unknown, options?: unknown }> = []
  const providers = options.providers ?? [
    {
      providerId: 'provider-a',
      providerName: 'Provider A',
      providerType: 'host',
      models: ['model-a'],
      defaultModel: 'model-a',
      capabilities: ['text.translate'],
      available: true,
    },
  ]
  const clipboardWrite = vi.fn(options.clipboardWrite ?? (async () => undefined))
  const module = loadPluginModule<any>(preludeUrl, {
    plugin: {
      feature: {
        async clearItems() {
          calls.push({ kind: 'clear' })
          await options.clearItems?.()
        },
        async pushItems(items: any[]) {
          pushes.push(structuredClone(items))
          calls.push({ kind: 'push', payload: structuredClone(items) })
        },
      },
      translation: {
        async listProviders() {
          calls.push({ kind: 'list-providers' })
          return structuredClone(providers)
        },
        async translate(payload: any, invokeOptions: any) {
          calls.push({ kind: 'translate', payload: structuredClone(payload), options: structuredClone(invokeOptions) })
          if (options.translate)
            return options.translate(payload, invokeOptions)
          return {
            result: `translated:${payload.text}`,
            provider: invokeOptions.preferredProviderId,
            model: invokeOptions.modelPreference?.[0] ?? 'default',
            traceId: 'trace-public',
            latency: 5,
          }
        },
        async ocr(payload: any, invokeOptions: any) {
          calls.push({ kind: 'ocr', payload: structuredClone(payload), options: structuredClone(invokeOptions) })
          if (options.ocr)
            return options.ocr(payload, invokeOptions)
          return {
            result: { text: 'recognized text' },
            provider: 'ocr-provider',
            model: 'ocr-model',
            traceId: 'ocr-trace',
            latency: 4,
          }
        },
      },
    },
    clipboard: { writeText: clipboardWrite },
    logger: { error() {}, warn() {} },
    TuffItemBuilder: TestTuffItemBuilder,
  })

  return { module, pushes, calls, clipboardWrite }
}

function finalItems(pushes: any[][]): any[] {
  return pushes.at(-1) ?? []
}

function actionItem(items: any[]): any {
  return items.find(item => item.actions?.some((action: any) => action.id === 'copy-translation'))
}

describe('touch-translation isolated Prelude', () => {
  it('contains no privileged child surface or production test export', () => {
    const source = fs.readFileSync(fileURLToPath(preludeUrl), 'utf8')
    for (const pattern of [
      /\b__test\b/,
      /\brequire\s*\(/,
      /\bfetch\s*\(/,
      /(?:^|[^.\w])process\s*(?:\.|\[)/m,
      /\btouchChannel\b/,
      /\bpermission\s*\.\s*request\s*\(/,
      /\b(?:apiKey|secretKey|secretId|authorization|endpoint)\b/i,
      /\b(?:child_process|node:crypto|electron)\b/,
    ]) {
      expect(source).not.toMatch(pattern)
    }
    const exported = createHarness().module
    expect(exported.__test).toBeUndefined()
  })

  it('awaits a bounded single-provider text translation and publishes a copy action', async () => {
    const harness = createHarness()
    await expect(
      harness.module.onFeatureTriggered('touch-translate', 'hello', undefined, new AbortController().signal),
    ).resolves.toBe(true)

    expect(harness.calls.map(call => call.kind)).toEqual([
      'clear',
      'push',
      'list-providers',
      'translate',
      'clear',
      'push',
    ])
    const translated = harness.calls.find(call => call.kind === 'translate')!
    expect(translated.payload).toEqual({ text: 'hello', targetLang: 'zh' })
    expect(translated.options).toMatchObject({
      preferredProviderId: 'provider-a',
      modelPreference: ['model-a'],
      metadata: {
        entry: 'touch-translate',
        capabilityId: 'text.translate',
        selectedProviderId: 'provider-a',
      },
    })
    const item = actionItem(finalItems(harness.pushes))
    expect(item.render.basic.icon).toEqual({ type: 'class', value: 'i-ri-translate-2' })
    expect(item.meta).toEqual({
      pluginName: 'touch-translation',
      featureId: 'touch-translate',
      defaultAction: 'copy-translation',
    })
    expect(item.actions[0].payload).toMatchObject({
      requestId: expect.any(String),
      text: 'translated:hello',
    })
  })

  it('caps multi-source translation to three host-enumerated public providers', async () => {
    const providers = Array.from({ length: 5 }, (_, index) => ({
      providerId: `provider-${index}`,
      providerName: `Provider ${index}`,
      providerType: 'host',
      models: [`model-${index}`],
      defaultModel: `model-${index}`,
      capabilities: ['text.translate'],
      available: true,
    }))
    const harness = createHarness({ providers })

    await harness.module.onFeatureTriggered('multi-source-translate', '你好', undefined, new AbortController().signal)

    const translateCalls = harness.calls.filter(call => call.kind === 'translate')
    expect(translateCalls).toHaveLength(3)
    expect(translateCalls.map(call => (call.options as any).preferredProviderId)).toEqual([
      'provider-0',
      'provider-1',
      'provider-2',
    ])
    expect(translateCalls.every(call => JSON.stringify(call).includes('ignored') === false)).toBe(true)
    expect(finalItems(harness.pushes)).toHaveLength(3)
  })

  it('performs screenshot OCR then fixed text.translate without image or window output', async () => {
    const harness = createHarness()
    const png = 'data:image/png;base64,iVBORw0KGgo='
    await harness.module.onFeatureTriggered(
      'screenshot-translate',
      { inputs: [{ type: 'image', content: png }] },
      undefined,
      new AbortController().signal,
    )

    const ocr = harness.calls.find(call => call.kind === 'ocr')!
    const translate = harness.calls.find(call => call.kind === 'translate')!
    expect(ocr.payload).toEqual({
      source: { type: 'data-url', dataUrl: png },
      language: 'zh-CN',
      includeLayout: false,
      includeKeywords: false,
    })
    expect(translate.payload).toEqual({ text: 'recognized text', targetLang: 'zh' })
    expect(JSON.stringify(finalItems(harness.pushes))).not.toContain(png)
    expect(JSON.stringify(finalItems(harness.pushes))).not.toMatch(/division|window|translatedImage/i)
  })

  it('distinguishes clipboard denial, operational failure, success, and stale actions', async () => {
    const denied = createHarness({
      clipboardWrite: async () => {
        throw Object.assign(new Error('redacted'), { code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED' })
      },
    })
    await denied.module.onFeatureTriggered('touch-translate', 'hello', undefined, new AbortController().signal)
    const deniedItem = actionItem(finalItems(denied.pushes))
    await expect(denied.module.onItemAction(deniedItem)).resolves.toMatchObject({
      status: 'blocked',
      reason: 'permission-denied',
    })

    const failed = createHarness({
      clipboardWrite: async () => {
        throw new Error('native secret')
      },
    })
    await failed.module.onFeatureTriggered('touch-translate', 'hello', undefined, new AbortController().signal)
    await expect(failed.module.onItemAction(actionItem(finalItems(failed.pushes)))).resolves.toMatchObject({
      status: 'failed',
      reason: 'clipboard-write-failed',
    })

    const successful = createHarness()
    await successful.module.onFeatureTriggered('touch-translate', 'hello', undefined, new AbortController().signal)
    const current = actionItem(finalItems(successful.pushes))
    await expect(successful.module.onItemAction(current)).resolves.toMatchObject({ status: 'started' })
    expect(successful.clipboardWrite).toHaveBeenCalledWith('translated:hello')

    const forged = structuredClone(current)
    forged.actions[0].payload.text = 'attacker-controlled'
    await expect(successful.module.onItemAction(forged)).resolves.toMatchObject({
      status: 'blocked',
      reason: 'invalid-payload',
    })
    expect(successful.clipboardWrite).toHaveBeenCalledTimes(1)

    const stale = structuredClone(current)
    stale.actions[0].payload.requestId = 'old-generation'
    await expect(successful.module.onItemAction(stale)).resolves.toMatchObject({
      status: 'ignored',
      reason: 'stale-request',
    })
    expect(successful.clipboardWrite).toHaveBeenCalledTimes(1)
  })

  it('serializes publications so an older clear cannot erase or republish over a newer request', async () => {
    let resolveOld!: (value: Record<string, unknown>) => void
    const oldResult = new Promise<Record<string, unknown>>((resolve) => {
      resolveOld = resolve
    })
    let releaseOldClear!: () => void
    const oldClearBarrier = new Promise<void>((resolve) => {
      releaseOldClear = resolve
    })
    let clearCount = 0
    const harness = createHarness({
      clearItems: async () => {
        clearCount += 1
        if (clearCount === 2)
          await oldClearBarrier
      },
      translate: async (payload, invokeOptions) => {
        if (payload.text === 'old')
          return oldResult
        return {
          result: `fresh:${payload.text}`,
          provider: invokeOptions.preferredProviderId,
          model: invokeOptions.modelPreference?.[0] ?? 'default',
          traceId: 'fresh-trace',
          latency: 1,
        }
      },
    })

    const oldLifecycle = harness.module.onFeatureTriggered(
      'touch-translate',
      'old',
      undefined,
      new AbortController().signal,
    )
    await vi.waitFor(() => expect(harness.calls.some(call => call.kind === 'translate')).toBe(true))
    resolveOld({
      result: 'stale-result',
      provider: 'provider-a',
      model: 'model-a',
      traceId: 'stale-trace',
      latency: 1,
    })
    await vi.waitFor(() => expect(clearCount).toBe(2))

    const freshLifecycle = harness.module.onFeatureTriggered(
      'touch-translate',
      'fresh',
      undefined,
      new AbortController().signal,
    )
    releaseOldClear()
    await Promise.all([oldLifecycle, freshLifecycle])

    expect(JSON.stringify(harness.pushes)).not.toContain('stale-result')
    expect(JSON.stringify(finalItems(harness.pushes))).toContain('fresh:fresh')
  })

  it('drops late provider completion after destroy and does not publish a stale result', async () => {
    let resolveTranslate!: (value: Record<string, unknown>) => void
    const deferred = new Promise<Record<string, unknown>>((resolve) => {
      resolveTranslate = resolve
    })
    const harness = createHarness({ translate: async () => deferred })
    const lifecycle = harness.module.onFeatureTriggered(
      'touch-translate',
      'late',
      undefined,
      new AbortController().signal,
    )
    await vi.waitFor(() => expect(harness.calls.some(call => call.kind === 'translate')).toBe(true))
    await harness.module.onDestroy()
    resolveTranslate({
      result: 'late-result',
      provider: 'provider-a',
      model: 'model-a',
      traceId: 'late-trace',
      latency: 1,
    })
    await lifecycle

    expect(JSON.stringify(harness.pushes)).not.toContain('late-result')
  })
})
