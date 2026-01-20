<!--
  SettingPermission Component

  Plugin Permission Center settings page
  Allows users to view and manage plugin permissions
-->
<script setup lang="ts" name="SettingPermission">
import type { PermissionAuditLog } from '@talex-touch/utils'
import { Check, Clock, Delete, InfoFilled, Refresh, Search, Warning } from '@element-plus/icons-vue'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { PermissionEvents, PluginEvents } from '@talex-touch/utils/transport/events'
import {
  ElButton,
  ElCollapse,
  ElCollapseItem,
  ElEmpty,
  ElIcon,
  ElInput,
  ElOption,
  ElSelect,
  ElTag
} from 'element-plus'
import { computed, onMounted, ref, watch } from 'vue'

import { PermissionList } from '~/components/permission'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'

const transport = useTuffTransport()

interface PermissionGrant {
  pluginId: string
  permissionId: string
  grantedAt: number
  grantedBy: 'user' | 'auto' | 'trust'
}

interface PluginPermissionInfo {
  id: string
  name: string
  sdkapi?: number
  enforcePermissions: boolean
  required: string[]
  optional: string[]
  granted: string[]
  missingRequired: string[]
  warning?: string
}

// State
const loading = ref(true)
const searchQuery = ref('')
const filterStatus = ref<'all' | 'granted' | 'missing'>('all')
const plugins = ref<PluginPermissionInfo[]>([])
const allPermissions = ref<Record<string, PermissionGrant[]>>({})
const expandedPlugins = ref<string[]>([])

// Audit log state
const showAuditLogs = ref(false)
const auditLogs = ref<PermissionAuditLog[]>([])
const auditLogsTotal = ref(0)
const auditLogsLoading = ref(false)
const auditLogFilter = ref<'all' | PermissionAuditLog['action']>('all')

// Permission info translations
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

// Filtered plugins
const filteredPlugins = computed(() => {
  let result = plugins.value

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(
      (p) => p.name.toLowerCase().includes(query) || p.id.toLowerCase().includes(query)
    )
  }

  // Status filter
  if (filterStatus.value === 'granted') {
    result = result.filter((p) => p.missingRequired.length === 0)
  } else if (filterStatus.value === 'missing') {
    result = result.filter((p) => p.missingRequired.length > 0)
  }

  return result
})

// Stats
const stats = computed(() => {
  const total = plugins.value.length
  const withMissing = plugins.value.filter((p) => p.missingRequired.length > 0).length
  const legacy = plugins.value.filter((p) => !p.enforcePermissions).length
  return { total, withMissing, legacy }
})

// Load data
async function loadData() {
  loading.value = true
  try {
    // Get all plugins
    const pluginList = await transport.send(PluginEvents.api.list, {})

    // Get all permissions
    const perms = await transport.send(PermissionEvents.api.getAll)
    allPermissions.value = perms || {}

    // Build plugin permission info
    plugins.value = await Promise.all(
      pluginList.map(async (plugin: any) => {
        const status = await transport.send(PermissionEvents.api.getStatus, {
          pluginId: plugin.name,
          sdkapi: plugin.sdkapi,
          required: plugin.declaredPermissions?.required || [],
          optional: plugin.declaredPermissions?.optional || []
        })

        return {
          id: plugin.name,
          name: plugin.name,
          sdkapi: plugin.sdkapi,
          enforcePermissions: status?.enforcePermissions ?? false,
          required: status?.required || [],
          optional: status?.optional || [],
          granted: status?.granted || [],
          missingRequired: status?.missingRequired || [],
          warning: status?.warning
        }
      })
    )
  } catch (e) {
    console.error('Failed to load permission data:', e)
  } finally {
    loading.value = false
  }
}

// Get permission list for a plugin
function getPermissionList(plugin: PluginPermissionInfo) {
  const all = [...plugin.required, ...plugin.optional]
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
      required: plugin.required.includes(id),
      granted: plugin.granted.includes(id)
    }
  })
}

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

// Toggle permission
async function handleToggle(pluginId: string, permissionId: string, granted: boolean) {
  try {
    if (granted) {
      await transport.send(PermissionEvents.api.grant, {
        pluginId,
        permissionId,
        grantedBy: 'user'
      })
    } else {
      await transport.send(PermissionEvents.api.revoke, { pluginId, permissionId })
    }
    // Refresh data
    await loadData()
  } catch (e) {
    console.error('Failed to toggle permission:', e)
  }
}

// Grant all required permissions
async function handleGrantAll(plugin: PluginPermissionInfo) {
  try {
    await transport.send(PermissionEvents.api.grantMultiple, {
      pluginId: plugin.id,
      permissionIds: plugin.missingRequired,
      grantedBy: 'user'
    })
    await loadData()
  } catch (e) {
    console.error('Failed to grant all permissions:', e)
  }
}

// Revoke all permissions
async function handleRevokeAll(pluginId: string) {
  try {
    await transport.send(PermissionEvents.api.revokeAll, { pluginId })
    await loadData()
  } catch (e) {
    console.error('Failed to revoke all permissions:', e)
  }
}

// Load audit logs
async function loadAuditLogs() {
  auditLogsLoading.value = true
  try {
    const result = await transport.send(PermissionEvents.api.getAuditLogs, {
      action: auditLogFilter.value === 'all' ? undefined : auditLogFilter.value,
      limit: 100
    })
    auditLogs.value = Array.isArray(result) ? result : []
    auditLogsTotal.value = auditLogs.value.length
  } catch (e) {
    console.error('Failed to load audit logs:', e)
  } finally {
    auditLogsLoading.value = false
  }
}

// Clear audit logs
async function clearAuditLogs() {
  try {
    await transport.send(PermissionEvents.api.clearAuditLogs)
    await loadAuditLogs()
  } catch (e) {
    console.error('Failed to clear audit logs:', e)
  }
}

// Format timestamp
function formatTime(timestamp: number) {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// Get action label
function getActionLabel(action: string) {
  switch (action) {
    case 'granted':
      return '授予'
    case 'revoked':
      return '撤销'
    case 'denied':
      return '拒绝'
    case 'used':
      return '使用'
    case 'blocked':
      return '拦截'
    default:
      return action
  }
}

// Get action type for tag
function getActionType(action: string) {
  switch (action) {
    case 'granted':
      return 'success'
    case 'revoked':
      return 'warning'
    case 'denied':
      return 'danger'
    case 'blocked':
      return 'danger'
    case 'used':
      return 'info'
    default:
      return 'info'
  }
}

function getAuditDetails(log: PermissionAuditLog): string | null {
  const reason = log.context?.reason
  return typeof reason === 'string' && reason.trim() ? reason : null
}

// Toggle audit logs view
function toggleAuditLogs() {
  showAuditLogs.value = !showAuditLogs.value
  if (showAuditLogs.value && auditLogs.value.length === 0) {
    loadAuditLogs()
  }
}

// Watch filter change
watch(auditLogFilter, () => {
  if (showAuditLogs.value) {
    loadAuditLogs()
  }
})

onMounted(() => {
  loadData()
})
</script>

<template>
  <TuffGroupBlock name="权限中心" description="管理插件的权限授权">
    <TuffBlockSlot>
      <!-- Stats -->
      <div class="permission-stats">
        <div class="stat-item">
          <ElIcon><Check /></ElIcon>
          <span>{{ stats.total }} 个插件</span>
        </div>
        <div v-if="stats.withMissing > 0" class="stat-item warning">
          <ElIcon><Warning /></ElIcon>
          <span>{{ stats.withMissing }} 个缺少权限</span>
        </div>
        <div v-if="stats.legacy > 0" class="stat-item info">
          <ElIcon><InfoFilled /></ElIcon>
          <span>{{ stats.legacy }} 个旧版 SDK</span>
        </div>
      </div>

      <!-- Filters -->
      <div class="permission-filters">
        <ElInput
          v-model="searchQuery"
          placeholder="搜索插件..."
          :prefix-icon="Search"
          clearable
          class="search-input"
        />
        <ElSelect v-model="filterStatus" class="status-select">
          <ElOption value="all" label="全部插件" />
          <ElOption value="granted" label="权限完整" />
          <ElOption value="missing" label="缺少权限" />
        </ElSelect>
        <ElButton :icon="Refresh" :loading="loading" @click="loadData"> 刷新 </ElButton>
      </div>

      <!-- Plugin List -->
      <div v-if="loading" class="loading-state">加载中...</div>

      <ElEmpty v-else-if="filteredPlugins.length === 0" description="没有找到插件" />

      <ElCollapse v-else v-model="expandedPlugins" class="plugin-list">
        <ElCollapseItem v-for="plugin in filteredPlugins" :key="plugin.id" :name="plugin.id">
          <template #title>
            <div class="plugin-header">
              <div class="plugin-info">
                <ElIcon
                  v-if="plugin.missingRequired.length === 0 && plugin.enforcePermissions"
                  class="status-icon success"
                >
                  <Check />
                </ElIcon>
                <ElIcon v-else-if="plugin.missingRequired.length > 0" class="status-icon danger">
                  <Warning />
                </ElIcon>
                <ElIcon v-else class="status-icon warning">
                  <InfoFilled />
                </ElIcon>
                <span class="plugin-name">{{ plugin.name }}</span>
                <ElTag v-if="!plugin.enforcePermissions" type="warning" size="small" effect="plain">
                  旧版 SDK
                </ElTag>
                <ElTag v-if="plugin.missingRequired.length > 0" type="danger" size="small">
                  缺少 {{ plugin.missingRequired.length }} 项
                </ElTag>
              </div>
              <div class="plugin-stats">
                <span class="stat">必需: {{ plugin.required.length }}</span>
                <span class="stat">可选: {{ plugin.optional.length }}</span>
                <span class="stat">已授予: {{ plugin.granted.length }}</span>
              </div>
            </div>
          </template>

          <div class="plugin-content">
            <!-- Warning -->
            <div v-if="plugin.warning && !plugin.enforcePermissions" class="legacy-warning">
              <ElIcon><InfoFilled /></ElIcon>
              <span>此插件使用旧版 SDK，权限校验已跳过。建议插件开发者升级 SDK。</span>
            </div>

            <!-- Actions -->
            <div class="plugin-actions">
              <ElButton
                v-if="plugin.missingRequired.length > 0"
                type="primary"
                size="small"
                @click.stop="handleGrantAll(plugin)"
              >
                授予全部必需权限
              </ElButton>
              <ElButton type="danger" size="small" plain @click.stop="handleRevokeAll(plugin.id)">
                撤销全部权限
              </ElButton>
            </div>

            <!-- Permission List -->
            <PermissionList
              :permissions="getPermissionList(plugin)"
              :readonly="!plugin.enforcePermissions"
              @toggle="(id, granted) => handleToggle(plugin.id, id, granted)"
            />
          </div>
        </ElCollapseItem>
      </ElCollapse>
    </TuffBlockSlot>
  </TuffGroupBlock>

  <!-- Audit Logs Section -->
  <TuffGroupBlock name="审计日志" description="查看权限操作历史记录">
    <TuffBlockSlot>
      <div class="audit-header">
        <ElButton :icon="Clock" @click="toggleAuditLogs">
          {{ showAuditLogs ? '收起日志' : '查看日志' }}
        </ElButton>

        <template v-if="showAuditLogs">
          <ElSelect v-model="auditLogFilter" class="audit-filter">
            <ElOption value="all" label="全部操作" />
            <ElOption value="granted" label="授予" />
            <ElOption value="revoked" label="撤销" />
            <ElOption value="denied" label="拒绝" />
            <ElOption value="used" label="使用" />
            <ElOption value="blocked" label="拦截" />
          </ElSelect>

          <ElButton :icon="Refresh" :loading="auditLogsLoading" @click="loadAuditLogs">
            刷新
          </ElButton>

          <ElButton :icon="Delete" type="danger" plain @click="clearAuditLogs"> 清空 </ElButton>
        </template>
      </div>

      <div v-if="showAuditLogs" class="audit-content">
        <div v-if="auditLogsLoading" class="loading-state">加载中...</div>

        <ElEmpty v-else-if="auditLogs.length === 0" description="暂无操作记录" :image-size="60" />

        <div v-else class="audit-list">
          <div class="audit-summary">共 {{ auditLogsTotal }} 条记录</div>

          <div v-for="log in auditLogs" :key="log.id" class="audit-item">
            <div class="audit-time">
              {{ formatTime(log.timestamp) }}
            </div>
            <ElTag :type="getActionType(log.action)" size="small" class="audit-action">
              {{ getActionLabel(log.action) }}
            </ElTag>
            <span class="audit-plugin">{{ log.pluginId }}</span>
            <span class="audit-arrow">→</span>
            <span class="audit-permission">{{
              permissionTranslations[log.permissionId]?.name || log.permissionId
            }}</span>
            <span v-if="getAuditDetails(log)" class="audit-details">
              ({{ getAuditDetails(log) }})
            </span>
          </div>
        </div>
      </div>
    </TuffBlockSlot>
  </TuffGroupBlock>
</template>

<style scoped lang="scss">
.permission-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;

  .stat-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--el-text-color-secondary);

    &.warning {
      color: var(--el-color-warning);
    }

    &.info {
      color: var(--el-color-info);
    }
  }
}

.permission-filters {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;

  .search-input {
    flex: 1;
    max-width: 300px;
  }

  .status-select {
    width: 140px;
  }
}

.loading-state {
  text-align: center;
  padding: 40px;
  color: var(--el-text-color-secondary);
}

.plugin-list {
  :deep(.el-collapse-item__header) {
    height: auto;
    padding: 12px 0;
  }

  :deep(.el-collapse-item__content) {
    padding-bottom: 16px;
  }
}

.plugin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding-right: 12px;
}

.plugin-info {
  display: flex;
  align-items: center;
  gap: 8px;

  .status-icon {
    &.success {
      color: var(--el-color-success);
    }
    &.warning {
      color: var(--el-color-warning);
    }
    &.danger {
      color: var(--el-color-danger);
    }
  }

  .plugin-name {
    font-weight: 500;
  }
}

.plugin-stats {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.plugin-content {
  padding: 0 8px;
}

.legacy-warning {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  background: var(--el-color-warning-light-9);
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--el-color-warning-dark-2);

  svg {
    flex-shrink: 0;
    margin-top: 2px;
  }
}

.plugin-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

// Audit logs styles
.audit-header {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;

  .audit-filter {
    width: 120px;
  }
}

.audit-content {
  margin-top: 16px;
}

.audit-summary {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
}

.audit-list {
  max-height: 400px;
  overflow-y: auto;
}

.audit-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
  margin-bottom: 6px;
  font-size: 13px;
  flex-wrap: wrap;

  &:hover {
    background: var(--el-fill-color-light);
  }
}

.audit-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
  min-width: 120px;
}

.audit-action {
  flex-shrink: 0;
}

.audit-plugin {
  font-weight: 500;
  color: var(--el-color-primary);
}

.audit-arrow {
  color: var(--el-text-color-secondary);
}

.audit-permission {
  color: var(--el-text-color-regular);
}

.audit-details {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
