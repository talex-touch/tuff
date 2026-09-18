<script setup lang="ts">
import type { StyleValue } from 'vue'
import type {
  SensitiveInputEmits,
  SensitiveInputLabels,
  SensitiveInputMode,
  SensitiveInputProps,
} from './types'
import { computed, nextTick, onBeforeUnmount, ref, useAttrs, useId, watch } from 'vue'
import { SENSITIVE_INPUT_DEFAULT_LABELS } from './types'

defineOptions({
  name: 'TxSensitiveInput',
  inheritAttrs: false,
})

const props = withDefaults(defineProps<SensitiveInputProps>(), {
  modelValue: '',
  placeholder: '',
  size: 'md',
  label: '',
  description: '',
  error: '',
  disabled: false,
  readonly: false,
  required: false,
  copyable: true,
  mask: '••••••••',
  copiedDuration: 2000,
})

const emit = defineEmits<SensitiveInputEmits>()

const attrs = useAttrs()

// Wrapper takes class/style; everything else lands on the field, matching
// TxInput. `v-bind="inputAttrs"` is bound *before* the explicit attributes so a
// stray `type` or `readonly` from the host cannot unmask the value.
const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})
const wrapperStyle = computed(() => attrs.style as StyleValue)

const text = computed<SensitiveInputLabels>(() => ({
  ...SENSITIVE_INPUT_DEFAULT_LABELS,
  ...props.labels,
}))

const inputId = useId()
const instructionId = useId()
const liveId = useId()

const containerRef = ref<HTMLDivElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

const hasValue = computed(() => props.modelValue.length > 0)
const mode = ref<SensitiveInputMode>(hasValue.value ? 'masked' : 'empty')
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

/** Explicit `status` wins; otherwise a message and its styling cannot disagree. */
const resolvedStatus = computed(() => props.status ?? (props.error ? 'error' : 'default'))

/**
 * The only state where the container becomes the control: the value exists and
 * is hidden. `empty` deliberately is not this — there is nothing to reveal, so
 * turning the field into a button would announce an action that does nothing.
 */
const isMasked = computed(() => mode.value === 'masked' && hasValue.value)
const showEye = computed(() => !props.disabled && (mode.value === 'revealed' || (mode.value === 'empty' && hasValue.value)))
const showCopy = computed(() => props.copyable && hasValue.value && !props.disabled)

const accessibleName = computed(() => props.label || text.value.fallbackName)
const maskedName = computed(() => `${accessibleName.value}, ${text.value.masked}`)
const describedBy = computed(() => `${instructionId} ${liveId}`)
const liveMessage = computed(() => {
  if (copied.value)
    return text.value.copySuccess
  return isMasked.value ? text.value.hidden : ''
})

// A value that arrives from outside — an API key fetched after mount — must
// land masked, not revealed. Typing sets `revealed` synchronously before the
// emit, so this watcher never sees `empty` on that path.
watch(hasValue, (next) => {
  if (!next) {
    mode.value = 'empty'
    return
  }
  if (mode.value === 'empty')
    mode.value = 'masked'
})

function reveal(): void {
  if (props.disabled || !hasValue.value || mode.value === 'revealed')
    return

  mode.value = 'revealed'
  emit('reveal')

  // A read-only secret is revealed but never edited, so it keeps the container
  // focused instead of moving into an input the user cannot change.
  if (!props.readonly)
    nextTick(() => inputRef.value?.focus())
}

function maskAgain(returnFocus = false): void {
  if (mode.value !== 'revealed')
    return

  mode.value = hasValue.value ? 'masked' : 'empty'
  emit('mask')

  // The input drops to tabindex="-1" the moment it is masked; without moving
  // focus, Escape would strand the keyboard user on an untabbable element.
  if (returnFocus && hasValue.value)
    nextTick(() => containerRef.value?.focus())
}

function handleInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value

  // Typing into an empty field shows what is being typed; switching before the
  // emit keeps the watcher from re-masking the first character.
  if (mode.value === 'empty' && value.length > 0)
    mode.value = 'revealed'

  emit('update:modelValue', value)
}

function handleFieldClick(): void {
  if (isMasked.value)
    reveal()
}

function handleFieldKeydown(event: KeyboardEvent): void {
  if (!isMasked.value)
    return
  if (event.key !== 'Enter' && event.key !== ' ')
    return

  event.preventDefault()
  reveal()
}

function handleLabelClick(event: MouseEvent): void {
  if (!isMasked.value)
    return

  // The label's native forwarding would focus an input that is masked,
  // pointer-events-none and aria-hidden. Reveal instead.
  event.preventDefault()
  reveal()
}

function handleInputKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && mode.value === 'revealed')
    maskAgain(true)
}

function handleBlur(event: FocusEvent): void {
  const next = event.relatedTarget
  // Focus moving to the eye or copy button is still "inside the field"; masking
  // there would yank the control out from under the click that caused it.
  if (next instanceof Node && containerRef.value?.contains(next))
    return

  maskAgain()
}

function handleToggle(): void {
  if (mode.value === 'revealed') {
    maskAgain()
    return
  }
  reveal()
}

async function writeClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  document.body.appendChild(textarea)
  try {
    textarea.select()
    if (!document.execCommand('copy'))
      throw new Error('Copy command failed')
  }
  finally {
    // Detach even when select()/execCommand throws, so a failed copy never
    // orphans a node holding the secret in the DOM.
    document.body.removeChild(textarea)
  }
}

async function handleCopy(): Promise<void> {
  if (props.disabled || !hasValue.value)
    return

  try {
    await writeClipboard(props.modelValue)
    copied.value = true
    emit('copy', props.modelValue)
    if (copiedTimer)
      clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copied.value = false
    }, props.copiedDuration)
  }
  catch (error) {
    // A denied clipboard (permissions policy, insecure context) is a host
    // condition, not a component failure: report it and leave the tab idle.
    emit('copyError', error)
  }
}

onBeforeUnmount(() => {
  if (copiedTimer)
    clearTimeout(copiedTimer)
})

defineExpose({
  focus: () => (isMasked.value ? containerRef.value?.focus() : inputRef.value?.focus()),
  blur: () => inputRef.value?.blur(),
  reveal: () => reveal(),
  mask: () => maskAgain(),
  copy: () => handleCopy(),
})
</script>

<template>
  <div
    class="tx-sensitive-input"
    :class="[
      `tx-sensitive-input--${size}`,
      {
        'is-error': resolvedStatus === 'error',
        'is-disabled': disabled,
        'is-masked': isMasked,
      },
      attrs.class,
    ]"
    :style="wrapperStyle"
  >
    <label
      v-if="label"
      class="tx-sensitive-input__label"
      :for="inputId"
      @click="handleLabelClick"
    >
      {{ label }}
      <span v-if="required" class="tx-sensitive-input__required" aria-hidden="true">*</span>
    </label>

    <div class="tx-sensitive-input__group">
      <!-- Sits above the field's top edge, outside its box. It is a sibling of
           the field so it never inherits the masked container's click handler. -->
      <button
        v-if="showCopy"
        type="button"
        class="tx-sensitive-input__copy"
        :class="{ 'is-copied': copied }"
        :aria-label="copied ? text.copied : text.copy"
        @click.stop="handleCopy"
        @keydown.stop
      >
        {{ copied ? text.copied : text.copy }}
      </button>

      <div
        ref="containerRef"
        class="tx-sensitive-input__field"
        :role="isMasked ? 'button' : undefined"
        :tabindex="isMasked ? (disabled ? -1 : 0) : undefined"
        :aria-label="isMasked ? maskedName : undefined"
        :aria-describedby="isMasked ? describedBy : undefined"
        :aria-disabled="isMasked && disabled ? 'true' : undefined"
        @click="handleFieldClick"
        @keydown="handleFieldKeydown"
      >
        <input
          :id="inputId"
          ref="inputRef"
          v-bind="inputAttrs"
          class="tx-sensitive-input__inner"
          :type="mode === 'revealed' ? 'text' : 'password'"
          :value="modelValue"
          :placeholder="placeholder"
          :disabled="disabled"
          :readonly="readonly || isMasked"
          :tabindex="isMasked ? -1 : 0"
          :aria-hidden="isMasked ? 'true' : undefined"
          :aria-invalid="resolvedStatus === 'error' ? 'true' : undefined"
          autocomplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          @input="handleInput"
          @blur="handleBlur"
          @keydown="handleInputKeydown"
        >

        <!-- Fixed-width glyphs, not the native password dots: the real dots
             leak the secret's length. -->
        <span v-if="isMasked" class="tx-sensitive-input__mask" aria-hidden="true">
          <span class="tx-sensitive-input__mask-stack">
            <span class="tx-sensitive-input__mask-dots">{{ mask }}</span>
            <span v-if="!disabled" class="tx-sensitive-input__mask-reveal">{{ text.reveal }}</span>
          </span>
        </span>

        <button
          type="button"
          class="tx-sensitive-input__eye"
          :class="{ 'is-hidden': !showEye }"
          :tabindex="showEye ? 0 : -1"
          :aria-label="mode === 'revealed' ? text.hide : text.show"
          @click.stop="handleToggle"
          @keydown.stop
        >
          <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 5C7.5 5 3.7 7.8 2 12c1.7 4.2 5.5 7 10 7s8.3-2.8 10-7c-1.7-4.2-5.5-7-10-7Zm0 12c-3.6 0-6.8-2.1-8.3-5C5.2 9.1 8.4 7 12 7s6.8 2.1 8.3 5c-1.5 2.9-4.7 5-8.3 5Z"
            />
            <path fill="currentColor" d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
            <path v-if="mode === 'revealed'" fill="currentColor" d="M4.7 3.3 3.3 4.7l16 16 1.4-1.4z" />
          </svg>
        </button>
      </div>
    </div>

    <p v-if="error" class="tx-sensitive-input__error" role="alert">
      {{ error }}
    </p>
    <p v-else-if="description" class="tx-sensitive-input__description">
      {{ description }}
    </p>

    <span v-if="isMasked" :id="instructionId" class="tx-sensitive-input__sr">{{ text.instruction }}</span>
    <span :id="liveId" class="tx-sensitive-input__sr" role="status" aria-live="polite">{{ liveMessage }}</span>
  </div>
</template>

<style lang="scss" scoped>
.tx-sensitive-input {
  display: flex;
  flex-direction: column;
  // Related text sits closer to its field than fields sit to each other.
  gap: 6px;
  width: 100%;
  min-width: 0;

  --tx-si-height: 32px;
  --tx-si-pad: 12px;
  --tx-si-font: 14px;
  --tx-si-radius: 12px;
  --tx-si-icon: 16px;

  &--xs {
    --tx-si-height: 24px;
    --tx-si-pad: 8px;
    --tx-si-font: 12px;
    --tx-si-radius: 8px;
    --tx-si-icon: 12px;
  }

  &--sm {
    --tx-si-height: 28px;
    --tx-si-pad: 10px;
    --tx-si-font: 13px;
    --tx-si-radius: 10px;
    --tx-si-icon: 14px;
  }

  &--lg {
    --tx-si-height: 38px;
    --tx-si-pad: 14px;
    --tx-si-font: 14px;
    --tx-si-radius: 14px;
    --tx-si-icon: 18px;
  }
}

.tx-sensitive-input__label {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--tx-text-color-regular, #606266);
  cursor: pointer;

  .tx-sensitive-input.is-disabled & {
    cursor: not-allowed;
    color: var(--tx-text-color-disabled, #c0c4cc);
  }
}

.tx-sensitive-input__required {
  color: var(--tx-color-danger, #f56c6c);
}

.tx-sensitive-input__group {
  position: relative;
  min-width: 0;
}

.tx-sensitive-input__field {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  height: var(--tx-si-height);
  padding: 0 var(--tx-si-pad);
  border-radius: var(--tx-si-radius);
  background: var(--tx-bg-color, #fff);
  // A ring, not a border: the box stays exactly --tx-si-height tall when focus
  // thickens it to 1.5px, so nothing in the form row shifts.
  box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6);
  outline: none;

  .tx-sensitive-input.is-masked:not(.is-disabled) & {
    cursor: pointer;
  }

  .tx-sensitive-input.is-disabled & {
    cursor: not-allowed;
    background: var(--tx-disabled-bg-color, #f5f7fa);
  }

  .tx-sensitive-input.is-error & {
    box-shadow: inset 0 0 0 1px var(--tx-color-danger, #f56c6c);
  }

  &:focus-visible,
  &:focus-within {
    box-shadow:
      inset 0 0 0 1.5px var(--tx-color-primary, #409eff),
      0 0 0 3px var(--tx-color-primary-light-9, #ecf5ff);
  }

  .tx-sensitive-input.is-error &:focus-visible,
  .tx-sensitive-input.is-error &:focus-within {
    box-shadow:
      inset 0 0 0 1.5px var(--tx-color-danger, #f56c6c),
      0 0 0 3px var(--tx-color-danger-light-9, #fef0f0);
  }
}

.tx-sensitive-input__inner {
  flex: 1;
  min-width: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  padding-right: calc(var(--tx-si-icon) + 8px);
  border: none;
  outline: none;
  background: transparent;
  font: inherit;
  font-size: var(--tx-si-font);
  color: var(--tx-text-color-primary, #303133);

  &::placeholder {
    color: var(--tx-text-color-placeholder, #a8abb2);
  }

  &:disabled {
    cursor: not-allowed;
    color: var(--tx-text-color-disabled, #c0c4cc);
  }

  // While masked the native dots are behind the overlay; keeping them
  // transparent stops two sets of glyphs from showing through each other.
  .tx-sensitive-input.is-masked & {
    color: transparent;
    pointer-events: none;
  }
}

.tx-sensitive-input__mask {
  position: absolute;
  inset: 0 calc(var(--tx-si-icon) + 8px) 0 0;
  display: flex;
  align-items: center;
  padding-left: var(--tx-si-pad);
  overflow: hidden;
  font-size: var(--tx-si-font);
  color: var(--tx-text-color-primary, #303133);
  user-select: none;
  pointer-events: none;

  .tx-sensitive-input.is-disabled & {
    color: var(--tx-text-color-disabled, #c0c4cc);
  }
}

.tx-sensitive-input__mask-stack {
  position: relative;
}

// Both strings stay mounted and swap visibility: rendering one at a time
// re-lays out the field on every hover.
.tx-sensitive-input__mask-reveal {
  position: absolute;
  top: 0;
  left: 0;
  visibility: hidden;
  white-space: nowrap;
  color: var(--tx-text-color-placeholder, #a8abb2);
}

.tx-sensitive-input__field:hover .tx-sensitive-input__mask-dots,
.tx-sensitive-input__field:focus-visible .tx-sensitive-input__mask-dots,
.tx-sensitive-input__field:focus-within .tx-sensitive-input__mask-dots {
  visibility: hidden;
}

.tx-sensitive-input__field:hover .tx-sensitive-input__mask-reveal,
.tx-sensitive-input__field:focus-visible .tx-sensitive-input__mask-reveal,
.tx-sensitive-input__field:focus-within .tx-sensitive-input__mask-reveal {
  visibility: visible;
}

.tx-sensitive-input.is-disabled .tx-sensitive-input__field:hover .tx-sensitive-input__mask-dots {
  visibility: visible;
}

.tx-sensitive-input__eye {
  position: absolute;
  top: 50%;
  right: var(--tx-si-pad);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--tx-si-icon);
  height: var(--tx-si-icon);
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  box-shadow: none;
  transform: translateY(-50%);
  font-size: var(--tx-si-icon);
  color: var(--tx-text-color-placeholder, #a8abb2);
  cursor: pointer;

  &:hover,
  &:focus {
    color: var(--tx-text-color-primary, #303133);
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: 2px;
    border-radius: 2px;
  }

  &.is-hidden {
    opacity: 0;
    pointer-events: none;
  }
}

.tx-sensitive-input__copy {
  position: absolute;
  bottom: 100%;
  right: 8px;
  z-index: 1;
  margin: 0 0 -1px;
  padding: 1px 8px 2px;
  border: none;
  // Concentric with the field: this tab's top corners are the field radius
  // minus the 6px inset from its right edge.
  border-radius: calc(var(--tx-si-radius) - 6px) calc(var(--tx-si-radius) - 6px) 0 0;
  background: var(--tx-color-primary, #409eff);
  box-shadow: none;
  font: inherit;
  font-size: 12px;
  line-height: 1.4;
  color: var(--tx-color-on-primary, #fff);
  cursor: pointer;
  opacity: 0;
  // Opacity only. Hover colour changes stay immediate.
  transition: opacity 0.15s ease;

  &.is-copied {
    background: var(--tx-color-success, #67c23a);
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: 2px;
  }

  .tx-sensitive-input__group:hover &,
  .tx-sensitive-input__group:focus-within &,
  &:focus-visible {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-sensitive-input__description {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-sensitive-input__error {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--tx-color-danger, #f56c6c);
}

.tx-sensitive-input__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
