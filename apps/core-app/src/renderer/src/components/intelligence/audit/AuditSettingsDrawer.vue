<script setup lang="ts">
import type { UsageInsights } from '@talex-touch/utils/transport/sdk/domains/intelligence'
import type { TxSelectModelValue } from '@talex-touch/tuffex/select'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TxSelect, TxSelectItem } from '@talex-touch/tuffex/select'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import SettingRow from '~/components/settings/SettingRow.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'
import { appSetting } from '~/modules/storage/app-storage'
import { formatDuration, formatRetention } from './audit-format'

/**
 * The audit page's settings, each control exactly once (parent PRD R-D7): whether call records are
 * kept, the response cache as one choice (off or how long), and the way to retention and deletion
 * in the privacy settings. The page used to carry two audit switches and two cache controls that
 * wrote the same fields.
 */
defineOptions({ name: 'AuditSettingsDrawer' })

const props = defineProps<{
  audit?: UsageInsights['audit'] | null
}>()

const visible = defineModel<boolean>('visible', { default: false })

const emit = defineEmits<{
  /** A setting the page reads back was saved; the page reloads. */
  changed: []
}>()

const { t, locale } = useI18n()
const router = useRouter()
const { globalConfig, updateGlobalConfig, saveSettings } = useIntelligenceManager()

const savingAudit = ref(false)
const savingCache = ref(false)

const auditEnabled = computed(() => Boolean(globalConfig.value.enableAudit))

const retention = computed(() => {
  // The window the main process reports; until the page has it, the policy's default wording.
  const retentionMs = props.audit ? props.audit.retentionMs : undefined
  if (retentionMs === undefined) return t('intelligenceAudit.retention.policy')
  return formatRetention(retentionMs, t, locale.value)
})

async function persist(): Promise<boolean> {
  try {
    await saveSettings()
    return true
  } catch {
    toast.error(t('intelligenceAudit.settings.saveFailed'))
    return false
  }
}

async function setAudit(next: boolean): Promise<void> {
  if (savingAudit.value || next === auditEnabled.value) return
  savingAudit.value = true
  updateGlobalConfig({ enableAudit: next })
  const saved = await persist()
  savingAudit.value = false
  if (saved) emit('changed')
}

/** Presets in seconds; a stored value outside them stays selectable as itself. */
const CACHE_PRESETS = [300, 900, 3600, 21_600, 86_400] as const
const CACHE_OFF = 'off'

const cacheValue = computed<string | number>(() =>
  globalConfig.value.enableCache ? (globalConfig.value.cacheExpiration ?? 3600) : CACHE_OFF
)

function cacheLabel(seconds: number): string {
  if (seconds % 3600 === 0) return formatDuration(seconds / 3600, 'hour', t, locale.value)
  return formatDuration(seconds / 60, 'minute', t, locale.value)
}

const cacheOptions = computed(() => {
  const seconds = new Set<number>(CACHE_PRESETS)
  const current = globalConfig.value.cacheExpiration
  if (typeof current === 'number' && current > 0) seconds.add(current)
  return [...seconds]
    .sort((left, right) => left - right)
    .map((value) => ({
      value,
      label: cacheLabel(value)
    }))
})

async function setCache(value: TxSelectModelValue): Promise<void> {
  if (savingCache.value || Array.isArray(value) || value === cacheValue.value) return
  savingCache.value = true
  if (value === CACHE_OFF) updateGlobalConfig({ enableCache: false })
  else updateGlobalConfig({ enableCache: true, cacheExpiration: Number(value) })
  await persist()
  savingCache.value = false
}

/**
 * Retention and deletion live in 存储 › 隐私与数据, and 存储 is a Developer Mode page: the router
 * turns any other visit away. So the way there is only offered when it can land.
 */
const developerMode = computed(() => Boolean(appSetting?.dev?.developerMode))

function openPrivacy(): void {
  visible.value = false
  void router.push('/setting/storage-usage')
}
</script>

<template>
  <TxDrawer
    v-model:visible="visible"
    :title="t('intelligenceAudit.settings.title')"
    size="560px"
    data-testid="audit-settings-drawer"
  >
    <div class="AuditSettings">
      <TuffGroupBlock :name="t('intelligenceAudit.settings.recordsGroup')" :collapsible="false">
        <SettingRow
          :title="t('intelligenceAudit.settings.enableAudit')"
          :description="t('intelligenceAudit.settings.enableAuditDescription', { retention })"
        >
          <template #trailing>
            <TxSwitch
              :model-value="auditEnabled"
              :disabled="savingAudit"
              :aria-label="t('intelligenceAudit.settings.enableAudit')"
              data-testid="audit-settings-enable"
              @update:model-value="setAudit"
            />
          </template>
        </SettingRow>
        <SettingRow
          :title="t('intelligenceAudit.settings.privacy')"
          :description="
            developerMode
              ? t('intelligenceAudit.settings.privacyDescription')
              : t('intelligenceAudit.settings.privacyNeedsDeveloperMode')
          "
        >
          <template #trailing>
            <TxButton
              size="sm"
              :disabled="!developerMode"
              data-testid="audit-settings-privacy"
              @click="openPrivacy"
            >
              {{ t('intelligenceAudit.settings.openPrivacy') }}
            </TxButton>
          </template>
        </SettingRow>
      </TuffGroupBlock>

      <TuffGroupBlock :name="t('intelligenceAudit.settings.cacheGroup')" :collapsible="false">
        <SettingRow
          :title="t('intelligenceAudit.settings.cache')"
          :description="t('intelligenceAudit.settings.cacheDescription')"
        >
          <template #trailing>
            <TxSelect
              :model-value="cacheValue"
              class="AuditSettings-Cache"
              :disabled="savingCache"
              :aria-label="t('intelligenceAudit.settings.cache')"
              data-testid="audit-settings-cache"
              @update:model-value="setCache"
            >
              <TxSelectItem :value="CACHE_OFF" :label="t('intelligenceAudit.settings.cacheOff')" />
              <TxSelectItem
                v-for="option in cacheOptions"
                :key="option.value"
                :value="option.value"
                :label="option.label"
              />
            </TxSelect>
          </template>
        </SettingRow>
      </TuffGroupBlock>
    </div>
  </TxDrawer>
</template>

<style scoped lang="scss">
.AuditSettings {
  display: grid;
  gap: var(--shell-space-4);
}

.AuditSettings-Cache {
  width: 148px;
}
</style>
