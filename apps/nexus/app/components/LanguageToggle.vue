<script setup lang="ts">
import { TxDropdownItem, TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { TxIconButton } from '@talex-touch/tuffex/icon-button'
import { computed, onBeforeUnmount, ref } from 'vue'

type SupportedLocale = 'zh' | 'en'

interface LanguageOption {
  code: SupportedLocale | 'fr' | 'ru' | 'ja' | 'vi'
  label: string
}

const languageOptions: LanguageOption[] = [
  { code: 'zh', label: '简体中文' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'ru', label: 'Русский' },
  { code: 'ja', label: '日本語' },
  { code: 'vi', label: 'Tiếng Việt' },
]

const { locale, t } = useI18n()
const { setManualLocale } = useLocaleOrchestrator()
const isOpen = ref(false)

// Hover-out is forgiving: keep the menu around long enough for the pointer to
// travel into the teleported panel (or come back) before it dissolves away.
const CLOSE_DELAY = 600
let closeTimer: ReturnType<typeof setTimeout> | null = null

const nextLocale = computed(() => (locale.value === 'zh' ? 'en' : 'zh'))
const triggerAriaLabel = computed(() =>
  t(nextLocale.value === 'zh' ? 'ui.languageToggle.switchToZh' : 'ui.languageToggle.switchToEn'),
)
const triggerTitle = computed(() =>
  t(nextLocale.value === 'zh' ? 'ui.languageToggle.zhLabel' : 'ui.languageToggle.enLabel'),
)

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

async function selectLocale(option: LanguageOption) {
  if (option.code === 'zh' || option.code === 'en')
    await setManualLocale(option.code)
}

onBeforeUnmount(clearCloseTimer)
</script>

<template>
  <div class="LanguageToggle" @mouseenter="openMenu" @mouseleave="closeMenu">
    <TxDropdownMenu
      v-model="isOpen"
      placement="bottom-end"
      :offset="10"
      :min-width="150"
      :panel-padding="0"
    >
      <template #trigger>
        <TxIconButton
          icon="i-carbon-language"
          :label="triggerAriaLabel"
          :title="triggerTitle"
          size="sm"
          shape="circle"
          class="LanguageToggle-Trigger"
          aria-haspopup="menu"
          :aria-expanded="isOpen"
        />
      </template>

      <div class="LanguageToggle-Options" @mouseenter="openMenu" @mouseleave="closeMenu">
        <TxDropdownItem
          v-for="option in languageOptions"
          :key="option.code"
          role="menuitemradio"
          :aria-checked="locale === option.code"
          @click="selectLocale(option)"
        >
          {{ option.label }}

          <template v-if="locale === option.code" #right>
            <span class="i-carbon-checkmark LanguageToggle-Check" aria-hidden="true" />
          </template>
        </TxDropdownItem>
      </div>
    </TxDropdownMenu>
  </div>
</template>

<style scoped>
.LanguageToggle {
  display: inline-flex;
  align-items: center;
}

/* Reproduces .tx-dropdown__panel's own layout: the wrapper only exists so the
   teleported panel can re-assert hover while the pointer is inside it. */
.LanguageToggle-Options {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.LanguageToggle-Check {
  font-size: 0.95rem;
  opacity: 0.85;
}
</style>
