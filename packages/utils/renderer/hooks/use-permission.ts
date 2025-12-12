/**
 * usePermission - Permission management hooks for renderer process
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import type {
  PermissionGrant,
  PluginPermissionStatus,
  PermissionDefinition,
} from '../../permission/types'

/**
 * Send channel message to main process
 */
async function sendChannel<T>(event: string, data?: unknown): Promise<T> {
  // @ts-expect-error - $channel is injected at runtime
  return window.$channel?.send(event, data)
}

/**
 * Register channel listener
 */
function onChannel(event: string, callback: (data: unknown) => void): () => void {
  // @ts-expect-error - $channel is injected at runtime
  return window.$channel?.regChannel(event, callback) || (() => {})
}

/**
 * Hook for managing plugin permissions
 */
export function usePermission(pluginId: string) {
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
      const result = await sendChannel<PermissionGrant[]>('permission:get-plugin', { pluginId })
      permissions.value = result || []
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  /**
   * Grant a permission
   */
  async function grant(permissionId: string): Promise<boolean> {
    try {
      const result = await sendChannel<{ success: boolean }>('permission:grant', {
        pluginId,
        permissionId,
        grantedBy: 'user',
      })
      if (result?.success) {
        await refresh()
      }
      return result?.success || false
    } catch {
      return false
    }
  }

  /**
   * Revoke a permission
   */
  async function revoke(permissionId: string): Promise<boolean> {
    try {
      const result = await sendChannel<{ success: boolean }>('permission:revoke', {
        pluginId,
        permissionId,
      })
      if (result?.success) {
        await refresh()
      }
      return result?.success || false
    } catch {
      return false
    }
  }

  /**
   * Grant multiple permissions
   */
  async function grantMultiple(permissionIds: string[]): Promise<boolean> {
    try {
      const result = await sendChannel<{ success: boolean }>('permission:grant-multiple', {
        pluginId,
        permissionIds,
        grantedBy: 'user',
      })
      if (result?.success) {
        await refresh()
      }
      return result?.success || false
    } catch {
      return false
    }
  }

  /**
   * Revoke all permissions
   */
  async function revokeAll(): Promise<boolean> {
    try {
      const result = await sendChannel<{ success: boolean }>('permission:revoke-all', {
        pluginId,
      })
      if (result?.success) {
        await refresh()
      }
      return result?.success || false
    } catch {
      return false
    }
  }

  /**
   * Check if a permission is granted
   */
  function isGranted(permissionId: string): boolean {
    return permissions.value.some((p) => p.permissionId === permissionId)
  }

  /**
   * Get granted permission IDs
   */
  const grantedIds = computed(() => permissions.value.map((p) => p.permissionId))

  // Listen for permission updates
  let unsubscribe: (() => void) | null = null

  onMounted(() => {
    refresh()
    unsubscribe = onChannel('permission:updated', (data: unknown) => {
      const { pluginId: updatedPluginId } = data as { pluginId: string }
      if (updatedPluginId === pluginId) {
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
export function usePermissionStatus(
  pluginId: string,
  sdkapi: number | undefined,
  declared: { required: string[]; optional: string[] }
) {
  const status = ref<PluginPermissionStatus | null>(null)
  const loading = ref(true)

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      const result = await sendChannel<PluginPermissionStatus>('permission:get-status', {
        pluginId,
        sdkapi,
        required: declared.required,
        optional: declared.optional,
      })
      status.value = result
    } catch {
      status.value = null
    } finally {
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
export function usePermissionRegistry() {
  const registry = ref<PermissionDefinition[]>([])
  const loading = ref(true)

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      const result = await sendChannel<PermissionDefinition[]>('permission:get-registry')
      registry.value = result || []
    } catch {
      registry.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * Get permission by ID
   */
  function getPermission(id: string): PermissionDefinition | undefined {
    return registry.value.find((p) => p.id === id)
  }

  /**
   * Get permissions by category
   */
  function byCategory(category: string): PermissionDefinition[] {
    return registry.value.filter((p) => p.category === category)
  }

  /**
   * Get permissions by risk level
   */
  function byRisk(risk: string): PermissionDefinition[] {
    return registry.value.filter((p) => p.risk === risk)
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
export function useAllPluginPermissions() {
  const permissions = ref<Record<string, PermissionGrant[]>>({})
  const loading = ref(true)

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      const result = await sendChannel<Record<string, PermissionGrant[]>>('permission:get-all')
      permissions.value = result || {}
    } catch {
      permissions.value = {}
    } finally {
      loading.value = false
    }
  }

  // Listen for permission updates
  let unsubscribe: (() => void) | null = null

  onMounted(() => {
    refresh()
    unsubscribe = onChannel('permission:updated', () => {
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
