import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getVoiceProvider, resetVoiceProviderRegistryForTests } from './voice-provider-runtime'

const VOICE_PROVIDER_ENV_NAMES = [
  'TUFF_VOICE_ASR_PROVIDER',
  'TUFF_VOICE_DOUBAO_API_KEY',
  'TUFF_VOICE_DOUBAO_APP_KEY',
  'TUFF_VOICE_DOUBAO_ACCESS_KEY',
  'TUFF_VOICE_DOUBAO_RESOURCE_ID',
  'TUFF_VOICE_DOUBAO_ASR_WS_URL',
  'TUFF_VOICE_DOUBAO_UPLOAD_VARIANT',
  'TUFF_VOICE_BAILIAN_API_KEY',
  'TUFF_VOICE_BAILIAN_WORKSPACE_ID',
  'TUFF_VOICE_BAILIAN_MODEL'
] as const

function configureDoubao(): void {
  vi.stubEnv('TUFF_VOICE_DOUBAO_API_KEY', 'test-doubao-api-key')
}

function configureBailian(): void {
  vi.stubEnv('TUFF_VOICE_BAILIAN_API_KEY', 'test-bailian-api-key')
  vi.stubEnv('TUFF_VOICE_BAILIAN_WORKSPACE_ID', 'test-bailian-workspace')
}

describe('voice provider runtime', () => {
  beforeEach(() => {
    for (const name of VOICE_PROVIDER_ENV_NAMES) vi.stubEnv(name, '')
    resetVoiceProviderRegistryForTests()
  })

  afterEach(() => {
    resetVoiceProviderRegistryForTests()
    vi.unstubAllEnvs()
  })

  it('prefers Bailian Paraformer for streaming when Bailian and Doubao are configured', () => {
    configureDoubao()
    configureBailian()

    expect(getVoiceProvider('stream')?.id).toBe('bailian-paraformer')
  })

  it('uses Doubao for streaming when it is the only configured provider', () => {
    configureDoubao()

    expect(getVoiceProvider('stream')?.id).toBe('doubao')
  })

  it('honors an explicit Doubao provider selection', () => {
    configureDoubao()
    configureBailian()
    vi.stubEnv('TUFF_VOICE_ASR_PROVIDER', 'doubao')

    expect(getVoiceProvider('stream')?.id).toBe('doubao')
  })

  it('rejects an explicitly selected provider that is not configured', () => {
    configureDoubao()
    vi.stubEnv('TUFF_VOICE_ASR_PROVIDER', 'bailian-paraformer')

    expect(() => getVoiceProvider('stream')).toThrow(
      'Voice provider is not configured: bailian-paraformer'
    )
  })
})
