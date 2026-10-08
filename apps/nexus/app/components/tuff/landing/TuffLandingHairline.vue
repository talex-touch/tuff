<script lang="ts">
import { hasWindow } from '@talex-touch/utils/env'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

// One figure from @lucasmarkes/hairline (MIT): an isometric line drawing that
// answers the pointer. The build is vendored under public/ rather than bundled,
// so its 42 KB (gzip) only loads once a figure scrolls near the viewport. This
// block is module scope, so every figure on the page shares the one import.

export type HairlineFigureName =
  | 'basket' | 'branches' | 'cabinet' | 'dish' | 'drawer' | 'elevator' | 'exploded'
  | 'keyboard' | 'laptop' | 'lockers' | 'loupe' | 'padlock' | 'patch' | 'phone'
  | 'phosphor' | 'plot' | 'plug' | 'query' | 'rail' | 'riffle' | 'router' | 'sieve'
  | 'slow' | 'terminal' | 'terrain' | 'turntable' | 'vault'

interface HairlineOptions {
  intensity?: number
  theme?: 'auto' | 'light' | 'dark'
  label?: string
  onRead?: (text: string) => void
}

interface HairlineFigure {
  update: (options: HairlineOptions) => void
  destroy: () => void
}

type HairlineModule = Partial<Record<HairlineFigureName, (el: HTMLElement, options?: HairlineOptions) => HairlineFigure>>

const HAIRLINE_URL = '/vendor/hairline/hairline-0.3.0.min.js'

let modulePromise: Promise<HairlineModule> | null = null

function loadHairline(): Promise<HairlineModule> {
  modulePromise ??= import(/* @vite-ignore */ HAIRLINE_URL) as Promise<HairlineModule>
  return modulePromise
}

function forgetHairline() {
  modulePromise = null
}
</script>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  figure: HairlineFigureName
  intensity?: number
  label?: string
}>(), {
  intensity: 0.5,
})

const emit = defineEmits<{
  read: [text: string]
}>()

const hostRef = ref<HTMLElement | null>(null)
let instance: HairlineFigure | null = null
let observer: IntersectionObserver | null = null
let disposed = false

async function mountFigure() {
  if (instance || !hostRef.value)
    return
  let mod: HairlineModule
  try {
    mod = await loadHairline()
  }
  catch {
    // The figure is decoration; an unreachable asset leaves the reserved box empty.
    forgetHairline()
    return
  }
  const host = hostRef.value
  const create = mod[props.figure]
  if (disposed || !host || !create)
    return
  instance = create(host, {
    theme: 'dark',
    intensity: props.intensity,
    label: props.label,
    onRead: text => emit('read', text),
  })
}

onMounted(() => {
  if (!hasWindow() || !hostRef.value)
    return
  if (!('IntersectionObserver' in window)) {
    void mountFigure()
    return
  }
  observer = new IntersectionObserver((entries) => {
    if (!entries.some(entry => entry.isIntersecting))
      return
    observer?.disconnect()
    observer = null
    void mountFigure()
  }, { rootMargin: '240px 0px' })
  observer.observe(hostRef.value)
})

watch(() => props.intensity, value => instance?.update({ intensity: value }))
watch(() => props.label, value => instance?.update({ label: value }))

onBeforeUnmount(() => {
  disposed = true
  observer?.disconnect()
  observer = null
  instance?.destroy()
  instance = null
})
</script>

<template>
  <div ref="hostRef" class="TuffLandingHairline" />
</template>

<style scoped>
/* The figure draws at its host's width and a 5:4 ratio; reserving that box
   keeps the layout still while the module loads. */
.TuffLandingHairline {
  width: 100%;
  aspect-ratio: 5 / 4;
}
</style>
