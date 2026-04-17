<!--
  SettingPermission Component

  Plugin Permission Center settings page
  Allows users to view and manage plugin permissions
-->
<script setup lang="ts" name="SettingPermission">
import type { PermissionAuditLog } from '@talex-touch/utils'
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import { usePermissionSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import {
  TuffInput,
  TuffSelect,
  TuffSelectItem,
  TxButton,
  TxCollapse,
  TxCollapseItem,
  TxEmpty,
  TxTag
} from '@talex-touch/tuffex'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { PermissionList } from '~/components/permission'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'

const transport = useTuffTransport()
const permissionSdk = usePermissionSdk()
const { t, locale } = useI18n()

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
  blocked: boolean
  blockedReason?: string
  enforcePermissions: boolean
  required: string[]
  optional: string[]
  granted: string[]
  missingRequired: string[]
}

type PermissionBackendMode = 'sqlite' | 'degraded/backend-unavailable'

interface PermissionBackendState {
  mode: PermissionBackendMode
  writable: boolean
  reason?: string
}

interface PermissionMutationResult {
  success: boolean
  error?: string
  backendState?: PermissionBackendState
}

interface PermissionPerformanceResult {
  backendState?: PermissionBackendState
}

interface PluginPermissionStatusResult {
  enforcePermissions?: boolean
  required?: string[]
  optional?: string[]
  granted?: string[]
  missingRequired?: string[]
  warning?: string
  backendState?: PermissionBackendState
}

// State
const loading = ref(true)
const searchQuery = ref('')
const filterStatus = ref<'all' | 'granted' | 'missing'>('all')
const plugins = ref<PluginPermissionInfo[]>([])
const allPermissions = ref<Record<string, PermissionGrant[]>>({})
const expandedPlugins = ref<string[]>([])
const backendState = ref<PermissionBackendState | null>(null)
const mutationError = ref<string | null>(null)

// Audit log state
const showAuditLogs = ref(false)
const auditLogs = ref<PermissionAuditLog[]>([])
const auditLogsTotal = ref(0)
const auditLogsLoading = ref(false)
const auditLogFilter = ref<'all' | PermissionAuditLog['action']>('all')

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
    result = result.filter((p) => !p.blocked && p.missingRequired.length === 0)
  } else if (filterStatus.value === 'missing') {
    result = result.filter((p) => !p.blocked && p.missingRequired.length > 0)
  }

  return result
})

// Stats
const stats = computed(() => {
  const total = plugins.value.length
  const withMissing = plugins.value.filter((p) => p.missingRequired.length > 0).length
  const blocked = plugins.value.filter((p) => p.blocked).length
  return { total, withMissing, blocked }
})

const backendUnavailable = computed(
  () => backendState.value?.mode === 'degraded/backend-unavailable'
)

const backendReason = computed(
  () => backendState.value?.reason || t('plugin.permissions.backendUnavailableDesc')
)

function updateBackendState(next?: PermissionBackendState | null) {
  if (next) {
    backendState.value = next
  }
}

function handleMutationResult(result: PermissionMutationResult | null | undefined): boolean {
  updateBackendState(result?.backendState)
  mutationError.value = result?.success ? null : result?.error || null
  return result?.success === true
}

// Load data
async function loadData() {
  loading.value = true
  try {
    mutationError.value = null
    const performance = (await permissionSdk.getPerformance()) as PermissionPerformanceResult | null
    updateBackendState(performance?.backendState)

    // Get all plugins
    const pluginList = (await transport.send(PluginEvents.api.list, {})) as ITouchPlugin[]

    // Get all permissions
    const perms = await permissionSdk.getAll()
    allPermissions.value = perms || {}

    // Build plugin permission info
    plugins.value = await Promise.all(
      pluginList.map(async (plugin: ITouchPlugin) => {
        const status = (await permissionSdk.getStatus({
          pluginId: plugin.name,
          sdkapi: plugin.sdkapi,
          required: plugin.declaredPermissions?.required || [],
          optional: plugin.declaredPermissions?.optional || []
        })) as PluginPermissionStatusResult | null
        updateBackendState(status?.backendState)
        const blockedIssue =
          plugin.loadError?.code === 'SDKAPI_BLOCKED'
            ? plugin.loadError
            : (plugin.issues ?? []).find(
                (issue) => issue.code === 'SDKAPI_BLOCKED' || issue.code === 'SDK_VERSION_OUTDATED'
              )
        const blocked = (status?.enforcePermissions ?? false) === false
        const blockedReason =
          plugin.loadError?.code === 'SDKAPI_BLOCKED'
            ? plugin.loadError.message
            : blockedIssue?.message || status?.warning

        return {
          id: plugin.name,
          name: plugin.name,
          sdkapi: plugin.sdkapi,
          blocked,
          blockedReason,
          enforcePermissions: status?.enforcePermissions ?? false,
          required: status?.required || [],
          optional: status?.optional || [],
          granted: status?.granted || [],
          missingRequired: blocked ? [] : status?.missingRequired || []
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
    const trans = getPermissionTranslation(id)
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

function getPermissionTranslation(permissionId: string): { name: string; desc: string } {
  const [category, action] = permissionId.split('.')
  if (!category || !action) {
    return { name: permissionId, desc: '' }
  }

  const keyBase = `plugin.permissions.registry.${category}.${action}`
  const nameKey = `${keyBase}.name`
  const descKey = `${keyBase}.desc`
  const name = t(nameKey)
  const desc = t(descKey)

  return {
    name: name === nameKey ? permissionId : name,
    desc: desc === descKey ? '' : desc
  }
}

function getRisk(permissionId: string): 'low' | 'medium' | 'high' {
  const highRisk = [
    'fs.write',
    'fs.execute',
    'system.shell',
    'intelligence.agents',
    'intelligence.admin',
    'window.capture'
  ]
  const mediumRisk = [
    'fs.read',
    'clipboard.read',
    'network.internet',
    'network.download',
    'system.tray',
    'intelligence.basic',
    'storage.shared'
  ]
  if (highRisk.includes(permissionId)) return 'high'
  if (mediumRisk.includes(permissionId)) return 'medium'
  return 'low'
}

// Toggle permission
async function handleToggle(pluginId: string, permissionId: string, granted: boolean) {
  if (backendUnavailable.value) return
  try {
    let result: PermissionMutationResult | null = null
    if (granted) {
      result = (await permissionSdk.grant({
        pluginId,
        permissionId,
        grantedBy: 'user'
      })) as PermissionMutationResult
    } else {
      result = (await permissionSdk.revoke({ pluginId, permissionId })) as PermissionMutationResult
    }
    if (!handleMutationResult(result)) {
      return
    }
    await loadData()
  } catch (e) {
    console.error('Failed to toggle permission:', e)
  }
}

// Grant all required permissions
async function handleGrantAll(plugin: PluginPermissionInfo) {
  if (backendUnavailable.value) return
  try {
    const result = (await permissionSdk.grantMultiple({
      pluginId: plugin.id,
      permissionIds: plugin.missingRequired,
      grantedBy: 'user'
    })) as PermissionMutationResult
    if (!handleMutationResult(result)) {
      return
    }
    await loadData()
  } catch (e) {
    console.error('Failed to grant all permissions:', e)
  }
}

// Revoke all permissions
async function handleRevokeAll(pluginId: string) {
  if (backendUnavailable.value) return
  try {
    const result = (await permissionSdk.revokeAll({ pluginId })) as PermissionMutationResult
    if (!handleMutationResult(result)) {
      return
    }
    await loadData()
  } catch (e) {
    console.error('Failed to revoke all permissions:', e)
  }
}

// Load audit logs
async function loadAuditLogs() {
  auditLogsLoading.value = true
  try {
    const result = await permissionSdk.getAuditLogs({
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
  if (backendUnavailable.value) return
  try {
    const result = (await permissionSdk.clearAuditLogs()) as PermissionMutationResult
    if (!handleMutationResult(result)) {
      return
    }
    await loadAuditLogs()
  } catch (e) {
    console.error('Failed to clear audit logs:', e)
  }
}

// Format timestamp
function formatTime(timestamp: number) {
  const date = new Date(timestamp)
  return date.toLocaleString(locale.value || 'zh-CN', {
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
      return t('settingPermission.audit.actions.granted')
    case 'revoked':
      return t('settingPermission.audit.actions.revoked')
    case 'denied':
      return t('settingPermission.audit.actions.denied')
    case 'used':
      return t('settingPermission.audit.actions.used')
    case 'blocked':
      return t('settingPermission.audit.actions.blocked')
    default:
      return action
  }
}

// Get action type for tag
function getActionColor(action: string) {
  switch (action) {
    case 'granted':
      return 'var(--tx-color-success)'
    case 'revoked':
      return 'var(--tx-color-warning)'
    case 'denied':
      return 'var(--tx-color-danger)'
    case 'blocked':
      return 'var(--tx-color-danger)'
    case 'used':
      return 'var(--tx-color-info)'
    default:
      return 'var(--tx-color-info)'
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
  <TuffGroupBlock
    :name="t('settingPermission.title')"
    :description="t('settingPermission.description')"
  >
    <TuffBlockSlot>
      <div v-if="backendUnavailable" class="backend-warning">
        <i class="i-carbon-warning-alt-filled" />
        <div>
          <div class="backend-warning__title">
            {{ t('plugin.permissions.backendUnavailableTitle') }}
          </div>
          <div class="backend-warning__text">{{ backendReason }}</div>
        </div>
      </div>

      <div v-if="mutationError" class="backend-warning backend-warning--error">
        <i class="i-carbon-error-filled" />
        <div>
          <div class="backend-warning__title">
            {{ t('plugin.permissions.backendMutationFailed') }}
          </div>
          <div class="backend-warning__text">{{ mutationError }}</div>
        </div>
      </div>

      <!-- Stats -->
      <div class="permission-stats">
        <div class="stat-item">
          <i class="i-carbon-checkmark" />
          <span>{{ t('settingPermission.stats.total', { count: stats.total }) }}</span>
        </div>
        <div v-if="stats.withMissing > 0" class="stat-item warning">
          <i class="i-carbon-warning" />
          <span>{{ t('settingPermission.stats.withMissing', { count: stats.withMissing }) }}</span>
        </div>
        <div v-if="stats.blocked > 0" class="stat-item danger">
          <i class="i-carbon-error" />
          <span>{{ t('settingPermission.stats.blocked', { count: stats.blocked }) }}</span>
        </div>
      </div>

      <!-- Filters -->
      <div class="permission-filters">
        <TuffInput
          v-model="searchQuery"
          :placeholder="t('settingPermission.searchPlaceholder')"
          clearable
          class="search-input"
        >
          <template #prefix>
            <i class="i-carbon-search" />
          </template>
        </TuffInput>
        <TuffSelect v-model="filterStatus" class="status-select">
          <TuffSelectItem :value="'all'" :label="t('settingPermission.filters.all')" />
          <TuffSelectItem :value="'granted'" :label="t('settingPermission.filters.granted')" />
          <TuffSelectItem :value="'missing'" :label="t('settingPermission.filters.missing')" />
        </TuffSelect>
        <TxButton :loading="loading" @click="loadData">
          <i class="i-carbon-renew mr-1" />
          {{ t('common.refresh') }}
        </TxButton>
      </div>

      <!-- Plugin List -->
      <div v-if="loading" class="loading-state">{{ t('common.loading') }}</div>

      <TxEmpty
        v-else-if="filteredPlugins.length === 0"
        :title="t('settingPermission.empty')"
        compact
      />

      <TxCollapse v-else v-model="expandedPlugins" class="plugin-list">
        <TxCollapseItem v-for="plugin in filteredPlugins" :key="plugin.id" :name="plugin.id">
          <template #title>
            <div class="plugin-header">
              <div class="plugin-info">
                <i v-if="plugin.blocked" class="i-carbon-error status-icon danger" />
                <i
                  v-else-if="plugin.missingRequired.length === 0 && plugin.enforcePermissions"
                  class="i-carbon-checkmark status-icon success"
                />
                <i
                  v-else-if="plugin.missingRequired.length > 0"
                  class="i-carbon-warning status-icon danger"
                />
                <i v-else class="i-carbon-information status-icon warning" />
                <span class="plugin-name">{{ plugin.name }}</span>
                <TxTag v-if="plugin.blocked" color="var(--tx-color-danger)" size="sm">
                  {{ t('settingPermission.tags.blocked') }}
                </TxTag>
                <TxTag
                  v-if="plugin.missingRequired.length > 0"
                  color="var(--tx-color-danger)"
                  size="sm"
                >
                  {{
                    t('settingPermission.tags.missing', { count: plugin.missingRequired.length })
                  }}
                </TxTag>
              </div>
              <div class="plugin-stats">
                <span class="stat">{{
                  t('settingPermission.pluginStats.required', { count: plugin.required.length })
                }}</span>
                <span class="stat">{{
                  t('settingPermission.pluginStats.optional', { count: plugin.optional.length })
                }}</span>
                <span class="stat">{{
                  t('settingPermission.pluginStats.granted', { count: plugin.granted.length })
                }}</span>
              </div>
            </div>
          </template>

          <div class="plugin-content">
            <!-- Warning -->
            <div v-if="plugin.blockedReason && plugin.blocked" class="legacy-warning">
              <i class="i-carbon-error" />
              <span>{{ plugin.blockedReason }}</span>
            </div>

            <!-- Actions -->
            <div class="plugin-actions">
              <TxButton
                v-if="plugin.missingRequired.length > 0 && !plugin.blocked"
                type="primary"
                size="small"
                :disabled="backendUnavailable"
                @click.stop="handleGrantAll(plugin)"
              >
                {{ t('settingPermission.actions.grantRequired') }}
              </TxButton>
              <TxButton
                type="danger"
                size="small"
                plain
                :disabled="backendUnavailable || plugin.blocked"
                @click.stop="handleRevokeAll(plugin.id)"
              >
                {{ t('plugin.permissions.actions.revokeAll') }}
              </TxButton>
            </div>

            <!-- Permission List -->
            <PermissionList
              :permissions="getPermissionList(plugin)"
              :readonly="plugin.blocked || backendUnavailable"
              @toggle="(id, granted) => handleToggle(plugin.id, id, granted)"
            />
          </div>
        </TxCollapseItem>
      </TxCollapse>
    </TuffBlockSlot>
  </TuffGroupBlock>

  <!-- Audit Logs Section -->
  <TuffGroupBlock
    :name="t('settingPermission.audit.title')"
    :description="t('settingPermission.audit.description')"
  >
    <TuffBlockSlot>
      <div class="audit-header">
        <TxButton @click="toggleAuditLogs">
          <i class="i-carbon-time mr-1" />
          {{
            showAuditLogs ? t('settingPermission.audit.hide') : t('settingPermission.audit.show')
          }}
        </TxButton>

        <template v-if="showAuditLogs">
          <TuffSelect v-model="auditLogFilter" class="audit-filter">
            <TuffSelectItem :value="'all'" :label="t('settingPermission.audit.filters.all')" />
            <TuffSelectItem
              :value="'granted'"
              :label="t('settingPermission.audit.actions.granted')"
            />
            <TuffSelectItem
              :value="'revoked'"
              :label="t('settingPermission.audit.actions.revoked')"
            />
            <TuffSelectItem
              :value="'denied'"
              :label="t('settingPermission.audit.actions.denied')"
            />
            <TuffSelectItem :value="'used'" :label="t('settingPermission.audit.actions.used')" />
            <TuffSelectItem
              :value="'blocked'"
              :label="t('settingPermission.audit.actions.blocked')"
            />
          </TuffSelect>

          <TxButton :loading="auditLogsLoading" @click="loadAuditLogs">
            <i class="i-carbon-renew mr-1" />
            {{ t('common.refresh') }}
          </TxButton>

          <TxButton type="danger" plain :disabled="backendUnavailable" @click="clearAuditLogs">
            <i class="i-carbon-trash-can mr-1" />
            {{ t('settingPermission.audit.clear') }}
          </TxButton>
        </template>
      </div>

      <div v-if="showAuditLogs" class="audit-content">
        <div v-if="auditLogsLoading" class="loading-state">{{ t('common.loading') }}</div>

        <TxEmpty
          v-else-if="auditLogs.length === 0"
          :title="t('settingPermission.audit.empty')"
          compact
        />

        <div v-else class="audit-list">
          <div class="audit-summary">
            {{ t('settingPermission.audit.total', { count: auditLogsTotal }) }}
          </div>

          <div v-for="log in auditLogs" :key="log.id" class="audit-item">
            <div class="audit-time">
              {{ formatTime(log.timestamp) }}
            </div>
            <TxTag :color="getActionColor(log.action)" size="sm" class="audit-action">
              {{ getActionLabel(log.action) }}
            </TxTag>
            <span class="audit-plugin">{{ log.pluginId }}</span>
            <span class="audit-arrow">→</span>
            <span class="audit-permission">{{
              getPermissionTranslation(log.permissionId).name
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
    color: var(--tx-text-color-secondary);

    &.warning {
      color: var(--tx-color-warning);
    }

    &.info {
      color: var(--tx-color-info);
    }

    &.danger {
      color: var(--tx-color-danger);
    }
  }
}

.backend-warning {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 8px;
  background: var(--tx-color-warning-light-9);
  color: var(--tx-color-warning-dark-2);
  font-size: 13px;

  &--error {
    background: var(--tx-color-danger-light-9);
    color: var(--tx-color-danger-dark-2);
  }

  &__title {
    font-weight: 600;
    margin-bottom: 2px;
  }

  &__text {
    word-break: break-word;
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
  color: var(--tx-text-color-secondary);
}

.plugin-list {
  :deep(.tx-collapse-item__header) {
    height: auto;
    padding: 12px 0;
  }

  :deep(.tx-collapse-item__content-inner) {
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
      color: var(--tx-color-success);
    }
    &.warning {
      color: var(--tx-color-warning);
    }
    &.danger {
      color: var(--tx-color-danger);
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
  color: var(--tx-text-color-secondary);
}

.plugin-content {
  padding: 0 8px;
}

.legacy-warning {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  background: var(--tx-color-danger-light-9);
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--tx-color-danger-dark-2);

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
  color: var(--tx-text-color-secondary);
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
  background: var(--tx-fill-color-lighter);
  border-radius: 6px;
  margin-bottom: 6px;
  font-size: 13px;
  flex-wrap: wrap;

  &:hover {
    background: var(--tx-fill-color-light);
  }
}

.audit-time {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  font-family: monospace;
  min-width: 120px;
}

.audit-action {
  flex-shrink: 0;
}

.audit-plugin {
  font-weight: 500;
  color: var(--tx-color-primary);
}

.audit-arrow {
  color: var(--tx-text-color-secondary);
}

.audit-permission {
  color: var(--tx-text-color-regular);
}

.audit-details {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}
</style>
