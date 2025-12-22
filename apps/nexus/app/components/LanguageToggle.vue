<script setup lang="ts">
import { autoUpdate, offset, useFloating } from '@floating-ui/vue'
import { computed } from 'vue'
import Icon from './icon/Icon.vue'

const { locale, setLocale, t } = useI18n()
const route = useRoute()
const router = useRouter()
const { persistPreferredLocale } = useLocalePreference()

const nextLocale = computed(() => (locale.value === 'zh' ? 'en' : 'zh'))
const ariaLabel = computed(() =>
  t(nextLocale.value === 'zh' ? 'ui.languageToggle.switchToZh' : 'ui.languageToggle.switchToEn'),
)
const tooltipLabel = computed(() =>
  t(nextLocale.value === 'zh' ? 'ui.languageToggle.zhLabel' : 'ui.languageToggle.enLabel'),
)
async function toggleLocale(targetTag: string) {
  const targetLocale = targetTag.startsWith('zh') ? 'zh' : 'en'
  const rawPath = route.path || '/'
  const normalizedPath = rawPath.replace(/^\/(en|zh)(?=\/|$)/i, '') || '/'

  await setLocale(targetLocale)
  persistPreferredLocale(targetLocale)

  const query = { ...route.query, lang: targetTag }
  await router.replace({
    path: normalizedPath,
    query,
    hash: route.hash,
  })
}

const _hover = ref(false)
const hover = debouncedRef(_hover, 200)
const reference = ref(null)
const floating = ref(null)
const { floatingStyles } = useFloating(reference, floating, {
  middleware: [offset(10)],
  whileElementsMounted: autoUpdate,
})
</script>

<template>
  <div class="LanguageToggle relative" @mouseenter="_hover = true" @mouseleave="_hover = false">
    <div ref="reference" :title="tooltipLabel" :aria-pressed="locale === 'zh'" :aria-label="ariaLabel" class="LanguageToggle-Content flex cursor-pointer items-center gap-2 rounded-[12px] px-3 py-[6px] text-black active:bg-black/8 hover:bg-black/5 dark:text-white dark:active:bg-white/8 dark:hover:bg-white/10">
      <Icon name="i-carbon-language" />
      <Icon name="i-carbon-chevron-down" :class="{ 'rotate-180': hover }" class="transition-transform duration-200" />
    </div>
    <teleport to="body">
      <div ref="floating" :class="{ display: hover }" :style="floatingStyles" class="LanguageToggle-Floating absolute z-10" @mouseenter="_hover = true" @mouseleave="_hover = false">
        <ul class="LanguageToggle-List m-0 h-[100px] w-[120px] flex flex-col cursor-pointer list-none items-start gap-2 overflow-hidden rounded-2xl bg-white p-2 shadow-[0_2px_12px_rgba(0,0,0,0.1)] dark:bg-black dark:shadow-[0_2px_12px_rgba(255,255,255,0.1)]">
          <li class="LanguageToggle-Item w-full flex items-center gap-2 rounded-lg p-2 hover:bg-black/5 hover:dark:bg-white/5" :class="{ 'LanguageToggle-Item--active !bg-black/10 !dark:bg-white/10': locale === 'en' }" @click="toggleLocale('en-US')">
            <span>English</span>
          </li>
          <li class="LanguageToggle-Item w-full flex items-center gap-2 rounded-lg p-2 hover:bg-black/5 hover:dark:bg-white/5" :class="{ 'LanguageToggle-Item--active !bg-black/10 !dark:bg-white/10': locale === 'zh' }" @click="toggleLocale('zh-CN')">
            <span>中文</span>
          </li>
        </ul>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.LanguageToggle-Floating {
  pointer-events: none;
}

.LanguageToggle-Floating .LanguageToggle-List {
  opacity: 0;

  filter: blur(18px);
  transform: scale(0.8) translateY(-10%);
  transition: all 0.5s cubic-bezier(0.86, 0, 0.07, 1);
}

.LanguageToggle-Floating.display {
  pointer-events: auto;
}

.LanguageToggle-Floating.display .LanguageToggle-List {
  opacity: 1;
  filter: blur(0);
  transform: scale(1) translateY(0);
}
</style>
