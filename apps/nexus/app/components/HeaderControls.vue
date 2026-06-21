<script setup lang="ts">
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
  <div class="HeaderControls flex items-center justify-end gap-2 text-sm">
    <div
      v-if="props.showSearchButton"
      class="relative"
    >
      <button
        type="button"
        class="HeaderControls-IconButton"
        :aria-label="searchButtonAriaLabel"
        :title="searchButtonLabel"
        data-role="global-search-trigger"
        @click="onSearchClick"
      >
        <span class="i-carbon-search" aria-hidden="true" />
      </button>
    </div>

    <div class="relative flex items-center gap-1 sm:ml-auto">
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
.HeaderControls-IconButton {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(20, 22, 24, 0.72);
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    box-shadow 160ms ease;
}

.HeaderControls-IconButton:hover,
.HeaderControls-IconButton:focus-visible {
  background: rgba(20, 22, 24, 0.06);
  color: rgba(20, 22, 24, 0.92);
  outline: none;
}

.HeaderControls-Divider {
  display: inline-block;
  width: 1px;
  height: 20px;
  min-height: 20px;
  margin: 0 10px 0 8px;
  background: rgba(0, 0, 0, 0.1);
}

.dark .HeaderControls-IconButton {
  color: rgba(248, 250, 247, 0.72);
}

.dark .HeaderControls-IconButton:hover,
.dark .HeaderControls-IconButton:focus-visible {
  background: rgba(248, 250, 247, 0.09);
  color: rgba(248, 250, 247, 0.92);
}

.dark .HeaderControls-Divider {
  background: rgba(255, 255, 255, 0.12);
}
</style>
