<script setup lang="ts">
import type { DashboardUpdate, PublicUpdatesPayload } from '~/utils/public-updates'
import { computed, onMounted } from 'vue'
import UpdatesAllView from '~/components/updates/UpdatesAllView.vue'
import { hydratePrerenderedUpdates, resolvePublicUpdatesCachedData } from '~/utils/public-updates'
import { requestJson } from '~/utils/request'

definePageMeta({
  layout: 'home',
  pageTransition: {
    name: 'page-slide',
    mode: 'out-in',
  },
})

const nuxtApp = useNuxtApp()
const { t } = useI18n()

const { data: updatesPayload, refresh: refreshUpdates } = await useAsyncData(
  'public-updates-all',
  () => requestJson<PublicUpdatesPayload>('/api/updates'),
  {
    getCachedData: key => resolvePublicUpdatesCachedData(
      (nuxtApp.isHydrating ? nuxtApp.payload.data[key] : nuxtApp.static.data[key]) as PublicUpdatesPayload | undefined,
      nuxtApp.isHydrating,
    ),
  },
)

onMounted(async () => {
  await hydratePrerenderedUpdates(updatesPayload.value, refreshUpdates)
})

const updateItems = computed<DashboardUpdate[]>(() => updatesPayload.value?.updates ?? [])

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
