<script setup lang="ts">
definePageMeta({
  layout: 'docs',
})

const route = useRoute()
const { locale, t } = useI18n()
const localePath = useLocalePath()

const SUPPORTED_LOCALES = ['en', 'zh']
const GITHUB_EDIT_BASE_URL = 'https://github.com/talex-touch/tuff-nexus/edit/main'

function stripLocalePrefix(path: string) {
  if (!path)
    return '/'
  for (const code of SUPPORTED_LOCALES) {
    const exact = `/${code}`
    if (path === exact || path === `${exact}/`)
      return '/'
    const prefixed = `${exact}/`
    if (path.startsWith(prefixed))
      return path.slice(exact.length) || '/'
  }
  return path
}

const docPath = computed(() => {
  const rawPath = route.path.endsWith('/') && route.path.length > 1
    ? route.path.slice(0, -1)
    : route.path
  const normalized = stripLocalePrefix(rawPath)
  return normalized || '/docs'
})

const localizedPath = computed(() => {
  if (locale.value === 'en')
    return docPath.value
  return `${docPath.value}.${locale.value}`
})

function normalizeContentPath(path: string | null | undefined) {
  if (!path)
    return null
  const prefixed = path.startsWith('/') ? path : `/${path}`
  return stripLocalePrefix(prefixed).replace(/\.(en|zh)$/, '')
}

const { data: doc, status } = await useAsyncData(
  () => `doc:${docPath.value}:${locale.value}`,
  async () => {
    const localizedDoc = await queryCollection('docs').path(localizedPath.value).first()
    if (localizedDoc)
      return localizedDoc

    return await queryCollection('docs').path(docPath.value).first()
  },
  { watch: [docPath, locale] },
)

const { data: navigationTree } = await useAsyncData(
  'docs:navigation',
  () => queryCollectionNavigation('docs'),
)

const outlineState = useState<any[]>('docs-toc', () => [])
const docTitleState = useState<string>('docs-title', () => '')
const docLocaleState = useState<string>('docs-locale', () => locale.value)

function resolveDocLocale(target: any) {
  const path = typeof target?._path === 'string' ? target._path : null
  if (!path)
    return 'en'
  if (path.endsWith('.zh'))
    return 'zh'
  if (path.endsWith('.en'))
    return 'en'
  return 'en'
}

const normalizedDocPath = computed(() => normalizeContentPath(doc.value?._path ?? docPath.value))

function itemTitle(title?: string, path?: string) {
  if (title)
    return title
  if (!path)
    return 'Untitled'

  return path
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/\.(en|zh)$/, '')
    ?.replace(/[-_]/g, ' ')
    ?.replace(/\b\w/g, c => c.toUpperCase()) ?? 'Untitled'
}

function collectSectionPages(node: any): any[] {
  if (!node)
    return []
  const queue = Array.isArray(node) ? node : [node]
  const result: any[] = []
  for (const current of queue) {
    if (!current)
      continue
    const currentPath = normalizeContentPath(current.path)
    if (currentPath && current.page !== false)
      result.push(current)
    if (Array.isArray(current.children) && current.children.length > 0)
      result.push(...collectSectionPages(current.children))
  }
  return result
}

const navigationSections = computed(() => {
  const items = navigationTree.value ?? []
  if (!items.length)
    return []
  const [first] = items
  if (first?.path === '/docs' && Array.isArray(first.children))
    return first.children
  return items
})

const docPager = computed(() => {
  const sections = navigationSections.value
  const currentPath = normalizedDocPath.value

  if (!sections.length || !currentPath)
    return { prev: null, next: null, sectionTitle: null }

  for (const section of sections) {
    const pages = collectSectionPages(section)
    const index = pages.findIndex(page => normalizeContentPath(page.path) === currentPath)
    if (index === -1)
      continue

    const prev = index > 0 ? pages[index - 1] : null
    const next = index < pages.length - 1 ? pages[index + 1] : null

    return {
      prev,
      next,
      sectionTitle: itemTitle(section.title, section.path),
    }
  }

  return { prev: null, next: null, sectionTitle: null }
})

const githubEditUrl = computed(() => {
  const file = doc.value?._file
  if (!file)
    return null
  const segments = [
    GITHUB_EDIT_BASE_URL,
    'content',
  ]
  if (file.path) {
    const normalized = file.path.startsWith('/') ? file.path.slice(1) : file.path
    segments.push(normalized)
  }
  else if (doc.value?._path) {
    const normalized = doc.value._path.replace(/^\//, '')
    segments.push(`${normalized}${file.extension ? '' : '.md'}`)
  }

  let url = segments.join('/')
  if (file.extension && !url.endsWith(`.${file.extension}`))
    url = `${url}.${file.extension}`

  return url
})

const lastUpdatedDate = computed(() => {
  const source = doc.value
  if (!source)
    return null

  const candidates = [
    source.updatedAt,
    source.modifiedAt,
    source._file?.mtime,
    source._file?.createdAt,
    source._file?.updatedAt,
  ]

  for (const candidate of candidates) {
    if (!candidate)
      continue
    const value = new Date(candidate)
    if (!Number.isNaN(value.getTime()))
      return value
  }

  return null
})

const formattedLastUpdated = computed(() => {
  if (!lastUpdatedDate.value)
    return null
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(lastUpdatedDate.value)
})

const pagerPrevPath = computed(() => {
  const entry = docPager.value.prev
  return entry ? normalizeContentPath(entry.path) : null
})

const pagerNextPath = computed(() => {
  const entry = docPager.value.next
  return entry ? normalizeContentPath(entry.path) : null
})

const pagerPrevTitle = computed(() => {
  const entry = docPager.value.prev
  return entry ? itemTitle(entry.title, entry.path) : null
})

const pagerNextTitle = computed(() => {
  const entry = docPager.value.next
  return entry ? itemTitle(entry.title, entry.path) : null
})

watchEffect(() => {
  if (doc.value) {
    outlineState.value = doc.value.body?.toc?.links ?? []
    docTitleState.value = doc.value.title ?? doc.value.head?.title ?? ''
    docLocaleState.value = resolveDocLocale(doc.value)
  }
  else {
    outlineState.value = []
    docTitleState.value = ''
    docLocaleState.value = locale.value
  }
})

onBeforeUnmount(() => {
  outlineState.value = []
  docTitleState.value = ''
})
</script>

<template>
  <div class="relative">
    <div
      v-if="status === 'pending'"
      class="flex items-center justify-center px-6 py-20 text-sm text-gray-500 dark:bg-dark/70 dark:text-gray-300"
    >
      <span class="i-carbon-circle-dash text-lg" />
      <span class="ml-3">{{ t('docs.loading') }}</span>
    </div>

    <div
      v-else-if="doc"
      class="docs-surface px-8 py-10 space-y-10"
    >
      <ContentRenderer
        :value="doc"
        class="docs-prose markdown-body max-w-none prose prose-neutral dark:prose-invert"
      />
      <div
        v-if="githubEditUrl || formattedLastUpdated"
        class="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-dark/5 pt-6 text-sm text-black/40 dark:border-light/5 dark:text-light/40"
      >
        <div v-if="formattedLastUpdated" class="flex items-center gap-1.5">
          <span class="i-carbon-time" />
          <span>
            {{ t('docs.lastUpdatedLabel') }}
            <span class="text-black/70 dark:text-light/70">{{ formattedLastUpdated }}</span>
          </span>
        </div>
        <NuxtLink
          v-if="githubEditUrl"
          :href="githubEditUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-1.5 transition-colors hover:text-primary"
        >
          <span class="i-carbon-logo-github" />
          {{ t('docs.editOnGitHub') }}
        </NuxtLink>
      </div>

      <div v-if="pagerPrevPath || pagerNextPath" class="space-y-4">
        <div v-if="docPager.sectionTitle" class="text-xs text-black/40 tracking-[0.2em] uppercase dark:text-light/40">
          {{ docPager.sectionTitle }}
        </div>
        <div class="grid gap-4 lg:grid-cols-2">
          <NuxtLink
            v-if="pagerPrevPath"
            :to="localePath(pagerPrevPath)"
            class="group flex flex-col gap-2 border border-dark/10 rounded-2xl px-5 py-4 no-underline transition dark:border-light/10 hover:border-dark/20 hover:bg-dark/5 dark:hover:border-light/20 dark:hover:bg-light/5"
          >
            <span class="dark:group-hover:text-primary-200 flex items-center gap-2 text-xs text-black/40 font-medium tracking-[0.2em] uppercase dark:text-light/40 group-hover:text-primary">
              <span class="i-carbon-arrow-left text-base" />
              {{ t('docs.previousChapter') }}
            </span>
            <span class="dark:group-hover:text-primary-200 text-base text-black font-semibold transition dark:text-light group-hover:text-primary">
              {{ pagerPrevTitle }}
            </span>
          </NuxtLink>
          <NuxtLink
            v-if="pagerNextPath"
            :to="localePath(pagerNextPath)"
            class="group flex flex-col gap-2 border border-dark/10 rounded-2xl px-5 py-4 no-underline transition dark:border-light/10 hover:border-primary/30 hover:bg-primary/5 dark:hover:border-primary/40 dark:hover:bg-primary/10"
          >
            <span class="dark:group-hover:text-primary-200 flex items-center gap-2 text-xs text-black/40 font-medium tracking-[0.2em] uppercase dark:text-light/40 group-hover:text-primary">
              {{ t('docs.nextChapter') }}
              <span class="i-carbon-arrow-right text-base" />
            </span>
            <span class="dark:group-hover:text-primary-200 text-base text-black font-semibold transition dark:text-light group-hover:text-primary">
              {{ pagerNextTitle }}
            </span>
          </NuxtLink>
        </div>
      </div>
    </div>

    <div
      v-else
      class="p-10 text-center space-y-4"
    >
      <div class="mx-auto h-16 w-16 flex items-center justify-center rounded-full bg-dark/5 text-3xl text-black dark:bg-light/10 dark:text-light">
        <span class="i-carbon-warning" />
      </div>
      <div class="text-lg text-black font-semibold dark:text-light">
        {{ t('docs.notFoundTitle') }}
      </div>
      <p class="text-sm text-gray-500 dark:text-gray-300">
        {{ t('docs.notFoundDescription') }}
      </p>
      <NuxtLink
        to="/docs"
        class="inline-flex items-center justify-center gap-2 rounded-full bg-dark px-5 py-2 text-sm text-light font-medium no-underline transition dark:bg-light hover:bg-black dark:text-black dark:hover:bg-light/90"
      >
        <span class="i-carbon-arrow-left text-base" />
        {{ t('docs.backHome') }}
      </NuxtLink>
    </div>
  </div>
</template>

<style src="../../components/docs/github-markdown.css" />

<style scoped>
/* :deep(.docs-prose h1) {
  font-size: 2.25rem;
  font-weight: 700;
  margin-bottom: 2rem;
  letter-spacing: -0.02em;
}

:deep(.docs-prose h2) {
  font-size: 1.75rem;
  font-weight: 600;
  margin-top: 3rem;
  margin-bottom: 1.25rem;
  letter-spacing: -0.01em;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  padding-bottom: 0.5rem;
}

:deep(.dark .docs-prose h2) {
  border-bottom-color: rgba(255, 255, 255, 0.05);
}

:deep(.docs-prose h3) {
  font-size: 1.25rem;
  font-weight: 600;
  margin-top: 2rem;
  margin-bottom: 1rem;
}

:deep(.docs-prose p),
:deep(.docs-prose ul),
:deep(.docs-prose ol) {
  line-height: 1.8;
  margin-bottom: 1.25rem;
  color: rgba(0, 0, 0, 0.8);
}

:deep(.dark .docs-prose p),
:deep(.dark .docs-prose ul),
:deep(.dark .docs-prose ol) {
  color: rgba(255, 255, 255, 0.8);
}

:deep(.docs-prose code) {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.875em;
  border-radius: 0.375rem;
  padding: 0.2rem 0.3rem;
  background-color: rgba(0, 0, 0, 0.05);
  color: #eb5757;
}

:deep(.dark .docs-prose code) {
  background-color: rgba(255, 255, 255, 0.1);
  color: #ff7b72;
}

:deep(.docs-prose pre) {
  margin: 1.5rem 0;
  padding: 1rem;
  border-radius: 0.75rem;
  background-color: #1e1e1e !important;
  border: 1px solid rgba(0, 0, 0, 0.1);
  overflow-x: auto;
}

:deep(.dark .docs-prose pre) {
  border-color: rgba(255, 255, 255, 0.1);
  background-color: #0d1117 !important;
}

:deep(.docs-prose pre code) {
  background-color: transparent !important;
  padding: 0;
  border-radius: 0;
  color: inherit;
  font-size: 0.9em;
  line-height: 1.6;
}

:deep(.docs-prose blockquote) {
  border-left: 4px solid var(--color-primary, #3b82f6);
  padding-left: 1rem;
  margin: 1.5rem 0;
  font-style: italic;
  color: rgba(0, 0, 0, 0.6);
}

:deep(.dark .docs-prose blockquote) {
  color: rgba(255, 255, 255, 0.6);
}

:deep(.docs-prose ul) {
  list-style-type: disc;
  padding-left: 1.5rem;
}

:deep(.docs-prose ol) {
  list-style-type: decimal;
  padding-left: 1.5rem;
}

:deep(.docs-prose a) {
  color: var(--color-primary, #3b82f6);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s;
}

:deep(.docs-prose a:hover) {
  border-bottom-color: currentColor;
} */
</style>
