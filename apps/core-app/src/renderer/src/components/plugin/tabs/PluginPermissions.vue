<script setup lang="ts" name="PluginPermissions">
/**
 * Plugin Permissions Tab
 *
 * Shows and manages permissions for a single plugin.
 */

import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import { TxButton, TxEmpty, TxTag } from '@talex-touch/tuffex'
import { PERMISSION_ENFORCEMENT_MIN_VERSION } from '@talex-touch/utils/plugin'
import { usePermissionSdk } from '@talex-touch/utils/renderer'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffBlockLine from '~/components/tuff/TuffBlockLine.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'

interface Props {
  plugin: ITouchPlugin
}

const props = defineProps<Props>()
const permissionSdk = usePermissionSdk()
const { t } = useI18n()

interface PluginPermissionStatus {
  pluginId: string
  sdkapi?: number
  enforcePermissions: boolean
  required: string[]
  optional: string[]
  granted: string[]
  deprecatedGranted: string[]
  outdatedByAppUpdate: string[]
  outdatedByPluginChange: string[]
  denied: string[]
  missingRequired: string[]
  warning?: string
}

type PermissionBackendMode = 'sqlite' | 'degraded/backend-unavailable'

interface PermissionBackendState {
  mode: PermissionBackendMode
  writable: boolean
  reason?: string
}

interface PluginPermissionStatusResult extends PluginPermissionStatus {
  backendState?: PermissionBackendState
}

interface PermissionMutationResult {
  success: boolean
  error?: string
  backendState?: PermissionBackendState
}

// State
const loading = ref(true)
const status = ref<PluginPermissionStatus | null>(null)
const backendState = ref<PermissionBackendState | null>(null)
const mutationError = ref<string | null>(null)

const blockedIssue = computed(() => {
  const issues = props.plugin.issues ?? []
  return issues.find((issue) => issue.code === 'SDKAPI_BLOCKED') ?? null
})

const sdkBlocked = computed(() => {
  return (
    props.plugin.loadState === 'load_failed' &&
    (props.plugin.loadError?.code === 'SDKAPI_BLOCKED' || blockedIssue.value !== null)
  )
})

const blockedMessage = computed(() => {
  if (props.plugin.loadError?.code === 'SDKAPI_BLOCKED') {
    return props.plugin.loadError.message || ''
  }
  return blockedIssue.value?.message || ''
})
const declaredPermissionIds = computed(() => {
  const required = props.plugin.declaredPermissions?.required || []
  const optional = props.plugin.declaredPermissions?.optional || []
  return [...new Set([...required, ...optional])]
})
const declaredRequiredCount = computed(() => props.plugin.declaredPermissions?.required?.length || 0)
const declaredOptionalCount = computed(() => props.plugin.declaredPermissions?.optional?.length || 0)

function getPermissionName(permissionId: string): string {
  const key = `plugin.permissions.registry.${permissionId}.name`
  const translated = t(key)
  return translated === key ? permissionId : translated
}

function getPermissionDesc(permissionId: string): string {
  const key = `plugin.permissions.registry.${permissionId}.desc`
  const translated = t(key)
  return translated === key ? '' : translated
}

// Computed
const hasPermissions = computed(() => {
  if (status.value) {
    return status.value.required.length > 0 || status.value.optional.length > 0
  }
  return declaredPermissionIds.value.length > 0 || sdkBlocked.value
})

const permissionList = computed(() => {
  const all = status.value
    ? [...status.value.required, ...status.value.optional]
    : declaredPermissionIds.value
  const unique = [...new Set(all)]

  return unique.map((id) => {
    const category = id.split('.')[0]
    const risk = getRisk(id)

    return {
      id,
      name: getPermissionName(id),
      desc: getPermissionDesc(id),
      category,
      risk,
      required: status.value?.required.includes(id) || false,
      granted: status.value?.granted.includes(id) || false
    }
  })
})

const outdatedByAppUpdatePermissions = computed(() => {
  if (!status.value?.outdatedByAppUpdate?.length) return []
  return status.value.outdatedByAppUpdate.map((id) => ({
    id,
    name: getPermissionName(id),
    desc: getPermissionDesc(id)
  }))
})

const outdatedByPluginChangePermissions = computed(() => {
  if (!status.value?.outdatedByPluginChange?.length) return []
  return status.value.outdatedByPluginChange.map((id) => ({
    id,
    name: getPermissionName(id),
    desc: getPermissionDesc(id)
  }))
})

const hasOutdatedPermissions = computed(() => {
  if (!status.value) return false
  return status.value.deprecatedGranted.length > 0
})

const hasStatusWarning = computed(() => {
  if (sdkBlocked.value) return true
  if (!status.value) return false
  return (
    status.value.missingRequired.length > 0 ||
    status.value.deprecatedGranted.length > 0 ||
    backendState.value?.mode === 'degraded/backend-unavailable'
  )
})

const statusDescription = computed(() => {
  if (sdkBlocked.value) {
    return blockedMessage.value || t('plugin.permissions.blockedWarning')
  }
  if (backendState.value?.mode === 'degraded/backend-unavailable') {
    return t('plugin.permissions.backendUnavailableDesc')
  }
  if (!status.value) return ''
  if (status.value.missingRequired.length > 0) {
    return t('plugin.permissions.statusMissing', {
      count: status.value.missingRequired.length
    })
  }
  if (status.value.deprecatedGranted.length > 0) {
    return t('plugin.permissions.statusDeprecated', {
      count: status.value.deprecatedGranted.length
    })
  }
  return t('plugin.permissions.statusGranted')
})

const backendUnavailable = computed(
  () => backendState.value?.mode === 'degraded/backend-unavailable'
)
const permissionMutationsDisabled = computed(
  () => backendUnavailable.value || sdkBlocked.value || !status.value?.enforcePermissions
)

function handleMutationResult(result: PermissionMutationResult | null | undefined): boolean {
  if (result?.backendState) {
    backendState.value = result.backendState
  }
  mutationError.value = result?.success ? null : result?.error || null
  return result?.success === true
}

// Category definitions
const categoryInfo: Record<string, { nameKey: string; icon: string }> = {
  fs: { nameKey: 'plugin.permissions.categories.fs', icon: 'i-carbon-folder' },
  clipboard: { nameKey: 'plugin.permissions.categories.clipboard', icon: 'i-carbon-copy' },
  network: { nameKey: 'plugin.permissions.categories.network', icon: 'i-carbon-network-3' },
  system: { nameKey: 'plugin.permissions.categories.system', icon: 'i-carbon-terminal' },
  intelligence: { nameKey: 'plugin.permissions.categories.intelligence', icon: 'i-carbon-bot' },
  storage: { nameKey: 'plugin.permissions.categories.storage', icon: 'i-carbon-data-base' },
  window: { nameKey: 'plugin.permissions.categories.window', icon: 'i-carbon-application' }
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
    name: categoryInfo[id] ? t(categoryInfo[id].nameKey) : id,
    icon: categoryInfo[id]?.icon || 'i-carbon-folder',
    permissions
  }))
})

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
    'system.shortcut',
    'intelligence.basic',
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
    'system.shortcut': 'i-carbon-keyboard',
    'intelligence.basic': 'i-carbon-bot',
    'intelligence.admin': 'i-carbon-shield',
    'intelligence.agents': 'i-carbon-user-multiple',
    'storage.plugin': 'i-carbon-data-base',
    'storage.shared': 'i-carbon-share',
    'window.create': 'i-carbon-application',
    'window.capture': 'i-carbon-screen'
  }
  return icons[permissionId] || 'i-carbon-checkmark'
}

function getRiskTagColor(risk: 'low' | 'medium' | 'high'): string {
  switch (risk) {
    case 'low':
      return 'var(--tx-color-success)'
    case 'medium':
      return 'var(--tx-color-warning)'
    case 'high':
      return 'var(--tx-color-danger)'
    default:
      return 'var(--tx-color-info)'
  }
}

function getRiskLabel(risk: 'low' | 'medium' | 'high'): string {
  switch (risk) {
    case 'low':
      return t('plugin.permissions.risk.low')
    case 'medium':
      return t('plugin.permissions.risk.medium')
    case 'high':
      return t('plugin.permissions.risk.high')
    default:
      return risk
  }
}

// Load permission status
async function loadStatus() {
  loading.value = true
  try {
    mutationError.value = null
    // Create plain copies of arrays to avoid structured clone issues
    const required = [...(props.plugin.declaredPermissions?.required || [])]
    const optional = [...(props.plugin.declaredPermissions?.optional || [])]

    const result = (await permissionSdk.getStatus({
      pluginId: props.plugin.name,
      sdkapi: props.plugin.sdkapi,
      required,
      optional
    })) as PluginPermissionStatusResult | null
    backendState.value = result?.backendState || null
    status.value = result
      ? {
          ...result,
          deprecatedGranted: result.deprecatedGranted || [],
          outdatedByAppUpdate: result.outdatedByAppUpdate || [],
          outdatedByPluginChange: result.outdatedByPluginChange || []
        }
      : null
  } catch (e) {
    console.error('Failed to load permission status:', e)
  } finally {
    loading.value = false
  }
}

// Toggle permission
async function handleToggle(permissionId: string, granted: boolean) {
  if (permissionMutationsDisabled.value) return
  try {
    let result: PermissionMutationResult | null = null
    if (granted) {
      result = (await permissionSdk.grant({
        pluginId: props.plugin.name,
        permissionId,
        grantedBy: 'user'
      })) as PermissionMutationResult
    } else {
      result = (await permissionSdk.revoke({
        pluginId: props.plugin.name,
        permissionId
      })) as PermissionMutationResult
    }
    if (!handleMutationResult(result)) {
      return
    }
    await loadStatus()
  } catch (e) {
    console.error('Failed to toggle permission:', e)
  }
}

// Grant all required
async function handleGrantAll() {
  if (permissionMutationsDisabled.value || !status.value?.missingRequired.length) return
  try {
    const result = (await permissionSdk.grantMultiple({
      pluginId: props.plugin.name,
      permissionIds: status.value.missingRequired,
      grantedBy: 'user'
    })) as PermissionMutationResult
    if (!handleMutationResult(result)) {
      return
    }
    await loadStatus()
  } catch (e) {
    console.error('Failed to grant all permissions:', e)
  }
}

// Revoke all
async function handleRevokeAll() {
  if (permissionMutationsDisabled.value) return
  try {
    const result = (await permissionSdk.revokeAll({
      pluginId: props.plugin.name
    })) as PermissionMutationResult
    if (!handleMutationResult(result)) {
      return
    }
    await loadStatus()
  } catch (e) {
    console.error('Failed to revoke all permissions:', e)
  }
}

// Watch plugin changes
watch(
  () => props.plugin.name,
  () => {
    loadStatus()
  }
)

onMounted(() => {
  loadStatus()
})
</script>

<template>
  <div class="PluginPermissions w-full space-y-4">
    <!-- Loading -->
    <div v-if="loading" class="loading-state">
      <i class="i-ri-loader-4-line animate-spin text-2xl" />
      <span>{{ t('plugin.permissions.loading') }}</span>
    </div>

    <!-- No Permissions -->
    <TxEmpty v-else-if="!hasPermissions" :title="t('plugin.permissions.empty')" compact />

    <!-- Permission Content -->
    <template v-else>
      <!-- Status Overview -->
      <TuffGroupBlock
        :name="t('plugin.permissions.statusTitle')"
        :description="statusDescription"
        :default-icon="hasStatusWarning ? 'i-carbon-warning-filled' : 'i-carbon-checkmark-filled'"
        :active-icon="hasStatusWarning ? 'i-carbon-warning-filled' : 'i-carbon-checkmark-filled'"
        memory-name="plugin-permissions-status"
      >
        <TuffBlockLine
          v-if="backendUnavailable"
          :title="t('plugin.permissions.backendUnavailableTitle')"
        >
          <template #description>
            <span class="text-[var(--tx-color-warning)]">
              {{ backendState?.reason || t('plugin.permissions.backendUnavailableDesc') }}
            </span>
          </template>
        </TuffBlockLine>
        <TuffBlockLine v-if="mutationError" :title="t('plugin.permissions.backendMutationFailed')">
          <template #description>
            <span class="text-[var(--tx-color-danger)]">{{ mutationError }}</span>
          </template>
        </TuffBlockLine>
        <TuffBlockLine :title="t('plugin.permissions.required')">
          <template #description>
            <TxTag color="var(--tx-color-danger)" size="sm">
              {{ status?.required.length ?? declaredRequiredCount }}
            </TxTag>
          </template>
        </TuffBlockLine>
        <TuffBlockLine :title="t('plugin.permissions.optional')">
          <template #description>
            <TxTag color="var(--tx-color-info)" size="sm">
              {{ status?.optional.length ?? declaredOptionalCount }}
            </TxTag>
          </template>
        </TuffBlockLine>
        <TuffBlockLine :title="t('plugin.permissions.granted')">
          <template #description>
            <TxTag color="var(--tx-color-success)" size="sm">
              {{ status?.granted.length || 0 }}
            </TxTag>
          </template>
        </TuffBlockLine>

        <!-- Actions -->
        <TuffBlockSlot
          :title="t('plugin.permissions.actionsTitle')"
          :description="t('plugin.permissions.actionsDesc')"
          default-icon="i-carbon-settings"
          active-icon="i-carbon-settings"
        >
          <div class="flex items-center gap-2">
            <TxButton variant="flat" @click="loadStatus">
              <i class="i-ri-refresh-line" />
              <span>{{ t('plugin.permissions.actions.refresh') }}</span>
            </TxButton>
            <TxButton
              v-if="status?.missingRequired.length"
              variant="flat"
              :disabled="permissionMutationsDisabled"
              @click="handleGrantAll"
            >
              <i class="i-ri-check-double-line" />
              <span>{{ t('plugin.permissions.actions.grantAll') }}</span>
            </TxButton>
            <TxButton
              v-if="status?.granted.length"
              variant="flat"
              class="danger"
              :disabled="permissionMutationsDisabled"
              @click="handleRevokeAll"
            >
              <i class="i-ri-close-line" />
              <span>{{ t('plugin.permissions.actions.revokeAll') }}</span>
            </TxButton>
          </div>
        </TuffBlockSlot>
      </TuffGroupBlock>

      <TuffGroupBlock
        v-if="sdkBlocked"
        :name="t('plugin.permissions.blockedTitle')"
        :description="t('plugin.permissions.blockedWarning')"
        default-icon="i-carbon-error"
        active-icon="i-carbon-error-filled"
        memory-name="plugin-permissions-sdk-blocked"
      >
        <TuffBlockLine :title="t('plugin.permissions.blockedStatusTitle')">
          <template #description>
            <span class="text-[var(--tx-color-danger)]">
              {{ blockedMessage || t('plugin.permissions.blockedWarning') }}
            </span>
          </template>
        </TuffBlockLine>
        <TuffBlockLine :title="t('plugin.permissions.recommendationsTitle')">
          <template #description>
            <span class="text-[var(--tx-color-warning)]">{{
              t('plugin.permissions.blockedHint', {
                version: PERMISSION_ENFORCEMENT_MIN_VERSION
              })
            }}</span>
          </template>
        </TuffBlockLine>
      </TuffGroupBlock>

      <!-- SDK Compatibility Warning -->
      <TuffGroupBlock
        v-else-if="status?.warning && !status?.enforcePermissions"
        :name="t('plugin.permissions.legacyTitle')"
        :description="t('plugin.permissions.legacyWarning')"
        default-icon="i-carbon-warning"
        active-icon="i-carbon-warning"
        memory-name="plugin-permissions-sdk-warning"
      >
        <TuffBlockLine :title="t('plugin.permissions.recommendationsTitle')">
          <template #description>
            <span class="text-[var(--tx-color-warning)]">{{
              t('plugin.permissions.legacyHint', {
                version: PERMISSION_ENFORCEMENT_MIN_VERSION
              })
            }}</span>
          </template>
        </TuffBlockLine>
      </TuffGroupBlock>

      <!-- Permission List by Category -->
      <TuffGroupBlock
        v-for="category in permissionCategories"
        :key="category.id"
        :name="category.name"
        :description="t('plugin.permissions.categoryDesc', { count: category.permissions.length })"
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
          :disabled="permissionMutationsDisabled"
          @change="(val) => handleToggle(perm.id, val)"
        >
          <template #tags>
            <TxTag v-if="perm.required" color="var(--tx-color-danger)" size="sm">
              {{ t('plugin.permissions.requiredTag') }}
            </TxTag>
            <TxTag :color="getRiskTagColor(perm.risk)" size="sm">
              {{ getRiskLabel(perm.risk) }}
            </TxTag>
          </template>
        </TuffBlockSwitch>
      </TuffGroupBlock>

      <TuffGroupBlock
        v-if="hasOutdatedPermissions"
        :name="t('plugin.permissions.deprecatedTitle')"
        :description="
          t('plugin.permissions.deprecatedDesc', { count: status?.deprecatedGranted.length || 0 })
        "
        default-icon="i-carbon-warning-alt-filled"
        active-icon="i-carbon-warning-alt-filled"
        memory-name="plugin-permissions-deprecated"
      >
        <TuffBlockLine :title="t('plugin.permissions.deprecatedReason.appUpdate')">
          <template #description>
            <TxTag color="var(--tx-color-warning)" size="sm">
              {{ outdatedByAppUpdatePermissions.length }}
            </TxTag>
          </template>
        </TuffBlockLine>
        <TuffBlockLine :title="t('plugin.permissions.deprecatedReason.pluginChange')">
          <template #description>
            <TxTag color="var(--tx-color-warning)" size="sm">
              {{ outdatedByPluginChangePermissions.length }}
            </TxTag>
          </template>
        </TuffBlockLine>
        <TuffBlockLine
          v-for="perm in outdatedByAppUpdatePermissions"
          :key="`app-${perm.id}`"
          :title="perm.name"
        >
          <template #description>
            <div class="DeprecatedPermission-Description">
              <span>{{ perm.desc || perm.id }}</span>
              <TxTag color="var(--tx-color-warning)" size="sm">
                {{ t('plugin.permissions.deprecatedReason.appUpdate') }}
              </TxTag>
            </div>
          </template>
        </TuffBlockLine>
        <TuffBlockLine
          v-for="perm in outdatedByPluginChangePermissions"
          :key="`plugin-${perm.id}`"
          :title="perm.name"
        >
          <template #description>
            <div class="DeprecatedPermission-Description">
              <span>{{ perm.desc || perm.id }}</span>
              <TxTag color="var(--tx-color-warning)" size="sm">
                {{ t('plugin.permissions.deprecatedReason.pluginChange') }}
              </TxTag>
            </div>
          </template>
        </TuffBlockLine>
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
  color: var(--tx-text-color-secondary);
}

.danger {
  color: var(--tx-color-danger) !important;
}

.DeprecatedPermission-Description {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
