<script setup lang="ts">
import { computed } from 'vue'
import BetaIcon from './BetaIcon.vue'
import Logo from './icon/Logo.vue'
import TouchAurora from './tuff/background/TouchAurora.vue'

const { t } = useI18n()

const year = new Date().getFullYear()

const footerSections = computed(() => [
  {
    title: t('landing.footer.sections.product'),
    links: [
      { to: '/market', label: t('nav.market') },
      { to: '/docs/guide/start', label: t('nav.tutorial') },
      { to: '/developer', label: t('nav.developer') },
      { to: '/updates', label: t('nav.download') },
      { to: '/pricing', label: t('nav.pricing') },
    ],
  },
  {
    title: t('landing.footer.sections.resources'),
    links: [
      { to: '/docs', label: t('nav.doc') },
      { to: '/blog', label: t('nav.blog') },
    ],
  },
])

const socialLinks = computed(() => [
  {
    href: 'https://github.com/talex-touch/tuff',
    label: t('landing.footer.socials.github'),
    icon: 'i-carbon-logo-github',
  },
])
</script>

<template>
  <footer class="TuffFooter relative border-t border-black/5 border-solid text-black dark:border-white/5 dark:text-white">
    <div class="TuffFooter-Background z-1">
      <Logo />

      <TouchAurora
        :color-stops="['#574BDD', '#8727CE', '#057CCF']"
        :amplitude="1.0"
        :blend="0.5"
        :speed="1.0"
        :intensity="1.0"
        class="op-50 -scale-100"
      />
    </div>

    <div class="TuffFooter-Main relative left-0 top-0 z-10 h-full w-full bg-white/80 dark:bg-black/80">
      <div class="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <!-- Main Content -->
        <div class="grid gap-12 lg:grid-cols-[2fr_3fr]">
          <!-- Brand Section -->
          <div class="space-y-6">
            <NuxtLink
              to="/"
              class="inline-flex items-center gap-2.5 text-2xl font-bold no-underline"
            >
              <Logo />
              <span>Tuff</span>
              <BetaIcon />
            </NuxtLink>

            <p class="max-w-md text-sm text-black/50 leading-relaxed dark:text-white/50">
              {{ t('landing.footer.tagline') }}
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

          <!-- Navigation -->
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
                  <NuxtLink
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

        <!-- Bottom -->
        <div class="mt-12 border-t border-white/5 pt-8">
          <div class="flex flex-col gap-4 text-xs text-black/40 sm:flex-row sm:items-center sm:justify-between dark:text-white/40">
            <p>
              © {{ year }} Tuff Labs. {{ t('landing.footer.rights') }}
            </p>
            <div class="flex items-center gap-6">
              <NuxtLink to="/privacy" class="text-black/60 no-underline transition-colors dark:text-white/60 hover:op-70">
                {{ t('landing.footer.privacy') }}
              </NuxtLink>
              <NuxtLink to="/license" class="text-black/60 no-underline transition-colors dark:text-white/60 hover:op-70">
                Tuff
              </NuxtLink>
              <NuxtLink to="/protocol" class="text-black/60 no-underline transition-colors dark:text-white/60 hover:op-70">
                Tuff
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

.TuffFooter-Main {
  backdrop-filter: blur(18px) saturate(180%);
}

.TuffFooter {
  /* overflow: hidden; */
}
</style>
