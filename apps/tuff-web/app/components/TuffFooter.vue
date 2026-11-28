<script setup lang="ts">
import { hasWindow } from '@talex-touch/utils/env'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import BetaIcon from './BetaIcon.vue'
import Logo from './icon/Logo.vue'
import { resolveLocaleFromPath, toLocalizedDocsPath, toLocalizedWebPath } from '~/utils/web-route'

const LazyTouchAurora = defineAsyncComponent(() => import('./tuff/background/TouchAurora.vue'))

const route = useRoute()
const { t } = useI18n()
const currentLocale = computed<'en' | 'zh'>(() => resolveLocaleFromPath(route.path))
const FOOTER_AURORA_ROOT_MARGIN = '480px 0px'
const shouldMountAurora = ref(false)
const footerRef = ref<HTMLElement | null>(null)
let auroraObserver: IntersectionObserver | null = null
let auroraFallbackTimer: ReturnType<typeof setTimeout> | null = null
let auroraIdleId: number | null = null

const year = new Date().getFullYear()

const footerCopy = computed(() => ({
  tagline: t('landing.footer.tagline'),
  rights: t('landing.footer.rights'),
  privacy: t('landing.footer.privacy'),
  terms: t('landing.footer.terms'),
  license: t('landing.footer.license'),
}))

const footerSections = computed(() => {
  const loc = currentLocale.value
  return [
    {
      title: t('landing.footer.sections.product'),
      links: [
        { to: toLocalizedWebPath('/store', loc), label: t('nav.store'), external: false },
        { to: toLocalizedDocsPath('/docs/guide/start', loc), label: t('nav.tutorial'), external: false },
        { to: toLocalizedDocsPath('/docs/dev', loc), label: t('nav.developer'), external: false },
        { to: `/tuffex/${loc}`, label: 'TuffEx UI', external: true },
        { to: toLocalizedWebPath('/updates', loc), label: t('nav.download'), external: false },
        { to: toLocalizedWebPath('/pricing', loc), label: t('nav.pricing'), external: false },
      ],
    },
    {
      title: t('landing.footer.sections.resources'),
      links: [
        { to: toLocalizedDocsPath('/docs', loc), label: t('nav.doc'), external: false },
        { to: toLocalizedWebPath('/privacy', loc), label: t('nav.privacy', 'Privacy'), external: false },
        { to: toLocalizedWebPath('/license', loc), label: t('nav.license', 'License'), external: false },
        { to: toLocalizedWebPath('/protocol', loc), label: footerCopy.value.license, external: false },
      ],
    },
  ]
})

const socialLinks = computed(() => [
  {
    href: 'https://github.com/talex-touch/tuff',
    label: t('landing.footer.socials.github'),
    icon: 'i-carbon-logo-github',
  },
])

function mountAurora() {
  shouldMountAurora.value = true
  clearAuroraSchedule()
}

function clearAuroraSchedule() {
  if (auroraObserver) {
    auroraObserver.disconnect()
    auroraObserver = null
  }
  if (auroraFallbackTimer) {
    if (hasWindow())
      window.clearTimeout(auroraFallbackTimer)
    auroraFallbackTimer = null
  }
  if (auroraIdleId !== null && hasWindow() && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(auroraIdleId)
    auroraIdleId = null
  }
}

function scheduleAuroraFallback() {
  if (!hasWindow())
    return
  if ('requestIdleCallback' in window) {
    auroraIdleId = window.requestIdleCallback(() => {
      auroraIdleId = null
      mountAurora()
    }, { timeout: 1800 })
    return
  }

  auroraFallbackTimer = setTimeout(() => {
    auroraFallbackTimer = null
    shouldMountAurora.value = true
  }, 600)
}

onMounted(() => {
  if (!hasWindow())
    return
  const footer = footerRef.value
  if ('IntersectionObserver' in window && footer) {
    auroraObserver = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting || entry.intersectionRatio > 0))
        mountAurora()
    }, { rootMargin: FOOTER_AURORA_ROOT_MARGIN })
    auroraObserver.observe(footer)
    return
  }

  scheduleAuroraFallback()
})

onBeforeUnmount(() => {
  clearAuroraSchedule()
})
</script>

<template>
  <footer ref="footerRef" class="TuffFooter relative border-t border-black/5 border-solid text-black dark:border-white/5 dark:text-white">
    <div class="TuffFooter-Background z-1">
      <Logo />

      <ClientOnly>
        <LazyTouchAurora
          v-if="shouldMountAurora"
          :color-stops="['#574BDD', '#8727CE', '#057CCF']"
          :amplitude="1.0"
          :blend="0.5"
          :speed="1.0"
          :intensity="1.0"
          class="op-35 -scale-100"
        />
      </ClientOnly>
    </div>

    <div class="TuffFooter-Main relative left-0 top-0 z-10 h-full w-full bg-white/88 dark:bg-black/84">
      <div class="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div class="grid gap-12 lg:grid-cols-[2fr_3fr]">
          <div class="space-y-6">
            <NuxtLink
              :to="toLocalizedWebPath('/', currentLocale)"
              class="inline-flex items-center gap-2.5 text-2xl font-bold no-underline"
            >
              <Logo />
              <span>Tuff</span>
              <BetaIcon />
            </NuxtLink>

            <p class="max-w-md text-sm text-black/50 leading-relaxed dark:text-white/50">
              {{ footerCopy.tagline }}
            </p>

            <div class="flex gap-2">
              <a
                v-for="social in socialLinks"
                :key="social.href"
                :href="social.href"
                :aria-label="social.label"
                target="_blank"
                rel="noopener noreferrer"
                class="size-9 inline-flex items-center justify-center border border-white/10 rounded-lg text-black/60 transition-colors hover:border-black/20 dark:text-white/60 hover:text-black dark:hover:border-white/20 dark:hover:text-white"
              >
                <span :class="social.icon" class="text-lg" aria-hidden="true" />
              </a>
            </div>
          </div>

          <nav aria-label="Footer navigation" class="grid gap-10 sm:grid-cols-2">
            <div
              v-for="section in footerSections"
              :key="section.title"
              class="space-y-4"
            >
              <h3 class="text-xs text-black/90 font-semibold tracking-wider uppercase dark:text-white/90">
                {{ section.title }}
              </h3>
              <ul class="list-none p-0 space-y-3">
                <li v-for="link in section.links" :key="link.to">
                  <a
                    v-if="link.external"
                    :href="link.to"
                    class="text-sm text-black/50 no-underline transition-colors dark:text-white/50 hover:text-black dark:hover:text-white"
                  >
                    {{ link.label }}
                  </a>
                  <NuxtLink
                    v-else
                    :to="link.to"
                    class="text-sm text-black/50 no-underline transition-colors dark:text-white/50 hover:text-black dark:hover:text-white"
                  >
                    {{ link.label }}
                  </NuxtLink>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div class="mt-12 border-t border-white/5 pt-8">
          <div class="flex flex-col gap-4 text-xs text-black/40 sm:flex-row sm:items-center sm:justify-between dark:text-white/40">
            <p>
              © {{ year }} Tuff Labs. {{ footerCopy.rights }}
            </p>
            <div class="flex items-center gap-6">
              <NuxtLink :to="toLocalizedWebPath('/privacy', currentLocale)" class="text-black/60 no-underline transition-colors dark:text-white/60 hover:op-70">
                {{ footerCopy.privacy }}
              </NuxtLink>
              <NuxtLink :to="toLocalizedWebPath('/license', currentLocale)" class="text-black/60 no-underline transition-colors dark:text-white/60 hover:op-70">
                {{ footerCopy.terms }}
              </NuxtLink>
              <NuxtLink :to="toLocalizedWebPath('/protocol', currentLocale)" class="text-black/60 no-underline transition-colors dark:text-white/60 hover:op-70">
                {{ footerCopy.license }}
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.TuffFooter-Background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  font-size: 20rem;
}

.TuffFooter-Background .TuffLogo {
  z-index: 1;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

/* Static translucent backdrop — avoids blurring a live WebGL2 canvas every frame. */
.TuffFooter-Main {
  background-image: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.92) 0%,
    rgba(255, 255, 255, 0.84) 100%
  );
}

:global(.dark) .TuffFooter-Main,
:global([data-theme='dark']) .TuffFooter-Main {
  background-image: linear-gradient(
    180deg,
    rgba(10, 10, 14, 0.9) 0%,
    rgba(8, 8, 12, 0.82) 100%
  );
}
</style>
