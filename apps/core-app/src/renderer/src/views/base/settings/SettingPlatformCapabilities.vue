<script setup lang="ts" name="SettingPlatformCapabilities">
import type {
  PlatformCapability,
  PlatformCapabilityScope,
  PlatformCapabilitySupportLevel,
  PlatformCapabilityStatus
} from '@talex-touch/utils'
import { TxButton } from '@talex-touch/tuffex'
import { usePlatformSdk } from '@talex-touch/utils/renderer'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { devLog } from '~/utils/dev-log'
import { createRendererLogger } from '~/utils/renderer-log'
import TuffIcon from '~/components/base/TuffIcon.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffStatusBadge from '~/components/tuff/TuffStatusBadge.vue'

const { t } = useI18n()
const platformSdk = usePlatformSdk()
const settingPlatformCapabilitiesLog = createRendererLogger('SettingPlatformCapabilities')

type PlatformCapabilityView = PlatformCapability & {
  issueCode?: string
  reason?: string
}

const capabilities = ref<PlatformCapabilityView[]>([])
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

const supportToneMap: Record<PlatformCapabilitySupportLevel, 'success' | 'warning' | 'danger'> = {
  supported: 'success',
  best_effort: 'warning',
  unsupported: 'danger'
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

const statusSummary = computed(() =>
  statusOrder
    .map((status) => ({
      status,
      label: statusLabel(status),
      count: capabilities.value.filter((item) => item.status === status).length
    }))
    .filter((summary) => summary.count > 0)
)

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

function supportLabel(level: PlatformCapabilitySupportLevel | undefined): string {
  return t(`settings.settingPlatformCapabilities.support.${level || 'supported'}`)
}

function supportTone(level: PlatformCapabilitySupportLevel | undefined) {
  return supportToneMap[level || 'supported']
}

async function loadCapabilities() {
  loading.value = true
  try {
    const result = await platformSdk.listCapabilities()
    capabilities.value = Array.isArray(result) ? (result as PlatformCapabilityView[]) : []
    lastUpdated.value = new Date()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('timed out')) {
      devLog('[SettingPlatformCapabilities] Load timed out, module may be initializing')
      return
    }
    settingPlatformCapabilitiesLog.error('Failed to load capabilities', error)
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
      <div class="PlatformCapabilities-Overview">
        <div class="PlatformCapabilities-Meta">
          <span>{{
            t('settings.settingPlatformCapabilities.total', { count: capabilities.length })
          }}</span>
          <span v-if="lastUpdatedText">
            {{ t('settings.settingPlatformCapabilities.lastUpdated', { time: lastUpdatedText }) }}
          </span>
        </div>
        <div v-if="statusSummary.length" class="PlatformCapabilities-Stats">
          <TuffStatusBadge
            v-for="summary in statusSummary"
            :key="summary.status"
            size="sm"
            :text="`${summary.label} ${summary.count}`"
            :status="statusTone(summary.status)"
          />
        </div>
      </div>
      <TxButton
        class="PlatformCapabilities-Refresh"
        variant="flat"
        :disabled="loading"
        @click="loadCapabilities"
      >
        <div class="i-carbon-renew" />
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
        <article v-for="item in group.items" :key="item.id" class="PlatformCapabilities-Item">
          <div class="PlatformCapabilities-ItemMain">
            <span class="PlatformCapabilities-Icon">
              <TuffIcon
                :icon="{ type: 'class', value: scopeIconMap[item.scope] }"
                :size="18"
                :alt="scopeLabel(item.scope)"
              />
            </span>

            <div class="PlatformCapabilities-Text">
              <div class="PlatformCapabilities-TitleRow">
                <h4>{{ item.name }}</h4>
                <div class="PlatformCapabilities-Badges">
                  <TuffStatusBadge
                    size="sm"
                    :text="statusLabel(item.status)"
                    :status="statusTone(item.status)"
                  />
                  <TuffStatusBadge
                    size="sm"
                    :text="supportLabel(item.supportLevel)"
                    :status="supportTone(item.supportLevel)"
                  />
                  <TuffStatusBadge
                    v-if="item.sensitive"
                    size="sm"
                    :text="t('settings.settingPlatformCapabilities.tags.sensitive')"
                    status="warning"
                  />
                </div>
              </div>
              <p>{{ item.description }}</p>
            </div>
          </div>

          <div class="PlatformCapabilities-Detail">
            <div class="PlatformCapabilities-MetaRow">
              <span class="PlatformCapabilities-IdBadge">{{ item.id }}</span>
              <span v-if="item.issueCode" class="PlatformCapabilities-IdBadge">
                {{ item.issueCode }}
              </span>
            </div>
            <div v-if="item.reason" class="PlatformCapabilities-Limitations" :title="item.reason">
              <span class="PlatformCapabilities-LimitationsLabel">
                {{ t('settings.settingPlatformCapabilities.reason') }}
              </span>
              <span class="PlatformCapabilities-LimitationsText">
                {{ item.reason }}
              </span>
            </div>
            <div
              v-if="item.limitations?.length"
              class="PlatformCapabilities-Limitations"
              :title="item.limitations.join('\n')"
            >
              <span class="PlatformCapabilities-LimitationsLabel">
                {{ t('settings.settingPlatformCapabilities.limitations') }}
              </span>
              <span class="PlatformCapabilities-LimitationsText">
                {{ item.limitations.join(' · ') }}
              </span>
            </div>
          </div>
        </article>
      </div>
    </div>
  </TuffGroupBlock>
</template>

<style lang="scss" scoped>
:deep(.TGroupBlock-Container) {
  overflow: visible;
}

:deep(.TGroupBlock-Main) {
  overflow: visible !important;
}

.PlatformCapabilities-Toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--tx-border-color-lighter);
}

.PlatformCapabilities-Overview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1 1 auto;
}

.PlatformCapabilities-Meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.PlatformCapabilities-Stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.PlatformCapabilities-Refresh {
  flex: 0 0 auto;
}

.PlatformCapabilities-State {
  margin: 12px 16px 16px;
  padding: 12px 14px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 72%, transparent);
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.PlatformCapabilities-List {
  padding: 0 0 8px;
}

.PlatformCapabilities-Group {
  margin-top: 14px;
}

.PlatformCapabilities-GroupHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tx-text-color-secondary);
}

.PlatformCapabilities-GroupCount {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.PlatformCapabilities-Item {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(260px, 42%);
  gap: 20px;
  align-items: flex-start;
  min-height: 72px;
  padding: 14px 18px;
  border-top: 1px solid color-mix(in srgb, var(--tx-border-color-lighter) 72%, transparent);
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease;

  &:hover {
    background: color-mix(in srgb, var(--tx-fill-color-light) 52%, transparent);
  }
}

.PlatformCapabilities-ItemMain {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  min-width: 0;
}

.PlatformCapabilities-Icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  margin-top: 1px;
  border-radius: 10px;
  color: var(--tx-text-color-primary);
  background: color-mix(in srgb, var(--tx-fill-color-light) 78%, transparent);
}

.PlatformCapabilities-Text {
  min-width: 0;

  p {
    margin: 5px 0 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--tx-text-color-secondary);
  }
}

.PlatformCapabilities-TitleRow {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;

  h4 {
    margin: 0;
    min-width: 0;
    font-size: 14px;
    line-height: 1.35;
    font-weight: 600;
    color: var(--tx-text-color-primary);
  }
}

.PlatformCapabilities-Badges {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.PlatformCapabilities-Detail {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  min-width: 0;
}

.PlatformCapabilities-IdBadge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--tx-border-color);
  background: var(--tx-fill-color-light);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: 11px;
  color: var(--tx-text-color-secondary);
  max-width: min(100%, 320px);
  line-height: 1.35;
  word-break: break-all;
}

.PlatformCapabilities-MetaRow {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  min-width: 0;
}

.PlatformCapabilities-Limitations {
  display: flex;
  align-items: baseline;
  gap: 6px;
  max-width: 100%;
  font-size: 11px;
  color: var(--tx-text-color-secondary);
}

.PlatformCapabilities-LimitationsLabel {
  font-weight: 600;
}

.PlatformCapabilities-LimitationsText {
  line-height: 1.5;
  min-width: 0;
  overflow-wrap: anywhere;
  text-align: right;
}

@media (max-width: 960px) {
  .PlatformCapabilities-Item {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .PlatformCapabilities-Detail {
    align-items: flex-start;
    padding-left: 48px;
  }

  .PlatformCapabilities-MetaRow {
    justify-content: flex-start;
  }

  .PlatformCapabilities-LimitationsText {
    text-align: left;
  }
}

@media (max-width: 640px) {
  .PlatformCapabilities-Toolbar,
  .PlatformCapabilities-Item,
  .PlatformCapabilities-GroupHeader {
    padding-left: 14px;
    padding-right: 14px;
  }

  .PlatformCapabilities-Detail {
    padding-left: 0;
  }

  .PlatformCapabilities-IdBadge {
    max-width: 100%;
  }
}
</style>
