/**
 * usePermission - Permission management hooks for renderer process
 */

import type {
  PermissionDefinition,
  PermissionGrant,
  PluginPermissionStatus,
} from '../../permission/types'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { usePermissionSdk } from './use-permission-sdk'

/**
 * Hook for managing plugin permissions
 */
/**
 * @deprecated 请优先使用 usePermissionSdk()，该 hook 仅保留兼容壳。
 */

export function usePermission(pluginId: string) {
  const permissionSdk = usePermissionSdk()
  const permissions = ref<PermissionGrant[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)

  /**
   * Refresh permissions from main process
   */
  async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const result = await permissionSdk.getPlugin({ pluginId })
      permissions.value = result || []
    }
    catch (e) {
      error.value = (e as Error).message
    }
    finally {
      loading.value = false
    }
  }

  /**
   * Grant a permission
   */
  async function grant(permissionId: string): Promise<boolean> {
    try {
      const result = await permissionSdk.grant({
        pluginId,
        permissionId,
        grantedBy: 'user',
      })
      if (result?.success) {
        await refresh()
      }
      return result?.success || false
    }
    catch {
      return false
    }
  }

  /**
   * Revoke a permission
   */
  async function revoke(permissionId: string): Promise<boolean> {
    try {
      const result = await permissionSdk.revoke({
        pluginId,
        permissionId,
      })
      if (result?.success) {
        await refresh()
      }
      return result?.success || false
    }
    catch {
      return false
    }
  }

  /**
   * Grant multiple permissions
   */
  async function grantMultiple(permissionIds: string[]): Promise<boolean> {
    try {
      const result = await permissionSdk.grantMultiple({
        pluginId,
        permissionIds,
        grantedBy: 'user',
      })
      if (result?.success) {
        await refresh()
      }
      return result?.success || false
    }
    catch {
      return false
    }
  }

  /**
   * Revoke all permissions
   */
  async function revokeAll(): Promise<boolean> {
    try {
      const result = await permissionSdk.revokeAll({
        pluginId,
      })
      if (result?.success) {
        await refresh()
      }
      return result?.success || false
    }
    catch {
      return false
    }
  }

  /**
   * Check if a permission is granted
   */
  function isGranted(permissionId: string): boolean {
    return permissions.value.some(p => p.permissionId === permissionId)
  }

  /**
   * Get granted permission IDs
   */
  const grantedIds = computed(() => permissions.value.map(p => p.permissionId))

  // Listen for permission updates
  let unsubscribe: (() => void) | null = null

  onMounted(() => {
    refresh()
    unsubscribe = permissionSdk.onUpdated((payload) => {
      if (payload?.pluginId === pluginId) {
        refresh()
      }
    })
  })

  onUnmounted(() => {
    unsubscribe?.()
  })

  return {
    permissions,
    loading,
    error,
    refresh,
    grant,
    revoke,
    grantMultiple,
    revokeAll,
    isGranted,
    grantedIds,
  }
}

/**
 * Hook for getting plugin permission status
 */
/**
 * @deprecated 请优先使用 usePermissionSdk().getStatus()，该 hook 仅保留兼容壳。
 */

export function usePermissionStatus(
  pluginId: string,
  sdkapi: number | undefined,
  declared: { required: string[], optional: string[] },
) {
  const permissionSdk = usePermissionSdk()
  const status = ref<PluginPermissionStatus | null>(null)
  const loading = ref(true)

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      const result = await permissionSdk.getStatus({
        pluginId,
        sdkapi,
        required: declared.required,
        optional: declared.optional,
      })
      status.value = result
    }
    catch {
      status.value = null
    }
    finally {
      loading.value = false
    }
  }

  // Computed helpers
  const enforcePermissions = computed(() => status.value?.enforcePermissions ?? false)
  const missingRequired = computed(() => status.value?.missingRequired ?? [])
  const hasWarning = computed(() => !!status.value?.warning)
  const warning = computed(() => status.value?.warning)

  onMounted(() => {
    refresh()
  })

  return {
    status,
    loading,
    refresh,
    enforcePermissions,
    missingRequired,
    hasWarning,
    warning,
  }
}

/**
 * Hook for getting permission registry (all available permissions)
 */
/**
 * @deprecated 请优先使用 usePermissionSdk().getRegistry()，该 hook 仅保留兼容壳。
 */

export function usePermissionRegistry() {
  const permissionSdk = usePermissionSdk()
  const registry = ref<PermissionDefinition[]>([])
  const loading = ref(true)

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      const result = await permissionSdk.getRegistry()
      registry.value = result || []
    }
    catch {
      registry.value = []
    }
    finally {
      loading.value = false
    }
  }

  /**
   * Get permission by ID
   */
  function getPermission(id: string): PermissionDefinition | undefined {
    return registry.value.find(p => p.id === id)
  }

  /**
   * Get permissions by category
   */
  function byCategory(category: string): PermissionDefinition[] {
    return registry.value.filter(p => p.category === category)
  }

  /**
   * Get permissions by risk level
   */
  function byRisk(risk: string): PermissionDefinition[] {
    return registry.value.filter(p => p.risk === risk)
  }

  onMounted(() => {
    refresh()
  })

  return {
    registry,
    loading,
    refresh,
    getPermission,
    byCategory,
    byRisk,
  }
}

/**
 * Hook for getting all plugin permissions
 */
/**
 * @deprecated 请优先使用 usePermissionSdk().getAll()，该 hook 仅保留兼容壳。
 */

export function useAllPluginPermissions() {
  const permissionSdk = usePermissionSdk()
  const permissions = ref<Record<string, PermissionGrant[]>>({})
  const loading = ref(true)

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      const result = await permissionSdk.getAll()
      permissions.value = result || {}
    }
    catch {
      permissions.value = {}
    }
    finally {
      loading.value = false
    }
  }

  // Listen for permission updates
  let unsubscribe: (() => void) | null = null

  onMounted(() => {
    refresh()
    unsubscribe = permissionSdk.onUpdated(() => {
      refresh()
    })
  })

  onUnmounted(() => {
    unsubscribe?.()
  })

  return {
    permissions,
    loading,
    refresh,
  }
}
