<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { AvatarProps } from './types'
import { computed, ref } from 'vue'
import { TxIcon } from '../../icon'

defineOptions({
  name: 'TxAvatar',
})

const props = withDefaults(defineProps<AvatarProps>(), {
  size: 'medium',
  shape: 'circle',
  clickable: false,
})

const emit = defineEmits<Emits>()

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

const customStyle = computed<CSSProperties>(() => {
  const style: CSSProperties = {
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

function handleKeydown(ev: KeyboardEvent) {
  // Only the avatar root itself activates; ignore Enter/Space bubbling up from
  // focusable slot content.
  if (ev.target !== ev.currentTarget)
    return
  if (!props.clickable)
    return
  if (ev.key !== 'Enter' && ev.key !== ' ')
    return
  ev.preventDefault()
  emit('click')
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
    :role="clickable ? 'button' : undefined"
    :tabindex="clickable ? 0 : undefined"
    @click="handleClick"
    @keydown="handleKeydown"
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
/*
 * The root must NOT clip: it is both the shape and the positioning context for
 * the status dot, and those two jobs are mutually exclusive. `overflow: hidden`
 * here plus a corner-anchored dot means the dot sits entirely outside the
 * rounded shape and gets shaved down to a sliver. Clipping lives one level
 * down, on the image and the fallback; the root's own background is still
 * clipped by its `border-radius`, so a circle avatar stays a circle without it.
 */
.tx-avatar {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 500;
  width: var(--tx-avatar-size, var(--tx-avatar-size-preset, auto));
  height: var(--tx-avatar-size, var(--tx-avatar-size-preset, auto));
  font-size: var(--tx-avatar-font-size, var(--tx-avatar-font-size-preset, inherit));

  /* Resolved once so the status rules don't repeat the three-level fallback. */
  --tx-avatar-status-diameter: var(--tx-avatar-status-size, var(--tx-avatar-status-size-preset, 12px));
  --tx-avatar-status-ring: var(--tx-avatar-status-border, var(--tx-avatar-status-border-preset, 2px));
  user-select: none;
  background: var(--tx-avatar-bg, var(--tx-avatar-background, #f3f4f6));
  color: var(--tx-avatar-text, var(--tx-avatar-color, #374151));
}

/*
 * Status inset per shape. A circle's bottom-right 45 degree point sits
 * 14.64% of the diameter in from each edge ((1 - (1 + 1/sqrt(2)) / 2)); pulling
 * back half the dot leaves its centre on the circumference, so the dot reads as
 * half in, half out. Square and rounded avatars anchor to the corner instead
 * and overhang slightly, which their smaller radii can afford.
 */
.tx-avatar--circle {
  border-radius: 50%;
  --tx-avatar-status-inset: calc(14.64% - var(--tx-avatar-status-diameter) * 0.5);
}

.tx-avatar--square {
  border-radius: 8px;
  --tx-avatar-status-inset: calc(var(--tx-avatar-status-diameter) * -0.25);
}

.tx-avatar--rounded {
  border-radius: 12px;
  --tx-avatar-status-inset: calc(var(--tx-avatar-status-diameter) * -0.25);
}

.tx-avatar--small {
  --tx-avatar-size-preset: 32px;
  --tx-avatar-font-size-preset: 12px;
  --tx-avatar-status-size-preset: 8px;
  --tx-avatar-status-border-preset: 1.5px;
}

.tx-avatar--medium {
  --tx-avatar-size-preset: 40px;
  --tx-avatar-font-size-preset: 14px;
  --tx-avatar-status-size-preset: 10px;
  --tx-avatar-status-border-preset: 2px;
}

.tx-avatar--large {
  --tx-avatar-size-preset: 48px;
  --tx-avatar-font-size-preset: 16px;
  --tx-avatar-status-size-preset: 12px;
  --tx-avatar-status-border-preset: 2px;
}

.tx-avatar--xlarge {
  --tx-avatar-size-preset: 64px;
  --tx-avatar-font-size-preset: 20px;
  --tx-avatar-status-size-preset: 16px;
  --tx-avatar-status-border-preset: 2.5px;
}

.tx-avatar--clickable {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.tx-avatar--clickable:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--tx-color-primary, #409eff) 60%, transparent);
  outline-offset: 2px;
}

.tx-avatar--clickable:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.tx-avatar__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}

.tx-avatar__fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: inherit;
}

.tx-avatar__text {
  text-transform: uppercase;
}

.tx-avatar__icon,
.tx-avatar__default-icon {
  font-size: inherit;
}

/*
 * `border-box` makes the status size variable mean the dot's outer diameter,
 * which is what the inset maths above and the documented variable both assume.
 * Under the default `content-box` the ring was added outside it, so a medium
 * avatar's "10px" dot actually measured 14px.
 */
.tx-avatar__status {
  position: absolute;
  bottom: var(--tx-avatar-status-inset, 0);
  right: var(--tx-avatar-status-inset, 0);
  box-sizing: border-box;
  width: var(--tx-avatar-status-diameter);
  height: var(--tx-avatar-status-diameter);
  border-radius: 50%;
  border: var(--tx-avatar-status-ring) solid #ffffff;
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
