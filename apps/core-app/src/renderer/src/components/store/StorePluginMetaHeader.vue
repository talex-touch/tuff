<script setup lang="ts" name="StorePluginMetaHeader">
import type { StorePluginListItem } from '~/composables/store/useStoreData'
import { TxPluginMetaHeader } from '@talex-touch/tuff-business'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import StoreIcon from '~/components/store/StoreIcon.vue'

const props = defineProps<{
  plugin: StorePluginListItem
}>()

const { t, locale } = useI18n()

const isZh = computed(() => locale.value.startsWith('zh'))
const isOfficial = computed(
  () => props.plugin.official === true || props.plugin.providerTrustLevel === 'official'
)

const updatedText = computed(() => {
  const value = props.plugin.timestamp
  if (value === undefined || value === null) return ''

  const date = typeof value === 'number' ? new Date(value) : new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium'
  }).format(date)
})

const metaItems = computed(() => {
  const items: string[] = [props.plugin.id]
  if (props.plugin.version) {
    items.push(`v${props.plugin.version}`)
  }
  if (props.plugin.category) {
    items.push(props.plugin.category)
  }
  if (props.plugin.providerName) {
    items.push(props.plugin.providerName)
  }
  if (updatedText.value) {
    items.push(`${isZh.value ? '更新于' : 'Updated'} ${updatedText.value}`)
  }
  return items
})
</script>

<template>
  <TxPluginMetaHeader
    class="StorePluginMetaHeader"
    :title="plugin.name"
    :description="plugin.description"
    :meta-items="metaItems"
    :icon-framed="false"
  >
    <template #icon>
      <StoreIcon class="StorePluginMetaHeader-Icon" :item="plugin" />
    </template>
    <template #title-extra>
      <span v-if="isOfficial" class="StorePluginMetaHeader-OfficialBadge">
        {{ t('store.official', 'Official') }}
      </span>
    </template>
  </TxPluginMetaHeader>
</template>

<style lang="scss" scoped>
.StorePluginMetaHeader-Icon {
  flex-shrink: 0;
}

.StorePluginMetaHeader-OfficialBadge {
  flex-shrink: 0;
  border-radius: 9999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  color: color-mix(
    in srgb,
    var(--tx-color-success, #22c55e) 88%,
    var(--tx-text-color, #111827) 12%
  );
  background: color-mix(in srgb, var(--tx-color-success, #22c55e) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--tx-color-success, #22c55e) 34%, transparent);
}

:deep(.TxPluginMetaHeader) {
  align-items: flex-start;
  gap: 12px;
}

:deep(.TxPluginMetaHeader-Title) {
  font-size: 1.05rem;
  line-height: 1.25;
}

:deep(.TxPluginMetaHeader-Description) {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.45;
  color: color-mix(in srgb, var(--tx-text-color, #111827) 82%, transparent);
}

:deep(.TxPluginMetaHeader-MetaRow) {
  font-size: 12px;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #4b5563) 90%, transparent);
}
</style>
