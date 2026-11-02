import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AnthropicProvider } from './anthropic-provider'
import {
  CliConfigProvider,
  resolveCliConfigEndpoint,
  withExtraHeaders
} from './cli-config-provider'

const CODEX_TOML = [
  'model_provider = "magpie"',
  'model = "ktvsky-2/gpt-6.1-sol"',
  '',
  '[model_providers.magpie]',
  'base_url = "http://127.0.0.1:3425/v1"',
  'wire_api = "responses"',
  ''
].join('\n')

const CLAUDE_SETTINGS = JSON.stringify({
  env: { ANTHROPIC_BASE_URL: 'https://claude.example.test' }
})

const OMP_MODELS = [
  'providers:',
  '  cpa:',
  '    baseUrl: https://relay.example.test/v1',
  '    api: openai-completions',
  '    models:',
  '      - id: gemini-3.8-flash',
  '  anth:',
  '    baseUrl: https://anthropic.example.test',
  '    api: anthropic-messages',
  '    models:',
  '      - id: claude-fixture',
  ''
].join('\n')

const ENV_KEYS = ['CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'TUFF_OMP_AGENT_DIR'] as const
let root: string
const saved: Record<string, string | undefined> = {}

async function writeAt(dir: string, file: string, content: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, file), content, 'utf8')
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cli-config-'))
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  process.env.CODEX_HOME = join(root, 'codex')
  process.env.CLAUDE_CONFIG_DIR = join(root, 'claude')
  process.env.TUFF_OMP_AGENT_DIR = join(root, 'omp')
})

afterEach(async () => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  await rm(root, { recursive: true, force: true })
})

describe('resolveCliConfigEndpoint', () => {
  it('reads the Codex endpoint from config.toml and keeps the requested model', async () => {
    await writeAt(join(root, 'codex'), 'config.toml', CODEX_TOML)
    const endpoint = resolveCliConfigEndpoint('codex', 'ktvsky-2/gpt-6.1-sol')
    expect(endpoint?.providerId).toBe('codex-config')
    expect(endpoint?.modelId).toBe('ktvsky-2/gpt-6.1-sol')
    expect(endpoint?.provider).toBeInstanceOf(CliConfigProvider)
  })

  it('falls back to the configured Codex model when none is requested', async () => {
    await writeAt(join(root, 'codex'), 'config.toml', CODEX_TOML)
    expect(resolveCliConfigEndpoint('codex', undefined)?.modelId).toBe('ktvsky-2/gpt-6.1-sol')
  })

  it('reads the active Codex provider even when config.toml names no model', async () => {
    const withoutModel = CODEX_TOML.replace(/^model = .*\n/m, '')
    await writeAt(join(root, 'codex'), 'config.toml', withoutModel)
    const endpoint = resolveCliConfigEndpoint('codex', 'ktvsky-2/gpt-6.1-sol')
    expect(endpoint?.providerId).toBe('codex-config')
    expect(endpoint?.modelId).toBe('ktvsky-2/gpt-6.1-sol')
  })

  it('returns null for Codex when config.toml is missing', () => {
    expect(resolveCliConfigEndpoint('codex', 'ktvsky-2/gpt-6.1-sol')).toBeNull()
  })

  it('reads the Claude endpoint from the env block of settings.json', async () => {
    await writeAt(join(root, 'claude'), 'settings.json', CLAUDE_SETTINGS)
    const endpoint = resolveCliConfigEndpoint('claude', 'claude-fixture')
    expect(endpoint?.providerId).toBe('claude-config')
    expect(endpoint?.modelId).toBe('claude-fixture')
    expect(endpoint?.provider).toBeInstanceOf(AnthropicProvider)
  })

  it('returns null for Claude when settings.json names no base URL', async () => {
    await writeAt(join(root, 'claude'), 'settings.json', JSON.stringify({ env: {} }))
    expect(resolveCliConfigEndpoint('claude', 'claude-fixture')).toBeNull()
  })

  it('splits an OMP model at its first slash and sends the rest to the endpoint', async () => {
    await writeAt(join(root, 'omp'), 'models.yml', OMP_MODELS)
    const endpoint = resolveCliConfigEndpoint('omp', 'cpa/gemini-3.8-flash')
    expect(endpoint?.providerId).toBe('omp-config')
    expect(endpoint?.modelId).toBe('gemini-3.8-flash')
    expect(endpoint?.provider).toBeInstanceOf(CliConfigProvider)
  })

  it('reads models.yaml when models.yml is absent, as the OMP catalog does', async () => {
    await writeAt(join(root, 'omp'), 'models.yaml', OMP_MODELS)
    const endpoint = resolveCliConfigEndpoint('omp', 'cpa/gemini-3.8-flash')
    expect(endpoint?.providerId).toBe('omp-config')
    expect(endpoint?.modelId).toBe('gemini-3.8-flash')
  })

  it('uses the Anthropic client for an OMP provider that speaks anthropic-messages', async () => {
    await writeAt(join(root, 'omp'), 'models.yml', OMP_MODELS)
    const endpoint = resolveCliConfigEndpoint('omp', 'anth/claude-fixture')
    expect(endpoint?.modelId).toBe('claude-fixture')
    expect(endpoint?.provider).toBeInstanceOf(AnthropicProvider)
  })

  it('returns null for an OMP model whose provider is not configured', async () => {
    await writeAt(join(root, 'omp'), 'models.yml', OMP_MODELS)
    expect(resolveCliConfigEndpoint('omp', 'nope/some-model')).toBeNull()
    expect(resolveCliConfigEndpoint('omp', 'gemini-3.8-flash')).toBeNull()
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

  it('lets a configured Authorization replace the SDK placeholder only when asked to', async () => {
    const sent: Headers[] = []
    const base = async (_url: unknown, init?: RequestInit) => {
      sent.push(new Headers(init?.headers))
      return new Response('ok')
    }
    const placeholder = { headers: { authorization: 'Bearer placeholder' } }
    const configured = { authorization: 'fixture-configured-auth' }
    await withExtraHeaders(base as never, configured, { replaceAuthorization: true })(
      'http://127.0.0.1:3425/v1/responses',
      placeholder
    )
    await withExtraHeaders(base as never, configured)(
      'http://127.0.0.1:3425/v1/responses',
      placeholder
    )
    expect(sent[0].get('authorization')).toBe('fixture-configured-auth')
    expect(sent[1].get('authorization')).toBe('Bearer placeholder')
  })
})
