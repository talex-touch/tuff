<script setup lang="ts">
import type { AvatarProps } from './types'
import { computed, ref } from 'vue'
import { TxIcon } from '../../icon'

defineOptions({
  name: 'TxAvatar',
})

const props = withDefaults(defineProps<Props>(), {
  size: 'medium',
  shape: 'circle',
  clickable: false,
})

const emit = defineEmits<Emits>()

interface Props extends AvatarProps {}

interface Emits {
  click: []
}

const imageError = ref(false)

const sizePresets = new Set(['small', 'medium', 'large', 'xlarge'])

const normalizedSize = computed(() => {
  const size = props.size
  if (typeof size === 'number') {
    return size > 0 ? size : null
  }

  if (typeof size === 'string') {
    if (sizePresets.has(size))
      return null

    const pxMatch = size.match(/^(\d+(?:\.\d+)?)px$/)
    if (pxMatch) {
      const value = Number(pxMatch[1])
      return value > 0 ? value : null
    }

    const value = Number(size)
    if (!Number.isNaN(value) && value > 0)
      return value
  }

  return null
})

const sizeClass = computed(() => {
  const size = props.size
  if (typeof size === 'string' && sizePresets.has(size))
    return `tx-avatar--${size}`

  return undefined
})

const sizeVars = computed(() => {
  const size = normalizedSize.value
  if (!size)
    return {}

  const statusSize = Math.max(4, Math.round(size * 0.25))
  const fontSize = Math.round(size * 0.25 + 4)
  const statusBorder = Math.max(1, Math.round(statusSize * 0.16 * 2) / 2)

  return {
    '--tx-avatar-size': `${size}px`,
    '--tx-avatar-font-size': `${fontSize}px`,
    '--tx-avatar-status-size': `${statusSize}px`,
    '--tx-avatar-status-border': `${statusBorder}px`,
  }
})

const customStyle = computed(() => {
  const style: Record<string, string> = {
    ...sizeVars.value,
  }

  if (props.backgroundColor) {
    style['--tx-avatar-bg'] = props.backgroundColor
    style['--tx-avatar-text'] = props.textColor || '#ffffff'
  }

  return style
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
      sizeClass,
      `tx-avatar--${shape}`,
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
  font-weight: 500;
  width: var(--tx-avatar-size, auto);
  height: var(--tx-avatar-size, auto);
  font-size: var(--tx-avatar-font-size, inherit);
  overflow: hidden;
  user-select: none;
  background: var(--tx-avatar-bg, #f3f4f6);
  color: var(--tx-avatar-text, #374151);
}

.tx-avatar--circle {
  border-radius: 50%;
}

.tx-avatar--square {
  border-radius: 8px;
}

.tx-avatar--rounded {
  border-radius: 12px;
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
  width: var(--tx-avatar-status-size, 12px);
  height: var(--tx-avatar-status-size, 12px);
  border-radius: 50%;
  border: var(--tx-avatar-status-border, 2px) solid #ffffff;
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
