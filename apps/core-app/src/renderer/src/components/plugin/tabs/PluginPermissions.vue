<script setup lang="ts" name="PluginPermissions">
/**
 * Plugin Permissions Tab
 *
 * Shows and manages permissions for a single plugin.
 */

import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import { ElEmpty, ElTag } from 'element-plus'
import { computed, onMounted, ref, watch } from 'vue'
import FlatButton from '~/components/base/button/FlatButton.vue'
import TuffBlockLine from '~/components/tuff/TuffBlockLine.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { touchChannel } from '~/modules/channel/channel-core'

interface Props {
  plugin: ITouchPlugin
}

const props = defineProps<Props>()

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

// State
const loading = ref(true)
const status = ref<PluginPermissionStatus | null>(null)

// Permission translations
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
  'window.capture': { name: '屏幕截图', desc: '捕获屏幕内容' }
}

// Computed
const hasPermissions = computed(() => {
  if (!status.value) return false
  return status.value.required.length > 0 || status.value.optional.length > 0
})

const permissionList = computed(() => {
  if (!status.value) return []

  const all = [...status.value.required, ...status.value.optional]
  const unique = [...new Set(all)]

  return unique.map((id) => {
    const trans = permissionTranslations[id]
    const category = id.split('.')[0]
    const risk = getRisk(id)

    return {
      id,
      name: trans?.name || id,
      desc: trans?.desc || '',
      category,
      risk,
      required: status.value!.required.includes(id),
      granted: status.value!.granted.includes(id)
    }
  })
})

// Category definitions
const categoryInfo: Record<string, { name: string; icon: string }> = {
  fs: { name: '文件系统', icon: 'i-carbon-folder' },
  clipboard: { name: '剪贴板', icon: 'i-carbon-copy' },
  network: { name: '网络', icon: 'i-carbon-network-3' },
  system: { name: '系统', icon: 'i-carbon-terminal' },
  ai: { name: 'AI 能力', icon: 'i-carbon-bot' },
  storage: { name: '存储', icon: 'i-carbon-data-base' },
  window: { name: '窗口', icon: 'i-carbon-application' }
}

// Group permissions by category
const permissionCategories = computed(() => {
  const list = permissionList.value
  const groups: Record<string, typeof list> = {}

  for (const perm of list) {
    if (!groups[perm.category]) {
      groups[perm.category] = []
    }
    groups[perm.category].push(perm)
  }

  return Object.entries(groups).map(([id, permissions]) => ({
    id,
    name: categoryInfo[id]?.name || id,
    icon: categoryInfo[id]?.icon || 'i-carbon-folder',
    permissions
  }))
})

function getRisk(permissionId: string): 'low' | 'medium' | 'high' {
  const highRisk = ['fs.write', 'fs.execute', 'system.shell', 'ai.agents', 'window.capture']
  const mediumRisk = [
    'fs.read',
    'clipboard.read',
    'network.internet',
    'network.download',
    'system.tray',
    'ai.advanced',
    'storage.shared'
  ]
  if (highRisk.includes(permissionId)) return 'high'
  if (mediumRisk.includes(permissionId)) return 'medium'
  return 'low'
}

function getPermissionIcon(permissionId: string): string {
  const icons: Record<string, string> = {
    'fs.read': 'i-carbon-document',
    'fs.write': 'i-carbon-edit',
    'fs.execute': 'i-carbon-play',
    'clipboard.read': 'i-carbon-copy',
    'clipboard.write': 'i-carbon-paste',
    'network.local': 'i-carbon-wifi',
    'network.internet': 'i-carbon-globe',
    'network.download': 'i-carbon-download',
    'system.shell': 'i-carbon-terminal',
    'system.notification': 'i-carbon-notification',
    'system.tray': 'i-carbon-overflow-menu-vertical',
    'ai.basic': 'i-carbon-bot',
    'ai.advanced': 'i-carbon-machine-learning',
    'ai.agents': 'i-carbon-user-multiple',
    'storage.plugin': 'i-carbon-data-base',
    'storage.shared': 'i-carbon-share',
    'window.create': 'i-carbon-application',
    'window.capture': 'i-carbon-screen'
  }
  return icons[permissionId] || 'i-carbon-checkmark'
}

function getRiskTagType(
  risk: 'low' | 'medium' | 'high'
): 'success' | 'warning' | 'danger' | 'info' {
  switch (risk) {
    case 'low':
      return 'success'
    case 'medium':
      return 'warning'
    case 'high':
      return 'danger'
    default:
      return 'info'
  }
}

function getRiskLabel(risk: 'low' | 'medium' | 'high'): string {
  switch (risk) {
    case 'low':
      return '低'
    case 'medium':
      return '中'
    case 'high':
      return '高'
    default:
      return risk
  }
}

// Load permission status
async function loadStatus() {
  loading.value = true
  try {
    // Create plain copies of arrays to avoid structured clone issues
    const required = [...(props.plugin.declaredPermissions?.required || [])]
    const optional = [...(props.plugin.declaredPermissions?.optional || [])]

    const result = await touchChannel.send('permission:get-status', {
      pluginId: props.plugin.name,
      sdkapi: props.plugin.sdkapi,
      required,
      optional
    })
    status.value = result
  } catch (e) {
    console.error('Failed to load permission status:', e)
  } finally {
    loading.value = false
  }
}

// Toggle permission
async function handleToggle(permissionId: string, granted: boolean) {
  try {
    if (granted) {
      await touchChannel.send('permission:grant', {
        pluginId: props.plugin.name,
        permissionId,
        grantedBy: 'user'
      })
    } else {
      await touchChannel.send('permission:revoke', {
        pluginId: props.plugin.name,
        permissionId
      })
    }
    await loadStatus()
  } catch (e) {
    console.error('Failed to toggle permission:', e)
  }
}

// Grant all required
async function handleGrantAll() {
  if (!status.value?.missingRequired.length) return
  try {
    await touchChannel.send('permission:grant-multiple', {
      pluginId: props.plugin.name,
      permissionIds: status.value.missingRequired,
      grantedBy: 'user'
    })
    await loadStatus()
  } catch (e) {
    console.error('Failed to grant all permissions:', e)
  }
}

// Revoke all
async function handleRevokeAll() {
  try {
    await touchChannel.send('permission:revoke-all', {
      pluginId: props.plugin.name
    })
    await loadStatus()
  } catch (e) {
    console.error('Failed to revoke all permissions:', e)
  }
}

// Watch plugin changes
watch(() => props.plugin.name, loadStatus)

onMounted(loadStatus)
</script>

<template>
  <div class="PluginPermissions w-full space-y-4">
    <!-- Loading -->
    <div v-if="loading" class="loading-state">
      <i class="i-ri-loader-4-line animate-spin text-2xl" />
      <span>加载权限信息...</span>
    </div>

    <!-- No Permissions -->
    <ElEmpty v-else-if="!hasPermissions" description="此插件未声明任何权限" :image-size="80" />

    <!-- Permission Content -->
    <template v-else>
      <!-- Status Overview -->
      <TuffGroupBlock
        name="权限状态"
        :description="
          status?.missingRequired.length === 0
            ? '所有必需权限已授予'
            : `缺少 ${status?.missingRequired.length} 个必需权限`
        "
        :default-icon="
          status?.missingRequired.length === 0
            ? 'i-carbon-checkmark-filled'
            : 'i-carbon-warning-filled'
        "
        :active-icon="
          status?.missingRequired.length === 0
            ? 'i-carbon-checkmark-filled'
            : 'i-carbon-warning-filled'
        "
        memory-name="plugin-permissions-status"
      >
        <TuffBlockLine title="必需权限">
          <template #description>
            <ElTag type="danger" effect="light" size="small">
              {{ status?.required.length || 0 }}
            </ElTag>
          </template>
        </TuffBlockLine>
        <TuffBlockLine title="可选权限">
          <template #description>
            <ElTag type="info" effect="light" size="small">
              {{ status?.optional.length || 0 }}
            </ElTag>
          </template>
        </TuffBlockLine>
        <TuffBlockLine title="已授予">
          <template #description>
            <ElTag type="success" effect="light" size="small">
              {{ status?.granted.length || 0 }}
            </ElTag>
          </template>
        </TuffBlockLine>

        <!-- Actions -->
        <TuffBlockSlot
          title="权限操作"
          description="刷新或批量管理权限"
          default-icon="i-carbon-settings"
          active-icon="i-carbon-settings"
        >
          <div class="flex items-center gap-2">
            <FlatButton @click="loadStatus">
              <i class="i-ri-refresh-line" />
              <span>刷新</span>
            </FlatButton>
            <FlatButton v-if="status?.missingRequired.length" @click="handleGrantAll">
              <i class="i-ri-check-double-line" />
              <span>授予全部</span>
            </FlatButton>
            <FlatButton v-if="status?.granted.length" class="danger" @click="handleRevokeAll">
              <i class="i-ri-close-line" />
              <span>撤销全部</span>
            </FlatButton>
          </div>
        </TuffBlockSlot>
      </TuffGroupBlock>

      <!-- SDK Warning -->
      <TuffGroupBlock
        v-if="status?.warning && !status?.enforcePermissions"
        name="SDK 版本警告"
        description="此插件使用旧版 SDK，权限校验已跳过"
        default-icon="i-carbon-warning"
        active-icon="i-carbon-warning"
        memory-name="plugin-permissions-sdk-warning"
      >
        <TuffBlockLine title="建议">
          <template #description>
            <span class="text-[var(--el-color-warning)]"
              >升级到 sdkapi >= 251212 以启用权限校验</span
            >
          </template>
        </TuffBlockLine>
      </TuffGroupBlock>

      <!-- Permission List by Category -->
      <TuffGroupBlock
        v-for="category in permissionCategories"
        :key="category.id"
        :name="category.name"
        :description="`${category.permissions.length} 个权限`"
        :default-icon="category.icon"
        :active-icon="category.icon"
        :memory-name="`plugin-permissions-${category.id}`"
      >
        <TuffBlockSwitch
          v-for="perm in category.permissions"
          :key="perm.id"
          :model-value="perm.granted"
          :title="perm.name"
          :description="perm.desc"
          :default-icon="getPermissionIcon(perm.id)"
          :active-icon="getPermissionIcon(perm.id)"
          @change="(val) => handleToggle(perm.id, val)"
        >
          <template #tags>
            <ElTag v-if="perm.required" type="danger" effect="light" size="small"> 必需 </ElTag>
            <ElTag :type="getRiskTagType(perm.risk)" effect="light" size="small">
              {{ getRiskLabel(perm.risk) }}
            </ElTag>
          </template>
        </TuffBlockSwitch>
      </TuffGroupBlock>
    </template>
  </div>
</template>

<style scoped lang="scss">
.PluginPermissions {
  height: 100%;
  overflow-y: auto;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 200px;
  color: var(--el-text-color-secondary);
}

.danger {
  color: var(--el-color-danger) !important;
}
</style>
