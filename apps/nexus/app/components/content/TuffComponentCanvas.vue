<script setup lang="ts">
withDefaults(defineProps<{
  name: string
  subtitle?: string
}>(), {
  subtitle: '',
})
</script>

<template>
  <section class="tuff-component-canvas">
    <div class="tuff-component-canvas__content">
      <slot />
    </div>
    <div v-if="name" class="tuff-component-canvas__label">
      {{ name }}
    </div>
    <p v-if="subtitle" class="tuff-component-canvas__subtitle">
      {{ subtitle }}
    </p>
  </section>
</template>

<style scoped>
.tuff-component-canvas {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 260px;
  padding: 48px 32px 56px;
  border-radius: 26px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.92);
  --canvas-grid: rgba(15, 15, 15, 0.08);
  --canvas-glow: rgba(15, 15, 15, 0.08);
  overflow: hidden;
}

.tuff-component-canvas::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(90deg, var(--canvas-grid) 1px, transparent 1px),
    linear-gradient(180deg, var(--canvas-grid) 1px, transparent 1px);
  background-size: 32px 32px;
  opacity: 0.7;
  pointer-events: none;
}

.tuff-component-canvas::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, var(--canvas-glow), transparent 60%);
  opacity: 0.6;
  pointer-events: none;
}

.tuff-component-canvas__content {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  min-height: 120px;
}

.tuff-component-canvas__label {
  position: absolute;
  right: 18px;
  bottom: 14px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(71, 85, 105, 0.9);
}

.tuff-component-canvas__subtitle {
  position: absolute;
  left: 18px;
  bottom: 14px;
  margin: 0;
  font-size: 12px;
  color: rgba(148, 163, 184, 0.9);
}

:global(.dark .tuff-component-canvas),
:global([data-theme='dark'] .tuff-component-canvas) {
  background: rgba(16, 16, 16, 0.82);
  border-color: rgba(160, 160, 160, 0.25);
  --canvas-grid: rgba(255, 255, 255, 0.06);
  --canvas-glow: rgba(255, 255, 255, 0.06);
}

:global(.dark .tuff-component-canvas__label),
:global([data-theme='dark'] .tuff-component-canvas__label) {
  color: rgba(255, 255, 255, 0.75);
}

:global(.dark .tuff-component-canvas__subtitle),
:global([data-theme='dark'] .tuff-component-canvas__subtitle) {
  color: rgba(200, 200, 200, 0.75);
}
</style>
