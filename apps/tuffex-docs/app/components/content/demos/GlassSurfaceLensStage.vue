<script setup lang="ts">
defineProps<{ hint?: string }>()
</script>

<template>
  <div class="glass-lens-stage">
    <div class="glass-lens-stage__art" aria-hidden="true">
      <span class="glass-lens-stage__ring" />
      <span class="glass-lens-stage__word">Liquid<br>Glass</span>
      <span class="glass-lens-stage__bars" />
    </div>
    <slot />
    <p v-if="hint" class="glass-lens-stage__hint">
      {{ hint }}
    </p>
  </div>
</template>

<style scoped>
.glass-lens-stage {
  position: relative;
  display: grid;
  height: 300px;
  place-items: center;
  overflow: hidden;
  border-radius: 16px;
  background:
    radial-gradient(120% 90% at 100% 0%, #6f8fe8 0%, #2f4fc0 38%, transparent 60%),
    radial-gradient(90% 80% at 0% 100%, #5fd3b2 0%, #2f9c86 40%, transparent 62%),
    #0a1a5c;
}

.glass-lens-stage__art {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.glass-lens-stage__ring {
  position: absolute;
  top: -70px;
  right: 8%;
  width: 190px;
  height: 190px;
  border: 20px solid rgb(160 190 255 / 0.55);
  border-radius: 50%;
}

.glass-lens-stage__word {
  position: absolute;
  inset: 0 0 26% 0;
  display: grid;
  place-content: center;
  color: #fff;
  font: 800 clamp(40px, 8vw, 72px) / 0.95 'Helvetica Neue', Arial, sans-serif;
  letter-spacing: -0.03em;
  text-align: center;
}

.glass-lens-stage__bars {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 26%;
  background: repeating-linear-gradient(90deg, rgb(255 255 255 / 0.85) 0 6px, transparent 6px 18px);
}

.glass-lens-stage__hint {
  position: absolute;
  top: 12px;
  left: 16px;
  margin: 0;
  color: rgb(255 255 255 / 0.74);
  font-size: 12px;
  pointer-events: none;
}
</style>
