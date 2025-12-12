<script setup lang="ts" name="PluginPermissions">
/**
 * Plugin Permissions Tab
 *
 * Shows and manages permissions for a single plugin.
 */

import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import { ref, computed, onMounted, watch } from 'vue'
import { ElButton, ElTag, ElEmpty, ElIcon, ElAlert } from 'element-plus'
import { Check, Warning, Refresh, InfoFilled } from '@element-plus/icons-vue'
import { PermissionList } from '~/components/permission'
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
  'window.capture': { name: '屏幕截图', desc: '捕获屏幕内容' },
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
      granted: status.value!.granted.includes(id),
    }
  })
})

function getRisk(permissionId: string): 'low' | 'medium' | 'high' {
  const highRisk = ['fs.write', 'fs.execute', 'system.shell', 'ai.agents', 'window.capture']
  const mediumRisk = ['fs.read', 'clipboard.read', 'network.internet', 'network.download', 'system.tray', 'ai.advanced', 'storage.shared']
  if (highRisk.includes(permissionId)) return 'high'
  if (mediumRisk.includes(permissionId)) return 'medium'
  return 'low'
}

// Load permission status
async function loadStatus() {
  loading.value = true
  try {
    const result = await touchChannel.send('permission:get-status', {
      pluginId: props.plugin.name,
      sdkapi: props.plugin.sdkapi,
      required: props.plugin.declaredPermissions?.required || [],
      optional: props.plugin.declaredPermissions?.optional || [],
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
        grantedBy: 'user',
      })
    } else {
      await touchChannel.send('permission:revoke', {
        pluginId: props.plugin.name,
        permissionId,
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
      grantedBy: 'user',
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
      pluginId: props.plugin.name,
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
  <div class="plugin-permissions">
    <!-- Loading -->
    <div v-if="loading" class="loading-state">
      <i class="i-ri-loader-4-line animate-spin text-2xl" />
      <span>加载权限信息...</span>
    </div>

    <!-- No Permissions -->
    <ElEmpty
      v-else-if="!hasPermissions"
      description="此插件未声明任何权限"
      :image-size="80"
    />

    <!-- Permission Content -->
    <template v-else>
      <!-- Status Header -->
      <div class="status-header">
        <div class="status-info">
          <ElIcon v-if="status?.missingRequired.length === 0" class="status-icon success"><Check /></ElIcon>
          <ElIcon v-else class="status-icon danger"><Warning /></ElIcon>
          <span class="status-text">
            {{ status?.missingRequired.length === 0 ? '所有权限已授予' : `缺少 ${status?.missingRequired.length} 个必需权限` }}
          </span>
        </div>

        <div class="status-stats">
          <ElTag type="danger" effect="light" size="small">
            必需: {{ status?.required.length || 0 }}
          </ElTag>
          <ElTag type="info" effect="light" size="small">
            可选: {{ status?.optional.length || 0 }}
          </ElTag>
          <ElTag type="success" effect="light" size="small">
            已授予: {{ status?.granted.length || 0 }}
          </ElTag>
        </div>

        <div class="status-actions">
          <ElButton :icon="Refresh" size="small" @click="loadStatus">刷新</ElButton>
        </div>
      </div>

      <!-- SDK Warning -->
      <ElAlert
        v-if="status?.warning && !status?.enforcePermissions"
        type="warning"
        :closable="false"
        class="sdk-warning"
      >
        <template #title>
          <div class="warning-title">
            <ElIcon><InfoFilled /></ElIcon>
            <span>旧版 SDK</span>
          </div>
        </template>
        此插件使用旧版 SDK，权限校验已跳过。建议插件开发者升级到 sdkapi >= 251212。
      </ElAlert>

      <!-- Missing Required Alert -->
      <ElAlert
        v-if="status?.missingRequired.length"
        type="error"
        :closable="false"
        class="missing-alert"
      >
        <template #title>
          <div class="flex items-center gap-2">
            <ElIcon><Warning /></ElIcon>
            <span>缺少必需权限</span>
          </div>
        </template>
        <div class="missing-content">
          <div class="missing-list">
            <ElTag
              v-for="perm in status.missingRequired"
              :key="perm"
              type="danger"
              effect="plain"
              size="small"
            >
              {{ permissionTranslations[perm]?.name || perm }}
            </ElTag>
          </div>
          <ElButton type="primary" size="small" @click="handleGrantAll">
            授予全部
          </ElButton>
        </div>
      </ElAlert>

      <!-- Actions -->
      <div class="permission-actions">
        <ElButton
          v-if="status?.granted.length"
          type="danger"
          plain
          size="small"
          @click="handleRevokeAll"
        >
          撤销全部权限
        </ElButton>
      </div>

      <!-- Permission List -->
      <PermissionList
        :permissions="permissionList"
        :readonly="!status?.enforcePermissions"
        :show-empty="false"
        @toggle="handleToggle"
      />
    </template>
  </div>
</template>

<style scoped lang="scss">
.plugin-permissions {
  padding: 16px;
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

.status-header {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.status-info {
  display: flex;
  align-items: center;
  gap: 8px;

  .status-icon {
    &.success {
      color: var(--el-color-success);
    }
    &.danger {
      color: var(--el-color-danger);
    }
  }

  .status-text {
    font-weight: 500;
  }
}

.status-stats {
  display: flex;
  gap: 8px;
}

.status-actions {
  margin-left: auto;
}

.sdk-warning,
.missing-alert {
  margin-bottom: 16px;

  .warning-title {
    display: flex;
    align-items: center;
    gap: 6px;
  }
}

.missing-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
}

.missing-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.permission-actions {
  margin-bottom: 16px;
}
</style>
