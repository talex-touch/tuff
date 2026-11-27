<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { AvatarEditResult } from './editor/types'
import type { AvatarEmits, AvatarProps } from './types'
import { computed, ref, shallowRef, watch } from 'vue'
import { TxIcon } from '../../icon'
import AvatarEditorIcon from './editor/AvatarEditorIcon.vue'
import { isLocalAvatarSourceUrl } from './editor/media-loader'
import TxAvatarEditor from './editor/TxAvatarEditor.vue'
import { AVATAR_EDITOR_DEFAULT_ACCEPT, AVATAR_EDITOR_IMAGE_ACCEPT } from './editor/types'

defineOptions({
  name: 'TxAvatar',
})

const props = withDefaults(defineProps<AvatarProps>(), {
  size: 'medium',
  shape: 'circle',
  clickable: false,
  editable: false,
  disabled: false,
  editTrigger: 'editor',
  editLabel: 'Edit avatar',
  outputFormat: 'png',
  allowFormatConversion: true,
  outputSize: 512,
  outputQuality: 0.92,
  allowVideoCapture: true,
  allowGifAnimation: true,
})

const emit = defineEmits<AvatarEmits>()

const imageError = ref(false)
const localSrc = ref<string | undefined>(undefined)
const editorOpen = ref(false)
const editorMounted = ref(false)
const editorSource = shallowRef<File | Blob | string | null>(null)
const isDragOver = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

// A new `src` gets its own try: the failure was the image before it, and external
// updates supersede an uncontrolled local edit preview.
watch(() => props.src, () => {
  localSrc.value = undefined
  imageError.value = false
})

const effectiveSrc = computed(() => localSrc.value ?? props.src)

const isInteractive = computed(() => props.clickable || (props.editable && !props.disabled))

const resolvedAccept = computed(() => {
  if (props.accept)
    return props.accept
  if (props.editorProps?.accept)
    return props.editorProps.accept
  return props.allowVideoCapture ? AVATAR_EDITOR_DEFAULT_ACCEPT : AVATAR_EDITOR_IMAGE_ACCEPT
})

const mergedEditorLabels = computed(() => ({
  ...props.editorProps?.labels,
  ...props.editorLabels,
}))

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

function openEditor(source?: File | Blob | string | null) {
  if (props.disabled)
    return
  editorMounted.value = true
  if (source !== undefined) {
    editorSource.value = source
  }
  else {
    const currentSrc = effectiveSrc.value ?? null
    const canPreload = currentSrc !== null
      && (props.editorProps?.allowRemoteSource === true || isLocalAvatarSourceUrl(currentSrc))
    editorSource.value = canPreload ? currentSrc : null
  }
  editorOpen.value = true
  emit('edit-open')
}

function pickFile() {
  if (!props.editable || props.disabled)
    return
  fileInputRef.value?.click()
}

function handleFileInputChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file)
    return
  openEditor(file)
}

function activateEditable() {
  if (props.editTrigger === 'upload') {
    pickFile()
    return
  }
  openEditor()
}

function handleClick() {
  if (props.editable && !props.disabled) {
    activateEditable()
  }
  if (props.clickable) {
    emit('click')
  }
}

function handleKeydown(ev: KeyboardEvent) {
  // Only the avatar root itself activates; ignore Enter/Space bubbling up from
  // focusable slot content.
  if (ev.target !== ev.currentTarget)
    return
  if (!isInteractive.value)
    return
  if (ev.key !== 'Enter' && ev.key !== ' ')
    return
  ev.preventDefault()
  if (props.editable && !props.disabled) {
    activateEditable()
  }
  if (props.clickable) {
    emit('click')
  }
}

function handleDragOver(ev: DragEvent) {
  if (!props.editable || props.disabled)
    return
  ev.preventDefault()
  isDragOver.value = true
}

function handleDragLeave(ev: DragEvent) {
  if (!props.editable || props.disabled)
    return
  const related = ev.relatedTarget as Node | null
  if (related && (ev.currentTarget as HTMLElement).contains(related))
    return
  isDragOver.value = false
}

function handleDrop(ev: DragEvent) {
  if (!props.editable || props.disabled)
    return
  ev.preventDefault()
  isDragOver.value = false
  const file = ev.dataTransfer?.files?.[0]
  if (file) {
    openEditor(file)
  }
}

function handleEditorConfirm(result: AvatarEditResult) {
  localSrc.value = result.url
  imageError.value = false
  emit('update:src', result.url)
  emit('edit', result)
}

function handleEditorCancel() {
  emit('edit-cancel')
}

function handleEditorError(error: Error) {
  emit('edit-error', error)
}

defineExpose({
  openEditor,
  pickFile,
})
</script>

<template>
  <div
    class="tx-avatar" :class="[
      sizeClass,
      `tx-avatar--${shape}`,
      {
        'tx-avatar--clickable': isInteractive,
        'tx-avatar--editable': editable,
        'tx-avatar--disabled': editable && disabled,
        'tx-avatar--drag-over': isDragOver,
      },
    ]"
    :style="customStyle"
    :role="isInteractive ? 'button' : undefined"
    :tabindex="isInteractive ? 0 : undefined"
    :aria-label="editable ? editLabel : undefined"
    :aria-disabled="editable && disabled ? 'true' : undefined"
    @click="handleClick"
    @keydown="handleKeydown"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <img
      v-if="effectiveSrc && !imageError"
      :src="effectiveSrc"
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

    <div v-if="editable && !disabled" class="tx-avatar__edit-overlay" aria-hidden="true">
      <slot name="edit-trigger">
        <AvatarEditorIcon name="camera" :size="18" />
      </slot>
    </div>

    <div v-if="status" class="tx-avatar__status" :class="`tx-avatar__status--${status}`" />

    <input
      v-if="editable"
      ref="fileInputRef"
      class="tx-avatar__file-input"
      type="file"
      :accept="resolvedAccept"
      :disabled="disabled"
      tabindex="-1"
      aria-hidden="true"
      @click.stop
      @change="handleFileInputChange"
    >

    <TxAvatarEditor
      v-if="editable && editorMounted"
      v-bind="editorProps"
      v-model:open="editorOpen"
      :source="editorSource"
      :shape="shape"
      :accept="resolvedAccept"
      :output-format="outputFormat"
      :allowed-output-formats="allowedOutputFormats"
      :allow-format-conversion="allowFormatConversion"
      :output-size="outputSize"
      :output-quality="outputQuality"
      :allow-video-capture="allowVideoCapture"
      :allow-gif-animation="allowGifAnimation"
      :labels="mergedEditorLabels"
      @confirm="handleEditorConfirm"
      @cancel="handleEditorCancel"
      @error="handleEditorError"
    />
  </div>
</template>

<style lang="scss" scoped>
// The root must NOT clip: it is both the shape and the positioning context for
// the status dot, and those two jobs are mutually exclusive. `overflow: hidden`
// here plus a corner-anchored dot means the dot sits entirely outside the
// rounded shape and gets shaved down to a sliver. Clipping lives one level
// down, on the image and the fallback; the root's own background is still
// clipped by its `border-radius`, so a circle avatar stays a circle without it.
.tx-avatar {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: var(--tx-font-weight-semibold, 600);
  letter-spacing: 0.02em;
  width: var(--tx-avatar-size, var(--tx-avatar-size-preset, auto));
  height: var(--tx-avatar-size, var(--tx-avatar-size-preset, auto));
  font-size: var(--tx-avatar-font-size, var(--tx-avatar-font-size-preset, inherit));

  // Resolved once so the status rules don't repeat the three-level fallback.
  --tx-avatar-status-diameter: var(--tx-avatar-status-size, var(--tx-avatar-status-size-preset, 12px));
  --tx-avatar-status-ring: var(--tx-avatar-status-border, var(--tx-avatar-status-border-preset, 2px));
  // The ring colour — around the status dot here, around each avatar in a
  // group — is the surface the avatar sits on, so a stacked group reads as
  // discs cut into the page rather than white plates on it. It was `#fff`,
  // which on a dark page made every ring a halo.
  --tx-avatar-ring-color: var(--tx-avatar-ring, var(--tx-bg-color, #ffffff));
  user-select: none;
  // The fallback disc follows the theme's fill token instead of a fixed light
  // grey: `#f3f4f6` was a bright plate in dark mode. A 1px inset rim from the
  // light border family gives the disc an edge on both themes and sits under
  // an image as a hairline frame.
  background: var(--tx-avatar-bg, var(--tx-avatar-background, var(--tx-fill-color, #f3f4f6)));
  color: var(--tx-avatar-text, var(--tx-avatar-color, var(--tx-text-color-primary, #374151)));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 60%, transparent);
}

// Status inset per shape. A circle's bottom-right 45 degree point sits
// 14.64% of the diameter in from each edge ((1 - (1 + 1/sqrt(2)) / 2)); pulling
// back half the dot leaves its centre on the circumference, so the dot reads as
// half in, half out. Square and rounded avatars anchor to the corner instead
// and overhang slightly, which their smaller radii can afford.
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

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-avatar--clickable:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--tx-color-primary, #409eff) 60%, transparent);
  outline-offset: 2px;
}

.tx-avatar--clickable:hover {
  transform: scale(1.05);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 60%, transparent),
    2px 4px 12px color-mix(in srgb, var(--tx-color-black, #000) 15%, transparent);
}

.tx-avatar--disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.tx-avatar--drag-over {
  box-shadow:
    inset 0 0 0 2px var(--tx-color-primary, #409eff),
    0 0 0 4px color-mix(in srgb, var(--tx-color-primary, #409eff) 22%, transparent);
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

.tx-avatar__edit-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: inherit;
  overflow: hidden;
  pointer-events: none;
  color: var(--tx-color-white, #ffffff);
  background: color-mix(in srgb, var(--tx-color-black, #000000) 48%, transparent);
  opacity: 0;
  transition: opacity 0.16s ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-avatar--editable:hover .tx-avatar__edit-overlay,
.tx-avatar--editable:focus-visible .tx-avatar__edit-overlay,
.tx-avatar--drag-over .tx-avatar__edit-overlay {
  opacity: 1;
}

.tx-avatar__file-input {
  display: none;
}

.tx-avatar__text {
  text-transform: uppercase;
}

// Glyph avatars read lighter than initials: the icon takes the secondary ink.
.tx-avatar__icon,
.tx-avatar__default-icon {
  font-size: inherit;
  color: var(--tx-avatar-text, var(--tx-avatar-color, var(--tx-text-color-secondary, #6b7280)));
}

// `border-box` makes the status size variable mean the dot's outer diameter,
// which is what the inset maths above and the documented variable both assume.
// Under the default `content-box` the ring was added outside it, so a medium
// avatar's "10px" dot actually measured 14px.
.tx-avatar__status {
  position: absolute;
  bottom: var(--tx-avatar-status-inset, 0);
  right: var(--tx-avatar-status-inset, 0);
  box-sizing: border-box;
  width: var(--tx-avatar-status-diameter);
  height: var(--tx-avatar-status-diameter);
  border-radius: 50%;
  border: var(--tx-avatar-status-ring) solid var(--tx-avatar-ring-color);
}

// Presence colours come from the theme's semantic tokens, so they shift with the theme like every other status signal.
.tx-avatar__status--online {
  background: var(--tx-color-success, #22c55e);
}

.tx-avatar__status--offline {
  background: var(--tx-text-color-placeholder, #6b7280);
}

.tx-avatar__status--busy {
  background: var(--tx-color-danger, #ef4444);
}

.tx-avatar__status--away {
  background: var(--tx-color-warning, #f59e0b);
}
</style>
