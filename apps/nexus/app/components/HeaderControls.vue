<script setup lang="ts">
import { onClickOutside, useEventListener } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

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

const { locale } = useI18n()

const _searchButtonLabel = computed(() => locale.value === 'zh' ? '搜索文档' : 'Search docs')

const _searchButtonAriaLabel = computed(() => locale.value === 'zh' ? '打开文档搜索' : 'Open docs search')

const isSearchOpen = ref(false)
const searchButtonRef = ref<HTMLElement | null>(null)
const searchPanelRef = ref<HTMLElement | null>(null)
let stopClickOutside: (() => void) | null = null

function _toggleSearch() {
  if (!props.showSearchButton)
    return
  isSearchOpen.value = !isSearchOpen.value
}

function _onSearchPanelClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('a'))
    isSearchOpen.value = false
}

watch(() => props.showSearchButton, (value) => {
  if (!value)
    isSearchOpen.value = false
  registerClickOutside()
})

watch(isSearchOpen, (open) => {
  if (!open)
    return
  nextTick(() => {
    const input = searchPanelRef.value?.querySelector('input')
    if (input instanceof HTMLInputElement)
      input.focus()
  })
})

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape')
    isSearchOpen.value = false
})

function registerClickOutside() {
  stopClickOutside?.()
  stopClickOutside = null

  if (!props.showSearchButton)
    return

  if (!searchPanelRef.value)
    return

  stopClickOutside = onClickOutside(searchPanelRef, () => {
    isSearchOpen.value = false
  }, { ignore: [searchButtonRef] })
}

onMounted(() => {
  registerClickOutside()
})

watch([searchButtonRef, searchPanelRef], () => {
  registerClickOutside()
})

onBeforeUnmount(() => {
  stopClickOutside?.()
  stopClickOutside = null
})
</script>

<template>
  <div
    class="HeaderControls flex items-center justify-end gap-2 overflow-hidden text-sm"
  >
    <!-- <div
      v-if="props.showSearchButton"
      class="relative w-full sm:w-auto"
    >
      <button
        ref="searchButtonRef"
        type="button"
        class="w-full inline-flex items-center justify-between gap-3 border border-transparent rounded-full bg-white/85 px-4 py-2 text-left text-black/70 font-medium shadow-[0_8px_18px_rgba(18,18,24,0.06)] transition hover:border-primary/20 dark:bg-dark/80 hover:bg-white dark:text-light/75 hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 dark:hover:bg-dark/70 dark:hover:text-light dark:focus-visible:ring-light/25"
        :aria-label="searchButtonAriaLabel"
        @click="toggleSearch"
      >
        <span class="flex items-center gap-2">
          <span class="i-carbon-search text-lg" />
          <span>{{ searchButtonLabel }}</span>
        </span>
        <kbd class="hidden border border-primary/10 rounded bg-dark/5 px-2 py-0.5 text-xs text-black/60 sm:inline-flex dark:border-light/15 dark:bg-light/10 dark:text-light/60">
          /
        </kbd>
      </button>

      <transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="transform -translate-y-2 opacity-0"
        enter-to-class="transform translate-y-0 opacity-100"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="transform translate-y-0 opacity-100"
        leave-to-class="transform -translate-y-2 opacity-0"
      >
        <div
          v-if="isSearchOpen"
          ref="searchPanelRef"
          class="absolute right-0 top-[calc(100%+0.75rem)] z-30 w-[min(380px,85vw)] border border-primary/10 rounded-3xl bg-white/95 p-4 shadow-[0_20px_40px_rgba(18,18,28,0.18)] backdrop-blur-2xl dark:border-light/15 dark:bg-dark/90 dark:shadow-[0_24px_48px_rgba(0,0,0,0.65)]"
          @click="onSearchPanelClick"
        >
          <Search />
        </div>
      </transition>
    </div> -->

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

<style scoped>
</style>
