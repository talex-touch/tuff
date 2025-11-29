<script setup lang="ts">
import { computed } from 'vue'

const { t } = useI18n()

const year = new Date().getFullYear()

const footerSections = computed(() => [
  {
    title: t('landing.footer.sections.product'),
    links: [
      { to: '/market', label: t('nav.market') },
      { to: '/#developer', label: t('nav.developer') },
      { to: '/updates', label: t('nav.download') },
      { to: '/pricing', label: t('nav.pricing') },
    ],
  },
  {
    title: t('landing.footer.sections.resources'),
    links: [
      { to: '/docs', label: t('nav.doc') },
      { to: '/#blog', label: t('nav.blog') },
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
  <footer class="bg-black text-white">
    <div class="mx-auto max-w-7xl px-6 py-16 lg:px-8">
      <!-- Main Content -->
      <div class="grid gap-12 lg:grid-cols-[2fr_3fr]">
        <!-- Brand Section -->
        <div class="space-y-6">
          <NuxtLink
            to="/"
            class="inline-flex items-center gap-2.5 text-2xl font-bold text-white no-underline"
          >
            <span>Tuff</span>
            <span class="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/60">
              Beta
            </span>
          </NuxtLink>

          <p class="max-w-md text-sm leading-relaxed text-white/50">
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
              class="inline-flex size-9 items-center justify-center rounded-lg border border-white/10 text-white/60 transition-colors hover:border-white/20 hover:text-white"
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
            <h3 class="text-xs font-semibold uppercase tracking-wider text-white/90">
              {{ section.title }}
            </h3>
            <ul class="space-y-3">
              <li v-for="link in section.links" :key="link.to">
                <NuxtLink
                  :to="link.to"
                  class="text-sm text-white/50 transition-colors hover:text-white"
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
        <div class="flex flex-col gap-4 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {{ year }} Tuff Labs. {{ t('landing.footer.rights') }}
          </p>
          <div class="flex items-center gap-6">
            <NuxtLink to="/privacy" class="transition-colors hover:text-white/60">
              {{ t('landing.footer.privacy') }}
            </NuxtLink>
            <NuxtLink to="/terms" class="transition-colors hover:text-white/60">
              {{ t('landing.footer.terms') }}
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </footer>
</template>
