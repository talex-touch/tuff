import type { PresetExportData } from '@talex-touch/utils'
import { validatePresetData } from '@talex-touch/utils'
import { ElMessage } from 'element-plus'
import { computed, ref } from 'vue'
import { compareVersions } from '~/composables/market/useVersionCompare'
import { getAuthBaseUrl } from '~/modules/auth/auth-env'
import { marketHttpRequest } from '~/modules/market/market-http-client'
import { requestNexusWithAuth } from '~/modules/market/nexus-auth-client'
import { getBuildInfo } from '~/utils/build-info'
import { usePresetExport } from '../usePresetExport'

export interface RemotePresetSummary {
  id: string
  slug: string
  name: string
  description?: string
  channel: 'stable' | 'beta'
  preview?: string
  source: 'nexus'
  compat?: {
    minAppVersion?: string
    maxAppVersion?: string
  }
  downloads: number
  updatedAt: string
}

interface RemotePresetDetailResponse {
  preset: PresetExportData
  sha256: string
  etag?: string
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  )

  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
    .join(',')}}`
}

async function sha256Hex(value: string): Promise<string> {
  if (!crypto?.subtle?.digest) {
    throw new Error('WebCrypto subtle.digest is unavailable')
  }

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function ensurePresetCompat(preset: PresetExportData): void {
  const compat = preset.meta.compat
  if (!compat) {
    return
  }

  const appVersion = getBuildInfo().version
  if (compat.minAppVersion && compareVersions(appVersion, compat.minAppVersion) === -1) {
    throw new Error(`Preset requires app >= ${compat.minAppVersion}`)
  }

  if (compat.maxAppVersion && compareVersions(appVersion, compat.maxAppVersion) === 1) {
    throw new Error(`Preset requires app <= ${compat.maxAppVersion}`)
  }
}

export function useRemotePresets() {
  const baseUrl = getAuthBaseUrl().replace(/\/$/, '')
  const isFetching = ref(false)
  const isApplying = ref(false)
  const items = ref<RemotePresetSummary[]>([])
  const { applyPreset, rollbackLastRemotePreset } = usePresetExport()

  const hasRemotePresets = computed(() => items.value.length > 0)

  async function requestWithAuth<T>(path: string): Promise<T | null> {
    const response = await requestNexusWithAuth(
      marketHttpRequest<T>,
      {
        url: `${baseUrl}${path}`,
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      },
      `preset:${path}`
    )

    if (!response) {
      return null
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Request failed: ${response.status}`)
    }

    return response.data
  }

  async function listRemotePresets(channel: 'stable' | 'beta' | 'all' = 'beta') {
    isFetching.value = true
    try {
      const query = channel === 'all' ? '' : `?channel=${channel}`
      const payload = await requestWithAuth<{ items: RemotePresetSummary[] }>(
        `/api/v1/presets${query}`
      )
      if (!payload) {
        items.value = []
        return []
      }

      items.value = payload.items || []
      return items.value
    } finally {
      isFetching.value = false
    }
  }

  async function getRemotePreset(id: string) {
    return requestWithAuth<{ item: RemotePresetSummary }>(
      `/api/v1/presets/${encodeURIComponent(id)}`
    )
  }

  async function downloadRemotePreset(id: string): Promise<RemotePresetDetailResponse> {
    const payload = await requestWithAuth<RemotePresetDetailResponse>(
      `/api/v1/presets/${encodeURIComponent(id)}/download`
    )

    if (!payload) {
      throw new Error('Not authenticated')
    }

    return payload
  }

  async function applyRemotePreset(id: string): Promise<void> {
    isApplying.value = true
    try {
      const payload = await downloadRemotePreset(id)
      const preset = payload.preset

      const validation = validatePresetData(preset)
      if (!validation.valid) {
        throw new Error(validation.errors.join('; '))
      }

      ensurePresetCompat(preset)

      const hashSource = stableSerialize(preset)
      const localSha = await sha256Hex(hashSource)
      if (payload.sha256 && payload.sha256 !== localSha) {
        throw new Error('Preset hash mismatch')
      }

      applyPreset({
        ...preset,
        meta: {
          ...preset.meta,
          source: 'nexus',
          channel: preset.meta.channel ?? 'beta'
        }
      })

      ElMessage.success('Nexus preset applied')
    } catch (error) {
      console.error('[RemotePreset] apply failed:', error)
      rollbackLastRemotePreset()
      throw error
    } finally {
      isApplying.value = false
    }
  }

  return {
    items,
    hasRemotePresets,
    isFetching,
    isApplying,
    listRemotePresets,
    getRemotePreset,
    downloadRemotePreset,
    applyRemotePreset,
    rollbackLastRemotePreset
  }
}
