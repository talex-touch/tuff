<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { prefersReducedMotion } from './use-gallery-loop'

const props = defineProps<{
  stages: string[]
  nextLabel: string
}>()

const index = ref(0)
const stage = computed(() => props.stages[index.value % props.stages.length] ?? '')

function next() {
  index.value += 1
}

// One step on its own after mounting, so the cell's reset button replays a
// morph. Only one: both rows are `aria-live`, and a loop would read every
// stage out to a screen reader for as long as the page stayed open.
let timer: ReturnType<typeof setTimeout> | undefined
onMounted(() => {
  if (!prefersReducedMotion())
    timer = setTimeout(next, 700)
})
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="docs-gallery__stack docs-gallery__stack--center">
    <div class="docs-gallery__morph">
      <code>morph</code>
      <TxTextTransformer :text="stage" :duration-ms="360" />
      <code>fade</code>
      <TxTextTransformer :text="stage" mode="fade" :duration-ms="360" :blur-px="8" />
    </div>
    <TxButton size="sm" icon="i-carbon-arrow-right" @click="next">
      {{ props.nextLabel }}
    </TxButton>
  </div>
</template>
