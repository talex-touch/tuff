<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { prefersReducedMotion } from './use-gallery-loop'

export interface GalleryTransformerStage {
  title: string
  desc: string
  tone: 'primary' | 'success' | 'warning'
}

const props = defineProps<{
  stages: GalleryTransformerStage[]
  nextLabel: string
}>()

const index = ref(0)
const stage = computed<GalleryTransformerStage>(() =>
  props.stages[index.value % props.stages.length] ?? { title: '', desc: '', tone: 'primary' },
)

const toneColor = computed(() => {
  if (stage.value.tone === 'success')
    return 'var(--tx-color-success)'
  if (stage.value.tone === 'warning')
    return 'var(--tx-color-warning)'
  return 'var(--tx-color-primary)'
})

function next() {
  index.value += 1
}

// One step on its own after mounting, so the cell's reset button replays a
// blur-fade transition without looping announcements to screen readers.
let timer: ReturnType<typeof setTimeout> | undefined
onMounted(() => {
  if (!prefersReducedMotion())
    timer = setTimeout(next, 700)
})
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="docs-gallery__stack docs-gallery__stack--center">
    <div class="docs-gallery__tt-card">
      <div class="docs-gallery__tt-head">
        <span class="docs-gallery__tt-dot" :style="{ background: toneColor }" aria-hidden="true" />
        <TxTextTransformer
          mode="fade"
          :text="stage.title"
          :duration-ms="340"
          :blur-px="8"
          class="docs-gallery__tt-title"
          :style="{ color: toneColor }"
        />
        <code class="docs-gallery__tt-badge">fade · wrap</code>
      </div>
      <TxTextTransformer
        mode="fade"
        wrap
        :text="stage.desc"
        :duration-ms="380"
        :blur-px="6"
        class="docs-gallery__tt-desc"
      />
    </div>
    <TxButton size="sm" icon="i-carbon-arrow-right" @click="next">
      {{ props.nextLabel }}
    </TxButton>
  </div>
</template>
