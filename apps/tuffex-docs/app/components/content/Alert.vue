<script setup lang="ts">
import { computed } from 'vue'

type AlertTone = 'info' | 'tip' | 'success' | 'warning' | 'danger' | 'error'

const props = withDefaults(defineProps<{
  type?: AlertTone
  title?: string
  description?: string
}>(), {
  type: 'info',
  title: '',
  description: '',
})

const normalizedTone = computed(() => {
  if (props.type === 'tip')
    return 'success'
  if (props.type === 'error')
    return 'danger'
  return props.type
})

const iconClass = computed(() => {
  switch (normalizedTone.value) {
    case 'success':
      return 'i-carbon-checkmark-filled'
    case 'warning':
      return 'i-carbon-warning-filled'
    case 'danger':
      return 'i-carbon-error-filled'
    default:
      return 'i-carbon-information-filled'
  }
})
</script>

<template>
  <aside class="docs-alert not-prose" :data-tone="normalizedTone" role="note">
    <span class="docs-alert__icon" :class="iconClass" aria-hidden="true" />
    <div class="docs-alert__body">
      <div v-if="props.title" class="docs-alert__title">
        {{ props.title }}
      </div>
      <div class="docs-alert__content">
        <slot>
          <p v-if="props.description" class="docs-alert__desc">
            {{ props.description }}
          </p>
        </slot>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.docs-alert {
  --alert-hue: var(--tx-color-primary, #409eff);
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 18px 0;
  padding: 13px 16px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--alert-hue) 9%, var(--docs-surface));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--alert-hue) 28%, transparent);
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--docs-ink);
}

.docs-alert[data-tone='success'] { --alert-hue: var(--tx-color-success, #67c23a); }
.docs-alert[data-tone='warning'] { --alert-hue: var(--tx-color-warning, #e6a23c); }
.docs-alert[data-tone='danger'] { --alert-hue: var(--tx-color-danger, #f56c6c); }

.docs-alert__icon {
  flex: none;
  margin-top: 3px;
  font-size: 16px;
  color: var(--alert-hue);
}

.docs-alert__body {
  min-width: 0;
  flex: 1;
}

.docs-alert__title {
  font-weight: 600;
  margin-bottom: 3px;
  color: var(--docs-ink);
}

.docs-alert__content :deep(p) {
  margin: 0;
}

.docs-alert__desc {
  margin: 0;
  color: var(--docs-ink-regular);
}
</style>
