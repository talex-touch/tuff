<script setup lang="ts">
import { computed, useSlots } from 'vue'

interface DemoProps {
  title?: string
  description?: string
  codeLabel?: string
}

const props = defineProps<DemoProps>()
const slots = useSlots()
const hasPreview = computed(() => Boolean(slots.preview || slots.default))
const hasCode = computed(() => Boolean(slots.code))
const codeLabel = computed(() => props.codeLabel || '')
</script>

<template>
  <section class="tuff-demo">
    <header v-if="props.title || props.description" class="tuff-demo__header">
      <h3 v-if="props.title" class="tuff-demo__title">
        {{ props.title }}
      </h3>
      <p v-if="props.description" class="tuff-demo__desc">
        {{ props.description }}
      </p>
    </header>
    <div class="tuff-demo__preview">
      <ClientOnly>
        <slot name="preview">
          <slot />
        </slot>
        <template #fallback>
          <div class="tuff-demo__placeholder">
            Demo loads on client.
          </div>
        </template>
      </ClientOnly>
      <div v-if="!hasPreview" class="tuff-demo__placeholder">
        Add a preview slot to render the demo.
      </div>
    </div>
    <div v-if="hasCode" class="tuff-demo__code">
      <div v-if="codeLabel" class="tuff-demo__code-header">
        {{ codeLabel }}
      </div>
      <div class="tuff-demo__code-body">
        <slot name="code" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.tuff-demo {
  border: 1px solid var(--docs-border);
  border-radius: 16px;
  padding: 16px;
  background: linear-gradient(135deg, rgba(20, 20, 25, 0.03), rgba(120, 120, 140, 0.05));
  box-shadow: 0 12px 30px rgba(15, 15, 25, 0.08);
}

.tuff-demo__header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.tuff-demo__title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.tuff-demo__desc {
  font-size: 13px;
  color: var(--docs-muted);
  margin: 0;
}

.tuff-demo__preview {
  border-radius: 12px;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--docs-border) 75%, transparent);
  background: var(--docs-surface, rgba(255, 255, 255, 0.65));
}

.tuff-demo__placeholder {
  font-size: 13px;
  color: var(--docs-muted);
  text-align: center;
  padding: 12px 0;
}

.tuff-demo__code {
  margin-top: 12px;
  border-radius: 12px;
  border: 1px solid var(--docs-border);
  overflow: hidden;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.7), rgba(230, 230, 240, 0.45));
}

.tuff-demo__code-header {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  padding: 8px 12px;
  border-bottom: 1px solid var(--docs-border);
  color: var(--docs-muted);
}

.tuff-demo__code-body {
  padding: 8px;
}

:global(.dark .tuff-demo),
:global([data-theme='dark'] .tuff-demo) {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.04), rgba(40, 40, 50, 0.2));
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
}

:global(.dark .tuff-demo__preview),
:global([data-theme='dark'] .tuff-demo__preview) {
  background: rgba(16, 18, 24, 0.6);
}

:global(.dark .tuff-demo__code),
:global([data-theme='dark'] .tuff-demo__code) {
  background: linear-gradient(135deg, rgba(24, 26, 34, 0.9), rgba(8, 10, 18, 0.85));
}

:slotted(.tuff-demo-row) {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

:slotted(.tuff-demo-pill) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--docs-border);
  font-size: 12px;
  color: var(--docs-ink);
  background: rgba(255, 255, 255, 0.75);
}

:slotted(.tuff-demo-btn) {
  border-radius: 999px;
  padding: 8px 16px;
  border: 1px solid var(--docs-border);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(220, 220, 230, 0.65));
  color: var(--docs-ink);
  font-size: 13px;
}

:slotted(.tuff-demo-btn.is-flat) {
  background: transparent;
  border-style: dashed;
}

:slotted(.tuff-demo-avatar) {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--docs-ink);
  border: 1px solid var(--docs-border);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(220, 220, 230, 0.6));
}

:slotted(.tuff-demo-grid) {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
  gap: 10px;
  width: 100%;
}

:slotted(.tuff-demo-grid-item) {
  height: 48px;
  border-radius: 12px;
  border: 1px solid var(--docs-border);
  background: rgba(255, 255, 255, 0.7);
}
</style>
