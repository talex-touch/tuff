<script setup lang="ts">
import { autoUpdate, offset, useFloating } from '@floating-ui/vue'
import { hasDocument } from '@talex-touch/utils/env'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useTheme } from '~/composables/useTheme'

type ThemeMode = 'auto' | 'dark' | 'light'

interface ThemeOption {
  value: ThemeMode
  labelKey: string
}

const themeOptions: ThemeOption[] = [
  { value: 'dark', labelKey: 'ui.themeToggle.dark' },
  { value: 'light', labelKey: 'ui.themeToggle.light' },
  { value: 'auto', labelKey: 'ui.themeToggle.auto' },
]

const { color, toggleDark } = useTheme()
const { t } = useI18n()
const isMounted = ref(false)
const isOpen = ref(false)
const isMenuRequested = ref(false)
const reference = ref<HTMLElement | null>(null)
const floating = ref<HTMLElement | null>(null)

const { floatingStyles } = useFloating(reference, floating, {
  placement: 'bottom-end',
  middleware: [offset(10)],
  whileElementsMounted: autoUpdate,
})

useHead({
  meta: [{
    id: 'theme-color',
    name: 'theme-color',
    content: () => color.value === 'dark' ? '#222222' : '#ffffff',
  }],
})

const isDark = computed(() => color.value === 'dark')
const selectedMode = computed<ThemeMode>(() => {
  const preference = color.preference
  return preference === 'dark' || preference === 'light' || preference === 'auto' ? preference : 'auto'
})
const selectedLabel = computed(() => t(`ui.themeToggle.${selectedMode.value}`))
const triggerTitle = computed(() => t('ui.themeToggle.title'))
const triggerAriaLabel = computed(() => t('ui.themeToggle.selectMode', { mode: selectedLabel.value }))

function optionLabel(option: ThemeOption) {
  return t(option.labelKey)
}

function requestMenu() {
  isMenuRequested.value = true
}

function openMenu() {
  requestMenu()
  isOpen.value = true
}

function closeMenu() {
  isOpen.value = false
}

function toggleMenu() {
  if (isOpen.value) {
    closeMenu()
    return
  }
  openMenu()
}

function targetInsideDropdown(target: EventTarget | null) {
  if (!(target instanceof Node))
    return false
  return Boolean(reference.value?.contains(target) || floating.value?.contains(target))
}

function removeDocumentListeners() {
  if (!hasDocument())
    return
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!targetInsideDropdown(event.target))
    closeMenu()
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape')
    return
  closeMenu()
  reference.value?.focus()
}

function selectTheme(mode: ThemeMode, event: MouseEvent) {
  toggleDark(mode, event)
  closeMenu()
  reference.value?.focus()
}

watch(isOpen, (open) => {
  removeDocumentListeners()
  if (!open || !hasDocument())
    return
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onMounted(() => {
  isMounted.value = true
})

onBeforeUnmount(() => {
  removeDocumentListeners()
})
</script>

<template>
  <div class="DarkToggle">
    <span class="DarkToggle-Reference">
      <button
        v-if="isMounted"
        ref="reference"
        type="button"
        class="DarkToggle-Trigger"
        :class="{ 'is-dark': isDark }"
        :aria-label="triggerAriaLabel"
        :aria-expanded="isOpen"
        aria-haspopup="menu"
        :title="triggerTitle"
        @click="toggleMenu"
        @focus="requestMenu"
      >
        <span class="DarkToggle-Icon i-carbon-moon" aria-hidden="true" />
        <span class="DarkToggle-Label">{{ selectedLabel }}</span>
        <span class="DarkToggle-Chevron i-carbon-chevron-down" :class="{ 'rotate-180': isOpen }" aria-hidden="true" />
      </button>
      <div v-else class="DarkToggle-Trigger" aria-hidden="true">
        <span class="DarkToggle-Icon i-carbon-moon" aria-hidden="true" />
        <span class="DarkToggle-Label">{{ t('ui.themeToggle.auto') }}</span>
        <span class="DarkToggle-Chevron i-carbon-chevron-down" aria-hidden="true" />
      </div>
    </span>

    <ClientOnly>
      <teleport to="body">
        <div
          v-if="isMenuRequested"
          ref="floating"
          :class="{ display: isOpen }"
          :style="floatingStyles"
          class="DarkToggle-Floating absolute z-10"
        >
          <ul class="DarkToggle-List" role="menu" :aria-label="triggerTitle">
            <li v-for="option in themeOptions" :key="option.value" role="presentation">
              <button
                type="button"
                class="DarkToggle-Item"
                :class="{ 'DarkToggle-Item--active': selectedMode === option.value }"
                role="menuitemradio"
                :aria-checked="selectedMode === option.value"
                @click="selectTheme(option.value, $event)"
              >
                <span>{{ optionLabel(option) }}</span>
                <span
                  v-if="selectedMode === option.value"
                  class="DarkToggle-Check i-carbon-checkmark"
                  aria-hidden="true"
                />
              </button>
            </li>
          </ul>
        </div>
      </teleport>
    </ClientOnly>
  </div>
</template>

<style scoped>
.DarkToggle,
.DarkToggle-Reference {
  display: inline-flex;
  align-items: center;
}

.DarkToggle-Trigger {
  display: inline-flex;
  min-width: 84px;
  height: 34px;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  background: rgba(242, 244, 247, 0.94);
  color: rgba(20, 22, 24, 0.92);
  cursor: pointer;
  font: inherit;
  line-height: 1;
  white-space: nowrap;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    box-shadow 160ms ease;
}

.DarkToggle-Trigger:hover,
.DarkToggle-Trigger:focus-visible,
.DarkToggle-Trigger[aria-expanded='true'] {
  background: rgba(236, 239, 244, 1);
  box-shadow: 0 0 0 3px rgba(20, 22, 24, 0.06);
  outline: none;
}

.DarkToggle-Trigger.is-dark {
  background: rgba(33, 35, 37, 0.82);
  color: rgba(248, 250, 247, 0.92);
}

.dark .DarkToggle-Trigger {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(248, 250, 247, 0.92);
}

.dark .DarkToggle-Trigger:hover,
.dark .DarkToggle-Trigger:focus-visible,
.dark .DarkToggle-Trigger[aria-expanded='true'] {
  background: rgba(255, 255, 255, 0.15);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.08);
}

.DarkToggle-Icon {
  font-size: 1rem;
}

.DarkToggle-Label {
  font-size: 0.78rem;
  font-weight: 600;
}

.DarkToggle-Chevron {
  font-size: 0.78rem;
  transition: transform 160ms ease;
}

.DarkToggle-Floating {
  display: none;
  pointer-events: none;
  z-index: 10020;
}

.DarkToggle-Floating .DarkToggle-List {
  opacity: 0;
  filter: blur(10px);
  transform: scale(0.96) translateY(-6px);
  transform-origin: top right;
  transition:
    opacity 160ms ease,
    filter 180ms ease,
    transform 180ms ease;
}

.DarkToggle-Floating.display {
  display: block;
  pointer-events: auto;
}

.DarkToggle-Floating.display .DarkToggle-List {
  opacity: 1;
  filter: blur(0);
  transform: scale(1) translateY(0);
}

.DarkToggle-List {
  display: grid;
  width: 132px;
  margin: 0;
  padding: 0.45rem;
  list-style: none;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  background: #252525;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
  color: #f6f6f2;
}

.DarkToggle-Item {
  display: flex;
  width: 100%;
  min-height: 34px;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border: 0;
  border-radius: 12px;
  padding: 0 0.7rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-size: 0.9rem;
  line-height: 1;
  text-align: left;
  transition: background 140ms ease, color 140ms ease;
}

.DarkToggle-Item:hover,
.DarkToggle-Item:focus-visible {
  background: rgba(255, 255, 255, 0.08);
  outline: none;
}

.DarkToggle-Item--active {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.06);
}

.DarkToggle-Check {
  flex: 0 0 auto;
  font-size: 0.95rem;
}
</style>
