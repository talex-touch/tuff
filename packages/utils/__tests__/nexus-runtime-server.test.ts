import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  migrateTuffNexusRuntimeServer,
  NEXUS_BASE_URL,
  NEXUS_LOCAL_BASE_URL,
  normalizeTuffNexusRuntimeServer,
  resolveTuffNexusBaseUrl,
  resolveTuffNexusBaseUrlDetail,
  TUFF_NEXUS_BASE_URL_ENV,
  validateNexusBaseUrl,
  type TuffNexusBaseUrlOptions
} from '../env'

/**
 * Both processes must decide the Nexus backend the same way (#522).
 *
 * The policy — resolve `runtimeServer`, fall back to the legacy `authServer`, coerce anything
 * unrecognised to production, then drop the legacy key — was written twice, once in
 * `main/modules/nexus/runtime-base.ts` and once in the renderer's. The copies had already drifted
 * in signature and function set, and a drift in the *policy* would mean the two halves of one
 * application talking to different backends: the renderer showing account state from production
 * while main sends intelligence requests to a local server, or the reverse.
 *
 * Only the policy is shared. How each side obtains and persists `dev` is genuinely different — main
 * reads the config file and writes it back when it changed, the renderer mutates a reactive object
 * — and stays where it is.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')

describe('normalizeTuffNexusRuntimeServer', () => {
  it('accepts only an explicit local', () => {
    expect(normalizeTuffNexusRuntimeServer('local')).toBe('local')
  })

  it('coerces everything else to production', () => {
    // Settings come off disk, so the input is whatever an earlier version or a hand edit left.
    for (const value of ['production', 'LOCAL', 'staging', '', null, undefined, 0, {}, []]) {
      expect(normalizeTuffNexusRuntimeServer(value)).toBe('production')
    }
  })
})

describe('migrateTuffNexusRuntimeServer', () => {
  it('promotes the legacy authServer when runtimeServer is absent', () => {
    const dev: Record<string, unknown> = { authServer: 'local' }

    expect(migrateTuffNexusRuntimeServer(dev)).toBe('local')
    expect(dev.runtimeServer).toBe('local')
    expect('authServer' in dev).toBe(false)
  })

  it('prefers runtimeServer when both are present', () => {
    const dev: Record<string, unknown> = { runtimeServer: 'production', authServer: 'local' }

    expect(migrateTuffNexusRuntimeServer(dev)).toBe('production')
    expect('authServer' in dev).toBe(false)
  })

  it('defaults an empty dev block to production', () => {
    const dev: Record<string, unknown> = {}

    expect(migrateTuffNexusRuntimeServer(dev)).toBe('production')
    expect(dev.runtimeServer).toBe('production')
  })

  it('normalises a value that is already stored', () => {
    // The stored value is not trusted either — it was written by whichever version ran last.
    const dev: Record<string, unknown> = { runtimeServer: 'staging' }

    expect(migrateTuffNexusRuntimeServer(dev)).toBe('production')
  })

  it('writes the migration back in place, which is what completes it', () => {
    // Main persists `dev` only when it changed, so the mutation is the migration; a pure function
    // returning a value would leave authServer on disk forever.
    const dev: Record<string, unknown> = { authServer: 'local', autoCloseDev: true }
    migrateTuffNexusRuntimeServer(dev)

    expect(dev).toEqual({ runtimeServer: 'local', autoCloseDev: true })
  })
})

/**
 * Which origin a signed request is sent to.
 *
 * Three inputs compete for it — the build/CI override, the address the user saved, and the runtime
 * server mode — and the winner is reported so the settings page can explain a saved address that
 * is not in effect. Precedence is `env > custom > runtime-server`, and a saved address only counts
 * while it still validates: a hand-edited config or a rule tightened by a later version must not
 * steer authenticated traffic at an origin the settings page itself rejects.
 */
describe('validateNexusBaseUrl', () => {
  it('accepts an https address and trims the trailing slash it was typed with', () => {
    expect(validateNexusBaseUrl('https://custom.example.test/')).toEqual({
      ok: true,
      value: 'https://custom.example.test'
    })
  })

  it('rejects an address that carries a path', () => {
    // Requests are composed as `new URL('/api/…', base)`, which drops the base path and would send
    // the request to the origin root — a different deployment than the one that was configured.
    for (const input of [
      'https://custom.example.test/nexus',
      'https://custom.example.test/nexus/',
      'http://localhost:3200/nexus'
    ]) {
      expect(validateNexusBaseUrl(input), input).toEqual({ ok: false, error: 'unsupported-path' })
    }
  })

  it('accepts a bare origin written with a trailing slash', () => {
    for (const [input, value] of [
      ['https://custom.example.test', 'https://custom.example.test'],
      ['https://custom.example.test/', 'https://custom.example.test'],
      ['https://custom.example.test///', 'https://custom.example.test'],
      ['http://localhost:3200/', 'http://localhost:3200']
    ]) {
      expect(validateNexusBaseUrl(input), input).toEqual({ ok: true, value })
    }
  })

  it('rejects an address carrying embedded credentials', () => {
    // The credential would be persisted in settings, and in the synced settings document, in
    // cleartext; this client authenticates with a bearer token instead.
    for (const input of [
      'https://user:secret@custom.example.test',
      'https://token@custom.example.test',
      'http://user:secret@localhost:3200'
    ]) {
      expect(validateNexusBaseUrl(input), input).toEqual({
        ok: false,
        error: 'embedded-credentials'
      })
    }
  })

  it('accepts cleartext http on a loopback host', () => {
    // A local Nexus is the development backend; it has no certificate and never carries a token
    // off the machine.
    for (const host of ['localhost:3200', '127.0.0.1:3200', '[::1]:3200']) {
      expect(validateNexusBaseUrl(`http://${host}`)).toEqual({
        ok: true,
        value: `http://${host}`
      })
    }
  })

  it('rejects cleartext http on any other host', () => {
    // Requests to this origin carry the account bearer token, so cleartext to a remote host is a
    // credential handed to the network, not a style preference.
    for (const input of [
      'http://custom.example.test',
      'http://custom.example.test:3200',
      'http://192.168.1.10:3200',
      'http://custom.example.test/nexus'
    ]) {
      expect(validateNexusBaseUrl(input), input).toEqual({
        ok: false,
        error: 'insecure-transport'
      })
    }
  })

  it('rejects schemes that are not http(s)', () => {
    for (const input of [
      'ftp://custom.example.test',
      'file:///etc/hosts',
      'ws://custom.example.test',
      'tuff://custom.example.test'
    ]) {
      expect(validateNexusBaseUrl(input), input).toEqual({
        ok: false,
        error: 'unsupported-protocol'
      })
    }
  })

  it('rejects an address carrying a query or a fragment', () => {
    // Neither can be composed into the request paths built from this base: `/api/…?tenant=1` is a
    // different route, and silently dropping the suffix would target the wrong deployment.
    for (const input of [
      'https://custom.example.test?tenant=1',
      'https://custom.example.test#frag',
      'https://custom.example.test/nexus?tenant=1'
    ]) {
      expect(validateNexusBaseUrl(input), input).toEqual({ ok: false, error: 'invalid-url' })
    }
  })

  it('distinguishes empty input from input that is not a URL', () => {
    for (const input of ['', '   ', null, undefined, 42, {}]) {
      expect(validateNexusBaseUrl(input), String(input)).toEqual({ ok: false, error: 'empty' })
    }
    expect(validateNexusBaseUrl('custom.example.test')).toEqual({
      ok: false,
      error: 'invalid-url'
    })
  })
})

describe('resolveTuffNexusBaseUrlDetail', () => {
  it('reports the build-time override as the env source, outranking a saved address', () => {
    expect(
      resolveTuffNexusBaseUrlDetail({
        customBaseUrl: 'https://custom.example.test',
        env: { [TUFF_NEXUS_BASE_URL_ENV]: 'https://runtime.example.test/' }
      })
    ).toEqual({ baseUrl: 'https://runtime.example.test', source: 'env' })
  })

  it('reports a valid saved address as the custom source', () => {
    expect(
      resolveTuffNexusBaseUrlDetail({ customBaseUrl: 'https://custom.example.test/' })
    ).toEqual({ baseUrl: 'https://custom.example.test', source: 'custom' })
  })

  it('falls back to the runtime server when the saved address is absent or unusable', () => {
    for (const customBaseUrl of [
      undefined,
      null,
      '',
      '   ',
      'custom.example.test',
      'http://custom.example.test',
      'ftp://custom.example.test',
      'https://custom.example.test?tenant=1'
    ]) {
      expect(resolveTuffNexusBaseUrlDetail({ customBaseUrl, env: {} }), String(customBaseUrl))
        .toEqual({ baseUrl: NEXUS_BASE_URL, source: 'runtime-server' })
    }
  })

  it('falls back to the local runtime server when that is the selected backend', () => {
    expect(
      resolveTuffNexusBaseUrlDetail({
        runtimeServer: 'local',
        customBaseUrl: 'http://custom.example.test',
        env: {}
      })
    ).toEqual({ baseUrl: NEXUS_LOCAL_BASE_URL, source: 'runtime-server' })
  })

  it('ignores a declared but blank env override', () => {
    expect(
      resolveTuffNexusBaseUrlDetail({
        customBaseUrl: 'https://custom.example.test',
        env: { [TUFF_NEXUS_BASE_URL_ENV]: '   ' }
      })
    ).toEqual({ baseUrl: 'https://custom.example.test', source: 'custom' })
  })

  it('ignores an env override that would send the account token in cleartext', () => {
    // The override may name a host the settings page would never accept, but it reaches the same
    // request composition, so a remote cleartext origin is refused rather than trusted.
    expect(
      resolveTuffNexusBaseUrlDetail({
        customBaseUrl: 'https://custom.example.test',
        env: { [TUFF_NEXUS_BASE_URL_ENV]: 'http://runtime.example.test' }
      })
    ).toEqual({ baseUrl: 'https://custom.example.test', source: 'custom' })

    expect(
      resolveTuffNexusBaseUrlDetail({ env: { [TUFF_NEXUS_BASE_URL_ENV]: 'http://10.0.0.7:3200' } })
    ).toEqual({ baseUrl: NEXUS_BASE_URL, source: 'runtime-server' })
  })

  it('keeps the cleartext env override a local test server needs', () => {
    expect(
      resolveTuffNexusBaseUrlDetail({ env: { [TUFF_NEXUS_BASE_URL_ENV]: 'http://127.0.0.1:3200' } })
    ).toEqual({ baseUrl: 'http://127.0.0.1:3200', source: 'env' })
  })

  it('agrees with resolveTuffNexusBaseUrl on the address it picked', () => {
    const cases: TuffNexusBaseUrlOptions[] = [
      { env: {} },
      { runtimeServer: 'local', env: {} },
      { customBaseUrl: 'https://custom.example.test/', env: {} },
      { customBaseUrl: 'http://custom.example.test', env: {} },
      {
        customBaseUrl: 'https://custom.example.test',
        env: { [TUFF_NEXUS_BASE_URL_ENV]: 'https://runtime.example.test' }
      }
    ]

    for (const options of cases) {
      expect(resolveTuffNexusBaseUrl(options)).toBe(resolveTuffNexusBaseUrlDetail(options).baseUrl)
    }
  })
})

describe('neither process keeps its own copy', () => {
  const sources = ['apps/core-app/src/main/modules/nexus/runtime-base.ts',
    'apps/core-app/src/renderer/src/modules/nexus/runtime-base.ts']
    .map((file) => ({ file, source: readFileSync(path.join(REPO_ROOT, file), 'utf8') }))

  it('reads both files', () => {
    // Positive control: the absence checks below are satisfied by an unreadable path.
    expect(sources).toHaveLength(2)
    for (const { source } of sources) expect(source).toContain('getRuntimeNexusBaseUrl')
  })

  it('calls the shared migration instead of restating it', () => {
    for (const { file, source } of sources) {
      expect(source, file).toContain('migrateTuffNexusRuntimeServer(dev)')
      expect(source, file).not.toContain("value === 'local' ? 'local' : 'production'")
      expect(source, file).not.toContain('dev.authServer')
    }
  })
})
