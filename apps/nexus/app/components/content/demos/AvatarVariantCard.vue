<script setup lang="ts">
defineProps<{
  title: string
  category: string
  desc: string
}>()
</script>

<template>
  <div class="tx-avatar-variants__card">
    <div class="tx-avatar-variants__preview">
      <div class="tx-avatar-variants__grid-bg" aria-hidden="true" />
      <div class="tx-avatar-variants__preview-scale">
        <slot name="preview" />
      </div>
    </div>
    <div class="tx-avatar-variants__info">
      <div class="tx-avatar-variants__info-head">
        <h3 class="tx-avatar-variants__title">
          {{ title }}
        </h3>
        <span class="tx-avatar-variants__tag">{{ category }}</span>
      </div>
      <p class="tx-avatar-variants__desc">
        {{ desc }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.tx-avatar-variants__card {
  background: var(--tx-bg-color);
  border: 1px solid var(--tx-border-color);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
}

.tx-avatar-variants__card:hover {
  border-color: color-mix(in srgb, var(--tx-color-primary) 30%, var(--tx-border-color));
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.tx-avatar-variants__preview {
  position: relative;
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid color-mix(in srgb, var(--tx-border-color) 60%, transparent);
  background: color-mix(in srgb, var(--tx-bg-color-page) 60%, transparent);
}

.tx-avatar-variants__grid-bg {
  position: absolute;
  inset: 0;
  opacity: 0.03;
  background-image: radial-gradient(var(--tx-color-primary) 1px, transparent 1px);
  background-size: 10px 10px;
}

.tx-avatar-variants__preview-scale {
  transform: scale(1.25);
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.tx-avatar-variants__card:hover .tx-avatar-variants__preview-scale {
  transform: scale(1.35);
}

.tx-avatar-variants__info {
  padding: 20px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.tx-avatar-variants__info-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.tx-avatar-variants__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
  margin: 0;
}

.tx-avatar-variants__tag {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--tx-text-color-placeholder);
}

.tx-avatar-variants__desc {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  margin: 0;
  line-height: 1.5;
}
</style>
