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
  CLAUDE_CLI_ORIGIN,
  CLAUDE_CLI_PROFILE_ID,
  CLAUDE_CLI_PROVIDER_ID,
  CODEX_CLI_ORIGIN,
  CODEX_CLI_PROFILE_ID,
  CODEX_CLI_PROVIDER_ID,
  OMP_CLI_ORIGIN,
  OMP_CLI_PROFILE_ID,
  OMP_CLI_PROVIDER_ID
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
})
