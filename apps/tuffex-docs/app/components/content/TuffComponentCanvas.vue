<script setup lang="ts">
withDefaults(defineProps<{
  name?: string
  subtitle?: string
}>(), {
  name: '',
  subtitle: '',
})
</script>

<template>
  <section class="tuff-component-canvas not-prose">
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
  min-height: 240px;
  margin: 18px 0;
  padding: 44px 28px 52px;
  border-radius: 20px;
  border: 1px solid var(--docs-border-light);
  background: var(--docs-surface);
  --canvas-grid: color-mix(in srgb, var(--docs-ink) 6%, transparent);
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
  pointer-events: none;
}

.tuff-component-canvas__content {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  min-height: 110px;
}

.tuff-component-canvas__label {
  position: absolute;
  right: 16px;
  bottom: 12px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--docs-muted);
}

.tuff-component-canvas__subtitle {
  position: absolute;
  left: 16px;
  bottom: 12px;
  margin: 0;
  font-size: 12px;
  color: var(--docs-muted);
}
</style>
