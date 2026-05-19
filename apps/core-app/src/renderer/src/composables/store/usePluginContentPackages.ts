import type {
  PluginContentInstallResponse as CloudShareInstallResponse,
  PluginContentListResponse,
  PluginContentPackage
} from '@talex-touch/utils/types/cloud-share'
import type { PluginContentInstallResponse as LocalPluginContentInstallResponse } from '@talex-touch/utils/transport/events/types'
import type { ComputedRef, Ref } from 'vue'
import { TOUCH_SNIPPETS_PLUGIN_ID } from '@talex-touch/utils/cloud-share'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createPluginSdk } from '@talex-touch/utils/transport/sdk/domains/plugin'
import { computed, ref, unref, watch } from 'vue'
import { getAuthBaseUrl } from '~/modules/auth/auth-env'
import { storeHttpRequest } from '~/modules/store/store-http-client'

type MaybeReactivePluginId =
  | string
  | null
  | undefined
  | Ref<string | null | undefined>
  | ComputedRef<string | null | undefined>

export interface PluginContentInstallOutcome extends LocalPluginContentInstallResponse {
  package?: PluginContentPackage
}

function normalizeBaseUrl(): string {
  return getAuthBaseUrl().replace(/\/$/, '')
}

function getErrorCode(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  if (error && typeof error === 'object' && 'error' in error) {
    const value = (error as { error?: unknown }).error
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
  }

  return fallback
}

function assertStoreResponse(status: number, fallback: string): void {
  if (status < 200 || status >= 300) {
    throw new Error(fallback)
  }
}

export function usePluginContentPackages(pluginId: MaybeReactivePluginId) {
  const pluginSdk = createPluginSdk(useTuffTransport())
  const packages = ref<PluginContentPackage[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const installingPackageId = ref<string | null>(null)
  const installError = ref<string | null>(null)

  const activePluginId = computed(() => {
    const value = unref(pluginId)
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
  })

  async function load(): Promise<void> {
    const currentPluginId = activePluginId.value
    if (!currentPluginId) {
      packages.value = []
      error.value = null
      return
    }

    loading.value = true
    error.value = null

    try {
      const response = await storeHttpRequest<PluginContentListResponse>({
        url: `${normalizeBaseUrl()}/api/store/plugin-content`,
        method: 'GET',
        params: {
          pluginId: currentPluginId,
          limit: 20
        },
        headers: {
          Accept: 'application/json'
        }
      })
      assertStoreResponse(response.status, 'LIST_REQUEST_FAILED')
      packages.value = response.data.packages ?? []
    } catch (loadError) {
      error.value = getErrorCode(loadError, 'LIST_REQUEST_FAILED')
      packages.value = []
    } finally {
      loading.value = false
    }
  }

  async function syncInstallCount(packageId: string): Promise<PluginContentPackage | null> {
    try {
      const response = await storeHttpRequest<CloudShareInstallResponse>({
        url: `${normalizeBaseUrl()}/api/store/plugin-content/${encodeURIComponent(packageId)}/install`,
        method: 'POST',
        headers: {
          Accept: 'application/json'
        }
      })
      assertStoreResponse(response.status, 'INSTALL_COUNT_SYNC_FAILED')
      return response.data.package ?? null
    } catch {
      throw new Error('INSTALL_COUNT_SYNC_FAILED')
    }
  }

  async function installPackage(
    contentPackage: PluginContentPackage
  ): Promise<PluginContentInstallOutcome> {
    if (installingPackageId.value) {
      return { success: false, error: 'INSTALL_IN_PROGRESS' }
    }

    installingPackageId.value = contentPackage.id
    installError.value = null

    try {
      const result = await pluginSdk.installContent({
        packageId: contentPackage.id,
        targetPluginName: TOUCH_SNIPPETS_PLUGIN_ID,
        contentPackage
      })

      if (!result.success) {
        installError.value = result.error ?? 'PLUGIN_CONTENT_INSTALL_FAILED'
        return result
      }

      const syncedPackage = await syncInstallCount(contentPackage.id)
      await load()

      return {
        ...result,
        package: syncedPackage ?? contentPackage
      }
    } catch (installFailure) {
      const code = getErrorCode(installFailure, 'PLUGIN_CONTENT_INSTALL_FAILED')
      installError.value = code
      return { success: false, error: code }
    } finally {
      installingPackageId.value = null
    }
  }

  watch(
    activePluginId,
    () => {
      void load()
    },
    { immediate: true }
  )

  return {
    packages,
    loading,
    error,
    installingPackageId,
    installError,
    load,
    installPackage
  }
}
