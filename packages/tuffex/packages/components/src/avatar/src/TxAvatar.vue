<script setup lang="ts">
import type { AvatarProps } from './types'
import { computed, ref } from 'vue'
import { TxIcon } from '../../icon'

defineOptions({
  name: 'TxAvatar',
})

const props = withDefaults(defineProps<Props>(), {
  size: 'medium',
  clickable: false,
})

const emit = defineEmits<Emits>()

interface Props extends AvatarProps {}

interface Emits {
  click: []
}

const imageError = ref(false)

const customStyle = computed(() => {
  if (props.backgroundColor) {
    return {
      '--tx-avatar-bg': props.backgroundColor,
      '--tx-avatar-text': props.textColor || '#ffffff',
    }
  }
  return {}
})

const fallbackText = computed(() => {
  const name = props.name?.trim()
  if (!name)
    return ''

  const words = name.split(' ').filter(word => word.length > 0)
  if (!words.length)
    return ''

  const first = words[0]?.charAt(0).toUpperCase() ?? ''
  if (words.length === 1)
    return first

  const last = words[words.length - 1]?.charAt(0).toUpperCase() ?? ''
  return `${first}${last}`
})

function handleImageError() {
  imageError.value = true
}

function handleClick() {
  if (props.clickable) {
    emit('click')
  }
}
</script>

<template>
  <div
    class="tx-avatar" :class="[
      `tx-avatar--${size}`,
      { 'tx-avatar--clickable': clickable },
    ]"
    :style="customStyle"
    @click="handleClick"
  >
    <img
      v-if="src && !imageError"
      :src="src"
      :alt="alt"
      class="tx-avatar__image"
      @error="handleImageError"
    >

    <div v-else class="tx-avatar__fallback">
      <slot v-if="$slots.default" />
      <TxIcon v-else-if="icon" :name="icon" class="tx-avatar__icon" />
      <span v-else-if="fallbackText" class="tx-avatar__text">
        {{ fallbackText }}
      </span>
      <TxIcon v-else name="user" class="tx-avatar__default-icon" />
    </div>

    <div v-if="status" class="tx-avatar__status" :class="`tx-avatar__status--${status}`" />
  </div>
</template>

<style scoped>
.tx-avatar {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-weight: 500;
  overflow: hidden;
  user-select: none;
  background: var(--tx-avatar-bg, #f3f4f6);
  color: var(--tx-avatar-text, #374151);
}

.tx-avatar--small {
  width: 32px;
  height: 32px;
  font-size: 12px;
}

.tx-avatar--medium {
  width: 40px;
  height: 40px;
  font-size: 14px;
}

.tx-avatar--large {
  width: 48px;
  height: 48px;
  font-size: 16px;
}

.tx-avatar--xlarge {
  width: 64px;
  height: 64px;
  font-size: 20px;
}

.tx-avatar--clickable {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.tx-avatar--clickable:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.tx-avatar__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tx-avatar__fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tx-avatar__text {
  text-transform: uppercase;
}

.tx-avatar__icon,
.tx-avatar__default-icon {
  font-size: inherit;
}

.tx-avatar__status {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #ffffff;
}

.tx-avatar--small .tx-avatar__status {
  width: 8px;
  height: 8px;
  border-width: 1.5px;
}

.tx-avatar--medium .tx-avatar__status {
  width: 10px;
  height: 10px;
  border-width: 2px;
}

.tx-avatar--large .tx-avatar__status {
  width: 12px;
  height: 12px;
  border-width: 2px;
}

.tx-avatar--xlarge .tx-avatar__status {
  width: 16px;
  height: 16px;
  border-width: 2.5px;
}

.tx-avatar__status--online {
  background: #22c55e;
}

.tx-avatar__status--offline {
  background: #6b7280;
}

.tx-avatar__status--busy {
  background: #ef4444;
}

.tx-avatar__status--away {
  background: #f59e0b;
}
</style>
