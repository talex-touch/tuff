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
    <p class="docs-redirect-loading__message">
      {{ resolvedTitle }}
    </p>
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

.docs-redirect-loading__message {
  position: relative;
  z-index: 1;
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  font-weight: 500;
}
</style>
