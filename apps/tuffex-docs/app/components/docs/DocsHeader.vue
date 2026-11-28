<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DocsLocaleToggle from '~/components/docs/DocsLocaleToggle.vue'
import DocsThemeToggle from '~/components/docs/DocsThemeToggle.vue'
import { prefetchDocPage } from '~/composables/useTuffexCurrentDoc'
import { resolveLocaleFromPath } from '~/utils/docs-route'

const LazyDocsDrawer = defineAsyncComponent(() => import('~/components/docs/DocsDrawer.vue'))

const route = useRoute()
const { t } = useI18n()

const docsLocale = computed(() => resolveLocaleFromPath(route.path))
const isZh = computed(() => docsLocale.value === 'zh')
const activeHeaderSection = computed<'concepts' | 'composition' | 'components'>(() => {
  const path = route.path.replace(/^\/tuffex(?=\/|$)/, '').replace(/^\/(?:en|zh)(?=\/|$)/, '') || '/'
  if (path === '/concepts' || path.startsWith('/concepts/'))
    return 'concepts'
  if (path === '/composition' || path.startsWith('/composition/'))
    return 'composition'
  return 'components'
})
const searchOpen = useState<boolean>('tuffex-search-open', () => false)

const scrolled = ref(false)
const mobileMenuOpen = ref(false)
const mobileMenuMounted = ref(false)
let scrollRaf: number | null = null

// Cross-app links back to Nexus on the same origin MUST use native <a> / external links!
const nexusLinks = computed(() => [
  { href: `/${docsLocale.value}/docs`, label: t('nav.docs', isZh.value ? 'Tuff 文档' : 'Tuff Docs') },
  { href: '/store', label: t('nav.store', isZh.value ? '插件市场' : 'Store') },
  { href: '/updates', label: t('nav.updates', isZh.value ? '更新日志' : 'Updates') },
])

function openSearch() {
  searchOpen.value = true
}

function openMobileMenu() {
  mobileMenuMounted.value = true
  mobileMenuOpen.value = true
}

function syncScroll() {
  const next = window.scrollY > 12
  if (scrolled.value !== next)
    scrolled.value = next
}

function onScroll() {
  if (scrollRaf !== null)
    return
  scrollRaf = window.requestAnimationFrame(() => {
    scrollRaf = null
    syncScroll()
  })
}

watch(() => route.path, () => {
  mobileMenuOpen.value = false
})

onMounted(() => {
  syncScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  if (scrollRaf !== null) {
    window.cancelAnimationFrame(scrollRaf)
    scrollRaf = null
  }
})
</script>

<template>
  <header class="docs-header" data-role="main-header">
    <!-- R3: Fixed width & ::before opacity-only transition (NEVER animating backdrop-filter or width!) -->
    <div class="docs-header__pill" :class="{ 'is-scrolled': scrolled }">
      <div class="docs-header__left">
        <a href="/" class="docs-header__brand" :aria-label="isZh ? '返回 Tuff 首页' : 'Back to Tuff Home'">
          <span class="docs-header__logo" aria-hidden="true">T</span>
          <span class="docs-header__brand-name">Tuff</span>
        </a>
        <span class="docs-header__sep" aria-hidden="true">/</span>
        <NuxtLink
          :to="`/${docsLocale}`"
          class="docs-header__product"
          @pointerenter="prefetchDocPage(docsLocale, '')"
          @focus="prefetchDocPage(docsLocale, '')"
        >
          <span>TuffEx</span>
          <span class="docs-header__product-badge">UI</span>
        </NuxtLink>
      </div>

      <nav class="docs-header__nav" aria-label="Primary navigation">
        <div class="docs-header__links">
          <NuxtLink
            :to="`/${docsLocale}`"
            class="docs-header__link"
            :class="{ 'is-active': activeHeaderSection === 'components' }"
            @pointerenter="prefetchDocPage(docsLocale, '')"
            @focus="prefetchDocPage(docsLocale, '')"
          >
            {{ isZh ? '组件' : 'Components' }}
          </NuxtLink>
          <NuxtLink
            :to="`/${docsLocale}/concepts`"
            class="docs-header__link"
            :class="{ 'is-active': activeHeaderSection === 'concepts' }"
            @pointerenter="prefetchDocPage(docsLocale, 'concepts')"
            @focus="prefetchDocPage(docsLocale, 'concepts')"
          >
            {{ isZh ? '设计理念' : 'Concepts' }}
          </NuxtLink>
          <NuxtLink
            :to="`/${docsLocale}/composition`"
            class="docs-header__link"
            :class="{ 'is-active': activeHeaderSection === 'composition' }"
            @pointerenter="prefetchDocPage(docsLocale, 'composition')"
            @focus="prefetchDocPage(docsLocale, 'composition')"
          >
            {{ isZh ? '组合指南' : 'Composition' }}
          </NuxtLink>
          <span class="docs-header__divider" aria-hidden="true" />
          <a
            v-for="link in nexusLinks"
            :key="link.href"
            :href="link.href"
            class="docs-header__link docs-header__link--external"
          >
            {{ link.label }}
          </a>
        </div>

        <div class="docs-header__controls">
          <button
            type="button"
            class="docs-header__search"
            :aria-label="isZh ? '搜索 TuffEx 文档' : 'Search TuffEx Docs'"
            @click="openSearch"
          >
            <span class="i-carbon-search docs-header__search-icon" aria-hidden="true" />
            <span class="docs-header__search-label">{{ isZh ? '搜索' : 'Search' }}</span>
            <kbd class="docs-header__kbd">⌘K</kbd>
          </button>

          <DocsLocaleToggle />
          <DocsThemeToggle />

          <a
            href="https://github.com/talex-touch/tuff"
            target="_blank"
            rel="noopener noreferrer"
            class="docs-header__icon-btn"
            aria-label="GitHub"
            title="GitHub"
          >
            <span class="i-carbon-logo-github" aria-hidden="true" />
          </a>

          <button
            type="button"
            class="docs-header__menu-btn"
            :aria-label="t('nav.menu', isZh ? '菜单' : 'Menu')"
            :aria-expanded="mobileMenuOpen"
            @click="openMobileMenu"
          >
            <span class="i-carbon-menu" aria-hidden="true" />
          </button>
        </div>
      </nav>
    </div>

    <ClientOnly>
      <LazyDocsDrawer
        v-if="mobileMenuMounted"
        :visible="mobileMenuOpen"
        :title="isZh ? '导航' : 'Navigation'"
        direction="right"
        @update:visible="(v) => (mobileMenuOpen = v)"
      >
        <div class="docs-header__mobile-list">
          <NuxtLink :to="`/${docsLocale}`" class="docs-header__mobile-link" @click="mobileMenuOpen = false">
            {{ isZh ? '组件文档' : 'Components' }}
          </NuxtLink>
          <NuxtLink :to="`/${docsLocale}/concepts`" class="docs-header__mobile-link" @click="mobileMenuOpen = false">
            {{ isZh ? '设计理念' : 'Design Concepts' }}
          </NuxtLink>
          <NuxtLink :to="`/${docsLocale}/composition`" class="docs-header__mobile-link" @click="mobileMenuOpen = false">
            {{ isZh ? '组合指南' : 'Composition Guide' }}
          </NuxtLink>
          <div class="docs-header__mobile-sep" />
          <a href="/" class="docs-header__mobile-link">
            {{ isZh ? 'Tuff 首页' : 'Tuff Home' }}
          </a>
          <a
            v-for="link in nexusLinks"
            :key="link.href"
            :href="link.href"
            class="docs-header__mobile-link"
          >
            {{ link.label }}
          </a>
        </div>
      </LazyDocsDrawer>
    </ClientOnly>
  </header>
</template>

<style scoped>
.docs-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  height: var(--docs-header-height, 76px);
  padding: 12px var(--docs-frame-gutter, 1rem) 0;
  pointer-events: none;
}

.docs-header__pill {
  position: relative;
  margin-inline: auto;
  width: 100%;
  max-width: calc(var(--docs-frame-compact, 840px) + 236px + 240px + 4rem);
  height: 52px;
  padding: 0 14px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  pointer-events: auto;
  isolation: isolate;
}

/* R3: Glass backdrop lives permanently on ::before and ONLY transitions opacity (220ms compositor-only)! */
.docs-header__pill::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: color-mix(in srgb, var(--docs-surface, #ffffff) 82%, transparent);
  box-shadow:
    inset 0 0 0 1px var(--docs-border-light, #ebeef5),
    0 10px 30px rgba(15, 23, 42, 0.06);
  -webkit-backdrop-filter: blur(14px) saturate(150%);
  backdrop-filter: blur(14px) saturate(150%);
  opacity: 0;
  transition: opacity 220ms ease;
  pointer-events: none;
}

.docs-header__pill.is-scrolled::before {
  opacity: 1;
}

:global(.dark .docs-header__pill::before),
:global([data-theme='dark'] .docs-header__pill::before) {
  background: color-mix(in srgb, var(--docs-surface, #121212) 84%, transparent);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.1),
    0 12px 32px rgba(0, 0, 0, 0.35);
}

@media (prefers-reduced-motion: reduce) {
  .docs-header__pill::before {
    transition: none;
  }
}

.docs-header__left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.docs-header__brand {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--docs-ink);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
}

.docs-header__logo {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background: var(--docs-ink);
  color: var(--docs-surface);
  font-size: 13px;
  font-weight: 700;
}

.docs-header__sep {
  color: var(--docs-muted);
  opacity: 0.45;
  font-size: 14px;
}

.docs-header__product {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--docs-ink);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
}

.docs-header__product-badge {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--docs-accent) 14%, transparent);
  color: var(--docs-accent);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.docs-header__nav {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  min-width: 0;
}

.docs-header__links {
  display: flex;
  align-items: center;
  gap: 4px;
}

.docs-header__link {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  color: var(--docs-ink-regular);
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
}

.docs-header__link:hover {
  background: color-mix(in srgb, var(--docs-ink) 6%, transparent);
  color: var(--docs-ink);
}

.docs-header__link.is-active,
.docs-header__link.router-link-exact-active {
  color: var(--docs-ink);
  font-weight: 600;
}

.docs-header__divider {
  width: 1px;
  height: 16px;
  margin-inline: 6px;
  background: var(--docs-border-light);
}

.docs-header__controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.docs-header__search {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 8px 0 10px;
  border: 0;
  border-radius: 10px;
  background: var(--docs-surface-subtle);
  box-shadow: inset 0 0 0 1px var(--docs-border-light);
  color: var(--docs-muted);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}

.docs-header__search:hover {
  box-shadow: inset 0 0 0 1px var(--docs-border);
  color: var(--docs-ink);
}

.docs-header__search-icon {
  font-size: 14px;
}

.docs-header__kbd {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 5px;
  border-radius: 5px;
  background: var(--docs-surface);
  box-shadow: inset 0 0 0 1px var(--docs-border-light);
  font-family: var(--docs-mono-font);
  font-size: 11px;
  color: var(--docs-muted);
}

.docs-header__icon-btn,
.docs-header__menu-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--docs-ink-regular);
  font-size: 16px;
  text-decoration: none;
  cursor: pointer;
}

.docs-header__icon-btn:hover,
.docs-header__menu-btn:hover {
  background: color-mix(in srgb, var(--docs-ink) 7%, transparent);
  color: var(--docs-ink);
}

.docs-header__menu-btn {
  display: none;
}

@media (max-width: 960px) {
  .docs-header__links {
    display: none;
  }

  .docs-header__search-label,
  .docs-header__kbd {
    display: none;
  }

  .docs-header__search {
    padding: 0 8px;
  }

  .docs-header__menu-btn {
    display: inline-flex;
  }
}

.docs-header__mobile-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.docs-header__mobile-link {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  color: var(--docs-ink-regular);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
}

.docs-header__mobile-link:hover {
  background: var(--docs-surface-subtle);
  color: var(--docs-ink);
}

.docs-header__mobile-sep {
  height: 1px;
  margin: 8px 0;
  background: var(--docs-border-light);
}
</style>
