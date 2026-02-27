<script setup lang="ts">
import { computed } from 'vue'

interface LocalizedText {
  zh: string
  en: string
}

interface ReleaseNotePayload {
  slug: string
  path: string
  releaseTag: string
  version: string
  title: string
  channel: string
  publishedAt: string
  notes: LocalizedText
  notesHtml?: LocalizedText | null
}

interface ReleaseNoteResponse {
  note: ReleaseNotePayload
}

definePageMeta({
  layout: 'home',
  pageTransition: {
    name: 'page-slide',
    mode: 'out-in',
  },
})

const route = useRoute()
const { locale } = useI18n()

const slug = computed(() => {
  const rawSlug = (route.params as { slug?: string | string[] }).slug
  const normalizedSlug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug
  return String(normalizedSlug ?? '').trim()
})
const isZh = computed(() => locale.value.toLowerCase().startsWith('zh'))

function resolveLocalizedText(content: LocalizedText | null | undefined): string {
  if (!content)
    return ''
  if (isZh.value)
    return content.zh || content.en || ''
  return content.en || content.zh || ''
}

const { data, pending, error } = await useAsyncData(
  () => `release-note-${slug.value}`,
  () => $fetch<ReleaseNoteResponse>(`/api/notes/${encodeURIComponent(slug.value)}`),
  {
    watch: [slug],
  },
)

const note = computed(() => data.value?.note ?? null)
const noteHtml = computed(() => resolveLocalizedText(note.value?.notesHtml))
const noteText = computed(() => resolveLocalizedText(note.value?.notes))
const publishedLabel = computed(() => {
  if (!note.value?.publishedAt)
    return ''
  const parsed = new Date(note.value.publishedAt)
  if (Number.isNaN(parsed.getTime()))
    return note.value.publishedAt
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(parsed)
})

useHead(() => ({
  title: note.value?.title ? `${note.value.title} | Notes` : 'Release Notes',
}))
</script>

<template>
  <section class="mx-auto max-w-4xl min-h-screen w-full px-6 py-16 md:px-10">
    <NuxtLink to="/updates" class="inline-flex items-center gap-2 text-sm text-gray-500 transition hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
      <span class="i-carbon-arrow-left text-base" />
      <span>{{ isZh ? '返回更新页' : 'Back to updates' }}</span>
    </NuxtLink>

    <div v-if="pending" class="mt-8 rounded-2xl border border-gray-200 bg-white/80 p-8 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-400">
      {{ isZh ? '正在加载发布日志...' : 'Loading release notes...' }}
    </div>

    <div
      v-else-if="error || !note"
      class="mt-8 rounded-2xl border border-red-200 bg-red-50 p-8 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-200"
    >
      {{ isZh ? '未找到对应发布日志。' : 'Release notes not found.' }}
    </div>

    <article v-else class="mt-8 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm md:p-10 dark:border-gray-700 dark:bg-gray-800/80">
      <header class="mb-6 flex flex-col gap-3 border-b border-gray-100 pb-6 dark:border-gray-700">
        <p class="text-xs tracking-wide text-gray-400 uppercase">
          {{ note.releaseTag }}
        </p>
        <h1 class="text-2xl font-semibold text-gray-900 md:text-3xl dark:text-white">
          {{ note.title }}
        </h1>
        <div class="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span>{{ note.version }}</span>
          <span>•</span>
          <span>{{ note.channel }}</span>
          <span v-if="publishedLabel">•</span>
          <span v-if="publishedLabel">{{ publishedLabel }}</span>
        </div>
      </header>

      <div
        v-if="noteHtml"
        class="prose prose-sm prose-gray max-w-none dark:prose-invert"
        v-html="noteHtml"
      />
      <div
        v-else
        class="whitespace-pre-wrap text-sm leading-7 text-gray-700 dark:text-gray-200"
      >
        {{ noteText }}
      </div>
    </article>
  </section>
</template>
