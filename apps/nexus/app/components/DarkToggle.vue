<script setup lang="ts">
import { computed } from 'vue'
import HeaderIconButton from '~/components/HeaderIconButton.vue'
import { useLazyDropdownMenu } from '~/composables/useLazyMenu'
import { useTheme } from '~/composables/useTheme'

const {
  isOpen,
  menuActivated,
  activateMenu,
  TxDropdownMenu,
  TxDropdownItem,
} = useLazyDropdownMenu()

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
 * Theme switching needs the native click coordinates for the View Transition
 * ripple. That ripple is already the stronger immediate confirmation, so this
 * item explicitly skips the menu-row blink instead of changing the theme under
 * a menu that stays open for another 180 ms.
 */
function selectTheme(mode: ThemeMode, event: MouseEvent) {
  toggleDark(mode, event)
}

</script>

<template>
  <div class="DarkToggle">
    <TxDropdownMenu
      v-if="menuActivated"
      v-model="isOpen"
      trigger="hover"
      placement="bottom-end"
      :offset="10"
    >
      <template #trigger>
        <HeaderIconButton
          icon="i-carbon-moon"
          :label="triggerAriaLabel"
          :title="triggerTitle"
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
          :activation-feedback="false"
          @click="selectTheme(option.value, $event)"
        >
          {{ optionLabel(option) }}

          <template v-if="selectedMode === option.value" #right>
            <span class="i-carbon-checkmark DarkToggle-Check" aria-hidden="true" />
          </template>
        </TxDropdownItem>
    </TxDropdownMenu>
    <HeaderIconButton
      v-else
      icon="i-carbon-moon"
      :label="triggerAriaLabel"
      :title="triggerTitle"
      class="DarkToggle-Trigger"
      aria-haspopup="menu"
      :aria-expanded="isOpen"
      @pointerenter="activateMenu()"
      @focus="activateMenu()"
      @click="activateMenu(true)"
    />
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
