<script setup lang="ts">
import DocsRedirectLoading from '~/components/docs/DocsRedirectLoading.vue'
import { toLocalizedDocsPath } from '#shared/utils/docs-path'

const { t } = useI18n()
const { docsLocale } = useDocsRoute()
const route = useRoute()
const target = computed(() => toLocalizedDocsPath('/docs/guide/start', docsLocale.value))

definePageMeta({
  layout: 'fullscreen',
})

useSeoMeta({
  title: computed(() => 'Redirecting to guide · Tuff Docs'),
  robots: 'noindex, nofollow',
})

if (import.meta.server) {
  await navigateTo(target.value, { redirectCode: 302 })
}
else {
  onMounted(() => {
    if (route.path !== target.value)
      navigateTo(target.value)
  })
}
</script>

<template>
  <DocsRedirectLoading :title="t('docs.redirectingGuide')" />
</template>
