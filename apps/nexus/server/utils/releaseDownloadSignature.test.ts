import type * as H3Module from 'h3'
import type { H3Event } from 'h3'
import type { Buffer } from 'node:buffer'
import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSignedReleaseDownloadPath,
  isUnsignedFallbackAllowed,
  parseReleaseDownloadQuerySignature,
  verifyReleaseDownloadSignature,
} from './releaseDownloadSignature'

const runtimeConfigMock = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
const queryMock = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))

vi.mock('#imports', () => ({ useRuntimeConfig: () => runtimeConfigMock.value }))
vi.stubGlobal('useRuntimeConfig', () => runtimeConfigMock.value)

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof H3Module>('h3')
  return { ...actual, getQuery: () => queryMock.value }
})

const AUTH_SECRET = 'an-auth-secret-value-16+'
const DEDICATED_SECRET = 'a-dedicated-download-signing-secret'
const event = {} as H3Event

function configure(releaseDownload: Record<string, unknown>) {
  runtimeConfigMock.value = { releaseDownload }
}

function signedQueryOf(path: string) {
  const url = new URL(path, 'https://nexus.test')
  return { exp: Number(url.searchParams.get('exp')), sig: String(url.searchParams.get('sig')) }
}

function forge(key: string | Buffer, tag: string, platform: string, arch: string, exp: number) {
  return createHmac('sha256', key).update(`${tag}:${platform}:${arch}:${exp}`).digest('hex')
}

describe('release download signing key', () => {
  beforeEach(() => {
    queryMock.value = {}
  })

  it('signs with a dedicated secret verbatim so operators can rotate it predictably', () => {
    configure({ secret: DEDICATED_SECRET, fallbackSecret: AUTH_SECRET })

    const path = createSignedReleaseDownloadPath(event, { tag: 'v2.5.0', platform: 'darwin', arch: 'arm64' })
    const { exp, sig } = signedQueryOf(path!)

    expect(sig).toBe(forge(DEDICATED_SECRET, 'v2.5.0', 'darwin', 'arm64', exp))
  })

  it('never signs with raw AUTH_SECRET when falling back to it', () => {
    configure({ secret: '', fallbackSecret: AUTH_SECRET })

    const path = createSignedReleaseDownloadPath(event, { tag: 'v2.5.0', platform: 'darwin', arch: 'arm64' })
    const { exp, sig } = signedQueryOf(path!)

    // The whole point: AUTH_SECRET also signs user sessions, so its bytes must not be the HMAC key.
    expect(sig).not.toBe(forge(AUTH_SECRET, 'v2.5.0', 'darwin', 'arm64', exp))
  })

  it('rejects a signature forged with raw AUTH_SECRET while accepting its own', () => {
    configure({ secret: '', fallbackSecret: AUTH_SECRET })

    const path = createSignedReleaseDownloadPath(event, { tag: 'v2.5.0', platform: 'darwin', arch: 'arm64' })
    const { exp, sig } = signedQueryOf(path!)
    const input = { tag: 'v2.5.0', platform: 'darwin', arch: 'arm64' }

    expect(verifyReleaseDownloadSignature(event, { ...input, signature: { exp, sig } })).toEqual({ valid: true })
    expect(
      verifyReleaseDownloadSignature(event, {
        ...input,
        signature: { exp, sig: forge(AUTH_SECRET, 'v2.5.0', 'darwin', 'arm64', exp) },
      }),
    ).toEqual({ valid: false, reason: 'mismatch' })
  })

  it('derives a distinct key per provenance, so configuring a dedicated secret changes the signature', () => {
    configure({ secret: '', fallbackSecret: AUTH_SECRET })
    const derived = signedQueryOf(
      createSignedReleaseDownloadPath(event, { tag: 'v2.5.0', platform: 'darwin', arch: 'arm64' })!,
    )

    configure({ secret: DEDICATED_SECRET, fallbackSecret: AUTH_SECRET })

    expect(
      verifyReleaseDownloadSignature(event, {
        tag: 'v2.5.0',
        platform: 'darwin',
        arch: 'arm64',
        signature: derived,
      }),
    ).toEqual({ valid: false, reason: 'mismatch' })
  })

  it('reports a missing secret rather than signing when neither provenance is configured', () => {
    configure({ secret: '', fallbackSecret: '' })

    expect(createSignedReleaseDownloadPath(event, { tag: 'v2.5.0', platform: 'darwin', arch: 'arm64' })).toBeNull()
    expect(
      verifyReleaseDownloadSignature(event, {
        tag: 'v2.5.0',
        platform: 'darwin',
        arch: 'arm64',
        signature: { exp: 9999999999, sig: 'a'.repeat(64) },
      }),
    ).toEqual({ valid: false, reason: 'missing-secret' })
  })

  it('rejects an expired signature before comparing it', () => {
    configure({ secret: DEDICATED_SECRET, fallbackSecret: AUTH_SECRET })
    const exp = Math.floor(Date.now() / 1000) - 1

    expect(
      verifyReleaseDownloadSignature(event, {
        tag: 'v2.5.0',
        platform: 'darwin',
        arch: 'arm64',
        signature: { exp, sig: forge(DEDICATED_SECRET, 'v2.5.0', 'darwin', 'arm64', exp) },
      }),
    ).toEqual({ valid: false, reason: 'expired' })
  })

  it('does not bind a signature to a different asset', () => {
    configure({ secret: DEDICATED_SECRET, fallbackSecret: AUTH_SECRET })
    const { exp, sig } = signedQueryOf(
      createSignedReleaseDownloadPath(event, { tag: 'v2.5.0', platform: 'darwin', arch: 'arm64' })!,
    )

    expect(
      verifyReleaseDownloadSignature(event, {
        tag: 'v2.5.0',
        platform: 'win32',
        arch: 'arm64',
        signature: { exp, sig },
      }),
    ).toEqual({ valid: false, reason: 'mismatch' })
  })

  it('rejects malformed signature queries without attempting verification', () => {
    queryMock.value = { exp: '1800000000', sig: 'not-hex' }
    expect(parseReleaseDownloadQuerySignature(event)).toBeNull()

    queryMock.value = { exp: '1800000000', sig: 'a'.repeat(64) }
    expect(parseReleaseDownloadQuerySignature(event)).toEqual({ exp: 1800000000, sig: 'a'.repeat(64) })
  })

  it('keeps the unsigned fallback available unless explicitly disabled', () => {
    // The desktop updater retries `fallbackDownloadUrl` once the 15-minute signed URL expires
    // (apps/core-app/src/main/modules/update/update-system.ts:226), so this default is load-bearing
    // for resumed downloads.
    configure({ secret: DEDICATED_SECRET })
    expect(isUnsignedFallbackAllowed(event)).toBe(true)

    configure({ secret: DEDICATED_SECRET, allowUnsignedFallback: false })
    expect(isUnsignedFallbackAllowed(event)).toBe(false)
  })
})
