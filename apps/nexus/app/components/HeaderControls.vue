<script setup lang="ts">
import { computed } from 'vue'
import { TxButton } from '@talex-touch/tuffex/button'
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
const { openSearch } = useGlobalSearch()

const searchButtonLabel = computed(() => t('search.open'))
const searchButtonAriaLabel = computed(() => t('search.openAria'))

async function onSearchClick(event: MouseEvent) {
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  openSearch(target)
}
</script>

<template>
  <div class="HeaderControls flex items-center justify-end gap-2 text-sm">
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

    <div class="relative flex items-center gap-1 sm:ml-auto">
      <TxDivider
        v-if="props.showLanguageToggle"
        direction="vertical"
        class="HeaderControls-Divider"
      />
      <template v-if="props.showLanguageToggle">
        <LanguageToggle />
      </template>
      <DarkToggle v-if="props.showDarkToggle" />
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

<style scoped>
.HeaderControls-Divider {
  height: 20px;
  min-height: 20px;
  margin: 0 10px 0 8px;
  --tx-divider-color: rgba(0, 0, 0, 0.1);
}

.dark .HeaderControls-Divider {
  --tx-divider-color: rgba(255, 255, 255, 0.12);
}
</style>
