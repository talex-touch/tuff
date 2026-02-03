<script setup lang="ts">
import type { SharedPluginDetail } from '../plugin-detail'
import { computed } from 'vue'

interface Props {
  detail: SharedPluginDetail
  formatDate?: (value: string | number | Date) => string
  formatNumber?: (value: number) => string
  officialLabel?: string
  installsLabel?: string
  versionLabel?: string
  updatedLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  officialLabel: 'Official',
  installsLabel: 'Installs',
  versionLabel: 'Version',
  updatedLabel: 'Updated'
})

const displayInstalls = computed(() => {
  if (props.detail.installs === undefined || props.detail.installs === null) {
    return ''
  }
  return props.formatNumber ? props.formatNumber(props.detail.installs) : `${props.detail.installs}`
})

const updatedAtValue = computed(() => {
  return props.detail.updatedAt ?? props.detail.latestVersion?.createdAt
})

const displayUpdatedAt = computed(() => {
  if (!updatedAtValue.value) return ''
  if (props.formatDate) return props.formatDate(updatedAtValue.value)
  const date = new Date(updatedAtValue.value as any)
  return Number.isNaN(date.valueOf()) ? `${updatedAtValue.value}` : date.toLocaleDateString()
})

const displayVersion = computed(() => props.detail.latestVersion?.version ?? '')

const isOfficial = computed(() => props.detail.official || props.detail.trustLevel === 'official')
</script>

<template>
  <header class="space-y-3">
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="text-2xl font-semibold">
        {{ detail.name }}
      </h2>
      <span
        v-if="isOfficial"
        class="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700"
      >
        {{ officialLabel }}
      </span>
      <span
        v-if="detail.category?.label"
        class="inline-flex items-center rounded-full bg-black/5 px-2 py-0.5 text-xs text-black/70"
      >
        {{ detail.category.label }}
      </span>
    </div>

    <p v-if="detail.summary" class="text-sm text-black/70">
      {{ detail.summary }}
    </p>

    <p v-if="detail.author?.name" class="text-xs text-black/50">
      {{ detail.author.name }}
    </p>

    <div class="flex flex-wrap gap-2 text-xs text-black/60">
      <span v-if="displayInstalls" class="inline-flex items-center rounded-full bg-black/5 px-2 py-0.5">
        {{ installsLabel }} · {{ displayInstalls }}
      </span>
      <span v-if="displayVersion" class="inline-flex items-center rounded-full bg-black/5 px-2 py-0.5">
        {{ versionLabel }} · v{{ displayVersion }}
      </span>
      <span v-if="displayUpdatedAt" class="inline-flex items-center rounded-full bg-black/5 px-2 py-0.5">
        {{ updatedLabel }} · {{ displayUpdatedAt }}
      </span>
    </div>

    <div v-if="detail.badges?.length" class="flex flex-wrap gap-2">
      <span
        v-for="badge in detail.badges"
        :key="badge"
        class="inline-flex items-center rounded-full bg-black/5 px-2 py-0.5 text-xs text-black/70"
      >
        {{ badge }}
      </span>
    </div>
  </header>
</template>
