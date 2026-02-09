import { beforeEach, describe, expect, it, vi } from 'vitest'

const createSecurityState = () => ({
  machineSeed: '',
  machineCodeHash: '',
  machineCodeAttestedAt: '',
  machineSeedMigratedAt: '',
  allowLegacyMachineSeedFallback: false
})

type AppSettingMock = {
  security: ReturnType<typeof createSecurityState>
  dev: {
    authServer: 'production' | 'local'
  }
}

type AuthEnvMock = {
  getAppDeviceId: ReturnType<typeof vi.fn<() => string | null>>
  getAuthBaseUrl: ReturnType<typeof vi.fn<() => string>>
  isLocalAuthMode: ReturnType<typeof vi.fn<() => boolean>>
}

async function loadTarget() {
  vi.resetModules()

  const appSettingMock: AppSettingMock = {
    security: createSecurityState(),
    dev: {
      authServer: 'production'
    }
  }

  const authEnvMock: AuthEnvMock = {
    getAppDeviceId: vi.fn(() => 'device-1'),
    getAuthBaseUrl: vi.fn(() => 'https://nexus.example'),
    isLocalAuthMode: vi.fn(() => false)
  }

  vi.doMock('~/modules/channel/storage', () => ({
    appSetting: appSettingMock
  }))

  vi.doMock('./auth-env', () => authEnvMock)

  const target = await import('./device-attest')
  return {
    attestCurrentDevice: target.attestCurrentDevice,
    appSettingMock,
    authEnvMock
  }
}

const osPayload = {
  platform: 'darwin',
  arch: 'arm64',
  cpus: [{ model: 'Apple M4' }],
  networkInterfaces: {
    en0: [{ mac: 'aa:bb:cc:dd:ee:ff', internal: false }]
  }
}

function jsonOkResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'content-type': 'application/json'
    }
  })
}

describe('device-attest', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('migrates legacy seed to secure store and skips duplicate attest', async () => {
    const { attestCurrentDevice, appSettingMock } = await loadTarget()
    appSettingMock.security.machineSeed = 'legacy-seed'

    const fetchMock = vi.fn(async () => jsonOkResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const deps = {
      getOS: vi.fn(async () => osPayload),
      getSecureValue: vi.fn(async () => 'secure-seed'),
      setSecureValue: vi.fn(async () => {})
    }

    await attestCurrentDevice('token-1', deps)

    expect(deps.setSecureValue).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(appSettingMock.security.machineSeed).toBe('')
    expect(appSettingMock.security.machineSeedMigratedAt).toBeTruthy()
    expect(appSettingMock.security.machineCodeHash).toHaveLength(64)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit]
    expect(String(url)).toBe('https://nexus.example/api/v1/devices/attest')
    const headers = new Headers(init.headers)
    expect(headers.get('authorization')).toBe('Bearer token-1')
    expect(headers.get('x-device-id')).toBe('device-1')

    const body = JSON.parse(String(init.body)) as { machine_code_hash: string }
    expect(body.machine_code_hash).toBe(appSettingMock.security.machineCodeHash)

    fetchMock.mockClear()
    await attestCurrentDevice('token-1', deps)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws when secure store is unavailable and fallback is disabled', async () => {
    const { attestCurrentDevice, appSettingMock } = await loadTarget()
    appSettingMock.security.machineSeed = 'legacy-seed'
    appSettingMock.security.allowLegacyMachineSeedFallback = false

    const fetchMock = vi.fn(async () => jsonOkResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const deps = {
      getOS: vi.fn(async () => osPayload),
      getSecureValue: vi.fn(async () => {
        throw new Error('safeStorage unavailable')
      }),
      setSecureValue: vi.fn(async () => {})
    }

    await expect(attestCurrentDevice('token-2', deps)).rejects.toThrow(
      'Secure machine seed unavailable'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses legacy seed when dev fallback is enabled', async () => {
    const { attestCurrentDevice, appSettingMock } = await loadTarget()
    appSettingMock.security.machineSeed = 'legacy-seed'
    appSettingMock.security.allowLegacyMachineSeedFallback = true

    const fetchMock = vi.fn(async () => jsonOkResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const deps = {
      getOS: vi.fn(async () => osPayload),
      getSecureValue: vi.fn(async () => {
        throw new Error('safeStorage unavailable')
      }),
      setSecureValue: vi.fn(async () => {})
    }

    await attestCurrentDevice('token-3', deps)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(appSettingMock.security.machineSeed).toBe('legacy-seed')
    expect(appSettingMock.security.machineCodeHash).toHaveLength(64)
  })

  it('skips attest in local auth mode', async () => {
    const { attestCurrentDevice, authEnvMock } = await loadTarget()
    authEnvMock.isLocalAuthMode.mockReturnValue(true)

    const fetchMock = vi.fn(async () => jsonOkResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const deps = {
      getOS: vi.fn(async () => osPayload),
      getSecureValue: vi.fn(async () => 'seed'),
      setSecureValue: vi.fn(async () => {})
    }

    await attestCurrentDevice('token-4', deps)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(deps.getSecureValue).not.toHaveBeenCalled()
  })
})
