<script lang="ts" setup>
import type { MarketplacePluginSummary } from '~/types/marketplace'
import { useMarketCategories } from '~/composables/useMarketCategories'
import { useMarketFormatters } from '~/composables/useMarketFormatters'

const props = defineProps<{
  plugin: MarketplacePluginSummary
}>()

const emit = defineEmits<{
  (event: 'viewDetail', plugin: MarketplacePluginSummary): void
}>()

const { t } = useI18n()
const { resolveCategoryLabel } = useMarketCategories()
const { formatDate, formatInstalls } = useMarketFormatters()

function viewDetails() {
  emit('viewDetail', props.plugin)
}
</script>

<template>
  <article
    class="group flex flex-col justify-between rounded-3xl bg-white/60 p-4 dark:bg-dark/30"
    @click="viewDetails"
  >
    <div class="space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-4">
          <span class="size-12 flex flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-dark/10 text-black dark:bg-light/10 dark:text-light">
            <img
              v-if="plugin.iconUrl"
              :src="plugin.iconUrl"
              :alt="`${plugin.name} icon`"
              class="h-full w-full object-cover"
            >
            <span v-else class="text-xl font-semibold">
              {{ plugin.name.charAt(0) }}
            </span>
          </span>
          <div>
            <h3 class="m-0 flex items-center gap-2 text-lg text-black font-semibold dark:text-light">
              <div class="size-5 flex items-center justify-center rounded-full bg-primary/80" :alt="t('market.badges.official')" aria-hidden="true">
                <span v-if="plugin.isOfficial" class="i-carbon-badge block text-sm text-white" />
              </div>
              {{ plugin.name }}
            </h3>
            <p class="line-clamp-3 m-0 text-sm text-black/70 leading-relaxed dark:text-light/80">
              {{ plugin.summary }}
            </p>
            <p class="m-0 text-[11px] text-black/50 font-semibold tracking-[0.35em] uppercase dark:text-light/60" />
          </div>
        </div>
        <span class="inline-flex items-center gap-1 rounded-full bg-dark/5 px-2 py-1 text-[10px] text-black/80 font-semibold dark:bg-light/10 dark:text-light/80">
          {{ resolveCategoryLabel(plugin.category) }}
          <!-- <span class="i-carbon-badge text-sm" aria-hidden="true" />
          <template v-if="plugin.isOfficial">
            {{ t('market.badges.official') }}
          </template>
          <template v-else-if="plugin.author">
            {{ plugin.author.name }}
          </template>
          <template v-else>
            {{ t('market.badges.community', 'Community') }}
          </template> -->
        </span>
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
        <span
          v-if="plugin.latestVersion"
          class="inline-flex items-center gap-1 rounded-full bg-dark/10 px-2 py-1 dark:bg-light/10 dark:text-light/80"
        >
          <span class="i-carbon-skill-level text-sm" aria-hidden="true" />
          {{ plugin.latestVersion.channel }}
        </span>
        <span class="inline-flex items-center gap-1 rounded-full bg-dark/10 px-2 py-1 dark:bg-light/10 dark:text-light/80">
          <span class="i-carbon-user-multiple text-sm" aria-hidden="true" />
          {{ t('dashboard.sections.plugins.stats.installs', { count: formatInstalls(plugin.installs) }) }}
        </span>
      </div>

      <div
        v-if="plugin.badges.length"
        class="flex flex-wrap gap-2"
      >
        <span
          v-for="badge in plugin.badges"
          :key="badge"
          class="inline-flex items-center gap-1 border border-primary/15 rounded-full px-2 py-0.5 text-[10px] text-black/60 tracking-[0.35em] uppercase dark:border-light/20 dark:text-light/70"
        >
          <span class="i-carbon-tag text-xs" aria-hidden="true" />
          {{ badge }}
        </span>
      </div>
    </div>
  </article>
</template>
