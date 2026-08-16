<script setup lang="ts">
import { TxDropdownItem, TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { TxIconButton } from '@talex-touch/tuffex/icon-button'
import { computed, ref } from 'vue'
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

/**
 * TxDropdownItem's own `select` event carries no payload, but `toggleDark`
 * needs the click coordinates to originate the View Transition ripple — so read
 * them off the native click, which Vue merges alongside the item's handler.
 */
function selectTheme(mode: ThemeMode, event: MouseEvent) {
  toggleDark(mode, event)
}

</script>

<template>
  <div class="DarkToggle">
    <TxDropdownMenu
      v-model="isOpen"
      trigger="hover"
      placement="bottom-end"
      :offset="10"
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
    </TxDropdownMenu>
  </div>
</template>

<style scoped>
.DarkToggle {
  display: inline-flex;
  align-items: center;
}

.DarkToggle-Check {
  font-size: 0.95rem;
  opacity: 0.85;
}
</style>
