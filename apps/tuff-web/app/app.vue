<script setup lang="ts">
import '~/assets/docs.css'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { toastHostRequestedEvent } from '~/constants'
import {
  buildCanonicalWebUrl,
  hasExplicitLocalePrefix,
  resolveLocaleFromPath,
  ROOT_LOCALE_AUTO_REDIRECT_SCRIPT,
  toLocalizedWebPath,
} from '~/utils/web-route'

const LazyDocsSearchModal = defineAsyncComponent(() => import('~/components/docs/DocsSearchModal.vue'))
const LazyToastContainer = defineAsyncComponent(() => import('~/components/ToastContainer.vue'))

const route = useRoute()
const { locale } = useI18n()

const routeLocale = computed(() => resolveLocaleFromPath(route.path))
const isUnprefixedRoute = computed(() => !hasExplicitLocalePrefix(route.path))
const searchOpen = useState<boolean>('tuff-web-search-open', () => false)
const searchMounted = ref(false)
const toastMounted = ref(false)

watch(searchOpen, (open) => {
  if (open)
    searchMounted.value = true
})

// Synchronously align vue-i18n locale with the URL prefix (`en`/`zh`) — zero `/_i18n/` fetches.
watch(
  routeLocale,
  (next) => {
    if (locale.value !== next)
      locale.value = next
  },
  { immediate: true },
)

const canonicalUrl = computed(() => buildCanonicalWebUrl(route.path))
const enAlternateUrl = computed(() => buildCanonicalWebUrl(toLocalizedWebPath(route.path, 'en')))
const zhAlternateUrl = computed(() => buildCanonicalWebUrl(toLocalizedWebPath(route.path, 'zh')))

const speculationRulesJson = JSON.stringify({
  prerender: [
    {
      where: {
        href_matches: '/tuffex/*',
      },
      eagerness: 'moderate',
    },
  ],
})

useHead(() => ({
  htmlAttrs: {
    lang: routeLocale.value === 'zh' ? 'zh-CN' : 'en',
  },
  link: [
    { rel: 'canonical', href: canonicalUrl.value },
    { rel: 'alternate', hreflang: 'en', href: enAlternateUrl.value },
    { rel: 'alternate', hreflang: 'zh', href: zhAlternateUrl.value },
    { rel: 'alternate', hreflang: 'x-default', href: enAlternateUrl.value },
  ],
  script: [
    ...(isUnprefixedRoute.value
      ? [{
          key: 'tuff-web-locale-redirect',
          innerHTML: ROOT_LOCALE_AUTO_REDIRECT_SCRIPT,
        }]
      : []),
    {
      key: 'tuff-web-speculation-rules',
      type: 'speculationrules',
      innerHTML: speculationRulesJson,
    },
  ],
}))

function handleGlobalKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    searchMounted.value = true
    searchOpen.value = !searchOpen.value
  }
}

function handleToastRequested() {
  toastMounted.value = true
}

onMounted(() => {
  if (!hasWindow())
    return
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener(toastHostRequestedEvent, handleToastRequested)
})

onBeforeUnmount(() => {
  if (!hasWindow())
    return
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener(toastHostRequestedEvent, handleToastRequested)
})
</script>

<template>
  <NuxtLoadingIndicator color="#1BB5F4" />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <ClientOnly>
    <LazyToastContainer v-if="toastMounted" />
    <LazyDocsSearchModal
      v-if="searchMounted"
      :open="searchOpen"
      @update:open="(value) => (searchOpen = value)"
    />
  </ClientOnly>
</template>

<style>
.plan-display-font {
  font-family: 'Poppins', 'Avenir Next', 'DM Sans', 'PingFang SC', 'Segoe UI', sans-serif;
  font-weight: 600;
  letter-spacing: -0.018em;
}

.cubic-transition,
.transition-cubic {
  transition: 0.25s cubic-bezier(0.785, 0.135, 0.15, 0.86);
}
</style>
