<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import ClientOnly from '../GallerySpecimenGate.vue'

defineProps<{
  docPath: (slug: string) => string
  cellLabel: (en: string, zh: string) => string
  localeKey: 'en' | 'zh'
}>()

const GalleryFlowchart = defineAsyncComponent(() => import('../GalleryFlowchart.vue'))
</script>

<template>
  <div class="docs-gallery__grid docs-gallery__grid--single">
    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('flowchart')">
        {{ cellLabel('Flowchart', '流程画布') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <GalleryFlowchart />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>
  </div>
</template>
