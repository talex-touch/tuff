<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref } from 'vue'

const { locale, t } = useI18n()
const LazyLanguageToggleMenu = defineAsyncComponent(() => import('./LanguageToggleMenu.vue'))

const nextLocale = computed(() => (locale.value === 'zh' ? 'en' : 'zh'))
const ariaLabel = computed(() =>
  t(nextLocale.value === 'zh' ? 'ui.languageToggle.switchToZh' : 'ui.languageToggle.switchToEn'),
)
const tooltipLabel = computed(() =>
  t(nextLocale.value === 'zh' ? 'ui.languageToggle.zhLabel' : 'ui.languageToggle.enLabel'),
)

const reference = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const isMenuRequested = ref(false)

// Hover-out is forgiving: keep the menu around for 600ms so the pointer can
// travel into it (or come back) before it dissolves away.
const CLOSE_DELAY = 600
let closeTimer: ReturnType<typeof setTimeout> | null = null

function clearCloseTimer() {
  if (closeTimer != null) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
}

function openMenu() {
  clearCloseTimer()
  isMenuRequested.value = true
  isOpen.value = true
}

function requestMenu() {
  isMenuRequested.value = true
}

function closeMenu() {
  clearCloseTimer()
  closeTimer = setTimeout(() => {
    isOpen.value = false
  }, CLOSE_DELAY)
}

// Selecting a language should dismiss immediately — no lingering delay.
function closeMenuNow() {
  clearCloseTimer()
  isOpen.value = false
}

function handleTriggerClick() {
  clearCloseTimer()
  isMenuRequested.value = true
  isOpen.value = true
}

onBeforeUnmount(clearCloseTimer)
</script>

<template>
  <div class="LanguageToggle relative" @mouseenter="openMenu" @mouseleave="closeMenu">
    <span ref="reference" class="LanguageToggle-Reference">
      <button
        type="button"
        :title="tooltipLabel"
        :aria-pressed="isOpen"
        :aria-expanded="isOpen"
        :aria-label="ariaLabel"
        class="LanguageToggle-Trigger"
        @click="handleTriggerClick"
        @focus="requestMenu"
      >
        <span class="LanguageToggle-Icon i-carbon-language" aria-hidden="true" />
        <span class="LanguageToggle-Chevron i-carbon-chevron-down" :class="{ 'rotate-180': isOpen }" aria-hidden="true" />
      </button>
    </span>
    <ClientOnly>
      <LazyLanguageToggleMenu
        v-if="isMenuRequested"
        :open="isOpen"
        :reference-el="reference"
        @open="openMenu"
        @close="closeMenu"
        @selected="closeMenuNow"
      />
    </ClientOnly>
  </div>
</template>

<style scoped>
.LanguageToggle-Reference {
  display: inline-flex;
}

.LanguageToggle-Trigger {
  display: inline-flex;
  min-width: 56px;
  height: 34px;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(20, 22, 24, 0.92);
  cursor: pointer;
  font: inherit;
  line-height: 1;
  padding: 0 12px;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    box-shadow 160ms ease;
}

.LanguageToggle-Trigger:hover,
.LanguageToggle-Trigger:focus-visible,
.LanguageToggle-Trigger[aria-expanded='true'] {
  background: rgba(20, 22, 24, 0.06);
  outline: none;
}

.dark .LanguageToggle-Trigger {
  color: rgba(248, 250, 247, 0.92);
}

.dark .LanguageToggle-Trigger:hover,
.dark .LanguageToggle-Trigger:focus-visible,
.dark .LanguageToggle-Trigger[aria-expanded='true'] {
  background: rgba(248, 250, 247, 0.09);
  outline: none;
}

.LanguageToggle-Icon {
  font-size: 1.15rem;
}

.LanguageToggle-Chevron {
  font-size: 0.82rem;
  transition: transform 160ms ease;
}
</style>
