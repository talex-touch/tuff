<script setup lang="ts">
import { TxDropdownItem, TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { TxIconButton } from '@talex-touch/tuffex/icon-button'
import { computed, onBeforeUnmount, ref } from 'vue'
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
const isOpen = ref(false)

// Hover-out is forgiving: keep the menu around long enough for the pointer to
// travel into the teleported panel (or come back) before it dissolves away.
const CLOSE_DELAY = 600
let closeTimer: ReturnType<typeof setTimeout> | null = null

useHead({
  meta: [{
    id: 'theme-color',
    name: 'theme-color',
    content: () => color.value === 'dark' ? '#222222' : '#ffffff',
  }],
})

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

function clearCloseTimer() {
  if (closeTimer != null) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
}

function openMenu() {
  clearCloseTimer()
  isOpen.value = true
}

function closeMenu() {
  clearCloseTimer()
  closeTimer = setTimeout(() => {
    isOpen.value = false
  }, CLOSE_DELAY)
}

/**
 * TxDropdownItem's own `select` event carries no payload, but `toggleDark`
 * needs the click coordinates to originate the View Transition ripple — so read
 * them off the native click, which Vue merges alongside the item's handler.
 */
function selectTheme(mode: ThemeMode, event: MouseEvent) {
  toggleDark(mode, event)
}

onBeforeUnmount(clearCloseTimer)
</script>

<template>
  <div class="DarkToggle" @mouseenter="openMenu" @mouseleave="closeMenu">
    <TxDropdownMenu
      v-model="isOpen"
      placement="bottom-end"
      :offset="10"
      :min-width="150"
      :panel-padding="0"
    >
      <template #trigger>
        <TxIconButton
          icon="i-carbon-moon"
          :label="triggerAriaLabel"
          :title="triggerTitle"
          size="sm"
          shape="circle"
          class="DarkToggle-Trigger"
          aria-haspopup="menu"
          :aria-expanded="isOpen"
        />
      </template>

      <div class="DarkToggle-Options" @mouseenter="openMenu" @mouseleave="closeMenu">
        <TxDropdownItem
          v-for="option in themeOptions"
          :key="option.value"
          role="menuitemradio"
          :aria-checked="selectedMode === option.value"
          @click="selectTheme(option.value, $event)"
        >
          {{ optionLabel(option) }}

          <template v-if="selectedMode === option.value" #right>
            <span class="i-carbon-checkmark DarkToggle-Check" aria-hidden="true" />
          </template>
        </TxDropdownItem>
      </div>
    </TxDropdownMenu>
  </div>
</template>

<style scoped>
.DarkToggle {
  display: inline-flex;
  align-items: center;
}

/* Reproduces .tx-dropdown__panel's own layout: the wrapper only exists so the
   teleported panel can re-assert hover while the pointer is inside it. */
.DarkToggle-Options {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.DarkToggle-Check {
  font-size: 0.95rem;
  opacity: 0.85;
}
</style>
