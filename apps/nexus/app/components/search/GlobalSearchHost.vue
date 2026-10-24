<script setup lang="ts">
import type { Component } from 'vue'
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { useGlobalSearchState } from '~/composables/useGlobalSearchState'

/**
 * Where the palette mounts, inside its own <Suspense> in app.vue. The flag is read here rather
 * than passed in, so that adding the palette is this component's update and not app.vue's: Vue
 * leaves a nested Suspense unpatched while the Suspense around it is still waiting, which in that
 * case is the page's, for as long as its async components take to load.
 */
const { mounted, mountSearch, closeSearch } = useGlobalSearchState()
const palette = shallowRef<Component | null>(null)
let loading: Promise<void> | null = null
const searchIntentDisposers: Array<() => void> = []

/**
 * Loads the palette here rather than through its Lazy component, which keeps a failed load for
 * good: the search then stayed open with nothing on screen, and every later click went to that
 * open. A failure closes and unmounts the search instead, so the next open loads it again.
 * Chrome fails a module URL that has failed once without asking the network again; in a build,
 * Nuxt reloads the page on a failed chunk (`emitRouteChunkError`), which is what clears that.
 */
function loadPalette() {
  loading ??= import('~/components/search/GlobalSearch.vue')
    .then((module) => {
      palette.value = module.default
    })
    .catch(() => {
      loading = null
      mounted.value = false
      closeSearch()
    })
}

watch(mounted, (value) => {
  if (value && !palette.value)
    loadPalette()
}, { immediate: true })

function mountSearchOnIntent() {
  mountSearch()
  for (const dispose of searchIntentDisposers)
    dispose()
  searchIntentDisposers.length = 0
}

// The search chunk is non-critical on a passive landing visit. Start it on the first real
// interaction; the boot script already queues an early shortcut/click until the boundary resolves.
onMounted(() => {
  for (const eventName of ['pointerdown', 'keydown', 'touchstart'] as const) {
    window.addEventListener(eventName, mountSearchOnIntent, { passive: true, once: true })
    searchIntentDisposers.push(() => window.removeEventListener(eventName, mountSearchOnIntent))
  }
})

onBeforeUnmount(() => {
  for (const dispose of searchIntentDisposers)
    dispose()
  searchIntentDisposers.length = 0
})
</script>

<template>
  <component :is="palette" v-if="palette" />
</template>
