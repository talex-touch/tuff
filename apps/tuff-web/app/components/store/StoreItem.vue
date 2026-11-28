<script lang="ts" setup>
import type { StorePluginSummary } from '~/types/store'
import { TxCard } from '@talex-touch/tuffex/card'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { TxTag } from '@talex-touch/tuffex/tag'
import { computed } from 'vue'
import StorePluginIcon from '~/components/store/StorePluginIcon.vue'
import { useStoreCategories } from '~/composables/useStoreCategories'
import { useStoreFormatters } from '~/composables/useStoreFormatters'

const props = defineProps<{
  plugin: StorePluginSummary
}>()

const emit = defineEmits<{
  (event: 'viewDetail', plugin: StorePluginSummary, source: HTMLElement | null): void
  (event: 'prefetchDetail', plugin: StorePluginSummary): void
}>()

const { t } = useI18n()
const { resolveCategoryLabel } = useStoreCategories()
const { formatDate, formatInstalls } = useStoreFormatters()

function channelTone(channel?: string) {
  switch (channel) {
    case 'RELEASE':
      return 'success' as const
    case 'BETA':
      return 'warning' as const
    case 'SNAPSHOT':
      return 'muted' as const
    default:
      return 'info' as const
  }
}

const versionLabel = computed(() => {
  const latest = props.plugin.latestVersion
  if (!latest?.version)
    return ''
  return latest.channel && latest.channel !== 'RELEASE'
    ? `v${latest.version} · ${latest.channel}`
    : `v${latest.version}`
})

const updatedDateText = computed(() => formatDate(props.plugin.latestVersion?.createdAt))

function viewDetails(event: MouseEvent | KeyboardEvent) {
  const source = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  emit('viewDetail', props.plugin, source)
}
</script>

<template>
  <TxCard
    variant="solid"
    background="mask"
    shadow="soft"
    :radius="20"
    :padding="18"
    clickable
    specular
    role="button"
    tabindex="0"
    :aria-label="plugin.name"
    class="StoreItemCard group"
    @pointerenter="emit('prefetchDetail', plugin)"
    @focus="emit('prefetchDetail', plugin)"
    @click="viewDetails"
  >
    <div class="StoreItem-Inner">
      <div class="StoreItem-Header">
        <StorePluginIcon
          class="StoreItem-Icon"
          :icon-url="plugin.iconUrl"
          :name="plugin.name"
          :category="plugin.category"
          :size="46"
        />

        <div class="StoreItem-Heading">
          <div class="StoreItem-TitleRow">
            <h3 class="StoreItem-Title" :title="plugin.name">
              {{ plugin.name }}
            </h3>
            <span
              v-if="plugin.isOfficial"
              class="StoreItem-Official i-carbon-certificate"
              :title="t('store.badges.official')"
              aria-hidden="true"
            />
          </div>
          <p class="StoreItem-Slug" :title="plugin.slug">
            {{ plugin.slug }}
          </p>
        </div>

        <TxTag
          variant="plain"
          size="sm"
          :label="resolveCategoryLabel(plugin.category)"
          class="StoreItem-Category"
        />
      </div>

      <p class="StoreItem-Summary">
        {{ plugin.summary || '—' }}
      </p>

      <div class="StoreItem-Footer">
        <div class="StoreItem-Meta">
          <TxStatusBadge
            v-if="versionLabel"
            :text="versionLabel"
            :status="channelTone(plugin.latestVersion?.channel)"
            size="sm"
          />

          <span class="StoreItem-Stat" :title="t('store.stats.installs', { count: formatInstalls(plugin.installs) })">
            <span class="i-carbon-download" aria-hidden="true" />
            <span>{{ formatInstalls(plugin.installs) }}</span>
          </span>

          <span v-if="updatedDateText" class="StoreItem-Stat StoreItem-Stat--date">
            <span class="i-carbon-time" aria-hidden="true" />
            <span>{{ updatedDateText }}</span>
          </span>
        </div>

        <span class="StoreItem-OpenHint" aria-hidden="true">
          <span class="i-carbon-arrow-up-right" />
        </span>
      </div>
    </div>
  </TxCard>
</template>

<style scoped>
.StoreItemCard.tx-card {
  height: 100%;
  border: 1px solid rgba(15, 23, 42, 0.09);
  background: rgba(255, 255, 255, 0.86);
  transition:
    transform 200ms cubic-bezier(0.22, 1, 0.36, 1),
    border-color 200ms ease,
    background-color 200ms ease,
    box-shadow 200ms ease;
}

.StoreItemCard.tx-card:hover,
.StoreItemCard.tx-card:focus-visible {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 38%, rgba(15, 23, 42, 0.16));
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
  outline: none;
}

.dark .StoreItemCard.tx-card {
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(20, 23, 30, 0.78);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 10px 28px rgba(0, 0, 0, 0.28);
}

.dark .StoreItemCard.tx-card:hover,
.dark .StoreItemCard.tx-card:focus-visible {
  border-color: rgba(125, 180, 255, 0.34);
  background: rgba(26, 30, 40, 0.9);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 18px 40px rgba(0, 0, 0, 0.42);
}

.StoreItem-Inner {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
  height: 100%;
  min-width: 0;
}

.StoreItem-Header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

.StoreItemCard:hover :deep(.StorePluginIcon) {
  transform: scale(1.03);
}

.StoreItem-Heading {
  flex: 1;
  min-width: 0;
  padding-top: 1px;
}

.StoreItem-TitleRow {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.StoreItem-Title {
  margin: 0;
  font-size: 1rem;
  font-weight: 650;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--tx-text-color-primary, #0f172a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dark .StoreItem-Title {
  color: rgba(248, 250, 252, 0.96);
}

.StoreItem-Official {
  flex-shrink: 0;
  font-size: 0.95rem;
  color: #f59e0b;
}

.StoreItem-Slug {
  margin: 2px 0 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.72rem;
  line-height: 1.35;
  color: rgba(71, 85, 105, 0.78);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dark .StoreItem-Slug {
  color: rgba(148, 163, 184, 0.72);
}

.StoreItem-Category {
  flex-shrink: 0;
}

.StoreItem-Summary {
  margin: 0;
  min-height: 2.8em;
  font-size: 0.85rem;
  line-height: 1.5;
  color: rgba(51, 65, 85, 0.88);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.dark .StoreItem-Summary {
  color: rgba(226, 232, 240, 0.78);
}

.StoreItem-Footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid rgba(15, 23, 42, 0.06);
}

.dark .StoreItem-Footer {
  border-top-color: rgba(255, 255, 255, 0.07);
}

.StoreItem-Meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.StoreItem-Stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: rgba(71, 85, 105, 0.85);
}

.dark .StoreItem-Stat {
  color: rgba(148, 163, 184, 0.85);
}

.StoreItem-OpenHint {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  font-size: 0.9rem;
  color: rgba(100, 116, 139, 0.75);
  background: rgba(15, 23, 42, 0.04);
  transition: transform 180ms ease, color 180ms ease, background-color 180ms ease;
}

.dark .StoreItem-OpenHint {
  color: rgba(148, 163, 184, 0.78);
  background: rgba(255, 255, 255, 0.05);
}

.StoreItemCard:hover .StoreItem-OpenHint,
.StoreItemCard:focus-visible .StoreItem-OpenHint {
  transform: translate(1px, -1px);
  color: var(--tx-color-primary, #409eff);
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 16%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .StoreItemCard.tx-card,
  .StoreItem-OpenHint {
    transition: none;
  }

  .StoreItemCard.tx-card:hover {
    transform: none;
  }
}
</style>
