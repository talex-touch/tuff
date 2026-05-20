<script setup lang="ts">
import { computed } from 'vue'

defineOptions({
  name: 'TxDivider',
})

const props = withDefaults(
  defineProps<{
    direction?: 'horizontal' | 'vertical'
    dashed?: boolean
    textPlacement?: 'left' | 'center' | 'right'
  }>(),
  {
    direction: 'horizontal',
    dashed: false,
    textPlacement: 'center',
  },
)

const hasText = computed(() => props.direction === 'horizontal')
</script>

<template>
  <div
    class="tx-divider"
    :class="[
      `tx-divider--${direction}`,
      `tx-divider--text-${textPlacement}`,
      {
        'tx-divider--dashed': dashed,
      },
    ]"
    role="separator"
    :aria-orientation="direction"
  >
    <span v-if="hasText && $slots.default" class="tx-divider__text">
      <slot />
    </span>
  </div>
</template>

<style scoped>
.tx-divider {
  --tx-divider-color: var(--tx-border-color, #dcdfe6);
  --tx-divider-gap: 12px;
  box-sizing: border-box;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-divider--horizontal {
  display: flex;
  align-items: center;
  width: 100%;
  margin: 16px 0;
  font-size: 13px;
  line-height: 1;
}

.tx-divider--horizontal::before,
.tx-divider--horizontal::after {
  content: "";
  min-width: var(--tx-divider-gap);
  border-top: 1px solid var(--tx-divider-color);
  flex: 1;
}

.tx-divider--dashed::before,
.tx-divider--dashed::after {
  border-top-style: dashed;
}

.tx-divider--text-left::before {
  flex: 0 0 24px;
}

.tx-divider--text-right::after {
  flex: 0 0 24px;
}

.tx-divider__text {
  padding: 0 var(--tx-divider-gap);
  white-space: nowrap;
}

.tx-divider--vertical {
  display: inline-block;
  width: 1px;
  height: 1em;
  min-height: 16px;
  margin: 0 8px;
  vertical-align: middle;
  border-left: 1px solid var(--tx-divider-color);
}

.tx-divider--vertical.tx-divider--dashed {
  border-left-style: dashed;
}
</style>
