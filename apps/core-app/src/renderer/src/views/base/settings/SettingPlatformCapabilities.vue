<script setup lang="ts" name="SettingPlatformCapabilities">
import type {
  PlatformCapability,
  PlatformCapabilityScope,
  PlatformCapabilityStatus
} from '@talex-touch/utils'
import { TxButton } from '@talex-touch/tuffex'
import { usePlatformSdk } from '@talex-touch/utils/renderer'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffStatusBadge from '~/components/tuff/TuffStatusBadge.vue'

const { t } = useI18n()
const platformSdk = usePlatformSdk()

const capabilities = ref<PlatformCapability[]>([])
const loading = ref(false)
const lastUpdated = ref<Date | null>(null)

const scopeOrder: PlatformCapabilityScope[] = ['system', 'plugin', 'ai']
const statusOrder: PlatformCapabilityStatus[] = ['stable', 'beta', 'alpha']

const scopeIconMap: Record<PlatformCapabilityScope, string> = {
  system: 'i-carbon-settings',
  plugin: 'i-carbon-plug',
  ai: 'i-carbon-ai'
}

const statusToneMap: Record<PlatformCapabilityStatus, 'success' | 'info' | 'warning'> = {
  stable: 'success',
  beta: 'info',
  alpha: 'warning'
}

const groupedCapabilities = computed(() =>
  scopeOrder
    .map((scope) => {
      const items = capabilities.value
        .filter((item) => item.scope === scope)
        .sort((a, b) => {
          const statusDiff = statusRank(a.status) - statusRank(b.status)
          if (statusDiff !== 0) return statusDiff
          return a.name.localeCompare(b.name)
        })
      return {
        scope,
        label: scopeLabel(scope),
        items
      }
    })
    .filter((group) => group.items.length > 0)
)

const lastUpdatedText = computed(() => {
  if (!lastUpdated.value) return ''
  return lastUpdated.value.toLocaleString()
})

function scopeLabel(scope: PlatformCapabilityScope): string {
  return t(`settings.settingPlatformCapabilities.scope.${scope}`)
}

function statusLabel(status: PlatformCapabilityStatus): string {
  return t(`settings.settingPlatformCapabilities.status.${status}`)
}

function statusTone(status: PlatformCapabilityStatus) {
  return statusToneMap[status] ?? 'info'
}

function statusRank(status: PlatformCapabilityStatus): number {
  const index = statusOrder.indexOf(status)
  return index === -1 ? statusOrder.length : index
}

async function loadCapabilities() {
  loading.value = true
  try {
    const result = await platformSdk.listCapabilities()
    capabilities.value = Array.isArray(result) ? result : []
    lastUpdated.value = new Date()
  } catch (error: any) {
    if (error?.message?.includes('timed out')) {
      console.debug('[SettingPlatformCapabilities] Load timed out, module may be initializing')
      return
    }
    console.error('[SettingPlatformCapabilities] Failed to load capabilities:', error)
    toast.error(t('settings.settingPlatformCapabilities.messages.loadFailed'))
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadCapabilities()
})
</script>

<template>
  <TuffGroupBlock
    :name="t('settings.settingPlatformCapabilities.groupTitle')"
    :description="t('settings.settingPlatformCapabilities.groupDesc')"
    memory-name="platform-capabilities"
  >
    <div class="PlatformCapabilities-Toolbar">
      <div class="PlatformCapabilities-Meta">
        <span>{{
          t('settings.settingPlatformCapabilities.total', { count: capabilities.length })
        }}</span>
        <span v-if="lastUpdatedText">
          {{ t('settings.settingPlatformCapabilities.lastUpdated', { time: lastUpdatedText }) }}
        </span>
      </div>
      <TxButton variant="flat" :disabled="loading" @click="loadCapabilities">
        {{
          loading
            ? t('settings.settingPlatformCapabilities.loading')
            : t('settings.settingPlatformCapabilities.refresh')
        }}
      </TxButton>
    </div>

    <div v-if="loading" class="PlatformCapabilities-State">
      {{ t('settings.settingPlatformCapabilities.loading') }}
    </div>
    <div v-else-if="groupedCapabilities.length === 0" class="PlatformCapabilities-State">
      {{ t('settings.settingPlatformCapabilities.empty') }}
    </div>
    <div v-else class="PlatformCapabilities-List">
      <div
        v-for="group in groupedCapabilities"
        :key="group.scope"
        class="PlatformCapabilities-Group"
      >
        <div class="PlatformCapabilities-GroupHeader">
          <span>{{ group.label }}</span>
          <span class="PlatformCapabilities-GroupCount">{{ group.items.length }}</span>
        </div>
        <TuffBlockSlot
          v-for="item in group.items"
          :key="item.id"
          :title="item.name"
          :description="item.description"
          :default-icon="scopeIconMap[item.scope]"
          :active-icon="scopeIconMap[item.scope]"
          :icon-size="18"
        >
          <template #tags>
            <TuffStatusBadge
              size="sm"
              :text="statusLabel(item.status)"
              :status="statusTone(item.status)"
            />
            <TuffStatusBadge size="sm" :text="scopeLabel(item.scope)" status="muted" />
            <TuffStatusBadge
              v-if="item.sensitive"
              size="sm"
              :text="t('settings.settingPlatformCapabilities.tags.sensitive')"
              status="warning"
            />
          </template>
          <span class="PlatformCapabilities-Id">{{ item.id }}</span>
        </TuffBlockSlot>
      </div>
    </div>
  </TuffGroupBlock>
</template>

<style lang="scss" scoped>
.PlatformCapabilities-Toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.PlatformCapabilities-Meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.PlatformCapabilities-State {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.PlatformCapabilities-Group {
  margin-top: 12px;
}

.PlatformCapabilities-GroupHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.PlatformCapabilities-GroupCount {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.PlatformCapabilities-Id {
  font-family: monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  max-width: 240px;
  word-break: break-all;
}
@media (max-width: 768px) {
  .PlatformCapabilities-Id {
    max-width: 160px;
  }
}
</style>
