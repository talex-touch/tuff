<script setup lang="ts">
import type { DashboardPlugin as Plugin, DashboardPluginVersion as PluginVersion } from '~/types/dashboard-plugin'

export interface PendingReviewItem {
  type: 'plugin' | 'version'
  plugin: Plugin
  version?: PluginVersion
}

interface Props {
  items: PendingReviewItem[]
  collapsed?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  collapsed: false,
})

const emit = defineEmits<{
  (e: 'review', item: PendingReviewItem): void
}>()

const { t } = useI18n()

const isExpanded = ref(!props.collapsed)

function toggleExpand() {
  isExpanded.value = !isExpanded.value
}
</script>

<template>
  <div
    v-if="items.length"
    class="rounded-2xl border border-amber-200/50 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-500/5"
  >
    <!-- Header -->
    <button
      type="button"
      class="flex w-full items-center justify-between p-4 text-left"
      @click="toggleExpand"
    >
      <div class="flex items-center gap-3">
        <div class="flex size-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/20">
          <span class="i-carbon-pending text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h3 class="text-sm font-semibold text-black dark:text-white">
            {{ t('dashboard.sections.plugins.pendingReviews') }}
          </h3>
          <p class="text-xs text-black/50 dark:text-white/50">
            {{ t('dashboard.sections.plugins.pendingReviewsCount', { count: items.length }) }}
          </p>
        </div>
      </div>
      <span
        class="i-carbon-chevron-down text-black/40 transition dark:text-white/40"
        :class="{ 'rotate-180': isExpanded }"
      />
    </button>

    <!-- Content -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div v-if="isExpanded" class="border-t border-amber-200/50 p-4 dark:border-amber-500/20">
        <div class="space-y-2">
          <button
            v-for="item in items"
            :key="item.type === 'version' ? `v-${item.version?.id}` : `p-${item.plugin.id}`"
            type="button"
            class="group flex w-full items-center gap-3 rounded-xl bg-white/80 p-3 text-left transition hover:bg-white dark:bg-white/5 dark:hover:bg-white/10"
            @click="emit('review', item)"
          >
            <!-- Icon -->
            <div class="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-black/5 bg-black/5 dark:border-white/10 dark:bg-white/10">
              <img
                v-if="item.plugin.iconUrl"
                :src="item.plugin.iconUrl"
                :alt="item.plugin.name"
                class="size-full object-cover"
              >
              <span v-else class="text-sm font-semibold text-black/60 dark:text-white/60">
                {{ item.plugin.name.charAt(0).toUpperCase() }}
              </span>
            </div>

            <!-- Info -->
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate text-sm font-medium text-black dark:text-white">
                  {{ item.plugin.name }}
                </span>
                <span
                  v-if="item.type === 'version' && item.version"
                  class="shrink-0 rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-medium text-black/60 dark:bg-white/10 dark:text-white/60"
                >
                  v{{ item.version.version }}
                </span>
              </div>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ item.type === 'plugin' ? t('dashboard.sections.plugins.reviewPlugin') : t('dashboard.sections.plugins.reviewVersion') }}
              </p>
            </div>

            <!-- Action -->
            <span class="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 transition group-hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:group-hover:bg-amber-500/30">
              <span class="i-carbon-view text-xs" />
              {{ t('dashboard.sections.plugins.viewDetails') }}
            </span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
