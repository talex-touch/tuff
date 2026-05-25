<script setup lang="ts">
import DocsRedirectLoading from '~/components/docs/DocsRedirectLoading.vue'

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const target = computed(() => localePath({ path: '/docs/dev/getting-started/quickstart' }))

definePageMeta({
  layout: 'fullscreen',
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
  <DocsRedirectLoading :title="t('docs.redirectingDeveloper')" />
</template>
