<script setup lang="ts">
import type { CardItemProps } from './types.ts'
import { computed } from 'vue'

defineOptions({
  name: 'TxCardItem',
})

const props = withDefaults(defineProps<CardItemProps>(), {
  role: 'button',
  title: '',
  subtitle: '',
  description: '',

  iconClass: '',
  avatarText: '',
  avatarUrl: '',
  avatarSize: 36,
  avatarShape: 'circle',

  clickable: false,
  active: false,
  disabled: false,
})

defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

const avatarStyle = computed(() => {
  const size = `${props.avatarSize}px`
  const radius = props.avatarShape === 'circle' ? '999px' : '12px'
  return {
    '--tx-card-item-avatar-size': size,
    '--tx-card-item-avatar-radius': radius,
  } as Record<string, string>
})
</script>

<template>
  <div
    class="tx-card-item"
    :class="{
      'tx-card-item--clickable': clickable,
      'tx-card-item--active': active,
      'tx-card-item--disabled': disabled,
      'tx-card-item--no-left': !($slots.avatar || avatarUrl || iconClass || avatarText),
    }"
    :role="role"
    :tabindex="(clickable && !disabled) ? 0 : -1"
    @click="!disabled && clickable && $emit('click', $event)"
    @keydown.enter="!disabled && clickable && $emit('click', $event as any)"
  >
    <div v-if="$slots.avatar || avatarUrl || iconClass || avatarText" class="tx-card-item__left" :style="avatarStyle">
      <slot name="avatar">
        <div v-if="avatarUrl" class="tx-card-item__avatar" aria-hidden="true">
          <img class="tx-card-item__avatar-img" :src="avatarUrl" alt="">
        </div>
        <div v-else-if="iconClass" class="tx-card-item__avatar tx-card-item__avatar--icon" aria-hidden="true">
          <i :class="iconClass" />
        </div>
        <div v-else class="tx-card-item__avatar tx-card-item__avatar--text" aria-hidden="true">
          {{ avatarText }}
        </div>
      </slot>
    </div>

    <div class="tx-card-item__main">
      <div class="tx-card-item__top">
        <div class="tx-card-item__title-area">
          <div class="tx-card-item__title">
            <slot name="title">
              {{ title }}
            </slot>
          </div>
          <div v-if="subtitle || $slots.subtitle" class="tx-card-item__subtitle">
            <slot name="subtitle">
              {{ subtitle }}
            </slot>
          </div>
        </div>

        <div v-if="$slots.right" class="tx-card-item__right">
          <slot name="right" />
        </div>
      </div>

      <div v-if="description || $slots.description" class="tx-card-item__desc">
        <slot name="description">
          {{ description }}
        </slot>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.tx-card-item {
  display: flex;
  align-items: flex-start;
  gap: var(--tx-card-item-gap, 12px);
  width: 100%;
  padding: var(--tx-card-item-padding, 10px 12px);
  border-radius: var(--tx-card-item-radius, 12px);
  box-sizing: border-box;

  border: 1px solid transparent;
  background: transparent;

  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    box-shadow 0.18s ease,
    opacity 0.18s ease;
}

.tx-card-item--disabled {
  opacity: 0.5;
  pointer-events: none;
}

.tx-card-item--clickable {
  cursor: pointer;
}

.tx-card-item--clickable:hover {
  border-color: color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 70%, transparent);
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 18%, transparent);
}

.tx-card-item--active {
  border-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 40%, transparent);
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 8%, transparent);
}

.tx-card-item--clickable:active {
  box-shadow: inset 0 0 0 999px rgba(0, 0, 0, 0.03);
}

.tx-card-item:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tx-color-primary, #409eff) 22%, transparent);
}

.tx-card-item--no-left {
  gap: 0;
}

.tx-card-item__left {
  flex: 0 0 auto;
}

.tx-card-item__avatar {
  width: var(--tx-card-item-avatar-size, 36px);
  height: var(--tx-card-item-avatar-size, 36px);
  border-radius: var(--tx-card-item-avatar-radius, 999px);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;

  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-primary, #303133);
}

.tx-card-item__avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tx-card-item__avatar--icon {
  font-size: 18px;
}

.tx-card-item__avatar--text {
  font-size: 13px;
  font-weight: 600;
}

.tx-card-item__main {
  flex: 1;
  min-width: 0;
}

.tx-card-item__top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.tx-card-item__title-area {
  flex: 1;
  min-width: 0;
}

.tx-card-item__title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--tx-text-color-primary, #303133);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tx-card-item__subtitle {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.2;
  color: var(--tx-text-color-secondary, #909399);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tx-card-item__right {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.tx-card-item__desc {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.3;
  color: var(--tx-text-color-secondary, #909399);
  word-break: break-word;
}
</style>
