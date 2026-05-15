<script lang="ts" name="IntelligenceProviderHeader" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import { TxBottomDialog, TxButton, TxDropdownItem, TxDropdownMenu } from '@talex-touch/tuffex'
import { intelligenceSettings } from '@talex-touch/utils/renderer/storage'
import { toast } from 'vue-sonner'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TSwitch from '~/components/base/switch/TSwitch.vue'
import TuffIcon from '~/components/base/TuffIcon.vue'
import {
  isNexusManagedProvider as checkNexusManagedProvider,
  TUFF_NEXUS_PROVIDER_ICON
} from '~/modules/intelligence/nexus-provider'

enum IntelligenceProviderType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  DEEPSEEK = 'deepseek',
  SILICONFLOW = 'siliconflow',
  LOCAL = 'local',
  CUSTOM = 'custom'
}

interface IntelligenceProviderConfig {
  id: string
  type: IntelligenceProviderType | string
  name: string
  enabled: boolean
  metadata?: Record<string, unknown>
  apiKey?: string
  baseUrl?: string
  models?: string[]
  defaultModel?: string
  instructions?: string
  timeout?: number
  rateLimit?: {
    requestsPerMinute?: number
    tokensPerMinute?: number
  }
  priority?: number
}

const props = defineProps<{
  provider: IntelligenceProviderConfig
}>()

const emits = defineEmits<{
  delete: []
  duplicate: []
  editBasic: []
}>()

const { t } = useI18n()

const providerIconMap: Record<IntelligenceProviderType, ITuffIcon> = {
  [IntelligenceProviderType.OPENAI]: { type: 'class', value: 'i-simple-icons-openai' },
  [IntelligenceProviderType.ANTHROPIC]: { type: 'class', value: 'i-simple-icons-anthropic' },
  [IntelligenceProviderType.DEEPSEEK]: { type: 'class', value: 'i-carbon-search-advanced' },
  [IntelligenceProviderType.SILICONFLOW]: {
    type: 'class',
    value: 'i-carbon-ibm-watson-machine-learning'
  },
  [IntelligenceProviderType.LOCAL]: { type: 'class', value: 'i-carbon-bare-metal-server' },
  [IntelligenceProviderType.CUSTOM]: { type: 'class', value: 'i-carbon-settings' }
}

const overflowIcon: ITuffIcon = { type: 'class', value: 'i-carbon-overflow-menu-horizontal' }
const trashIcon: ITuffIcon = { type: 'class', value: 'i-carbon-trash-can' }
const copyIcon: ITuffIcon = { type: 'class', value: 'i-carbon-copy' }
const editIcon: ITuffIcon = { type: 'class', value: 'i-carbon-edit' }
const shareIcon: ITuffIcon = { type: 'class', value: 'i-carbon-share' }
const exportIcon: ITuffIcon = { type: 'class', value: 'i-carbon-document-export' }
const configIcon: ITuffIcon = { type: 'class', value: 'i-carbon-settings-adjust' }
const defaultIcon: ITuffIcon = { type: 'class', value: 'i-carbon-ibm-watson-machine-learning' }

const localEnabled = computed({
  get: () => props.provider.enabled,
  set: (value: boolean) => {
    intelligenceSettings.updateProvider(props.provider.id, { enabled: value })
  }
})

const isNexusManagedProvider = computed(() => {
  return checkNexusManagedProvider(props.provider)
})

const providerIcon = computed<ITuffIcon>(() => {
  if (isNexusManagedProvider.value) {
    return TUFF_NEXUS_PROVIDER_ICON
  }
  return providerIconMap[props.provider.type as IntelligenceProviderType] ?? defaultIcon
})

const deleteConfirmVisible = ref(false)
const actionMenuOpen = ref(false)

async function handleDuplicate() {
  emits('duplicate')
}

function handleEditBasic() {
  emits('editBasic')
}

function createProviderConfigText(): string {
  const { apiKey: _apiKey, ...safeProvider } = props.provider
  return JSON.stringify(
    {
      schema: 'tuff.intelligence.provider.config.v1',
      exportedAt: new Date().toISOString(),
      provider: safeProvider
    },
    null,
    2
  )
}

function getProviderConfigFileName(): string {
  const safeName = props.provider.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
  return `${safeName || props.provider.id}-provider-config.json`
}

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

async function handleCopyId() {
  try {
    await copyText(props.provider.id)
    toast.success(t('settings.intelligence.copyProviderSuccess'))
  } catch {
    toast.error(t('settings.intelligence.copyProviderFailed'))
  }
}

async function handleCopyConfig() {
  try {
    await copyText(createProviderConfigText())
    toast.success(t('settings.intelligence.copyProviderConfigSuccess'))
  } catch {
    toast.error(t('settings.intelligence.copyProviderConfigFailed'))
  }
}

async function handleShareConfig() {
  const text = createProviderConfigText()
  const title = t('settings.intelligence.shareProviderConfigTitle', { name: props.provider.name })

  try {
    if (navigator.share) {
      await navigator.share({ title, text })
      toast.success(t('settings.intelligence.shareProviderConfigSuccess'))
      return
    }

    await copyText(text)
    toast.success(t('settings.intelligence.shareProviderConfigFallback'))
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    toast.error(t('settings.intelligence.shareProviderConfigFailed'))
  }
}

function handleExportConfig() {
  try {
    const blob = new Blob([createProviderConfigText()], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = getProviderConfigFileName()
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    toast.success(t('settings.intelligence.exportProviderConfigSuccess'))
  } catch {
    toast.error(t('settings.intelligence.exportProviderConfigFailed'))
  }
}

function handleDelete() {
  deleteConfirmVisible.value = true
}

async function confirmDelete(): Promise<boolean> {
  emits('delete')
  return true
}

function closeDeleteConfirm() {
  deleteConfirmVisible.value = false
}
</script>

<template>
  <header
    class="IntelligenceHeader z-1 sticky w-full top-0 flex items-center justify-between p-4 fake-background"
    role="banner"
  >
    <div class="flex items-center gap-3">
      <TuffIcon :icon="providerIcon" :alt="provider.name" :size="40" />
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-2">
          <h1
            id="provider-name"
            class="min-w-0 truncate text-lg font-semibold text-gray-900 dark:text-white"
          >
            {{ provider.name }}
          </h1>
          <p v-if="isNexusManagedProvider" class="provider-official-badge">
            <i class="i-carbon-cloud-service-management" />
            <span>{{ t('settings.intelligence.nexusOfficialProvider') }}</span>
          </p>
        </div>
        <p id="provider-type" class="text-sm text-gray-600 dark:text-gray-400">
          {{ provider.type }}
        </p>
      </div>
    </div>
    <div class="flex items-center gap-3" role="group" aria-label="Provider actions">
      <TxDropdownMenu v-model="actionMenuOpen" placement="bottom-end">
        <template #trigger>
          <TxButton
            variant="flat"
            type="text"
            size="sm"
            :aria-label="t('settings.intelligence.moreActions')"
          >
            <TuffIcon
              :icon="overflowIcon"
              :alt="t('settings.intelligence.moreActions')"
              :size="20"
            />
          </TxButton>
        </template>
        <TxDropdownItem @select="handleCopyId">
          <TuffIcon :icon="copyIcon" :alt="t('settings.intelligence.copyProvider')" :size="18" />
          <span class="ml-2">{{ t('settings.intelligence.copyProvider') }}</span>
        </TxDropdownItem>
        <TxDropdownItem @select="handleCopyConfig">
          <TuffIcon
            :icon="configIcon"
            :alt="t('settings.intelligence.copyProviderConfig')"
            :size="18"
          />
          <span class="ml-2">{{ t('settings.intelligence.copyProviderConfig') }}</span>
        </TxDropdownItem>
        <TxDropdownItem @select="handleShareConfig">
          <TuffIcon
            :icon="shareIcon"
            :alt="t('settings.intelligence.shareProviderConfig')"
            :size="18"
          />
          <span class="ml-2">{{ t('settings.intelligence.shareProviderConfig') }}</span>
        </TxDropdownItem>
        <TxDropdownItem @select="handleExportConfig">
          <TuffIcon
            :icon="exportIcon"
            :alt="t('settings.intelligence.exportProviderConfig')"
            :size="18"
          />
          <span class="ml-2">{{ t('settings.intelligence.exportProviderConfig') }}</span>
        </TxDropdownItem>
        <TxDropdownItem v-if="!isNexusManagedProvider" @select="handleEditBasic">
          <TuffIcon
            :icon="editIcon"
            :alt="t('settings.intelligence.editProviderBasic')"
            :size="18"
          />
          <span class="ml-2">{{ t('settings.intelligence.editProviderBasic') }}</span>
        </TxDropdownItem>
        <TxDropdownItem v-if="!isNexusManagedProvider" @select="handleDuplicate">
          <TuffIcon
            :icon="copyIcon"
            :alt="t('settings.intelligence.duplicateProvider')"
            :size="18"
          />
          <span class="ml-2">{{ t('settings.intelligence.duplicateProvider') }}</span>
        </TxDropdownItem>
        <TxDropdownItem v-if="!isNexusManagedProvider" danger @select="handleDelete">
          <TuffIcon
            :icon="trashIcon"
            :alt="t('settings.intelligence.deleteProviderConfig', { name: provider.name })"
            :size="18"
          />
          <span class="ml-2">
            {{ t('settings.intelligence.deleteProviderConfig', { name: provider.name }) }}
          </span>
        </TxDropdownItem>
      </TxDropdownMenu>
      <TSwitch v-model="localEnabled" :aria-label="`Toggle ${provider.name}`" />
    </div>
  </header>

  <TxBottomDialog
    v-if="deleteConfirmVisible"
    :title="t('settings.intelligence.deleteConfirmTitle')"
    :message="t('settings.intelligence.deleteConfirmMessage', { name: provider.name })"
    :btns="[
      { content: t('common.cancel'), type: 'info', onClick: () => true },
      {
        content: t('settings.intelligence.deleteConfirmButton'),
        type: 'error',
        onClick: confirmDelete
      }
    ]"
    :close="closeDeleteConfirm"
  />
</template>

<style lang="scss" scoped>
.IntelligenceHeader {
  backdrop-filter: blur(18px) saturate(180%);
  border-bottom: 1px solid var(--tx-border-color-light);
}

.provider-official-badge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  max-width: 12rem;
  margin: 0;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  color: var(--tx-color-primary);
  background: var(--tx-color-primary-soft);

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
