<script setup lang="ts">
import { computed } from 'vue'
import UpdatesAllView from '~/components/updates/UpdatesAllView.vue'
import { requestJson } from '~/utils/request'

interface LocalizedText {
  zh: string
  en: string
}

interface DashboardUpdate {
  id: string
  type: 'news' | 'release' | 'announcement' | 'config' | 'data'
  scope: 'web' | 'system' | 'both'
  channels: string[]
  releaseTag: string | null
  title: LocalizedText
  timestamp: string
  summary: LocalizedText
  tags: string[]
  link: string
}

definePageMeta({
  layout: 'home',
  pageTransition: {
    name: 'page-slide',
    mode: 'out-in',
  },
})

const { t } = useI18n()

const { data: updatesPayload } = await useAsyncData('public-updates-all', () =>
  requestJson<{ updates: DashboardUpdate[] }>('/api/updates'),
)

const updateItems = computed<DashboardUpdate[]>(() => updatesPayload.value?.updates ?? [])

const pageTitle = computed(() => `${t('updates.all.title', 'All updates')} · Tuff Nexus`)
useSeoMeta({
  title: pageTitle,
  ogTitle: pageTitle,
  description: computed(() => t('updates.all.description', 'Browse every release note and product update.')),
})
</script>

<template>
  <UpdatesAllView :updates="updateItems" />
</template>
