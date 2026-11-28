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

<style scoped>
.docs-gallery__tt-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: min(296px, 100%);
  padding: 12px 14px;
  border-radius: var(--tx-button-radius, 12px);
  border: 1px solid var(--docs-gallery-line);
  background: var(--tx-bg-color-overlay, var(--tx-bg-color));
  box-sizing: border-box;
}

.docs-gallery__tt-head {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.docs-gallery__tt-dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  transition: background-color 0.28s ease;
}

.docs-gallery__tt-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
}

.docs-gallery__tt-badge {
  flex: none;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--docs-inline-code-bg);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
  line-height: 1.3;
  color: var(--docs-muted);
}

.docs-gallery__tt-desc {
  min-height: 36px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--docs-muted);
}
</style>
