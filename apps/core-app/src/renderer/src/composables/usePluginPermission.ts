/**
 * usePluginPermission
 *
 * Composable for managing plugin permissions in the UI.
 */

import { usePermissionSdk } from '@talex-touch/utils/renderer'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

interface PermissionGrant {
  pluginId: string
  permissionId: string
  grantedAt: number
  grantedBy: 'user' | 'auto' | 'trust'
}

interface PermissionDefinition {
  id: string
  category: string
  risk: 'low' | 'medium' | 'high'
  nameKey: string
  descKey: string
  icon?: string
}

interface PluginPermissionStatus {
  pluginId: string
  sdkapi?: number
  enforcePermissions: boolean
  required: string[]
  optional: string[]
  granted: string[]
  denied: string[]
  missingRequired: string[]
  warning?: string
}

export function usePluginPermission(pluginId: string) {
  const permissionSdk = usePermissionSdk()
  const { t } = useI18n()

  const getPermissionName = (permissionId: string) => {
    const key = `plugin.permissions.registry.${permissionId}.name`
    const translated = t(key)
    return translated === key ? permissionId : translated
  }

  const getPermissionDesc = (permissionId: string) => {
    const key = `plugin.permissions.registry.${permissionId}.desc`
    const translated = t(key)
    return translated === key ? '' : translated
  }

  const permissions = ref<PermissionGrant[]>([])
  const registry = ref<PermissionDefinition[]>([])
  const status = ref<PluginPermissionStatus | null>(null)
  const loading = ref(true)

  // Fetch data
  async function refresh() {
    loading.value = true
    try {
      const [perms, reg] = await Promise.all([
        permissionSdk.getPlugin({ pluginId }),
        permissionSdk.getRegistry()
      ])
      permissions.value = perms || []
      registry.value = reg || []
    } catch (e) {
      console.error('Failed to load permissions:', e)
    } finally {
      loading.value = false
    }
  }

  // Fetch status with plugin info
  async function refreshStatus(sdkapi?: number, required: string[] = [], optional: string[] = []) {
    try {
      const result = await permissionSdk.getStatus({
        pluginId,
        sdkapi,
        required,
        optional
      })
      status.value = result
    } catch (e) {
      console.error('Failed to load permission status:', e)
    }
  }

  // Grant permission
  async function grant(permissionId: string): Promise<boolean> {
    try {
      const result = await permissionSdk.grant({
        pluginId,
        permissionId,
        grantedBy: 'user'
      })
      if (result?.success) {
        await refresh()
        return true
      }
      return false
    } catch {
      return false
    }
  }

  // Revoke permission
  async function revoke(permissionId: string): Promise<boolean> {
    try {
      const result = await permissionSdk.revoke({ pluginId, permissionId })
      if (result?.success) {
        await refresh()
        return true
      }
      return false
    } catch {
      return false
    }
  }

  // Grant multiple permissions
  async function grantMultiple(permissionIds: string[]): Promise<boolean> {
    try {
      const result = await permissionSdk.grantMultiple({
        pluginId,
        permissionIds,
        grantedBy: 'user'
      })
      if (result?.success) {
        await refresh()
        return true
      }
      return false
    } catch {
      return false
    }
  }

  // Get permission info
  function getPermissionInfo(permissionId: string) {
    const def = registry.value.find((p) => p.id === permissionId)
    return {
      id: permissionId,
      name: getPermissionName(permissionId),
      desc: getPermissionDesc(permissionId),
      category: def?.category || permissionId.split('.')[0],
      risk: def?.risk || 'medium'
    }
  }

  // Check if granted
  function isGranted(permissionId: string): boolean {
    return permissions.value.some((p) => p.permissionId === permissionId)
  }

  // Formatted permission list for UI
  const permissionList = computed(() => {
    if (!status.value) return []

    const all = [...status.value.required, ...status.value.optional]
    const unique = [...new Set(all)]

    return unique.map((id) => {
      const info = getPermissionInfo(id)
      return {
        id,
        name: info.name,
        desc: info.desc,
        category: info.category,
        risk: info.risk as 'low' | 'medium' | 'high',
        required: status.value!.required.includes(id),
        granted: status.value!.granted.includes(id),
        reason: undefined // Could be from manifest
      }
    })
  })

  // Listen for updates
  let unsubscribe: (() => void) | null = null

  function startListening() {
    unsubscribe = permissionSdk.onUpdated((data) => {
      if (data?.pluginId === pluginId) {
        refresh()
      }
    })
  }

  function stopListening() {
    unsubscribe?.()
    unsubscribe = null
  }

  // Initial load
  refresh()
  startListening()

  return {
    permissions,
    registry,
    status,
    loading,
    permissionList,
    refresh,
    refreshStatus,
    grant,
    revoke,
    grantMultiple,
    getPermissionInfo,
    isGranted,
    stopListening
  }
}

/**
 * Hook for permission request dialog
 */
export function usePermissionRequest() {
  const visible = ref(false)
  const currentRequest = ref<{
    pluginId: string
    pluginName: string
    permissionId: string
    permissionName: string
    permissionDesc: string
    riskLevel: 'low' | 'medium' | 'high'
    reason?: string
    resolve: (result: 'allow-once' | 'allow-always' | 'deny') => void
  } | null>(null)

  function request(options: {
    pluginId: string
    pluginName: string
    permissionId: string
    permissionName: string
    permissionDesc: string
    riskLevel: 'low' | 'medium' | 'high'
    reason?: string
  }): Promise<'allow-once' | 'allow-always' | 'deny'> {
    return new Promise((resolve) => {
      currentRequest.value = {
        ...options,
        resolve
      }
      visible.value = true
    })
  }

  function handleAllowOnce() {
    currentRequest.value?.resolve('allow-once')
    visible.value = false
    currentRequest.value = null
  }

  function handleAllowAlways() {
    currentRequest.value?.resolve('allow-always')
    visible.value = false
    currentRequest.value = null
  }

  function handleDeny() {
    currentRequest.value?.resolve('deny')
    visible.value = false
    currentRequest.value = null
  }

  return {
    visible,
    currentRequest,
    request,
    handleAllowOnce,
    handleAllowAlways,
    handleDeny
  }
}
