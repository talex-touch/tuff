<script setup lang="ts">
import { autoUpdate, offset, useFloating } from '@floating-ui/vue'
import { computed, ref } from 'vue'
import Icon from './icon/Icon.vue'

const { locale, t } = useI18n()
const { setManualLocale } = useLocaleOrchestrator()

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

const nextLocale = computed(() => (locale.value === 'zh' ? 'en' : 'zh'))
const ariaLabel = computed(() =>
  t(nextLocale.value === 'zh' ? 'ui.languageToggle.switchToZh' : 'ui.languageToggle.switchToEn'),
)
const tooltipLabel = computed(() =>
  t(nextLocale.value === 'zh' ? 'ui.languageToggle.zhLabel' : 'ui.languageToggle.enLabel'),
)
async function toggleLocale(targetLocale: 'en' | 'zh') {
  await setManualLocale(targetLocale)
  isOpen.value = false
}

async function selectLocale(option: LanguageOption) {
  if (option.code === 'zh' || option.code === 'en')
    await toggleLocale(option.code)
}

const reference = ref(null)
const floating = ref(null)
const isOpen = ref(false)
const { floatingStyles } = useFloating(reference, floating, {
  middleware: [offset(10)],
  whileElementsMounted: autoUpdate,
})

function openMenu() {
  isOpen.value = true
}

function closeMenu() {
  isOpen.value = false
}

function toggleMenu() {
  isOpen.value = !isOpen.value
}
</script>

<template>
  <div class="LanguageToggle relative" @mouseenter="openMenu" @mouseleave="closeMenu">
    <span ref="reference" class="LanguageToggle-Reference">
      <TxIconButton
        size="sm"
        shape="pill"
        :title="tooltipLabel"
        :pressed="isOpen"
        :aria-expanded="isOpen"
        :label="ariaLabel"
        class="LanguageToggle-Trigger"
        @click="toggleMenu"
        @focus="openMenu"
      >
        <Icon name="i-carbon-language" class="LanguageToggle-Icon" />
        <Icon name="i-carbon-chevron-down" :class="{ 'rotate-180': isOpen }" class="LanguageToggle-Chevron" />
      </TxIconButton>
    </span>
    <teleport to="body">
      <div
        ref="floating"
        :class="{ display: isOpen }"
        :style="floatingStyles"
        class="LanguageToggle-Floating absolute z-10"
        @mouseenter="openMenu"
        @mouseleave="closeMenu"
      >
        <ul class="LanguageToggle-List" role="menu">
          <li
            v-for="option in languageOptions"
            :key="option.code"
            class="LanguageToggle-Item"
            :class="{ 'LanguageToggle-Item--active': locale === option.code }"
            role="menuitemradio"
            :aria-checked="locale === option.code"
            @click="selectLocale(option)"
          >
            <span>{{ option.label }}</span>
            <Icon v-if="locale === option.code" name="i-carbon-checkmark" class="LanguageToggle-Check" />
          </li>
        </ul>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.LanguageToggle-Floating {
  display: none;
  pointer-events: none;
  z-index: 10020;
}

.LanguageToggle-Floating .LanguageToggle-List {
  opacity: 0;

  filter: blur(10px);
  transform: scale(0.96) translateY(-6px);
  transform-origin: top left;
  transition:
    opacity 160ms ease,
    filter 180ms ease,
    transform 180ms ease;
}

.LanguageToggle-Floating.display {
  display: block;
  pointer-events: auto;
}

.LanguageToggle-Floating.display .LanguageToggle-List {
  opacity: 1;
  filter: blur(0);
  transform: scale(1) translateY(0);
}

.LanguageToggle-Reference {
  display: inline-flex;
}

.LanguageToggle-Trigger {
  min-width: 56px;
  gap: 0;
  color: rgba(20, 22, 24, 0.92);
  --tx-icon-button-size: 34px;
  --tx-icon-button-bg-hover: rgba(20, 22, 24, 0.06);
  --tx-icon-button-bg-pressed: rgba(20, 22, 24, 0.06);
}

.LanguageToggle-Trigger :deep(.tx-icon-button__inner) {
  gap: 0.35rem;
}

.LanguageToggle-Trigger:hover,
.LanguageToggle-Trigger:focus-visible,
.LanguageToggle-Trigger[aria-expanded='true'] {
  outline: none;
}

.dark .LanguageToggle-Trigger {
  color: rgba(248, 250, 247, 0.92);
  --tx-icon-button-bg-hover: rgba(248, 250, 247, 0.09);
  --tx-icon-button-bg-pressed: rgba(248, 250, 247, 0.09);
}

.dark .LanguageToggle-Trigger:hover,
.dark .LanguageToggle-Trigger:focus-visible,
.dark .LanguageToggle-Trigger[aria-expanded='true'] {
  outline: none;
}

.LanguageToggle-Icon {
  font-size: 1.15rem;
}

.LanguageToggle-Chevron {
  font-size: 0.82rem;
  transition: transform 160ms ease;
}

.LanguageToggle-List {
  display: grid;
  width: 190px;
  margin: 0;
  padding: 0.55rem 0;
  list-style: none;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  background: #252525;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
  color: #f6f6f2;
}

.LanguageToggle-Item {
  display: flex;
  min-height: 38px;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0 1rem;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  transition: background 140ms ease;
}

.LanguageToggle-Item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.LanguageToggle-Item--active {
  color: #ffffff;
}

.LanguageToggle-Check {
  flex: 0 0 auto;
  font-size: 0.95rem;
}
</style>
