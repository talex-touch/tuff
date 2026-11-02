import type {
  IntelligenceChatPayload,
  IntelligenceInvokeOptions,
  IntelligenceProviderConfig,
  IntelligenceStreamChunk
} from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IntelligenceProvider } from '../runtime/base-provider'

const resolveCodexConfigProvider = vi.hoisted(() => vi.fn<() => IntelligenceProvider | null>())

vi.mock('./codex-config-provider', () => ({ resolveCodexConfigProvider }))

import { PiCliProvider } from './pi-cli-provider'
import { CODEX_CLI_ORIGIN, CODEX_CLI_PROFILE_ID, CODEX_CLI_PROVIDER_ID } from './pi-cli-runtime'

const CODEX_CONFIG: IntelligenceProviderConfig = {
  id: CODEX_CLI_PROVIDER_ID,
  type: IntelligenceProviderType.LOCAL,
  name: 'Codex (local CLI)',
  enabled: true,
  priority: 10,
  models: [],
  timeout: 120000,
  capabilities: ['text.chat'],
  metadata: { internal: true, isLocalCli: true, origin: CODEX_CLI_ORIGIN }
}

const PAYLOAD = {
  messages: [{ role: 'user', content: 'hi' }]
} as unknown as IntelligenceChatPayload

function directProvider(chunks: IntelligenceStreamChunk[]): IntelligenceProvider {
  return {
    chatStream: async function* () {
      yield* chunks
    }
  } as unknown as IntelligenceProvider
}

async function collect(
  stream: AsyncGenerator<IntelligenceStreamChunk>
): Promise<IntelligenceStreamChunk[]> {
  const out: IntelligenceStreamChunk[] = []
  for await (const chunk of stream) out.push(chunk)
  return out
}

describe('PiCliProvider Codex model routing', () => {
  beforeEach(() => {
    resolveCodexConfigProvider.mockReset()
  })

  it('calls a Codex model through the configured endpoint for a non-Codex scheduler', async () => {
    const chunks = [{ delta: 'hello' }] as IntelligenceStreamChunk[]
    resolveCodexConfigProvider.mockReturnValue(directProvider(chunks))
    const provider = new PiCliProvider(CODEX_CONFIG, () => false)
    const options = { metadata: { profileId: 'default-pi' } } as IntelligenceInvokeOptions
    await expect(collect(provider.chatStream(PAYLOAD, options))).resolves.toEqual(chunks)
  })

  it('keeps the Codex scheduler on the Codex binary', async () => {
    const provider = new PiCliProvider(CODEX_CONFIG, () => false)
    const options = { metadata: { profileId: CODEX_CLI_PROFILE_ID } } as IntelligenceInvokeOptions
    await expect(collect(provider.chatStream(PAYLOAD, options))).rejects.toThrow(
      'LOCAL_AI_CLI_FEATURE_DISABLED'
    )
    expect(resolveCodexConfigProvider).not.toHaveBeenCalled()
  })

  it('leaves runs without a scheduler on the Codex binary', async () => {
    const provider = new PiCliProvider(CODEX_CONFIG, () => false)
    await expect(
      collect(provider.chatStream(PAYLOAD, {} as IntelligenceInvokeOptions))
    ).rejects.toThrow('LOCAL_AI_CLI_FEATURE_DISABLED')
    expect(resolveCodexConfigProvider).not.toHaveBeenCalled()
  })

  it('fails clearly when the Codex config names no usable endpoint', async () => {
    resolveCodexConfigProvider.mockReturnValue(null)
    const provider = new PiCliProvider(CODEX_CONFIG, () => false)
    const options = { metadata: { profileId: 'default-pi' } } as IntelligenceInvokeOptions
    await expect(collect(provider.chatStream(PAYLOAD, options))).rejects.toThrow(
      'CODEX_CONFIG_PROVIDER_UNAVAILABLE'
    )
  })
})
