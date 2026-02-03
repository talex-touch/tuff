<script setup lang="ts">
import type { SharedPluginVersion } from '../plugin-detail'
import { computed } from 'vue'

interface Props {
  versions?: SharedPluginVersion[]
  title?: string
  emptyText?: string
  downloadText?: string
  formatDate?: (value: string | number | Date) => string
  formatSize?: (value: number) => string
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Versions',
  emptyText: 'No versions',
  downloadText: 'Download'
})

const emit = defineEmits<{
  (e: 'download', version: SharedPluginVersion): void
}>()

const hasVersions = computed(() => (props.versions?.length ?? 0) > 0)

const formatBytes = (value: number): string => {
  if (props.formatSize) return props.formatSize(value)
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}

const formatTime = (value: string | number | Date): string => {
  if (props.formatDate) return props.formatDate(value)
  const date = new Date(value as any)
  return Number.isNaN(date.valueOf()) ? `${value}` : date.toLocaleDateString()
}

const signatureText = (signature?: string) => {
  if (!signature) return ''
  return signature.length > 12 ? `${signature.slice(0, 12)}…` : signature
}
</script>

<template>
  <section class="space-y-3">
    <h3 v-if="title" class="text-sm font-semibold uppercase tracking-wide text-black/70">
      {{ title }}
    </h3>
    <div v-if="hasVersions" class="space-y-3">
      <article
        v-for="version in versions"
        :key="version.id ?? version.version"
        class="rounded-2xl border border-black/5 bg-white/80 p-4 text-sm text-black/70"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2 text-black font-semibold">
            <span>v{{ version.version }}</span>
            <span
              v-if="version.channel"
              class="inline-flex items-center rounded-full bg-black/5 px-2 py-0.5 text-xs text-black/70"
            >
              {{ version.channel }}
            </span>
          </div>
          <span class="text-xs text-black/50">
            <span v-if="version.createdAt">{{ formatTime(version.createdAt) }}</span>
            <span v-if="version.packageSize"> · {{ formatBytes(version.packageSize) }}</span>
          </span>
        </div>
        <p v-if="version.changelog" class="mt-2 text-sm leading-relaxed text-black/70">
          {{ version.changelog }}
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <a
            v-if="version.packageUrl"
            :href="version.packageUrl"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center rounded-full bg-black text-white px-3 py-1"
            @click="emit('download', version)"
          >
            {{ downloadText }}
          </a>
          <span
            v-if="version.signature"
            class="inline-flex items-center rounded-full bg-black/5 px-2 py-0.5 text-xs text-black/70"
          >
            {{ signatureText(version.signature) }}
          </span>
        </div>
      </article>
    </div>
    <p v-else class="text-sm text-black/60">
      {{ emptyText }}
    </p>
  </section>
</template>
