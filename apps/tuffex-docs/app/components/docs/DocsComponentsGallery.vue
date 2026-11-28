<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, provide } from 'vue'
import './DocsComponentsGallery.css'
import tuffexPkg from '../../../../../packages/tuffex/package.json'
import DocsGalleryFrameworkBar from './DocsGalleryFrameworkBar.vue'
import { createSpecimenQueue, SPECIMEN_QUEUE_KEY } from './gallery/specimen-queue'
import type { DocsSuiteKey } from '~/utils/docs-suites'

// One band per render: every suite has its own overview page, so the gallery
// only ever loads and renders that page's suite chunk.
const props = defineProps<{ suite: Exclude<DocsSuiteKey, 'concepts' | 'templates'> }>()

// One viewport-gated queue per gallery, owning a single shared IntersectionObserver.
const specimenQueue = createSpecimenQueue()
provide(SPECIMEN_QUEUE_KEY, specimenQueue)
onBeforeUnmount(() => specimenQueue.dispose())

const suiteComponents = {
  base: defineAsyncComponent(() => import('./gallery/suites/GalleryBaseSuite.vue')),
  pro: defineAsyncComponent(() => import('./gallery/suites/GalleryProSuite.vue')),
  ai: defineAsyncComponent(() => import('./gallery/suites/GalleryAiSuite.vue')),
  data: defineAsyncComponent(() => import('./gallery/suites/GalleryDataSuite.vue')),
  motion: defineAsyncComponent(() => import('./gallery/suites/GalleryMotionSuite.vue')),
  flow: defineAsyncComponent(() => import('./gallery/suites/GalleryFlowSuite.vue')),
} as const

const activeSuiteComponent = computed(() => suiteComponents[props.suite])

const { locale } = useI18n()

const localeKey = computed<'en' | 'zh'>(() => (locale.value === 'zh' ? 'zh' : 'en'))

// BaseURL-relative localized route (`/{locale}/{slug}`) — NuxtLink prepends `app.baseURL` (`/tuffex/`).
function docPath(slug: string) {
  return `/${localeKey.value}/${slug}`
}

function cellLabel(en: string, zh: string) {
  return localeKey.value === 'zh' ? `${en} ${zh}` : en
}
</script>

<template>
  <div class="docs-gallery">
    <DocsGalleryFrameworkBar :suite="props.suite" :version="tuffexPkg.version" />
    <component
      :is="activeSuiteComponent"
      :doc-path="docPath"
      :cell-label="cellLabel"
      :locale-key="localeKey"
      :version="tuffexPkg.version"
    />
  </div>
</template>
