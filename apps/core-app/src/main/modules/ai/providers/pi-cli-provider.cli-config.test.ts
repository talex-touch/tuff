import type {
  IntelligenceChatPayload,
  IntelligenceInvokeOptions,
  IntelligenceProviderConfig,
  IntelligenceStreamChunk
} from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IntelligenceProvider } from '../runtime/base-provider'

const resolveCliConfigEndpoint = vi.hoisted(() => vi.fn())

vi.mock('./cli-config-provider', () => ({ resolveCliConfigEndpoint }))

import { PiCliProvider } from './pi-cli-provider'
import {
  ANTIGRAVITY_CLI_ORIGIN,
  ANTIGRAVITY_CLI_PROFILE_ID,
  ANTIGRAVITY_CLI_PROVIDER_ID,
  CLAUDE_CLI_ORIGIN,
  CLAUDE_CLI_PROFILE_ID,
  CLAUDE_CLI_PROVIDER_ID,
  CODEX_CLI_ORIGIN,
  CODEX_CLI_PROFILE_ID,
  CODEX_CLI_PROVIDER_ID,
  CURSOR_CLI_ORIGIN,
  CURSOR_CLI_PROFILE_ID,
  CURSOR_CLI_PROVIDER_ID,
  GEMINI_CLI_ORIGIN,
  GEMINI_CLI_PROFILE_ID,
  GEMINI_CLI_PROVIDER_ID,
  KIRO_CLI_ORIGIN,
  KIRO_CLI_PROFILE_ID,
  KIRO_CLI_PROVIDER_ID,
  OMP_CLI_ORIGIN,
  OMP_CLI_PROFILE_ID,
  OMP_CLI_PROVIDER_ID,
  OPENCODE_CLI_ORIGIN,
  OPENCODE_CLI_PROFILE_ID,
  OPENCODE_CLI_PROVIDER_ID
} from './pi-cli-runtime'

const CLIS = [
  {
    cli: 'codex',
    id: CODEX_CLI_PROVIDER_ID,
    origin: CODEX_CLI_ORIGIN,
    scheduler: CODEX_CLI_PROFILE_ID
  },
  {
    cli: 'claude',
    id: CLAUDE_CLI_PROVIDER_ID,
    origin: CLAUDE_CLI_ORIGIN,
    scheduler: CLAUDE_CLI_PROFILE_ID
  },
  {
    cli: 'omp',
    id: OMP_CLI_PROVIDER_ID,
    origin: OMP_CLI_ORIGIN,
    scheduler: OMP_CLI_PROFILE_ID
  }
] as const

const ACP_ONLY_CLIS = [
  {
    cli: 'antigravity',
    codePrefix: 'ANTIGRAVITY',
    id: ANTIGRAVITY_CLI_PROVIDER_ID,
    origin: ANTIGRAVITY_CLI_ORIGIN,
    scheduler: ANTIGRAVITY_CLI_PROFILE_ID
  },
  {
    cli: 'opencode',
    codePrefix: 'OPENCODE',
    id: OPENCODE_CLI_PROVIDER_ID,
    origin: OPENCODE_CLI_ORIGIN,
    scheduler: OPENCODE_CLI_PROFILE_ID
  },
  {
    cli: 'gemini',
    codePrefix: 'GEMINI',
    id: GEMINI_CLI_PROVIDER_ID,
    origin: GEMINI_CLI_ORIGIN,
    scheduler: GEMINI_CLI_PROFILE_ID
  },
  {
    cli: 'kiro',
    codePrefix: 'KIRO',
    id: KIRO_CLI_PROVIDER_ID,
    origin: KIRO_CLI_ORIGIN,
    scheduler: KIRO_CLI_PROFILE_ID
  },
  {
    cli: 'cursor',
    codePrefix: 'CURSOR',
    id: CURSOR_CLI_PROVIDER_ID,
    origin: CURSOR_CLI_ORIGIN,
    scheduler: CURSOR_CLI_PROFILE_ID
  }
] as const

const PAYLOAD = {
  messages: [{ role: 'user', content: 'hi' }]
} as unknown as IntelligenceChatPayload

function cliConfig(id: string, origin: string): IntelligenceProviderConfig {
  return {
    id,
    type: IntelligenceProviderType.LOCAL,
    name: id,
    enabled: true,
    priority: 10,
    models: [],
    timeout: 120000,
    capabilities: ['text.chat'],
    metadata: { internal: true, isLocalCli: true, origin }
  }
}

function reusedEndpoint(seen: IntelligenceInvokeOptions[]) {
  return {
    providerId: 'reused-config',
    modelId: 'upstream-model',
    provider: {
      chatStream: async function* (_payload: unknown, options: IntelligenceInvokeOptions) {
        seen.push(options)
        yield { delta: 'hello', done: false } as IntelligenceStreamChunk
      }
    } as unknown as IntelligenceProvider
  }
}

async function collect(
  stream: AsyncGenerator<IntelligenceStreamChunk>
): Promise<IntelligenceStreamChunk[]> {
  const out: IntelligenceStreamChunk[] = []
  for await (const chunk of stream) out.push(chunk)
  return out
}

describe.each(CLIS)('PiCliProvider routing for $cli', ({ cli, id, origin, scheduler }) => {
  beforeEach(() => {
    resolveCliConfigEndpoint.mockReset()
  })

  it('reuses the configured endpoint under another scheduler and names it in the chunks', async () => {
    const seen: IntelligenceInvokeOptions[] = []
    resolveCliConfigEndpoint.mockReturnValue(reusedEndpoint(seen))
    const provider = new PiCliProvider(cliConfig(id, origin), () => false)
    const options = {
      metadata: { profileId: 'default-pi' },
      modelPreference: ['requested-model']
    } as IntelligenceInvokeOptions
    await expect(collect(provider.chatStream(PAYLOAD, options))).resolves.toEqual([
      { delta: 'hello', done: false, provider: 'reused-config' }
    ])
    expect(resolveCliConfigEndpoint).toHaveBeenCalledWith(cli, 'requested-model')
    expect(seen[0].modelPreference).toEqual(['upstream-model'])
  })

  it('runs its own binary only under its own scheduler', async () => {
    const provider = new PiCliProvider(cliConfig(id, origin), () => false)
    const options = { metadata: { profileId: scheduler } } as IntelligenceInvokeOptions
    await expect(collect(provider.chatStream(PAYLOAD, options))).rejects.toThrow(
      'LOCAL_AI_CLI_FEATURE_DISABLED'
    )
    expect(resolveCliConfigEndpoint).not.toHaveBeenCalled()
  })

  it('reuses the configured endpoint when no scheduler is named', async () => {
    const seen: IntelligenceInvokeOptions[] = []
    resolveCliConfigEndpoint.mockReturnValue(reusedEndpoint(seen))
    const provider = new PiCliProvider(cliConfig(id, origin), () => false)
    await expect(
      collect(provider.chatStream(PAYLOAD, {} as IntelligenceInvokeOptions))
    ).resolves.toEqual([{ delta: 'hello', done: false, provider: 'reused-config' }])
  })

  it('fails clearly when the CLI config names no usable endpoint', async () => {
    resolveCliConfigEndpoint.mockReturnValue(null)
    const provider = new PiCliProvider(cliConfig(id, origin), () => false)
    const options = { metadata: { profileId: 'default-pi' } } as IntelligenceInvokeOptions
    await expect(collect(provider.chatStream(PAYLOAD, options))).rejects.toThrow(
      `${cli.toUpperCase()}_CONFIG_PROVIDER_UNAVAILABLE`
    )
  })

  it('declares native tool support only when reusing the configured HTTP endpoint', () => {
    const provider = new PiCliProvider(cliConfig(id, origin), () => false)
    expect(provider.supportsNativeToolsFor({ metadata: { profileId: 'default-pi' } })).toBe(true)
    expect(provider.supportsNativeToolsFor({})).toBe(true)
    expect(provider.supportsNativeToolsFor({ metadata: { profileId: scheduler } })).toBe(false)
  })

  it('forwards native tools to a native-capable reused endpoint without folding into text protocol', async () => {
    const seenPayloads: IntelligenceChatPayload[] = []
    resolveCliConfigEndpoint.mockReturnValue({
      providerId: 'reused-config',
      modelId: 'upstream-model',
      provider: {
        supportsNativeTools: true,
        chatStream: async function* (payload: IntelligenceChatPayload) {
          seenPayloads.push(payload)
          yield { delta: 'ok', done: false } as IntelligenceStreamChunk
        }
      } as unknown as IntelligenceProvider
    })
    const provider = new PiCliProvider(cliConfig(id, origin), () => false)
    const payloadWithTools: IntelligenceChatPayload = {
      messages: [{ role: 'user', content: 'search QUIC' }],
      tools: [
        {
          name: 'browser.search',
          description: 'Search the web',
          parameters: { type: 'object', properties: { query: { type: 'string' } } }
        }
      ]
    }
    await collect(
      provider.chatStream(payloadWithTools, {
        metadata: { profileId: 'default-pi' },
        modelPreference: ['requested-model']
      } as IntelligenceInvokeOptions)
    )
    expect(seenPayloads[0]).toBe(payloadWithTools)
    expect(seenPayloads[0].tools).toHaveLength(1)
  })

  it('folds tools into text protocol when a reused endpoint does not support native tools', async () => {
    const seenPayloads: IntelligenceChatPayload[] = []
    resolveCliConfigEndpoint.mockReturnValue({
      providerId: 'reused-config',
      modelId: 'upstream-model',
      provider: {
        supportsNativeTools: false,
        chatStream: async function* (payload: IntelligenceChatPayload) {
          seenPayloads.push(payload)
          yield { delta: 'ok', done: false } as IntelligenceStreamChunk
        }
      } as unknown as IntelligenceProvider
    })
    const provider = new PiCliProvider(cliConfig(id, origin), () => false)
    const payloadWithTools: IntelligenceChatPayload = {
      messages: [{ role: 'user', content: 'search QUIC' }],
      tools: [
        {
          name: 'browser.search',
          description: 'Search the web',
          parameters: { type: 'object', properties: { query: { type: 'string' } } }
        }
      ]
    }
    await collect(
      provider.chatStream(payloadWithTools, {
        metadata: { profileId: 'default-pi' },
        modelPreference: ['requested-model']
      } as IntelligenceInvokeOptions)
    )
    expect(seenPayloads[0].tools).toBeUndefined()
    expect(seenPayloads[0].messages[0]?.role).toBe('system')
    expect(seenPayloads[0].messages[0]?.content).toContain('"type":"tool"')
  })
})

describe.each(ACP_ONLY_CLIS)(
  'PiCliProvider fail-closed routing for ACP-only CLI $cli (scheduler-decides-executor invariant)',
  ({ cli, codePrefix, id, origin, scheduler }) => {
    beforeEach(() => {
      resolveCliConfigEndpoint.mockReset()
    })

    it.each([
      ['default-pi', { metadata: { profileId: 'default-pi' } }],
      ['unnamed run', {}],
      ['custom profile', { metadata: { profileId: `custom-${cli}-profile` } }],
      ['mismatched CLI profile', { metadata: { profileId: CODEX_CLI_PROFILE_ID } }]
    ])(
      'fails closed without spawning or calling cli-config reuse under %s',
      async (_label, rawOptions) => {
        // Even with localCliEnabled=true, a non-matching scheduler MUST fail closed immediately.
        const provider = new PiCliProvider(cliConfig(id, origin), () => true)
        await expect(
          collect(provider.chatStream(PAYLOAD, rawOptions as IntelligenceInvokeOptions))
        ).rejects.toThrow(`${codePrefix}_CONFIG_PROVIDER_UNAVAILABLE`)
        expect(resolveCliConfigEndpoint).not.toHaveBeenCalled()
      }
    )

    it('also fails closed when matched by metadata.origin under an arbitrary config id', async () => {
      const provider = new PiCliProvider(cliConfig('arbitrary-local-id', origin), () => true)
      await expect(
        collect(
          provider.chatStream(PAYLOAD, {
            metadata: { profileId: 'default-pi' }
          } as IntelligenceInvokeOptions)
        )
      ).rejects.toThrow(`${codePrefix}_CONFIG_PROVIDER_UNAVAILABLE`)
      expect(resolveCliConfigEndpoint).not.toHaveBeenCalled()
    })

    it('respects localCliEnabled=false under its matching scheduler profile', async () => {
      const provider = new PiCliProvider(cliConfig(id, origin), () => false)
      await expect(
        collect(
          provider.chatStream(PAYLOAD, {
            metadata: { profileId: scheduler }
          } as IntelligenceInvokeOptions)
        )
      ).rejects.toThrow('LOCAL_AI_CLI_FEATURE_DISABLED')
      expect(resolveCliConfigEndpoint).not.toHaveBeenCalled()
    })

    it('requires ACP runtime host rather than falling through to pi when matched and enabled', async () => {
      const provider = new PiCliProvider(cliConfig(id, origin), () => true)
      await expect(
        collect(
          provider.chatStream(PAYLOAD, {
            metadata: { profileId: scheduler }
          } as IntelligenceInvokeOptions)
        )
      ).rejects.toThrow(`${codePrefix}_ACP_RUNTIME_REQUIRED`)
      expect(resolveCliConfigEndpoint).not.toHaveBeenCalled()
    })

    it('never declares native HTTP tool reuse for ACP-only CLIs', () => {
      const provider = new PiCliProvider(cliConfig(id, origin), () => true)
      expect(provider.supportsNativeToolsFor({ metadata: { profileId: 'default-pi' } })).toBe(false)
      expect(provider.supportsNativeToolsFor({})).toBe(false)
      expect(provider.supportsNativeToolsFor({ metadata: { profileId: scheduler } })).toBe(false)
    })
  }
)

describe('PiCliProvider supportsNativeToolsFor for built-in pi-cli', () => {
  it('stays false for the pi binary config regardless of scheduler', () => {
    const provider = new PiCliProvider(cliConfig('pi-cli', 'pi-cli'), () => true)
    expect(provider.supportsNativeToolsFor({ metadata: { profileId: 'default-pi' } })).toBe(false)
    expect(provider.supportsNativeToolsFor({})).toBe(false)
  })
})
