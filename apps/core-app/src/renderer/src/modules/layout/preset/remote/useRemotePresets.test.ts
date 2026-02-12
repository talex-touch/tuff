import { beforeEach, describe, expect, it, vi } from 'vitest'

type NexusResponse<T> = {
  status: number
  data: T
}

interface MockState {
  requestNexusWithAuth: ReturnType<typeof vi.fn>
  applyPreset: ReturnType<typeof vi.fn>
  rollbackLastRemotePreset: ReturnType<typeof vi.fn>
  compareVersions: ReturnType<typeof vi.fn>
  validatePresetData: ReturnType<typeof vi.fn>
}

async function loadTarget() {
  vi.resetModules()

  const state: MockState = {
    requestNexusWithAuth: vi.fn(),
    applyPreset: vi.fn(),
    rollbackLastRemotePreset: vi.fn(),
    compareVersions: vi.fn(() => 0),
    validatePresetData: vi.fn(() => ({ valid: true, errors: [], warnings: [] }))
  }

  vi.doMock('~/modules/auth/auth-env', () => ({
    getAuthBaseUrl: () => 'https://nexus.example'
  }))

  vi.doMock('~/modules/market/market-http-client', () => ({
    marketHttpRequest: vi.fn()
  }))

  vi.doMock('~/modules/market/nexus-auth-client', () => ({
    requestNexusWithAuth: state.requestNexusWithAuth
  }))

  vi.doMock('~/composables/market/useVersionCompare', () => ({
    compareVersions: state.compareVersions
  }))

  vi.doMock('~/utils/build-info', () => ({
    getBuildInfo: () => ({ version: '1.0.0' })
  }))

  vi.doMock('../usePresetExport', () => ({
    usePresetExport: () => ({
      applyPreset: state.applyPreset,
      rollbackLastRemotePreset: state.rollbackLastRemotePreset
    })
  }))

  vi.doMock('element-plus', () => ({
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn()
    }
  }))

  vi.doMock('@talex-touch/utils', () => ({
    validatePresetData: state.validatePresetData
  }))

  const target = await import('./useRemotePresets')
  return {
    ...state,
    useRemotePresets: target.useRemotePresets
  }
}

const basePreset = {
  version: 2,
  exportedAt: '2026-02-11T00:00:00.000Z',
  meta: {
    id: 'preset_1',
    name: 'Remote Beta',
    channel: 'beta' as const
  }
}

function okResponse<T>(data: T): NexusResponse<T> {
  return {
    status: 200,
    data
  }
}

describe('useRemotePresets', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('listRemotePresets 在 401 时抛出错误', async () => {
    const { useRemotePresets, requestNexusWithAuth } = await loadTarget()

    requestNexusWithAuth.mockResolvedValue({
      status: 401,
      data: null
    })

    const api = useRemotePresets()

    await expect(api.listRemotePresets('beta')).rejects.toThrow('Request failed: 401')
    expect(api.items.value).toEqual([])
  })

  it('applyRemotePreset 在版本不兼容时会回滚', async () => {
    const {
      useRemotePresets,
      requestNexusWithAuth,
      compareVersions,
      rollbackLastRemotePreset,
      applyPreset
    } = await loadTarget()

    compareVersions.mockImplementation((current: string, target: string) => {
      if (current === '1.0.0' && target === '2.0.0') {
        return -1
      }
      return 0
    })

    requestNexusWithAuth.mockResolvedValue(
      okResponse({
        preset: {
          ...basePreset,
          meta: {
            ...basePreset.meta,
            compat: {
              minAppVersion: '2.0.0'
            }
          }
        },
        sha256: 'ignored'
      })
    )

    const api = useRemotePresets()

    await expect(api.applyRemotePreset('preset_1')).rejects.toThrow('Preset requires app >= 2.0.0')
    expect(rollbackLastRemotePreset).toHaveBeenCalledTimes(1)
    expect(applyPreset).not.toHaveBeenCalled()
  })

  it('applyRemotePreset 在 hash 不匹配时会回滚', async () => {
    const { useRemotePresets, requestNexusWithAuth, rollbackLastRemotePreset, applyPreset } =
      await loadTarget()

    requestNexusWithAuth.mockResolvedValue(
      okResponse({
        preset: basePreset,
        sha256: 'deadbeef'
      })
    )

    const api = useRemotePresets()

    await expect(api.applyRemotePreset('preset_1')).rejects.toThrow('Preset hash mismatch')
    expect(rollbackLastRemotePreset).toHaveBeenCalledTimes(1)
    expect(applyPreset).not.toHaveBeenCalled()
  })
})
