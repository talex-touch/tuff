<script setup lang="ts">
import { TxIconButton } from '@talex-touch/tuffex/icon-button'
import { computed } from 'vue'
import { useGlobalSearchState } from '~/composables/useGlobalSearchState'

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
const { summonSearch } = useGlobalSearchState()

const searchButtonLabel = computed(() => t('search.open'))
const searchButtonAriaLabel = computed(() => t('search.openAria'))

async function onSearchClick(event: MouseEvent) {
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  await summonSearch(target)
}
</script>

<template>
  <div class="HeaderControls flex shrink-0 items-center justify-end gap-2 text-sm">
    <div
      v-if="props.showSearchButton"
      class="relative"
    >
      <TxIconButton
        icon="i-carbon-search"
        :label="searchButtonAriaLabel"
        :title="searchButtonLabel"
        size="sm"
        shape="circle"
        data-role="global-search-trigger"
        @click="onSearchClick"
      />
    </div>

    <div class="relative flex shrink-0 items-center gap-1 sm:ml-auto">
      <span
        v-if="props.showLanguageToggle"
        class="HeaderControls-Divider"
        aria-hidden="true"
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
  display: inline-block;
  width: 1px;
  height: 20px;
  min-height: 20px;
  margin: 0 10px 0 8px;
  background: rgba(0, 0, 0, 0.1);
}

.dark .HeaderControls-Divider {
  background: rgba(255, 255, 255, 0.12);
}
</style>
