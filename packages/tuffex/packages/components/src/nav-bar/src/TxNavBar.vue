<script setup lang="ts">
import type { NavBarEmits, NavBarProps } from './types'
import { computed, useSlots } from 'vue'

defineOptions({ name: 'TxNavBar' })

const props = withDefaults(defineProps<NavBarProps>(), {
  title: '',
  fixed: false,
  safeAreaTop: true,
  showBack: false,
  disabled: false,
  zIndex: 2000,
})

const emit = defineEmits<NavBarEmits>()
const slots = useSlots()

const rootStyle = computed<Record<string, string>>(() => {
  return {
    '--tx-nav-bar-z-index': String(props.zIndex ?? 2000),
  }
})

const leftInteractive = computed(() => props.showBack || Boolean(slots.left))
const rightInteractive = computed(() => Boolean(slots.right))

function onBack() {
  if (props.disabled)
    return
  emit('back')
  emit('click-left')
}

function onLeftClick() {
  if (props.disabled)
    return
  emit('click-left')
}

function onRightClick() {
  if (props.disabled)
    return
  emit('click-right')
}

function onLeftAction() {
  if (props.showBack && !slots.left)
    onBack()
  else
    onLeftClick()
}
</script>

<template>
  <header
    class="tx-nav-bar"
    :class="{ 'is-fixed': fixed, 'is-disabled': disabled }"
    :style="rootStyle"
  >
    <div v-if="safeAreaTop" class="tx-nav-bar__safe" aria-hidden="true" />

    <div class="tx-nav-bar__inner">
      <button
        type="button"
        class="tx-nav-bar__left"
        :disabled="disabled || !leftInteractive"
        :aria-label="showBack ? 'Back' : 'Navigation left action'"
        @click="onLeftAction"
      >
        <slot name="left">
          <span
            v-if="showBack"
            class="tx-nav-bar__back"
            aria-hidden="true"
          >
            <i class="i-carbon-arrow-left" />
          </span>
        </slot>
      </button>

      <div class="tx-nav-bar__center">
        <slot name="title">
          <div class="tx-nav-bar__title">
            {{ title }}
          </div>
        </slot>
      </div>

      <button
        type="button"
        class="tx-nav-bar__right"
        :disabled="disabled || !rightInteractive"
        aria-label="Navigation right action"
        @click="onRightClick"
      >
        <slot name="right" />
      </button>
    </div>
  </header>
</template>

<style scoped lang="scss">
.tx-nav-bar {
  --tx-nav-bar-height: 44px;

  width: 100%;
  color: var(--tx-text-color-primary, #303133);
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 70%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 60%, transparent);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
  z-index: var(--tx-nav-bar-z-index, 2000);

  &.is-fixed {
    position: sticky;
    top: 0;
  }

  &.is-disabled {
    opacity: 0.75;
  }
}

.tx-nav-bar__safe {
  height: env(safe-area-inset-top, 0px);
}

.tx-nav-bar__inner {
  height: var(--tx-nav-bar-height);
  display: grid;
  grid-template-columns: minmax(56px, 1fr) minmax(0, 2fr) minmax(56px, 1fr);
  align-items: center;
  padding: 0 10px;
}

.tx-nav-bar__left,
.tx-nav-bar__right {
  display: flex;
  align-items: center;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  appearance: none;
  color: inherit;
  font: inherit;
  background: transparent;

  &:not(:disabled) {
    cursor: pointer;
  }

  &:disabled {
    cursor: default;
  }
}

.tx-nav-bar__left {
  justify-content: flex-start;
}

.tx-nav-bar__right {
  justify-content: flex-end;
}

.tx-nav-bar__center {
  min-width: 0;
}

.tx-nav-bar__title {
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-nav-bar__back {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--tx-text-color-primary, #303133);
}

.tx-nav-bar__left:not(:disabled):hover .tx-nav-bar__back {
  background: color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 70%, transparent);
}

.tx-nav-bar__left:disabled .tx-nav-bar__back {
  opacity: 0.6;
}
</style>
