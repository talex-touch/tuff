<script lang="ts" name="IntelligenceHeader" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import { intelligenceSettings } from '@talex-touch/utils/renderer/storage'
import { ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import FlatButton from '~/components/base/button/FlatButton.vue'
import TSwitch from '~/components/base/switch/TSwitch.vue'
import TuffIcon from '~/components/base/TuffIcon.vue'

enum IntelligenceProviderType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  DEEPSEEK = 'deepseek',
  SILICONFLOW = 'siliconflow',
  LOCAL = 'local',
  CUSTOM = 'custom',
}

interface IntelligenceProviderConfig {
  id: string
  type: IntelligenceProviderType | string
  name: string
  enabled: boolean
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
}>()

const { t } = useI18n()

const providerIconMap: Record<IntelligenceProviderType, ITuffIcon> = {
  [IntelligenceProviderType.OPENAI]: { type: 'class', value: 'i-simple-icons-openai' },
  [IntelligenceProviderType.ANTHROPIC]: { type: 'class', value: 'i-simple-icons-anthropic' },
  [IntelligenceProviderType.DEEPSEEK]: { type: 'class', value: 'i-carbon-search-advanced' },
  [IntelligenceProviderType.SILICONFLOW]: { type: 'class', value: 'i-carbon-ibm-watson-machine-learning' },
  [IntelligenceProviderType.LOCAL]: { type: 'class', value: 'i-carbon-bare-metal-server' },
  [IntelligenceProviderType.CUSTOM]: { type: 'class', value: 'i-carbon-settings' },
}

const overflowIcon: ITuffIcon = { type: 'class', value: 'i-carbon-overflow-menu-horizontal' }
const trashIcon: ITuffIcon = { type: 'class', value: 'i-carbon-trash-can' }
const defaultIcon: ITuffIcon = { type: 'class', value: 'i-carbon-ibm-watson-machine-learning' }

const localEnabled = computed({
  get: () => props.provider.enabled,
  set: (value: boolean) => {
    intelligenceSettings.updateProvider(props.provider.id, { enabled: value })
  },
})

const providerIcon = computed<ITuffIcon>(() => {
  return providerIconMap[props.provider.type as IntelligenceProviderType] ?? defaultIcon
})

function handleDelete() {
  ElMessageBox.confirm(
    t('settings.intelligence.deleteConfirmMessage', { name: props.provider.name }),
    t('settings.intelligence.deleteConfirmTitle'),
    {
      confirmButtonText: t('settings.intelligence.deleteConfirmButton'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
      confirmButtonClass: 'el-button--danger',
    },
  )
    .then(() => {
      emits('delete')
    })
    .catch(() => {})
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
        <h1 id="provider-name" class="text-lg font-semibold text-gray-900 dark:text-white">
          {{ provider.name }}
        </h1>
        <p id="provider-type" class="text-sm text-gray-600 dark:text-gray-400">
          {{ provider.type }}
        </p>
      </div>
    </div>
    <div class="flex items-center gap-3" role="group" aria-label="Provider actions">
      <el-dropdown v-if="provider.type === 'custom'" trigger="click" placement="bottom-end">
        <FlatButton text mini :aria-label="t('settings.intelligence.moreActions')">
          <TuffIcon :icon="overflowIcon" :alt="t('settings.intelligence.moreActions')" :size="20" />
        </FlatButton>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="handleDelete">
              <TuffIcon
                :icon="trashIcon"
                :alt="t('settings.intelligence.deleteProvider', { name: provider.name })"
                :size="18"
              />
              <span class="ml-2">
                {{ t('settings.intelligence.deleteProvider', { name: provider.name }) }}
              </span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <TSwitch v-model="localEnabled" :aria-label="`Toggle ${provider.name}`" />
    </div>
  </header>
</template>

<style lang="scss" scoped>
.IntelligenceHeader {
  backdrop-filter: blur(18px) saturate(180%);
  border-bottom: 1px solid var(--el-border-color-light);
}
</style>
