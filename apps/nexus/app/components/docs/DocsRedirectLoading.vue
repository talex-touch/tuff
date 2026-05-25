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
    <div class="docs-redirect-loading__bg" aria-hidden="true" />

    <div class="docs-redirect-loading__content">
      <div class="docs-redirect-loading__badge">
        <span class="i-carbon-circle-dash docs-redirect-loading__spinner" />
        <span>{{ resolvedTitle }}</span>
      </div>
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
  color: var(--tx-text-color-primary, #f5f7fa);
  background:
    radial-gradient(circle at 50% -10%, rgba(96, 165, 250, 0.22), transparent 34%),
    radial-gradient(circle at 78% 78%, rgba(168, 85, 247, 0.18), transparent 32%),
    linear-gradient(135deg, #050607 0%, #111217 58%, #050607 100%);
}

.docs-redirect-loading__bg {
  position: absolute;
  inset: -20%;
  background:
    linear-gradient(115deg, transparent 22%, rgba(255, 255, 255, 0.08) 42%, transparent 58%),
    radial-gradient(circle at 20% 72%, rgba(64, 158, 255, 0.18), transparent 28%);
  filter: blur(18px);
  opacity: 0.55;
  transform: rotate(-8deg);
}

.docs-redirect-loading__content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.docs-redirect-loading__badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: rgba(12, 14, 18, 0.72);
  padding: 9px 16px;
  color: rgba(255, 255, 255, 0.86);
  font-size: 14px;
  line-height: 1;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.26);
  backdrop-filter: blur(16px) saturate(160%);
}

.docs-redirect-loading__spinner {
  color: var(--tx-color-primary, #409eff);
  font-size: 16px;
  animation: docs-redirect-spin 1.1s linear infinite;
}

@keyframes docs-redirect-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
