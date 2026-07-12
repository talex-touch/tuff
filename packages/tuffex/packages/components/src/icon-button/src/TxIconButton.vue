<script setup lang="ts">
import { computed, ref } from 'vue'
import TxIcon from '../../icon/src/TxIcon.vue'

defineOptions({
  name: 'TxIconButton',
  inheritAttrs: false,
})

const props = withDefaults(defineProps<{
  icon?: string
  label?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  shape?: 'square' | 'circle' | 'pill'
  pressed?: boolean
  disabled?: boolean
  nativeType?: 'button' | 'submit' | 'reset'
}>(), {
  icon: '',
  label: '',
  size: 'md',
  shape: 'square',
  disabled: false,
  nativeType: 'button',
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const isHovered = ref(false)
const ariaLabel = computed(() => props.label || undefined)
const ariaPressed = computed(() => typeof props.pressed === 'boolean' ? props.pressed : undefined)

function handleClick(event: MouseEvent) {
  if (props.disabled)
    return
  emit('click', event)
}

function handleMouseenter() {
  isHovered.value = true
}

function handleMouseleave() {
  isHovered.value = false
}
</script>

<template>
  <button
    class="tx-icon-button"
    :class="[
      `tx-icon-button--${size}`,
      `tx-icon-button--${shape}`,
      {
        'is-pressed': pressed === true,
        'is-disabled': disabled,
      },
    ]"
    :type="nativeType"
    :disabled="disabled"
    :aria-label="ariaLabel"
    :aria-pressed="ariaPressed"
    v-bind="$attrs"
    @click="handleClick"
    @mouseenter="handleMouseenter"
    @mouseleave="handleMouseleave"
  >
    <span class="tx-icon-button__inner">
      <slot :hover="isHovered" :pressed="pressed === true">
        <TxIcon v-if="icon" :name="icon" class="tx-icon-button__icon" aria-hidden="true" />
      </slot>
    </span>
  </button>
</template>

<style scoped>
.tx-icon-button {
  --tx-icon-button-size: 40px;
  --tx-icon-button-radius: 10px;
  --tx-icon-button-color: var(--tx-text-color, currentColor);
  --tx-icon-button-bg: transparent;
  --tx-icon-button-bg-hover: var(--tx-fill-color, rgba(15, 23, 42, 0.06));
  --tx-icon-button-bg-pressed: var(--tx-fill-color-light, rgba(15, 23, 42, 0.1));
  --tx-icon-button-focus: color-mix(in srgb, var(--tx-color-primary, #409eff) 28%, transparent);

  display: inline-flex;
  width: var(--tx-icon-button-size);
  min-width: var(--tx-icon-button-size);
  height: var(--tx-icon-button-size);
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--tx-icon-button-radius);
  padding: 0;
  color: var(--tx-icon-button-color);
  background: var(--tx-icon-button-bg);
  font: inherit;
  line-height: 1;
  cursor: pointer;
  user-select: none;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.tx-icon-button:hover:not(.is-disabled) {
  background: var(--tx-icon-button-bg-hover);
}

.tx-icon-button:active:not(.is-disabled) {
  transform: scale(0.96);
}

.tx-icon-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--tx-icon-button-focus);
}

.tx-icon-button.is-pressed {
  background: var(--tx-icon-button-bg-pressed);
}

.tx-icon-button.is-disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.tx-icon-button--xs {
  --tx-icon-button-size: 24px;
  --tx-icon-button-radius: 4px;
}

.tx-icon-button--sm {
  --tx-icon-button-size: 32px;
  --tx-icon-button-radius: 8px;
}

.tx-icon-button--lg {
  --tx-icon-button-size: 48px;
  --tx-icon-button-radius: 14px;
}

.tx-icon-button--circle,
.tx-icon-button--pill {
  --tx-icon-button-radius: 999px;
}

.tx-icon-button--pill {
  width: auto;
  min-width: var(--tx-icon-button-size);
  padding: 0 12px;
}

.tx-icon-button__inner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.tx-icon-button__icon {
  font-size: 1.25rem;
}
</style>
