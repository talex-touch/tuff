<script setup lang="ts">
import { computed } from 'vue'
import UpdatesAllView from '~/components/updates/UpdatesAllView.vue'
import { usePublicUpdates } from '~/composables/usePublicUpdates'

definePageMeta({
  layout: 'home',
  pageTransition: {
    name: 'page-slide',
    mode: 'out-in',
  },
})

const { t } = useI18n()
const { updateItems } = await usePublicUpdates()

const pageTitle = computed(() => `${t('updates.all.title')} · Tuff`)
useSeoMeta({
  title: pageTitle,
  ogTitle: pageTitle,
  description: computed(() => t('updates.all.subtitle', 'Browse every release note and product update.')),
})
</script>

<template>
  <UpdatesAllView :updates="updateItems" />
</template>
