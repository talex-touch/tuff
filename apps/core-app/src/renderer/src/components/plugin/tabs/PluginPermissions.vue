<script setup lang="ts" name="PluginPermissions">
/**
 * Plugin Permissions Tab
 *
 * Shows and manages permissions for a single plugin.
 */

import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import type { ShortcutWarning, ShortcutWithStatus } from '~/modules/channel/main/shortcon'
import { TxButton } from '@talex-touch/tuffex'
import { ShortcutType } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { PermissionEvents } from '@talex-touch/utils/transport/events'
import { ElEmpty, ElTag } from 'element-plus'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatKeyInput from '~/components/base/input/FlatKeyInput.vue'
import TuffBlockLine from '~/components/tuff/TuffBlockLine.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { shortconApi } from '~/modules/channel/main/shortcon'

interface Props {
  plugin: ITouchPlugin
}

const props = defineProps<Props>()
const transport = useTuffTransport()
const { t } = useI18n()

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
const shortcutsLoading = ref(false)
const shortcuts = ref<ShortcutWithStatus[]>([])

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
  if (!status.value) return false
  return status.value.required.length > 0 || status.value.optional.length > 0
})

const permissionList = computed(() => {
  if (!status.value) return []

  const all = [...status.value.required, ...status.value.optional]
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
      required: status.value!.required.includes(id),
      granted: status.value!.granted.includes(id)
    }
  })
})

// Category definitions
const categoryInfo: Record<string, { nameKey: string; icon: string }> = {
  fs: { nameKey: 'plugin.permissions.categories.fs', icon: 'i-carbon-folder' },
  clipboard: { nameKey: 'plugin.permissions.categories.clipboard', icon: 'i-carbon-copy' },
  network: { nameKey: 'plugin.permissions.categories.network', icon: 'i-carbon-network-3' },
  system: { nameKey: 'plugin.permissions.categories.system', icon: 'i-carbon-terminal' },
  ai: { nameKey: 'plugin.permissions.categories.ai', icon: 'i-carbon-bot' },
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

const pluginShortcuts = computed(() =>
  shortcuts.value
    .filter(
      (shortcut) =>
        shortcut.type === ShortcutType.RENDERER && shortcut.meta?.author === props.plugin.name
    )
    .sort((a, b) => a.accelerator.localeCompare(b.accelerator))
)

function getRisk(permissionId: string): 'low' | 'medium' | 'high' {
  const highRisk = ['fs.write', 'fs.execute', 'system.shell', 'ai.agents', 'window.capture']
  const mediumRisk = [
    'fs.read',
    'clipboard.read',
    'network.internet',
    'network.download',
    'system.tray',
    'system.shortcut',
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
    'system.shortcut': 'i-carbon-keyboard',
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

function getShortcutTitle(shortcut: ShortcutWithStatus): string {
  const meta = shortcut.meta as { description?: string; shortcutId?: string } | undefined
  return meta?.description || meta?.shortcutId || shortcut.id
}

function getShortcutStatusLabel(shortcut: ShortcutWithStatus): string | null {
  const status = shortcut.status
  if (!status || status.state === 'active') {
    return null
  }
  if (status.state === 'conflict') {
    return status.reason === 'conflict-system'
      ? t('plugin.permissions.shortcuts.status.conflictSystem')
      : t('plugin.permissions.shortcuts.status.conflictPlugin')
  }
  if (status.reason === 'invalid') {
    return t('plugin.permissions.shortcuts.status.invalid')
  }
  return t('plugin.permissions.shortcuts.status.unavailable')
}

function getShortcutStatusTagType(shortcut: ShortcutWithStatus): 'danger' | 'warning' | 'info' {
  const status = shortcut.status
  if (!status || status.state === 'active') return 'info'
  if (status.state === 'conflict') return 'danger'
  return 'warning'
}

function getShortcutWarningLabel(warning: ShortcutWarning): string {
  switch (warning) {
    case 'permission-missing':
      return t('plugin.permissions.shortcuts.warning.permissionMissing')
    case 'sdk-legacy':
      return t('plugin.permissions.shortcuts.warning.legacySdk')
    case 'missing-description':
      return t('plugin.permissions.shortcuts.warning.missingDescription')
    default:
      return warning
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
    // Create plain copies of arrays to avoid structured clone issues
    const required = [...(props.plugin.declaredPermissions?.required || [])]
    const optional = [...(props.plugin.declaredPermissions?.optional || [])]

    const result = await transport.send(PermissionEvents.api.getStatus, {
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

async function loadShortcuts() {
  shortcutsLoading.value = true
  try {
    shortcuts.value = await shortconApi.getAll()
  } catch (e) {
    console.error('Failed to load shortcuts:', e)
  } finally {
    shortcutsLoading.value = false
  }
}

async function updatePluginShortcut(id: string, newAccelerator: string): Promise<void> {
  if (!id || !newAccelerator) return
  const target = shortcuts.value.find((item) => item.id === id)
  const previousValue = target?.accelerator

  if (target) {
    target.accelerator = newAccelerator
  }

  const success = await shortconApi.update(id, newAccelerator)
  if (!success && target && previousValue) {
    target.accelerator = previousValue
  }
  await loadShortcuts()
}

// Toggle permission
async function handleToggle(permissionId: string, granted: boolean) {
  try {
    if (granted) {
      await transport.send(PermissionEvents.api.grant, {
        pluginId: props.plugin.name,
        permissionId,
        grantedBy: 'user'
      })
    } else {
      await transport.send(PermissionEvents.api.revoke, {
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
    await transport.send(PermissionEvents.api.grantMultiple, {
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
    await transport.send(PermissionEvents.api.revokeAll, {
      pluginId: props.plugin.name
    })
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
    loadShortcuts()
  }
)

onMounted(() => {
  loadStatus()
  loadShortcuts()
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
    <ElEmpty
      v-else-if="!hasPermissions"
      :description="t('plugin.permissions.empty')"
      :image-size="80"
    />

    <!-- Permission Content -->
    <template v-else>
      <!-- Status Overview -->
      <TuffGroupBlock
        :name="t('plugin.permissions.statusTitle')"
        :description="
          status?.missingRequired.length === 0
            ? t('plugin.permissions.statusGranted')
            : t('plugin.permissions.statusMissing', {
                count: status?.missingRequired.length || 0
              })
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
        <TuffBlockLine :title="t('plugin.permissions.required')">
          <template #description>
            <ElTag type="danger" effect="light" size="small">
              {{ status?.required.length || 0 }}
            </ElTag>
          </template>
        </TuffBlockLine>
        <TuffBlockLine :title="t('plugin.permissions.optional')">
          <template #description>
            <ElTag type="info" effect="light" size="small">
              {{ status?.optional.length || 0 }}
            </ElTag>
          </template>
        </TuffBlockLine>
        <TuffBlockLine :title="t('plugin.permissions.granted')">
          <template #description>
            <ElTag type="success" effect="light" size="small">
              {{ status?.granted.length || 0 }}
            </ElTag>
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
            <TxButton v-if="status?.missingRequired.length" variant="flat" @click="handleGrantAll">
              <i class="i-ri-check-double-line" />
              <span>{{ t('plugin.permissions.actions.grantAll') }}</span>
            </TxButton>
            <TxButton
              v-if="status?.granted.length"
              variant="flat"
              class="danger"
              @click="handleRevokeAll"
            >
              <i class="i-ri-close-line" />
              <span>{{ t('plugin.permissions.actions.revokeAll') }}</span>
            </TxButton>
          </div>
        </TuffBlockSlot>
      </TuffGroupBlock>

      <!-- SDK Warning -->
      <TuffGroupBlock
        v-if="status?.warning && !status?.enforcePermissions"
        :name="t('plugin.permissions.legacyTitle')"
        :description="t('plugin.permissions.legacyWarning')"
        default-icon="i-carbon-warning"
        active-icon="i-carbon-warning"
        memory-name="plugin-permissions-sdk-warning"
      >
        <TuffBlockLine :title="t('plugin.permissions.recommendationsTitle')">
          <template #description>
            <span class="text-[var(--el-color-warning)]">{{
              t('plugin.permissions.legacyHint', { version: 251212 })
            }}</span>
          </template>
        </TuffBlockLine>
      </TuffGroupBlock>

      <TuffGroupBlock
        :name="t('plugin.permissions.shortcuts.title')"
        :description="t('plugin.permissions.shortcuts.desc')"
        default-icon="i-carbon-keyboard"
        active-icon="i-carbon-keyboard"
        memory-name="plugin-permissions-shortcuts"
      >
        <div v-if="shortcutsLoading" class="PluginShortcuts-Loading">
          {{ t('plugin.permissions.shortcuts.loading') }}
        </div>
        <ElEmpty
          v-else-if="pluginShortcuts.length === 0"
          :description="t('plugin.permissions.shortcuts.empty')"
          :image-size="80"
        />
        <div v-else class="PluginShortcuts-List">
          <div v-for="shortcut in pluginShortcuts" :key="shortcut.id" class="PluginShortcuts-Item">
            <div class="PluginShortcuts-Info">
              <div class="PluginShortcuts-Title">
                {{ getShortcutTitle(shortcut) }}
              </div>
              <div v-if="getShortcutStatusLabel(shortcut)" class="PluginShortcuts-Status">
                <ElTag :type="getShortcutStatusTagType(shortcut)" effect="light" size="small">
                  {{ getShortcutStatusLabel(shortcut) }}
                </ElTag>
              </div>
              <div v-if="(shortcut.status?.warnings || []).length" class="PluginShortcuts-Warnings">
                <ElTag
                  v-for="warning in shortcut.status?.warnings || []"
                  :key="warning"
                  type="warning"
                  effect="light"
                  size="small"
                >
                  {{ getShortcutWarningLabel(warning) }}
                </ElTag>
              </div>
            </div>
            <FlatKeyInput
              :model-value="shortcut.accelerator"
              @update:model-value="
                (newValue) => updatePluginShortcut(shortcut.id, String(newValue))
              "
            />
          </div>
        </div>
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
          @change="(val) => handleToggle(perm.id, val)"
        >
          <template #tags>
            <ElTag v-if="perm.required" type="danger" effect="light" size="small">
              {{ t('plugin.permissions.requiredTag') }}
            </ElTag>
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

.PluginShortcuts-Loading {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 6px 0;
}

.PluginShortcuts-List {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}

.PluginShortcuts-Item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--el-border-color-light);
}

.PluginShortcuts-Item:last-child {
  border-bottom: none;
}

.PluginShortcuts-Info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.PluginShortcuts-Title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.PluginShortcuts-Status,
.PluginShortcuts-Warnings {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
</style>
