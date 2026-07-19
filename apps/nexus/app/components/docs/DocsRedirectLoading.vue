<script setup lang="ts">
const props = withDefaults(defineProps<{
  title?: string
  description?: string
}>(), {
  title: '',
  description: '',
})

const { t } = useI18n()

const resolvedTitle = computed(() => props.title || t('docs.redirecting'))
</script>

<template>
  <section class="docs-redirect-loading" aria-live="polite" aria-busy="true">
    <div class="docs-redirect-loading__panel">
      <span class="docs-redirect-loading__spinner" aria-hidden="true" />
      <p class="docs-redirect-loading__message">
        {{ resolvedTitle }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.docs-redirect-loading {
  position: relative;
  min-height: 100vh;
  width: 100vw;
  overflow: hidden;
  display: grid;
  place-items: center;
  padding: clamp(24px, 5vw, 56px);
  color: rgba(255, 255, 255, 0.72);
  background: transparent;
}

.docs-redirect-loading__panel {
  position: relative;
  z-index: 1;
  display: grid;
  justify-items: center;
  gap: 14px;
  min-width: min(92vw, 280px);
  padding: 22px 24px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  background: rgba(10, 12, 18, 0.55);
  backdrop-filter: blur(14px);
}

.docs-redirect-loading__spinner {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 2px solid rgba(255, 255, 255, 0.18);
  border-top-color: rgba(255, 255, 255, 0.82);
  animation: docs-redirect-spin 0.8s linear infinite;
}

.docs-redirect-loading__message {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  font-weight: 500;
  text-align: center;
}

@keyframes docs-redirect-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .docs-redirect-loading__spinner {
    animation: none;
    border-top-color: rgba(255, 255, 255, 0.55);
  }
}
</style>
