<script setup lang="ts">
import type { FunctionalComponent } from 'vue'
import { ref } from 'vue'
// Nuxt's own ClientOnly, imported by name: DocsComponentsGallery.vue binds this
// wrapper to `ClientOnly`, so an unqualified tag there resolves to this file.
import { ClientOnly } from '#components'

const { t } = useI18n()

// Bumped by the reset button. Keying the specimen on it unmounts and remounts
// everything the cell renders, so an entrance animation plays again and any
// state the specimen keeps of its own starts over. State the gallery holds for
// the cell (a switch's model, an open flag) is the gallery's and survives.
const generation = ref(0)

const Specimen: FunctionalComponent = (_, { slots }) => slots.default?.()
</script>

<template>
  <ClientOnly>
    <Specimen :key="generation">
      <slot />
    </Specimen>
    <button
      type="button"
      class="docs-gallery__replay"
      :aria-label="t('docs.demo.reset')"
      :title="t('docs.demo.reset')"
      @click="generation++"
    >
      <span class="docs-gallery__replay-icon i-carbon-renew" aria-hidden="true" />
    </button>
    <template #fallback>
      <slot name="fallback" />
    </template>
  </ClientOnly>
</template>
