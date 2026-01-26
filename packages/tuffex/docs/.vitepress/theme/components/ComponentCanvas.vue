<script setup lang="ts">
withDefaults(defineProps<{
  name: string
  subtitle?: string
}>(), {
  subtitle: '',
})
</script>

<template>
  <section class="tx-component-canvas">
    <div class="tx-component-canvas__content">
      <slot />
    </div>
    <div v-if="name" class="tx-component-canvas__label">
      {{ name }}
    </div>
    <p v-if="subtitle" class="tx-component-canvas__subtitle">
      {{ subtitle }}
    </p>
  </section>
</template>

<style scoped>
.tx-component-canvas {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 260px;
  padding: 48px 32px 56px;
  border-radius: 26px;
  border: 1px solid color-mix(in srgb, var(--vp-c-border) 70%, transparent);
  background: color-mix(in srgb, var(--vp-c-bg) 96%, transparent);
  overflow: hidden;
}

.tx-component-canvas::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(90deg, rgba(59, 130, 246, 0.08) 1px, transparent 1px),
    linear-gradient(180deg, rgba(59, 130, 246, 0.08) 1px, transparent 1px);
  background-size: 32px 32px;
  opacity: 0.7;
  pointer-events: none;
}

.tx-component-canvas::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, rgba(59, 130, 246, 0.08), transparent 60%);
  opacity: 0.6;
  pointer-events: none;
}

.tx-component-canvas__content {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  min-height: 120px;
}

.tx-component-canvas__label {
  position: absolute;
  right: 18px;
  bottom: 14px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
}

.tx-component-canvas__subtitle {
  position: absolute;
  left: 18px;
  bottom: 14px;
  margin: 0;
  font-size: 12px;
  color: var(--vp-c-text-3);
}
</style>
