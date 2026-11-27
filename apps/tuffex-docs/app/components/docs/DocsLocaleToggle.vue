<script setup lang="ts">
import { computed } from 'vue'
import { prefetchDocPage } from '~/composables/useTuffexCurrentDoc'
import {
  parseTuffexRoute,
  persistLocalePreference,
  resolveLocaleFromPath,
  toLocalizedTuffexPath,
  type SupportedLocale,
} from '~/utils/docs-route'

const route = useRoute()
const { setLocale } = useI18n()

const currentLocale = computed<SupportedLocale>(() => resolveLocaleFromPath(route.path))
const nextLocale = computed<SupportedLocale>(() => (currentLocale.value === 'zh' ? 'en' : 'zh'))

const buttonLabel = computed(() => (currentLocale.value === 'zh' ? 'EN' : '中文'))
const buttonTitle = computed(() => (
  currentLocale.value === 'zh' ? 'Switch language to English' : '切换语言为简体中文'
))

async function toggleLocale() {
  const target = nextLocale.value
  // C7: Synchronize cookie (`tuff_locale`) & localStorage across TuffEx Docs and Nexus on the same origin.
  persistLocalePreference(target, true)
  if (typeof setLocale === 'function')
    void setLocale(target)

  const targetPath = toLocalizedTuffexPath(route.path, target)
  await navigateTo({
    path: targetPath,
    query: route.query,
    hash: route.hash,
  })
}
</script>

<template>
  <button
    type="button"
    class="docs-locale-toggle"
    :aria-label="buttonTitle"
    :title="buttonTitle"
    @pointerenter="prefetchDocPage(nextLocale, parseTuffexRoute(route.path).slug)"
    @focus="prefetchDocPage(nextLocale, parseTuffexRoute(route.path).slug)"
    @click="toggleLocale"
  >
    <span class="i-carbon-language docs-locale-toggle__icon" aria-hidden="true" />
    <span class="docs-locale-toggle__text">{{ buttonLabel }}</span>
  </button>
</template>

<style scoped>
.docs-locale-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 9px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--docs-ink-regular);
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
}

.docs-locale-toggle:hover {
  background: color-mix(in srgb, var(--docs-ink) 7%, transparent);
  color: var(--docs-ink);
}

.docs-locale-toggle__icon {
  font-size: 15px;
}
</style>
