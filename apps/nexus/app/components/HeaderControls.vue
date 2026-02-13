<script setup lang="ts">
import { computed } from 'vue'
import { useGlobalSearch } from '~/composables/useGlobalSearch'

interface Props {
  githubUrl?: string
  showSearchButton?: boolean
  showDarkToggle?: boolean
  showLanguageToggle?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  githubUrl: '',
  showSearchButton: false,
  showDarkToggle: true,
  showLanguageToggle: true,
})

const { t } = useI18n()
const { summonSearch } = useGlobalSearch()

const searchButtonLabel = computed(() => t('search.open'))
const searchButtonAriaLabel = computed(() => t('search.openAria'))

async function onSearchClick(event: MouseEvent) {
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  await summonSearch(target)
}
</script>

<template>
  <div
    class="HeaderControls flex items-center justify-end gap-2 overflow-hidden text-sm"
  >
    <div
      v-if="props.showSearchButton"
      class="relative w-full sm:w-auto"
    >
      <button
        type="button"
        class="w-full inline-flex items-center justify-between gap-3 border border-transparent rounded-full bg-white/85 px-4 py-2 text-left text-black/70 font-medium shadow-[0_8px_18px_rgba(18,18,24,0.06)] transition hover:border-primary/20 dark:bg-dark/80 hover:bg-white dark:text-light/75 hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 dark:hover:bg-dark/70 dark:hover:text-light dark:focus-visible:ring-light/25"
        :aria-label="searchButtonAriaLabel"
        data-role="global-search-trigger"
        @click="onSearchClick"
      >
        <span class="flex items-center gap-2">
          <span class="i-carbon-search text-lg" />
          <span>{{ searchButtonLabel }}</span>
        </span>
        <kbd class="hidden border border-primary/10 rounded bg-dark/5 px-2 py-0.5 text-xs text-black/60 sm:inline-flex dark:border-light/15 dark:bg-light/10 dark:text-light/60">
          /
        </kbd>
      </button>
    </div>

    <div class="relative flex items-center gap-[1.5] sm:ml-auto">
      <template v-if="props.showLanguageToggle">
        <LanguageToggle />
      </template>
      <div
        v-if="props.showLanguageToggle && (props.showDarkToggle || props.githubUrl)"
        class="mx-2 block h-6 w-[1px] bg-black/10 dark:bg-white/10"
      />
      <DarkToggle v-if="props.showDarkToggle" />
      <div
        v-if="props.showDarkToggle && props.githubUrl"
        class="mx-2 block h-6 w-[1px] bg-black/10 dark:bg-white/10"
      />
      <div
        v-if="props.githubUrl && !props.showDarkToggle && !props.showLanguageToggle"
        class="mx-2 block h-6 w-[1px] bg-black/10 dark:bg-white/10"
      />
      <a
        v-if="props.githubUrl"
        :href="props.githubUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-2 rounded-full text-sm text-black font-semibold transition dark:text-white focus-visible:outline-none"
      >
        <span class="i-carbon-logo-github text-lg" />
      </a>
    </div>
  </div>
</template>
