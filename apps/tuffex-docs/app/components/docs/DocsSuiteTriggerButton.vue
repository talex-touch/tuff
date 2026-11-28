<script setup lang="ts">
import { hasDocument } from '@talex-touch/utils/env'
import { ref } from 'vue'

interface Props {
  label: string
  srLabel: string
  icon: string
  count?: number
  open?: boolean
}

defineProps<Props>()

const buttonRef = ref<HTMLButtonElement | null>(null)

defineExpose({
  focus: () => buttonRef.value?.focus(),
  isFocused: () => hasDocument() && Boolean(buttonRef.value) && document.activeElement === buttonRef.value,
})
</script>

<template>
  <button
    ref="buttonRef"
    type="button"
    class="docs-suite-trigger"
    aria-haspopup="menu"
    :aria-expanded="open"
  >
    <span class="docs-suite-trigger__icon" aria-hidden="true">
      <span :class="icon" />
    </span>
    <span class="sr-only">{{ srLabel }}</span>
    <span class="docs-suite-trigger__name">{{ label }}</span>
    <span v-if="count" class="docs-suite-trigger__count">
      {{ count }}
    </span>
    <span class="docs-suite-trigger__chevron i-carbon-chevron-sort" aria-hidden="true" />
  </button>
</template>

<style scoped>
.docs-suite-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 40px;
  padding: 0 10px 0 6px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  color: var(--tx-text-color-primary, #303133);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.docs-suite-trigger:hover,
.docs-suite-trigger[aria-expanded='true'] {
  background: var(--docs-nav-switch-track);
}

.docs-suite-trigger:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 2px;
}

.docs-suite-trigger__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  /* Concentric with the trigger: 12px radius minus the 6px inset. */
  border-radius: 6px;
  font-size: 15px;
  color: var(--tx-color-primary, #409eff);
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 14%, transparent);
}

.docs-suite-trigger__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.docs-suite-trigger__count {
  flex: none;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-text-color-primary, #303133) 8%, transparent);
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
  color: var(--docs-nav-ink);
}

.docs-suite-trigger__chevron {
  flex: none;
  font-size: 14px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
