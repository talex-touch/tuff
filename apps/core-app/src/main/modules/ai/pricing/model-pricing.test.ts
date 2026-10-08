/**
 * Pricing resolution and cost estimation against a real models.dev cut.
 *
 * Fixture: `__fixtures__/models-dev-subset.json` is a verbatim cut of https://models.dev/api.json
 * downloaded on 2026-10-03 — 11 providers and 19 models, raw shape, original provider order. It
 * includes an all-zero priced model (`zhipuai-coding-plan/glm-5.3-flash`), a model without `cost`
 * (`openai/gpt-image-1`) and a reseller (`openrouter`). The cut script is not committed.
 */
import type { PricingChannel } from './model-pricing'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../intelligence-test-harness'
import { isMainStorageReady } from '../../storage'
import { getStorageMocks } from '../intelligence-test-harness'
import fixture from './__fixtures__/models-dev-subset.json'
import { compactModelsDevCatalog } from './models-dev-catalog'
import { estimateCostUsd, resolveModelPricing, SYSTEM_OCR_PROVIDER_ID } from './model-pricing'

const sdkMocks = vi.hoisted(() => ({
  configs: null as Map<string, Record<string, unknown>> | null
}))

vi.mock('../intelligence-sdk', () => ({
  getIntelligenceProviderManager: () => {
    if (!sdkMocks.configs) throw new Error('[Intelligence] Provider manager not initialized')
    const configs = sdkMocks.configs
    return {
      get: (providerId: string) => {
        const config = configs.get(providerId)
        return config ? { getConfig: () => config } : undefined
      }
    }
  }
}))

const catalog = compactModelsDevCatalog(fixture, { fetchedAt: 1, etag: null })
if (!catalog) throw new Error('fixture did not compact')

function channel(overrides: Partial<PricingChannel> & { id: string }): PricingChannel {
  return { type: 'custom', baseUrl: null, metadata: null, ...overrides }
}

function resolveWith(providerChannel: PricingChannel | undefined, model: string, id?: string) {
  return resolveModelPricing(
    { providerId: id ?? providerChannel?.id ?? 'unknown', model },
    { catalog, lookupChannel: () => providerChannel }
  )
}

const UNKNOWN_GATEWAY = channel({ id: 'custom-gateway', baseUrl: 'https://cpa.example.net/v1' })

beforeEach(() => {
  sdkMocks.configs = null
  getStorageMocks().storedConfig = undefined
  vi.mocked(isMainStorageReady).mockReturnValue(false)
})

describe('resolveModelPricing — parent AC-9 samples', () => {
  it('prices gpt-4o on the official OpenAI channel at the openai listing', () => {
    expect(resolveWith(channel({ id: 'openai-default', type: 'openai' }), 'gpt-4o')).toEqual({
      status: 'priced',
      resolvedVia: 'channel-type',
      catalogProvider: 'openai',
      catalogModel: 'gpt-4o',
      inputPerMTokens: 2.5,
      outputPerMTokens: 10,
      contextTokens: 128_000,
      outputLimitTokens: 16_384
    })
  })

  it('resolves a custom DashScope channel to alibaba-cn by its base URL host', () => {
    const dashscope = channel({
      id: 'custom-dashscope',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    })
    expect(resolveWith(dashscope, 'qwen-plus')).toMatchObject({
      status: 'priced',
      resolvedVia: 'base-url',
      catalogProvider: 'alibaba-cn',
      catalogModel: 'qwen-plus',
      inputPerMTokens: 0.115,
      outputPerMTokens: 0.287
    })
  })

  it('prices claude-sonnet-4-5 on an unknown gateway at the anthropic listing', () => {
    expect(resolveWith(UNKNOWN_GATEWAY, 'claude-sonnet-4-5')).toMatchObject({
      status: 'priced',
      resolvedVia: 'model-family',
      catalogProvider: 'anthropic',
      catalogModel: 'claude-sonnet-4-5',
      inputPerMTokens: 3,
      outputPerMTokens: 15
    })
  })

  it('treats Ollama and the other local runtimes as local, catalog or not', () => {
    const ollama = channel({
      id: 'local-default',
      type: 'local',
      baseUrl: 'http://localhost:11434'
    })
    expect(resolveWith(ollama, 'qwen2.5:3b').status).toBe('local')
    // Older rows store the channel type instead of a channel id.
    expect(resolveWith(undefined, 'qwen2.5:3b', 'local').status).toBe('local')
    for (const id of [
      SYSTEM_OCR_PROVIDER_ID,
      'pi-cli-default',
      'omp-cli',
      'codex-cli',
      'claude-cli'
    ]) {
      expect(resolveWith(undefined, 'claude-sonnet-4-5', id).status).toBe('local')
    }
    expect(
      resolveModelPricing(
        { providerId: 'local-default', model: 'qwen2.5:3b' },
        { catalog: null, lookupChannel: () => ollama }
      ).status
    ).toBe('local')
  })

  it('reports Nexus-managed calls as credits instead of USD', () => {
    expect(
      resolveWith(
        channel({ id: 'tuff-nexus-default', baseUrl: 'https://nexus.example/v1' }),
        'gpt-4o'
      ).status
    ).toBe('credits')
    expect(
      resolveWith(channel({ id: 'nexus-mirror', metadata: { origin: 'tuff-nexus' } }), 'gpt-4o')
        .status
    ).toBe('credits')
    expect(resolveWith(undefined, 'gpt-4o', 'tuff-nexus-default').status).toBe('credits')
  })

  it('leaves a model nobody lists unpriced', () => {
    expect(resolveWith(UNKNOWN_GATEWAY, 'house-model-7b')).toEqual({
      status: 'unpriced',
      resolvedVia: null,
      catalogProvider: null,
      catalogModel: null,
      inputPerMTokens: null,
      outputPerMTokens: null,
      contextTokens: null,
      outputLimitTokens: null
    })
  })

  it('without a catalog prices nothing', () => {
    const resolved = resolveModelPricing(
      { providerId: 'openai-default', model: 'gpt-4o' },
      { catalog: null, lookupChannel: () => channel({ id: 'openai-default', type: 'openai' }) }
    )
    expect(resolved.status).toBe('unpriced')
  })
})

describe('resolveModelPricing — conservative matching', () => {
  it('strips a date suffix, a case difference, an org prefix and :latest, in that order', () => {
    const official = channel({ id: 'openai-default', type: 'openai' })
    expect(resolveWith(official, 'gpt-4.1-2025-04-14')).toMatchObject({
      catalogProvider: 'openai',
      catalogModel: 'gpt-4.1'
    })
    expect(resolveWith(UNKNOWN_GATEWAY, 'o4-mini-2025-04-16')).toMatchObject({
      resolvedVia: 'model-family',
      catalogModel: 'o4-mini'
    })
    expect(resolveWith(UNKNOWN_GATEWAY, 'OpenAI/GPT-4o')).toMatchObject({
      catalogProvider: 'openai',
      catalogModel: 'gpt-4o'
    })
    expect(resolveWith(UNKNOWN_GATEWAY, 'deepseek-v4-flash:latest')).toMatchObject({
      resolvedVia: 'model-family',
      catalogProvider: 'deepseek',
      catalogModel: 'deepseek-v4-flash'
    })
  })

  it('never takes a reseller price, and never matches loosely', () => {
    // Only openrouter lists this id; the maker's own listing uses `claude-sonnet-4-5`.
    expect(resolveWith(UNKNOWN_GATEWAY, 'anthropic/claude-sonnet-4.5').status).toBe('unpriced')
    expect(resolveWith(UNKNOWN_GATEWAY, 'gpt-4o-ultra').status).toBe('unpriced')
    // Pointing the channel at the reseller is what makes its price apply.
    expect(
      resolveWith(
        channel({ id: 'custom-openrouter', baseUrl: 'https://openrouter.ai/api/v1' }),
        'anthropic/claude-sonnet-4.5'
      )
    ).toMatchObject({ status: 'priced', resolvedVia: 'base-url', catalogProvider: 'openrouter' })
  })

  it('splits SiliconFlow by host and keeps org-prefixed ids exact', () => {
    const builtIn = channel({ id: 'siliconflow-default', type: 'siliconflow' })
    expect(resolveWith(builtIn, 'deepseek-ai/DeepSeek-V3')).toMatchObject({
      resolvedVia: 'channel-type',
      catalogProvider: 'siliconflow-cn',
      catalogModel: 'deepseek-ai/DeepSeek-V3'
    })
    expect(
      resolveWith(
        channel({ ...builtIn, baseUrl: 'https://api.siliconflow.com/v1' }),
        'deepseek-ai/DeepSeek-V3'
      ).catalogProvider
    ).toBe('siliconflow')
  })

  it('picks zhipuai over the zero-priced coding plan on the same host by URL path', () => {
    // models.dev lists zhipuai-coding-plan before zhipuai, both on open.bigmodel.cn.
    const providerIds = Object.keys(catalog.providers)
    expect(providerIds.indexOf('zhipuai-coding-plan')).toBeLessThan(providerIds.indexOf('zhipuai'))

    expect(
      resolveWith(
        channel({ id: 'custom-zhipu', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' }),
        'glm-5.3-flash'
      )
    ).toMatchObject({
      status: 'priced',
      resolvedVia: 'base-url',
      catalogProvider: 'zhipuai',
      inputPerMTokens: 0.15,
      outputPerMTokens: 0.5
    })
    expect(
      resolveWith(
        channel({
          id: 'custom-zhipu-plan',
          baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4'
        }),
        'glm-5.3-flash'
      )
    ).toMatchObject({ status: 'free', catalogProvider: 'zhipuai-coding-plan' })
    // No path to tell them apart: catalog order decides.
    expect(
      resolveWith(
        channel({ id: 'custom-zhipu-bare', baseUrl: 'https://open.bigmodel.cn' }),
        'glm-5.3-flash'
      ).catalogProvider
    ).toBe('zhipuai-coding-plan')
  })

  it('compares hosts with their port', () => {
    // Shape of models.dev's LM Studio entry; local apps on 127.0.0.1 differ only by port.
    const local = compactModelsDevCatalog({
      lmstudio: {
        name: 'LMStudio',
        api: 'http://127.0.0.1:1234/v1',
        models: { 'openai/gpt-oss-20b': { cost: { input: 0, output: 0 } } }
      }
    })
    const resolveLocal = (baseUrl: string) =>
      resolveModelPricing(
        { providerId: 'custom-local', model: 'openai/gpt-oss-20b' },
        { catalog: local, lookupChannel: () => channel({ id: 'custom-local', baseUrl }) }
      )
    expect(resolveLocal('http://127.0.0.1:1234/v1')).toMatchObject({
      status: 'free',
      catalogProvider: 'lmstudio'
    })
    // A relay on another port of the same machine is not LM Studio.
    expect(resolveLocal('http://127.0.0.1:8317/v1').status).toBe('unpriced')
  })

  it('reports listed models without a price as unpriced, with their limits', () => {
    expect(
      resolveWith(channel({ id: 'openai-default', type: 'openai' }), 'gpt-image-1')
    ).toMatchObject({
      status: 'unpriced',
      resolvedVia: 'channel-type',
      catalogProvider: 'openai',
      catalogModel: 'gpt-image-1',
      inputPerMTokens: null,
      outputPerMTokens: null
    })
  })

  it('uses base prices for tiered models', () => {
    expect(resolveWith(UNKNOWN_GATEWAY, 'gemini-2.5-pro')).toMatchObject({
      catalogProvider: 'google',
      inputPerMTokens: 1.25,
      outputPerMTokens: 10
    })
  })
})

describe('resolveModelPricing — channel lookup', () => {
  const dashscope: Record<string, unknown> = {
    id: 'custom-1',
    type: 'custom',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  }
  const zhipu: Record<string, unknown> = {
    id: 'custom-1',
    type: 'custom',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4'
  }

  it('reads the live provider manager before the persisted channel list', () => {
    sdkMocks.configs = new Map([['custom-1', dashscope]])
    vi.mocked(isMainStorageReady).mockReturnValue(true)
    getStorageMocks().storedConfig = { providers: [zhipu] }

    expect(
      resolveModelPricing({ providerId: 'custom-1', model: 'qwen-max' }, { catalog })
        .catalogProvider
    ).toBe('alibaba-cn')
  })

  it('falls back to the persisted channel list when the manager has no such channel', () => {
    vi.mocked(isMainStorageReady).mockReturnValue(true)
    getStorageMocks().storedConfig = { providers: [zhipu] }

    expect(
      resolveModelPricing({ providerId: 'custom-1', model: 'glm-4.5' }, { catalog })
    ).toMatchObject({ resolvedVia: 'base-url', catalogProvider: 'zhipuai' })
  })

  it('treats a bare channel type as that type, and anything else as an unknown channel', () => {
    expect(
      resolveModelPricing({ providerId: 'openai', model: 'gpt-4o' }, { catalog }).resolvedVia
    ).toBe('channel-type')
    expect(
      resolveModelPricing({ providerId: 'deleted-channel', model: 'gpt-4o' }, { catalog })
        .resolvedVia
    ).toBe('model-family')
  })

  it('does not let the memo hide an edited channel', () => {
    sdkMocks.configs = new Map([['custom-1', dashscope]])
    expect(
      resolveModelPricing({ providerId: 'custom-1', model: 'glm-4.5' }, { catalog }).resolvedVia
    ).toBe('model-family')

    sdkMocks.configs = new Map([['custom-1', zhipu]])
    expect(
      resolveModelPricing({ providerId: 'custom-1', model: 'glm-4.5' }, { catalog }).resolvedVia
    ).toBe('base-url')
  })

  it('keeps the system OCR id in step with intelligence-config', () => {
    const configSource = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../intelligence-config.ts'),
      'utf8'
    )
    const declared = /^export const INTERNAL_SYSTEM_OCR_PROVIDER_ID = '([^']+)'$/m.exec(
      configSource
    )
    expect(declared?.[1]).toBe(SYSTEM_OCR_PROVIDER_ID)
  })
})

describe('estimateCostUsd', () => {
  const official = channel({ id: 'openai-default', type: 'openai' })
  const gpt4o = resolveWith(official, 'gpt-4o')

  it('prices 1000 input + 1000 output gpt-4o tokens at the fixture rate ($2.5 / $10 per 1M)', () => {
    expect(
      estimateCostUsd(
        {
          providerId: 'openai-default',
          model: 'gpt-4o',
          usage: { promptTokens: 1000, completionTokens: 1000 }
        },
        gpt4o
      )
    ).toBe(0.0125)
  })

  it('prefers a provider-reported cost (Pi CLI) and then an explicit one over the catalog', () => {
    const usage = { promptTokens: 1000, completionTokens: 1000, cost: 0.0042 }
    expect(estimateCostUsd({ providerId: 'openai-default', model: 'gpt-4o', usage }, gpt4o)).toBe(
      0.0042
    )
    expect(
      estimateCostUsd(
        { providerId: 'openai-default', model: 'gpt-4o', usage, estimatedCost: 0.5 },
        gpt4o
      )
    ).toBe(0.5)
    // A reported 0 is a real answer (local runtimes report it), not a missing one.
    expect(
      estimateCostUsd(
        { providerId: 'openai-default', model: 'gpt-4o', usage: { ...usage, cost: 0 } },
        gpt4o
      )
    ).toBe(0)
  })

  it('counts free, local, credits and unpriced models as 0', () => {
    const usage = { promptTokens: 5000, completionTokens: 5000 }
    expect(
      estimateCostUsd(
        { providerId: 'custom-zhipu-plan', model: 'glm-5.3-flash', usage },
        resolveWith(
          channel({
            id: 'custom-zhipu-plan',
            baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4'
          }),
          'glm-5.3-flash'
        )
      )
    ).toBe(0)
    expect(estimateCostUsd({ providerId: 'local', model: 'qwen2.5:3b', usage })).toBe(0)
    expect(estimateCostUsd({ providerId: 'tuff-nexus-default', model: 'gpt-4o', usage })).toBe(0)
    expect(
      estimateCostUsd(
        { providerId: 'custom-gateway', model: 'house-model-7b', usage },
        resolveWith(UNKNOWN_GATEWAY, 'house-model-7b')
      )
    ).toBe(0)
  })

  it('rounds to 6 decimals and ignores invalid token counts', () => {
    const mini = resolveWith(official, 'gpt-4o-mini')
    // (333 × 0.15 + 777 × 0.6) / 1e6 = 0.00051615
    expect(
      estimateCostUsd(
        {
          providerId: 'openai-default',
          model: 'gpt-4o-mini',
          usage: { promptTokens: 333, completionTokens: 777 }
        },
        mini
      )
    ).toBe(0.000516)
    expect(
      estimateCostUsd(
        {
          providerId: 'openai-default',
          model: 'gpt-4o-mini',
          usage: { promptTokens: Number.NaN, completionTokens: -10 }
        },
        mini
      )
    ).toBe(0)
  })
})
