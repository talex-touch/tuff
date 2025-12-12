/**
 * usePluginPermission
 *
 * Composable for managing plugin permissions in the UI.
 */

import { ref, computed } from 'vue'
import { useChannel } from '@talex-touch/utils/renderer'

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

// Permission name/desc translations (inline for simplicity)
const permissionTranslations: Record<string, { name: string; desc: string }> = {
  'fs.read': { name: '读取文件', desc: '读取用户文件系统中的文件' },
  'fs.write': { name: '写入文件', desc: '创建、修改或删除用户文件' },
  'fs.execute': { name: '执行文件', desc: '运行可执行文件或脚本' },
  'clipboard.read': { name: '读取剪贴板', desc: '访问剪贴板中的内容' },
  'clipboard.write': { name: '写入剪贴板', desc: '将内容复制到剪贴板' },
  'network.local': { name: '本地网络', desc: '访问本地网络资源' },
  'network.internet': { name: '互联网访问', desc: '发送和接收互联网请求' },
  'network.download': { name: '下载文件', desc: '从互联网下载文件到本地' },
  'system.shell': { name: '执行命令', desc: '运行系统命令或脚本' },
  'system.notification': { name: '系统通知', desc: '发送系统通知' },
  'system.tray': { name: '托盘交互', desc: '访问系统托盘功能' },
  'ai.basic': { name: '基础 AI', desc: '使用基础 AI 能力' },
  'ai.advanced': { name: '高级 AI', desc: '使用高级 AI 模型' },
  'ai.agents': { name: '智能体', desc: '调用智能体系统' },
  'storage.plugin': { name: '插件存储', desc: '使用插件私有存储空间' },
  'storage.shared': { name: '共享存储', desc: '访问跨插件共享存储' },
  'window.create': { name: '创建窗口', desc: '创建新窗口或视图' },
  'window.capture': { name: '屏幕截图', desc: '捕获屏幕内容' },
}

export function usePluginPermission(pluginId: string) {
  const { send, regChannel } = useChannel()

  const permissions = ref<PermissionGrant[]>([])
  const registry = ref<PermissionDefinition[]>([])
  const status = ref<PluginPermissionStatus | null>(null)
  const loading = ref(true)

  // Fetch data
  async function refresh() {
    loading.value = true
    try {
      const [perms, reg] = await Promise.all([
        send('permission:get-plugin', { pluginId }),
        send('permission:get-registry'),
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
      const result = await send('permission:get-status', {
        pluginId,
        sdkapi,
        required,
        optional,
      })
      status.value = result
    } catch (e) {
      console.error('Failed to load permission status:', e)
    }
  }

  // Grant permission
  async function grant(permissionId: string): Promise<boolean> {
    try {
      const result = await send('permission:grant', {
        pluginId,
        permissionId,
        grantedBy: 'user',
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
      const result = await send('permission:revoke', { pluginId, permissionId })
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
      const result = await send('permission:grant-multiple', {
        pluginId,
        permissionIds,
        grantedBy: 'user',
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
    const trans = permissionTranslations[permissionId]
    return {
      id: permissionId,
      name: trans?.name || permissionId,
      desc: trans?.desc || '',
      category: def?.category || permissionId.split('.')[0],
      risk: def?.risk || 'medium',
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
        reason: undefined, // Could be from manifest
      }
    })
  })

  // Listen for updates
  let unsubscribe: (() => void) | null = null

  function startListening() {
    if (!regChannel) return
    unsubscribe = regChannel('permission:updated', (data: any) => {
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
    stopListening,
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
        resolve,
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
    handleDeny,
  }
}
