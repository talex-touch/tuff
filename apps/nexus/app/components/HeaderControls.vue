<script setup lang="ts">
import { computed } from 'vue'
import { TxButton } from '@talex-touch/tuffex'
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
      class="relative"
    >
      <TxButton
        circle
        variant="ghost"
        icon="i-carbon-search"
        :aria-label="searchButtonAriaLabel"
        :title="searchButtonLabel"
        data-role="global-search-trigger"
        @click="onSearchClick"
      />
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
