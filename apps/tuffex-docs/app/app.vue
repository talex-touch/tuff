<script setup lang="ts">
import '~/assets/docs.css'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  buildCanonicalTuffexUrl,
  resolveLocaleFromPath,
  toLocalizedTuffexPath,
} from '~/utils/docs-route'

const LazyDocsSearchModal = defineAsyncComponent(() => import('~/components/docs/DocsSearchModal.vue'))

const route = useRoute()
const { locale } = useI18n()

const routeLocale = computed(() => resolveLocaleFromPath(route.path))
const searchOpen = useState<boolean>('tuffex-search-open', () => false)
const searchMounted = ref(false)

watch(searchOpen, (open) => {
  if (open)
    searchMounted.value = true
})

// Synchronously align vue-i18n locale with the URL prefix (`en`/`zh`) without extra route rewrites or fetches.
watch(
  routeLocale,
  (next) => {
    if (locale.value !== next)
      locale.value = next
  },
  { immediate: true },
)

const canonicalUrl = computed(() => buildCanonicalTuffexUrl(route.path))
const enAlternateUrl = computed(() => buildCanonicalTuffexUrl(toLocalizedTuffexPath(route.path, 'en')))
const zhAlternateUrl = computed(() => buildCanonicalTuffexUrl(toLocalizedTuffexPath(route.path, 'zh')))

const speculationRulesJson = JSON.stringify({
  prerender: [
    {
      where: {
        or: [
          { href_matches: '/en/docs/*' },
          { href_matches: '/zh/docs/*' },
          { href_matches: '/store' },
          { href_matches: '/updates' },
        ],
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
    {
      key: 'tuffex-speculation-rules',
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

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <ClientOnly>
    <LazyDocsSearchModal
      v-if="searchMounted"
      :open="searchOpen"
      @update:open="(value) => (searchOpen = value)"
    />
  </ClientOnly>
</template>
