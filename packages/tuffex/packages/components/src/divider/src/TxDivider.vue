<script setup lang="ts">
import { computed } from 'vue'

type DividerGradient = boolean | 'start' | 'end' | 'both'

defineOptions({
  name: 'TxDivider',
})

const props = withDefaults(
  defineProps<{
    direction?: 'horizontal' | 'vertical'
    dashed?: boolean
    textPlacement?: 'left' | 'center' | 'right'
    gradient?: DividerGradient
  }>(),
  {
    direction: 'horizontal',
    dashed: false,
    textPlacement: 'center',
    gradient: false,
  },
)

const hasText = computed(() => props.direction === 'horizontal')
const gradientMode = computed<'start' | 'end' | 'both' | null>(() => {
  if (props.gradient === true) {
    return 'both'
  }
  if (props.gradient === 'start' || props.gradient === 'end' || props.gradient === 'both') {
    return props.gradient
  }
  return null
})
const isGradient = computed(() => Boolean(gradientMode.value))
const gradientClass = computed(() => gradientMode.value ? `tx-divider--gradient-${gradientMode.value}` : '')
</script>

<template>
  <div
    class="tx-divider"
    :class="[
      `tx-divider--${direction}`,
      `tx-divider--text-${textPlacement}`,
      gradientClass,
      {
        'tx-divider--dashed': dashed,
        'tx-divider--gradient': isGradient,
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

.tx-divider--gradient.tx-divider--horizontal::before,
.tx-divider--gradient.tx-divider--horizontal::after,
.tx-divider--gradient.tx-divider--vertical {
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
}

.tx-divider--gradient-start.tx-divider--horizontal::before {
  -webkit-mask-image: linear-gradient(to right, transparent, #000);
  mask-image: linear-gradient(to right, transparent, #000);
}

.tx-divider--gradient-start.tx-divider--horizontal::after {
  -webkit-mask-image: linear-gradient(to right, #000, #000);
  mask-image: linear-gradient(to right, #000, #000);
}

.tx-divider--gradient-end.tx-divider--horizontal::before {
  -webkit-mask-image: linear-gradient(to right, #000, #000);
  mask-image: linear-gradient(to right, #000, #000);
}

.tx-divider--gradient-end.tx-divider--horizontal::after {
  -webkit-mask-image: linear-gradient(to right, #000, transparent);
  mask-image: linear-gradient(to right, #000, transparent);
}

.tx-divider--gradient-both.tx-divider--horizontal::before {
  -webkit-mask-image: linear-gradient(to right, transparent, #000);
  mask-image: linear-gradient(to right, transparent, #000);
}

.tx-divider--gradient-both.tx-divider--horizontal::after {
  -webkit-mask-image: linear-gradient(to right, #000, transparent);
  mask-image: linear-gradient(to right, #000, transparent);
}

.tx-divider--gradient-start.tx-divider--vertical {
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000);
  mask-image: linear-gradient(to bottom, transparent, #000);
}

.tx-divider--gradient-end.tx-divider--vertical {
  -webkit-mask-image: linear-gradient(to bottom, #000, transparent);
  mask-image: linear-gradient(to bottom, #000, transparent);
}

.tx-divider--gradient-both.tx-divider--vertical {
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 50%, transparent);
  mask-image: linear-gradient(to bottom, transparent, #000 50%, transparent);
}
</style>
