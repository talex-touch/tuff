<script setup lang="ts">
defineOptions({
  name: 'TxKbd',
})

withDefaults(
  defineProps<{
    size?: 'sm' | 'md'
    tone?: 'default' | 'primary'
  }>(),
  {
    size: 'sm',
    tone: 'default',
  },
)
</script>

<template>
  <kbd
    class="tx-kbd"
    :class="[
      `tx-kbd--${size}`,
      `tx-kbd--${tone}`,
    ]"
  >
    <slot />
  </kbd>
</template>

<style scoped>
.tx-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border: 1px solid var(--tx-border-color, #dcdfe6);
  border-bottom-color: var(--tx-border-color-dark, #c8ccd3);
  border-radius: 6px;
  background: linear-gradient(180deg, var(--tx-bg-color, #ffffff), var(--tx-fill-color-light, #f5f7fa));
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.08);
  color: var(--tx-text-color-regular, #606266);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

.tx-kbd--md {
  min-width: 26px;
  height: 26px;
  padding: 0 8px;
  font-size: 13px;
}

.tx-kbd--primary {
  border-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 45%, transparent);
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 10%, var(--tx-bg-color, #ffffff));
  color: var(--tx-color-primary, #409eff);
}
</style>
