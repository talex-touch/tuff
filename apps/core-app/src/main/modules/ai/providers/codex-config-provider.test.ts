import { describe, expect, it } from 'vitest'
import {
  buildCodexConfigProviderConfig,
  CODEX_CONFIG_PROVIDER_ID,
  withExtraHeaders
} from './codex-config-provider'

const CONFIG_TOML = [
  'model_provider = "magpie"',
  'model = "ktvsky-2/gpt-6.1-sol"',
  '',
  '[model_providers.magpie]',
  'base_url = "http://127.0.0.1:3425/v1"',
  'wire_api = "responses"',
  '',
  '[model_providers.magpie.http_headers]',
  'x-openai-actor-authorization = "fixture-actor-token"',
  ''
].join('\n')

describe('buildCodexConfigProviderConfig', () => {
  it('describes the active Codex provider as a Responses endpoint with its headers', () => {
    expect(buildCodexConfigProviderConfig(CONFIG_TOML)).toMatchObject({
      id: CODEX_CONFIG_PROVIDER_ID,
      baseUrl: 'http://127.0.0.1:3425/v1',
      defaultModel: 'ktvsky-2/gpt-6.1-sol',
      models: [{ id: 'ktvsky-2/gpt-6.1-sol' }],
      metadata: {
        transport: 'responses',
        headers: { 'x-openai-actor-authorization': 'fixture-actor-token' }
      }
    })
  })

  it('returns null when the config names no active provider', () => {
    expect(
      buildCodexConfigProviderConfig(CONFIG_TOML.replace('model_provider = "magpie"\n', ''))
    ).toBeNull()
  })

  it('returns null for content that is not a config', () => {
    expect(buildCodexConfigProviderConfig('')).toBeNull()
  })
})

describe('withExtraHeaders', () => {
  it('adds the configured headers and keeps headers the request already set', async () => {
    const sent: Headers[] = []
    const base = async (_url: unknown, init?: RequestInit) => {
      sent.push(new Headers(init?.headers))
      return new Response('ok')
    }
    const extra = {
      'x-openai-actor-authorization': 'fixture-actor-token',
      'x-request-id': 'injected-header'
    }
    const send = withExtraHeaders(base as never, extra)
    await send('http://127.0.0.1:3425/v1/responses', {
      headers: { 'x-request-id': 'from-request' }
    })
    expect(sent[0].get('x-openai-actor-authorization')).toBe('fixture-actor-token')
    expect(sent[0].get('x-request-id')).toBe('from-request')
  })
})
