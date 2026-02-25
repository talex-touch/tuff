<script lang="ts" setup>
import type { StorePluginSummary } from '~/types/store'
import { TxPluginMetaHeader } from '@talex-touch/tuff-business'
import StatusBadge from '~/components/ui/StatusBadge.vue'
import Tag from '~/components/ui/Tag.vue'
import { useStoreCategories } from '~/composables/useStoreCategories'
import { useStoreFormatters } from '~/composables/useStoreFormatters'

const props = defineProps<{
  plugin: StorePluginSummary
}>()

const emit = defineEmits<{
  (event: 'viewDetail', plugin: StorePluginSummary, source: HTMLElement | null): void
}>()

const { t } = useI18n()
const { resolveCategoryLabel } = useStoreCategories()
const { formatDate, formatInstalls } = useStoreFormatters()

function channelTone(channel?: string) {
  switch (channel) {
    case 'RELEASE':
      return 'success'
    case 'BETA':
      return 'warning'
    case 'SNAPSHOT':
      return 'muted'
    default:
      return 'info'
  }
}

function viewDetails(event: MouseEvent) {
  const source = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  emit('viewDetail', props.plugin, source)
}
</script>

<template>
  <article
    class="StoreItemCard group flex flex-col justify-between rounded-3xl bg-white/60 p-4 dark:bg-dark/30"
    @click="viewDetails"
  >
    <div class="space-y-4">
      <div class="flex items-start justify-between gap-3">
        <TxPluginMetaHeader
          class="StoreItem-MetaHeader min-w-0 flex-1"
          :title="plugin.name"
          :description="plugin.summary || ''"
          :icon-url="plugin.iconUrl"
          :icon-alt="`${plugin.name} icon`"
          :official="false"
        >
          <template #title-extra>
            <span
              v-if="plugin.isOfficial"
              class="StoreItem-Official i-carbon-badge text-sm"
              :title="t('store.badges.official')"
            />
          </template>
        </TxPluginMetaHeader>
        <Tag
          :label="resolveCategoryLabel(plugin.category)"
          size="sm"
          class="rounded-full bg-dark/5 px-2 py-1 text-[10px] font-semibold dark:bg-light/10 dark:text-light/80"
        />
      </div>

      <div class="flex flex-wrap gap-2 text-xs text-black/60 dark:text-light/70">
        <span class="inline-flex items-center gap-1 rounded-full bg-dark/10 px-2 py-1 dark:bg-light/10 dark:text-light/80">
          <span class="i-carbon-calendar text-sm" aria-hidden="true" />
          {{ t('dashboard.sections.plugins.updatedOn', { date: formatDate(plugin.latestVersion?.createdAt) }) }}
        </span>
        <span class="inline-flex items-center gap-1 rounded-full bg-dark/10 px-2 py-1 dark:bg-light/10 dark:text-light/80">
          <span class="i-carbon-version text-sm" aria-hidden="true" />
          <template v-if="plugin.latestVersion">
            v{{ plugin.latestVersion.version }}
          </template>
          <template v-else>
            —
          </template>
        </span>
        <StatusBadge
          v-if="plugin.latestVersion"
          :text="plugin.latestVersion.channel"
          :status="channelTone(plugin.latestVersion.channel)"
          size="sm"
        />
        <span class="inline-flex items-center gap-1 rounded-full bg-dark/10 px-2 py-1 dark:bg-light/10 dark:text-light/80">
          <span class="i-carbon-user-multiple text-sm" aria-hidden="true" />
          {{ t('dashboard.sections.plugins.stats.installs', { count: formatInstalls(plugin.installs) }) }}
        </span>
      </div>

      <div
        v-if="plugin.badges.length"
        class="flex flex-wrap gap-2"
      >
        <Tag
          v-for="badge in plugin.badges"
          :key="badge"
          :label="badge"
          size="sm"
          class="border border-primary/15 rounded-full px-2 py-0.5 text-[10px] text-black/60 tracking-[0.35em] uppercase dark:border-light/20 dark:text-light/70"
        />
      </div>
    </div>
  </article>
</template>

<style scoped>
:deep(.StoreItem-MetaHeader.TxPluginMetaHeader) {
  align-items: flex-start;
  gap: 12px;
}

:deep(.StoreItem-MetaHeader .TxPluginMetaHeader-Icon) {
  width: 48px;
  height: 48px;
  border-radius: 14px;
}

:deep(.StoreItem-MetaHeader .TxPluginMetaHeader-Title) {
  font-size: 1rem;
}

:deep(.StoreItem-MetaHeader .TxPluginMetaHeader-Description) {
  margin-top: 6px;
  line-height: 1.45;
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.StoreItem-Official {
  color: color-mix(in srgb, var(--tx-color-warning, #f59e0b) 90%, transparent);
}
</style>
