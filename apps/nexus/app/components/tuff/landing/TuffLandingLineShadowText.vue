<script setup lang="ts">
defineOptions({
  name: 'TuffLandingLineShadowText',
})

defineProps<{
  text: string
}>()
</script>

<template>
  <span class="TuffLandingLineShadowText" :data-text="text">
    {{ text }}
  </span>
</template>

<style scoped>
.TuffLandingLineShadowText {
  --line-shadow-color: rgba(226, 232, 240, 0.85);

  position: relative;
  display: inline-flex;
  z-index: 0;
  filter: drop-shadow(0 6px 18px rgba(226, 232, 240, 0.2));
}

.TuffLandingLineShadowText::after {
  content: attr(data-text);
  position: absolute;
  top: 0.04em;
  left: 0.04em;
  z-index: -1;
  background: linear-gradient(45deg, transparent 45%, var(--line-shadow-color) 45%, var(--line-shadow-color) 55%, transparent 0);
  background-size: 0.06em 0.06em;
  background-clip: text;
  color: transparent;
  animation: landing-line-shadow 15s linear infinite;
  -webkit-background-clip: text;
}

@keyframes landing-line-shadow {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: 100% -100%;
  }
}
</style>
