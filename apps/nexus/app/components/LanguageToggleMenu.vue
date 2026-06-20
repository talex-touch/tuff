<script setup lang="ts">
import { autoUpdate, offset, useFloating } from '@floating-ui/vue'
import { computed, ref } from 'vue'

type SupportedLocale = 'zh' | 'en'

interface LanguageOption {
  code: SupportedLocale | 'fr' | 'ru' | 'ja' | 'vi'
  label: string
}

const props = defineProps<{
  open: boolean
  referenceEl?: HTMLElement | null
}>()

const emit = defineEmits<{
  open: []
  close: []
  selected: []
}>()

const languageOptions: LanguageOption[] = [
  { code: 'zh', label: '简体中文' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'ru', label: 'Русский' },
  { code: 'ja', label: '日本語' },
  { code: 'vi', label: 'Tiếng Việt' },
]

const { locale } = useI18n()
const { setManualLocale } = useLocaleOrchestrator()
const reference = computed(() => props.referenceEl ?? null)
const floating = ref<HTMLElement | null>(null)
const { floatingStyles } = useFloating(reference, floating, {
  middleware: [offset(10)],
  whileElementsMounted: autoUpdate,
})

async function toggleLocale(targetLocale: SupportedLocale) {
  await setManualLocale(targetLocale)
  emit('selected')
}

async function selectLocale(option: LanguageOption) {
  if (option.code === 'zh' || option.code === 'en')
    await toggleLocale(option.code)
}
</script>

<template>
  <teleport to="body">
    <div
      ref="floating"
      :class="{ display: props.open }"
      :style="floatingStyles"
      class="LanguageToggle-Floating absolute z-10"
      @mouseenter="emit('open')"
      @mouseleave="emit('close')"
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
          <span
            v-if="locale === option.code"
            class="LanguageToggle-Check i-carbon-checkmark"
            aria-hidden="true"
          />
        </li>
      </ul>
    </div>
  </teleport>
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
