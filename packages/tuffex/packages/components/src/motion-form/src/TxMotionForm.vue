<script setup lang="ts">
// Amicro forms/AnimatedFormElement.tsx, MIT License.
// Copyright (c) 2026 SYED  SUBHAN UDDIN
// Port: compose TuffEx controls; business outcomes belong exclusively to the caller.
import type { FileUploaderFile } from '../../file-uploader/src/types'
import type { TxSelectModelValue, TxSelectValue } from '../../select/src/types'
import type { MotionFormEmits, MotionFormProps, MotionFormSlots, MotionFormValue } from './types'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useMotionActivity } from '../../../../utils/motion-activity'
import TxButton from '../../button/src/button.vue'
import TxCheckbox from '../../checkbox/src/TxCheckbox.vue'
import TxFileUploader from '../../file-uploader/src/TxFileUploader.vue'
import TxInput from '../../input/src/TxInput.vue'
import { resolveTransition } from '../../liquid/src/spring'
import TxRadio from '../../radio/src/TxRadio.vue'
import TxRadioGroup from '../../radio/src/TxRadioGroup.vue'
import TxSelect from '../../select/src/TxSelect.vue'
import TxSlider from '../../slider/src/TxSlider.vue'
import TxTextarea from '../../textarea/src/TxTextarea.vue'
import TxTextMorph from '../../text-morph/src/TxTextMorph.vue'
import { MOTION_FORM_DEFAULT_LABELS } from './types'

defineOptions({ name: 'TxMotionForm', inheritAttrs: false })
defineSlots<MotionFormSlots>()
const props = withDefaults(defineProps<MotionFormProps>(), {
  variant: 'floating-label-input',
  label: '',
  placeholder: '',
  description: '',
  size: 'md',
  disabled: false,
  readonly: false,
  required: false,
  status: 'default',
  error: '',
  options: () => [],
  inputType: 'text',
  rows: 2,
  maxRows: 8,
  accept: '*/*',
  multiple: true,
  maxFiles: 10,
  min: 0,
  max: 100,
  step: 1,
  nativeType: 'button',
  motion: true,
})
const emit = defineEmits<MotionFormEmits>()
const root = ref<HTMLElement | null>(null)
const { active, present } = useMotionActivity(root, () => props.motion)
const id = useId()
const controlId = `${id}-control`
const labelId = `${id}-label`
const messageId = `${id}-message`
const focused = ref(false)
const revealed = ref(props.passwordVisible ?? false)
const errorBeat = ref(false)
const pickerValue = ref<TxSelectValue>('')
const selectRef = ref<InstanceType<typeof TxSelect> | null>(null)
const digits = ref(['', '', '', ''])
let growAnimation: Animation | undefined

const copy = computed(() => ({ ...MOTION_FORM_DEFAULT_LABELS, ...props.labels }))
const accessibleLabel = computed(() => props.label || copy.value.field)
const isError = computed(() => Boolean(props.error) || props.status === 'error')
const isTextField = computed(() => [
  'floating-label-input', 'input-focus-glow', 'password-toggle', 'search-expand',
  'error-shake', 'success-check',
].includes(props.variant))
const hasNativeLabel = computed(() => isTextField.value
  || ['textarea-auto-grow', 'select-dropdown', 'multi-select-chips'].includes(props.variant))
const textValue = computed(() => typeof props.modelValue === 'string' || typeof props.modelValue === 'number'
  ? props.modelValue : '')
const selectedValues = computed<TxSelectValue[]>(() => Array.isArray(props.modelValue)
  ? props.modelValue.filter((value): value is TxSelectValue => typeof value === 'string' || typeof value === 'number')
  : [])
const selectedOptions = computed(() => selectedValues.value.map(value =>
  props.options.find(option => option.value === value) ?? { value, label: String(value) }))
const availableOptions = computed(() => props.options.map(option => ({
  ...option, disabled: option.disabled || selectedValues.value.includes(option.value),
})))
const files = computed<FileUploaderFile[]>(() => Array.isArray(props.modelValue)
  ? props.modelValue.filter((value): value is FileUploaderFile => typeof value === 'object' && value !== null && 'file' in value)
  : [])
const selectedValue = computed<TxSelectValue>(() => typeof props.modelValue === 'string' || typeof props.modelValue === 'number'
  ? props.modelValue : '')
const numericValue = computed(() => typeof props.modelValue === 'number' ? props.modelValue : props.min)
const statusLabel = computed(() => {
  if (props.variant === 'form-submit-button') {
    if (props.status === 'loading') return copy.value.submitting
    if (props.status === 'success') return copy.value.submitted
    if (isError.value) return copy.value.submitError
    return copy.value.submit
  }
  if (props.status === 'loading') return copy.value.validating
  return props.status === 'success' ? copy.value.verified : copy.value.validate
})
const message = computed(() => {
  if (props.error) return props.error
  if (isError.value) return props.variant === 'form-submit-button' ? copy.value.submitError : copy.value.validationError
  if (props.status !== 'default') return statusLabel.value
  return props.description
})
const controlAttrs = computed(() => ({
  id: controlId,
  'aria-labelledby': labelId,
  'aria-describedby': messageId,
  'aria-invalid': isError.value || undefined,
  'aria-required': props.required || undefined,
}))
const spring = computed(() => {
  const coefficients = props.variant === 'radio-scale' || props.variant === 'otp-input'
    ? { stiffness: 500, damping: 25 }
    : { stiffness: 400, damping: props.variant === 'search-expand' ? 28 : 25 }
  return resolveTransition(coefficients, !active.value)
})
const motionStyle = computed(() => ({
  '--tx-mf-duration': `${spring.value.duration}ms`,
  '--tx-mf-easing': spring.value.easing,
}))
const dropdownAnimation = computed(() => active.value
  ? { type: 'expand' as const, scale: 0.95, distance: 6, blur: 4, duration: 200, ease: spring.value.easing }
  : { type: 'none' as const, duration: 0 })

function update(value: MotionFormValue): void {
  if (props.disabled)
    return
  emit('update:modelValue', value)
  emit('change', value)
  if (props.variant === 'search-expand')
    emit('search', String(value))
}
function requestValidation(): void {
  if (!props.disabled && props.status !== 'loading')
    emit('validate', props.modelValue ?? '')
}
function requestSubmit(event: MouseEvent): void {
  if (!props.disabled && props.status !== 'loading')
    emit('submit', props.modelValue, event)
}
function togglePassword(): void {
  if (props.disabled)
    return
  revealed.value = !revealed.value
  emit('update:passwordVisible', revealed.value)
}
function focusControl(): void {
  if (props.disabled)
    return
  root.value?.querySelector<HTMLElement>('input:not([type="file"]):not(:disabled), textarea:not(:disabled), button:not(:disabled)')?.focus()
}
function onFocus(event: FocusEvent): void {
  if (focused.value)
    return
  focused.value = true
  emit('focus', event)
}
function onBlur(event: FocusEvent): void {
  if (event.relatedTarget && root.value?.contains(event.relatedTarget as Node))
    return
  focused.value = false
  emit('blur', event)
}
function addOption(value: TxSelectModelValue): void {
  if (Array.isArray(value) || props.disabled)
    return
  const option = props.options.find(option => option.value === value)
  if (!option || option.disabled || selectedValues.value.includes(value))
    return
  pickerValue.value = value
  update([...selectedValues.value, value])
  void nextTick(() => { pickerValue.value = '' })
}
function removeOption(value: TxSelectValue): void {
  update(selectedValues.value.filter(item => item !== value))
  void nextTick(focusControl)
}
function removeFile(id: string): void {
  if (props.disabled)
    return
  const value = files.value.filter(file => file.id !== id)
  update(value)
  emit('fileRemove', { id, value })
  void nextTick(focusControl)
}
function onFilesAdded(value: FileUploaderFile[]): void {
  if (!props.disabled)
    emit('filesSelected', value)
}

// Four scoped TxInputs retain empty middle boxes while the controlled model is
// their joined string. A genuinely external value replaces the entire code.
function normalizeDigits(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '').slice(0, 4) : ''
}
watch(() => [props.modelValue, props.variant] as const, ([value, variant]) => {
  if (variant !== 'otp-input')
    return
  const next = normalizeDigits(value)
  if (next !== digits.value.join(''))
    digits.value = Array.from({ length: 4 }, (_, index) => next[index] ?? '')
}, { immediate: true })
function otpInputs(): HTMLInputElement[] {
  return Array.from(root.value?.querySelectorAll<HTMLInputElement>('[data-tx-mf-otp]') ?? [])
}
function focusDigit(index: number): void {
  const input = otpInputs()[Math.max(0, Math.min(3, index))]
  input?.focus()
  input?.select()
}
function commitDigits(): void {
  const value = digits.value.join('')
  update(value)
  if (digits.value.every(digit => /^\d$/.test(digit)))
    emit('otpComplete', value)
  void nextTick(() => {
    // A rejected/non-digit input must be restored even when the model did not
    // change; relying on a same-value Vue patch leaves the browser's edit visible.
    otpInputs().forEach((input, index) => { input.value = digits.value[index] ?? '' })
  })
}
function inputDigit(index: number, value: string | number): void {
  if (props.disabled || props.readonly)
    return
  const clean = String(value).replace(/\D/g, '')
  if (!clean) {
    digits.value[index] = ''
    commitDigits()
    return
  }
  const incoming = clean.slice(0, 4 - index)
  for (let offset = 0; offset < incoming.length; offset++)
    digits.value[index + offset] = incoming[offset] ?? ''
  commitDigits()
  void nextTick(() => focusDigit(Math.min(3, index + incoming.length)))
}
function pasteDigits(index: number, event: ClipboardEvent): void {
  event.preventDefault()
  if (!props.disabled && !props.readonly)
    inputDigit(index, event.clipboardData?.getData('text') ?? '')
}
function otpKey(index: number, event: KeyboardEvent): void {
  if (props.disabled)
    return
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    focusDigit(index + (event.key === 'ArrowLeft' ? -1 : 1))
  }
  else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    focusDigit(event.key === 'Home' ? 0 : 3)
  }
  else if (event.key === 'Backspace' && !props.readonly) {
    event.preventDefault()
    if (digits.value[index])
      digits.value[index] = ''
    else if (index > 0) {
      digits.value[index - 1] = ''
      focusDigit(index - 1)
    }
    commitDigits()
  }
  else if (event.key === 'Delete' && !props.readonly) {
    event.preventDefault()
    digits.value[index] = ''
    commitDigits()
  }
}

function stopGrow(): void {
  growAnimation?.cancel()
  growAnimation = undefined
}
function growTextarea(): void {
  if (props.variant !== 'textarea-auto-grow')
    return
  const field = root.value?.querySelector<HTMLTextAreaElement>('textarea')
  if (!field)
    return
  stopGrow()
  const previous = field.getBoundingClientRect().height
  const style = getComputedStyle(field)
  const lineHeight = Number.parseFloat(style.lineHeight) || 20
  const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
  const minRows = Math.max(1, props.rows)
  const maxRows = Math.max(minRows, props.maxRows)
  field.style.height = 'auto'
  const height = Math.min(maxRows * lineHeight + padding,
    Math.max(minRows * lineHeight + padding, field.scrollHeight))
  field.style.height = `${height}px`
  field.style.overflowY = field.scrollHeight > height ? 'auto' : 'hidden'
  if (active.value && previous !== height && typeof field.animate === 'function') {
    const animation = field.animate([{ height: `${previous}px` }, { height: `${height}px` }], {
      duration: spring.value.duration, easing: spring.value.easing,
    })
    growAnimation = animation
    animation.onfinish = () => {
      if (growAnimation === animation)
        growAnimation = undefined
    }
  }
}
watch(() => [props.modelValue, props.variant, props.rows, props.maxRows], growTextarea, { flush: 'post' })
watch(() => props.passwordVisible, value => {
  if (value !== undefined)
    revealed.value = value
})
watch(() => [props.error, props.status, props.validationKey], () => {
  if (isError.value)
    errorBeat.value = !errorBeat.value
})
watch(active, (running) => {
  if (!running) {
    stopGrow()
    selectRef.value?.close()
  }
})
onMounted(growTextarea)
onBeforeUnmount(stopGrow)
defineExpose({ focus: focusControl, blur: () => {
  const target = root.value?.querySelector<HTMLElement>(':focus')
  target?.blur()
} })
</script>

<template>
  <div
    ref="root"
    v-bind="$attrs"
    class="tx-motion-form"
    :class="[
      `tx-motion-form--${variant}`, `tx-motion-form--${size}`,
      { 'is-active': active, 'is-focused': focused, 'is-filled': textValue !== '',
        'is-disabled': disabled, 'is-error': isError, 'is-success': status === 'success',
        'is-loading': status === 'loading', 'is-error-a': errorBeat, 'is-error-b': !errorBeat },
    ]"
    :style="motionStyle"
    @focusin="onFocus"
    @focusout="onBlur"
  >
    <component
      :is="hasNativeLabel ? 'label' : 'span'"
      v-if="variant !== 'floating-label-input' && variant !== 'checkbox-draw'"
      :id="labelId"
      :for="hasNativeLabel ? controlId : undefined"
      class="tx-motion-form__label"
    >
<slot name="label">
{{ accessibleLabel }}
</slot><span v-if="required" aria-hidden="true"> *</span>
</component>

    <div class="tx-motion-form__control">
      <label v-if="variant === 'floating-label-input'" :id="labelId" :for="controlId" class="tx-motion-form__floating">
        <slot name="label">{{ accessibleLabel }}</slot><span v-if="required" aria-hidden="true"> *</span>
      </label>
      <TxInput
        v-if="isTextField"
        v-bind="controlAttrs"
        :model-value="textValue"
        :type="variant === 'password-toggle' ? (revealed ? 'text' : 'password') : inputType"
        :placeholder="variant === 'floating-label-input' && !focused && textValue === '' ? '' : placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :required="required"
        :autocomplete="autocomplete"
        :maxlength="maxLength"
        :caps-lock-text="copy.capsLock"
        @update:model-value="update"
      >
        <template #prefix>
          <slot name="prefix">
            <svg v-if="variant === 'search-expand'" class="tx-motion-form__search" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" />
            </svg>
          </slot>
        </template>
        <template #suffix>
          <slot name="suffix">
            <button
              v-if="variant === 'password-toggle'"
              type="button"
              class="tx-motion-form__eye"
              :class="{ 'is-revealed': revealed }"
              :disabled="disabled"
              :aria-label="revealed ? copy.hidePassword : copy.showPassword"
              :aria-pressed="revealed"
              :aria-controls="controlId"
              @click="togglePassword"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
                <path v-if="!revealed" d="m3 3 18 18" />
              </svg>
            </button>
          </slot>
        </template>
      </TxInput>

      <TxCheckbox
        v-else-if="variant === 'checkbox-draw'"
        v-bind="controlAttrs"
        :model-value="modelValue === true"
        :disabled="disabled"
        variant="checkmark"
        @update:model-value="update"
      >
<span :id="labelId"><slot name="label">{{ accessibleLabel }}</slot><span v-if="required" aria-hidden="true"> *</span></span>
</TxCheckbox>

      <TxRadioGroup
        v-else-if="variant === 'radio-scale'"
        v-bind="controlAttrs"
        :model-value="selectedValue"
        :disabled="disabled"
        type="standard"
        direction="column"
        @update:model-value="update"
      >
        <TxRadio v-for="option in options" :key="option.value" :value="option.value" :disabled="option.disabled" :label="option.label">
          <slot name="option" :option="option" :selected="selectedValue === option.value">
{{ option.label }}
</slot>
        </TxRadio>
      </TxRadioGroup>

      <TxSelect
        v-else-if="variant === 'select-dropdown'"
        ref="selectRef"
        v-bind="controlAttrs"
        :model-value="selectedValue"
        :options="options"
        :placeholder="placeholder"
        :disabled="disabled"
        :status="isError ? 'error' : 'default'"
        :animation="dropdownAnimation"
        :empty-text="copy.noOptions"
        panel-background="pure"
        :panel-radius="12"
        @update:model-value="update"
      >
        <template #option="scope">
<slot name="option" v-bind="scope">
{{ scope.option.label }}
</slot>
</template>
      </TxSelect>

      <div v-else-if="variant === 'multi-select-chips'" class="tx-motion-form__multi" role="group" :aria-labelledby="labelId" :aria-describedby="messageId">
        <TransitionGroup :css="active" name="tx-mf-chip" tag="ul" class="tx-motion-form__chips">
          <li v-for="option in selectedOptions" :key="option.value" class="tx-motion-form__chip">
            <slot name="chip" :option="option">
{{ option.label }}
</slot>
            <button type="button" :disabled="disabled" :aria-label="copy.removeOption(option.label)" @click="removeOption(option.value)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </li>
        </TransitionGroup>
        <!-- Add one choice with the existing, fully keyboard-operated single
             select; chips remain a separate labelled list with native buttons. -->
        <TxSelect
          ref="selectRef"
          v-bind="controlAttrs"
          :model-value="pickerValue"
          :options="availableOptions"
          :disabled="disabled"
          :placeholder="placeholder || copy.searchOptions"
          :empty-text="copy.noOptions"
          :animation="dropdownAnimation"
          panel-background="pure"
          :panel-radius="12"
          @update:model-value="addOption"
        >
          <template #option="scope">
<slot name="option" v-bind="scope">
{{ scope.option.label }}
</slot>
</template>
        </TxSelect>
      </div>

      <TxTextarea
        v-else-if="variant === 'textarea-auto-grow'"
        v-bind="controlAttrs"
        :model-value="String(textValue)"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :required="required"
        :rows="rows"
        :max-length="maxLength"
        :status="isError ? 'error' : status === 'success' ? 'success' : 'default'"
        resize="none"
        @update:model-value="update"
      />

      <div v-else-if="variant === 'otp-input'" class="tx-motion-form__otp" role="group" :aria-labelledby="labelId" :aria-describedby="messageId">
        <TxInput
          v-for="(_, index) in digits"
          :id="`${controlId}-${index}`"
          :key="index"
          data-tx-mf-otp
          :model-value="digits[index]"
          :disabled="disabled"
          :readonly="readonly"
          :required="required"
          :aria-label="`${accessibleLabel}: ${copy.otpDigit(index + 1)}`"
          :aria-invalid="isError || undefined"
          :aria-describedby="messageId"
          inputmode="numeric"
          pattern="[0-9]*"
          :autocomplete="index === 0 ? 'one-time-code' : 'off'"
          :maxlength="4"
          @update:model-value="value => inputDigit(index, value)"
          @paste="(event: ClipboardEvent) => pasteDigits(index, event)"
          @keydown="(event: KeyboardEvent) => otpKey(index, event)"
          @focus="() => focusDigit(index)"
        />
      </div>

      <div v-else-if="variant === 'file-upload-dropzone'" class="tx-motion-form__files" role="group" :aria-labelledby="labelId" :aria-describedby="messageId" :aria-invalid="isError || undefined">
        <svg class="tx-motion-form__upload" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" /></svg>
        <TxFileUploader
          :model-value="files"
          :disabled="disabled"
          :accept="accept"
          :multiple="multiple"
          :max="maxFiles"
          :button-text="copy.chooseFiles"
          :drop-text="copy.dropFiles"
          :hint-text="copy.fileHint"
          @update:model-value="update"
          @add="onFilesAdded"
        />
        <!-- The primitive owns picker/filter/drop semantics. This localized
             file list replaces its English-only remove labels, not selection. -->
        <ul v-if="files.length" class="tx-motion-form__file-list">
          <li v-for="file in files" :key="file.id" class="tx-motion-form__file">
            <slot name="file" :file="file" :remove="() => removeFile(file.id)">
<span>{{ file.name }}</span><span>{{ file.size }} B</span>
</slot>
            <button type="button" :disabled="disabled" :aria-label="copy.removeFile(file.name)" @click="removeFile(file.id)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </li>
        </ul>
      </div>

      <TxSlider
        v-else-if="variant === 'range-slider'"
        :model-value="numericValue"
        :active="present"
        :disabled="disabled"
        :aria-labelledby="labelId"
        :min="min"
        :max="max"
        :step="step"
        :format-value="formatValue"
        :show-value="true"
        :show-tooltip="active"
        tooltip-trigger="hover"
        :tooltip-tilt="active"
        :tooltip-jelly="active"
        :thumb-surface="active"
        :tooltip-motion="active ? 'fade' : 'none'"
        @update:model-value="update"
      />

      <TxButton
        v-else-if="variant === 'form-submit-button'"
        class="tx-motion-form__submit"
        :size="size === 'xs' ? 'sm' : size"
        :disabled="disabled || status === 'loading'"
        :native-type="nativeType"
        :variant="isError ? 'danger' : status === 'success' ? 'success' : 'primary'"
        :aria-busy="status === 'loading' || undefined"
        :aria-describedby="messageId"
        block
        @click="requestSubmit"
      >
        <span v-if="status === 'loading'" class="tx-motion-form__spinner" aria-hidden="true" />
        <svg v-else-if="status === 'success'" class="tx-motion-form__check" viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" d="M20 6 9 17l-5-5" /></svg>
        <slot name="submit" :status="status" :label="statusLabel">
<TxTextMorph :text="statusLabel" :disabled="!active" />
</slot>
      </TxButton>

      <TxButton
        v-if="variant === 'error-shake' || variant === 'success-check'"
        class="tx-motion-form__validate"
        :size="size === 'xs' ? 'sm' : size"
        :disabled="disabled || status === 'loading'"
        :aria-busy="status === 'loading' || undefined"
        variant="secondary"
        @click="requestValidation"
      >
        <svg v-if="variant === 'success-check' && status === 'success'" class="tx-motion-form__check" viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" d="M20 6 9 17l-5-5" /></svg>
        <span v-if="status === 'loading'" class="tx-motion-form__spinner" aria-hidden="true" />
        <TxTextMorph :text="statusLabel" :disabled="!active" />
      </TxButton>
    </div>

    <div :id="messageId" class="tx-motion-form__message" role="status" aria-live="polite" aria-atomic="true">
      <slot name="status" :status="status" :error="error" :value="modelValue">
{{ message }}
</slot>
    </div>
  </div>
</template>

<style scoped>
.tx-motion-form {
  --tx-mf-height: 36px;
  --tx-mf-choice: 22px;
  --tx-mf-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  color: var(--tx-text-color-primary, #303133);
  font-size: 14px;
}
.tx-motion-form--xs { --tx-mf-height: 26px; --tx-mf-choice: 16px; --tx-mf-radius: 8px; }
.tx-motion-form--sm { --tx-mf-height: 30px; --tx-mf-choice: 18px; --tx-mf-radius: 10px; }
.tx-motion-form--lg { --tx-mf-height: 42px; --tx-mf-choice: 24px; }
.tx-motion-form__label { font-size: 13px; font-weight: 500; line-height: 1.4; }
.tx-motion-form__control { position: relative; min-width: 0; }
.tx-motion-form__message { color: var(--tx-text-color-regular, #606266); font-size: 12px; line-height: 1.5; }
.tx-motion-form__message:empty { display: none; }
.tx-motion-form.is-error { --tx-mf-ring: var(--tx-color-danger, #f56c6c); }
.tx-motion-form :deep(.tx-input) {
  box-sizing: border-box;
  height: var(--tx-mf-height);
  min-height: var(--tx-mf-height);
  border: 0;
  border-radius: var(--tx-mf-radius);
  box-shadow: inset 0 0 0 1px var(--tx-mf-ring, var(--tx-border-color, #dcdfe6));
  transition: box-shadow 200ms;
}
.tx-motion-form :deep(.tx-input__inner) { min-width: 0; font-size: 14px; }
.tx-motion-form :deep(.tx-input.is-focused) { box-shadow: inset 0 0 0 1.5px var(--tx-mf-ring, var(--tx-color-primary, #409eff)); }
.tx-motion-form__floating {
  position: absolute;
  z-index: 1;
  inset-inline-start: 12px;
  top: calc((var(--tx-mf-height) - 20px) / 2);
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  transform-origin: left center;
  color: var(--tx-text-color-regular, #606266);
  transition: transform var(--tx-mf-duration) var(--tx-mf-easing);
  cursor: text;
}
.tx-motion-form--floating-label-input { padding-top: 22px; }
.tx-motion-form--floating-label-input.is-focused .tx-motion-form__floating,
.tx-motion-form--floating-label-input.is-filled .tx-motion-form__floating { transform: translateY(-24px) scale(0.85); }
.tx-motion-form--floating-label-input.is-focused .tx-motion-form__floating { color: var(--tx-text-color-primary, #303133); }
.tx-motion-form--input-focus-glow :deep(.tx-input.is-focused) {
  box-shadow: inset 0 0 0 1.5px var(--tx-color-primary, #409eff), 0 0 0 4px var(--tx-color-primary-light-9, #ecf5ff), 0 0 14px 2px color-mix(in srgb, var(--tx-color-primary, #409eff) 20%, transparent);
}
.tx-motion-form__eye, .tx-motion-form__chip button, .tx-motion-form__file button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  padding: 4px;
  border: 0;
  border-radius: 6px;
  color: inherit;
  background: transparent;
  cursor: pointer;
}
.tx-motion-form__eye { transform: rotate(-10deg); transition: transform var(--tx-mf-duration) var(--tx-mf-easing); }
.tx-motion-form__eye.is-revealed { transform: rotate(0) scale(1.1); }
.tx-motion-form__eye:hover:not(:disabled), .tx-motion-form__chip button:hover:not(:disabled), .tx-motion-form__file button:hover:not(:disabled) { background: var(--tx-fill-color-light, #f5f7fa); }
.tx-motion-form button:focus-visible { outline: 2px solid var(--tx-color-primary, #409eff); outline-offset: 2px; }
.tx-motion-form button:disabled { cursor: not-allowed; }
.tx-motion-form svg { display: block; width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }
.tx-motion-form--search-expand .tx-motion-form__control { width: min(100%, 160px); transition: width var(--tx-mf-duration) var(--tx-mf-easing); }
.tx-motion-form--search-expand.is-focused .tx-motion-form__control { width: min(100%, 240px); }
.tx-motion-form--search-expand :deep(.tx-input) { border-radius: 999px; }
.tx-motion-form__search { transition: transform var(--tx-mf-duration) var(--tx-mf-easing); }
.tx-motion-form.is-focused .tx-motion-form__search { transform: translateX(-2px); }
.tx-motion-form :deep(.tx-checkbox__box) { width: var(--tx-mf-choice); height: var(--tx-mf-choice); transition-property: transform, box-shadow; }
.tx-motion-form :deep(.tx-checkbox__tick) { transition: stroke-dashoffset 200ms; stroke: var(--tx-text-color-primary, #303133); }
.tx-motion-form :deep(.tx-radio) { transition: transform var(--tx-mf-duration) var(--tx-mf-easing); }
.tx-motion-form :deep(.tx-radio__indicator) { width: var(--tx-mf-choice); height: var(--tx-mf-choice); background: var(--tx-bg-color, #fff); transition: none; }
.tx-motion-form :deep(.tx-radio.is-checked .tx-radio__indicator) { background: var(--tx-bg-color, #fff); }
.tx-motion-form :deep(.tx-radio__indicator::after) { width: 60%; height: 60%; background: var(--tx-color-primary, #409eff); transition: transform var(--tx-mf-duration) var(--tx-mf-easing); }
.tx-motion-form__validate { margin-top: 8px; }
.tx-motion-form__check { color: var(--tx-text-color-primary, #303133); }
.tx-motion-form__multi { display: flex; flex-direction: column; gap: 8px; }
.tx-motion-form__chips, .tx-motion-form__file-list { margin: 0; padding: 0; list-style: none; }
.tx-motion-form__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.tx-motion-form__chip { display: inline-flex; align-items: center; gap: 2px; padding: 2px 4px 2px 10px; border-radius: 999px; background: var(--tx-color-primary-light-9, #ecf5ff); color: var(--tx-text-color-primary, #303133); font-size: 13px; }
.tx-mf-chip-enter-active, .tx-mf-chip-leave-active { transition: transform var(--tx-mf-duration) var(--tx-mf-easing), opacity 160ms; }
.tx-mf-chip-enter-from, .tx-mf-chip-leave-to { transform: scale(0); opacity: 0; }
.tx-motion-form--textarea-auto-grow :deep(.tx-textarea) { min-height: 0; border: 0; box-shadow: inset 0 0 0 1px var(--tx-mf-ring, var(--tx-border-color, #dcdfe6)); transition: box-shadow 200ms; }
.tx-motion-form--textarea-auto-grow :deep(.tx-textarea__field) { box-sizing: border-box; min-height: 0; line-height: 20px; }
.tx-motion-form__otp { display: flex; gap: 8px; }
.tx-motion-form__otp :deep(.tx-input) { width: calc(var(--tx-mf-height) + 4px); height: calc(var(--tx-mf-height) + 8px); flex: 0 1 auto; padding: 0; transition: transform var(--tx-mf-duration) var(--tx-mf-easing); }
.tx-motion-form__otp :deep(.tx-input.is-focused) { transform: scale(1.1); }
.tx-motion-form__otp :deep(.tx-input__inner) { text-align: center; padding: 0; font-variant-numeric: tabular-nums; }
.tx-motion-form__files { position: relative; }
.tx-motion-form__upload { position: absolute; z-index: 1; top: 14px; left: calc(50% - 12px); width: 24px !important; height: 24px !important; pointer-events: none; color: var(--tx-text-color-primary, #303133); }
.tx-motion-form__files :deep(.tx-file-uploader__drop) { position: relative; padding-top: 44px; border-radius: var(--tx-mf-radius); transition: transform var(--tx-mf-duration) var(--tx-mf-easing); }
.tx-motion-form__files :deep(.tx-file-uploader__drop:hover:not(:disabled)) { transform: scale(1.02); }
.tx-motion-form__files :deep(.tx-file-uploader__list) { display: none; }
.tx-motion-form__file-list { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
.tx-motion-form__file { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.tx-motion-form__file > span:first-child { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.tx-motion-form__file > span:nth-child(2) { font-variant-numeric: tabular-nums; }
.tx-motion-form__submit { min-height: var(--tx-mf-height); border-radius: var(--tx-mf-radius); }
.tx-motion-form__spinner { width: 16px; height: 16px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; }
.tx-motion-form:not(.is-active) *, .tx-motion-form:not(.is-active) :deep(*) { animation: none !important; transition: none !important; }
@media (prefers-reduced-motion: no-preference) {
  .tx-motion-form.is-active :deep(.tx-checkbox.is-checked .tx-checkbox__box) { animation: tx-mf-choice 220ms ease-out; }
  .tx-motion-form.is-active .tx-motion-form__check { animation: tx-mf-check-pop var(--tx-mf-duration) var(--tx-mf-easing); }
  .tx-motion-form.is-active .tx-motion-form__check path { animation: tx-mf-draw 300ms ease-out; }
  .tx-motion-form.is-active .tx-motion-form__spinner { animation: tx-mf-spin 800ms linear infinite; }
  .tx-motion-form.is-active .tx-motion-form__files:has(.is-dragging) .tx-motion-form__upload { animation: tx-mf-upload 800ms ease-in-out infinite; }
  .tx-motion-form.is-active .tx-motion-form__files :deep(.is-dragging .tx-file-uploader__drop::before) { content: ''; position: absolute; inset: 2px; border: 1px dashed var(--tx-color-primary, #409eff); border-radius: inherit; pointer-events: none; animation: tx-mf-drop 800ms ease-in-out infinite; }
  .tx-motion-form--error-shake.is-active.is-error.is-error-a :deep(.tx-input) { animation: tx-mf-shake-a 500ms linear; }
  .tx-motion-form--error-shake.is-active.is-error.is-error-b :deep(.tx-input) { animation: tx-mf-shake-b 500ms linear; }
}
@keyframes tx-mf-choice { 50% { scale: 1.15; } }
@keyframes tx-mf-check-pop { from { scale: 0; } to { scale: 1; } }
@keyframes tx-mf-draw { from { stroke-dasharray: 1; stroke-dashoffset: 1; } to { stroke-dasharray: 1; stroke-dashoffset: 0; } }
@keyframes tx-mf-spin { to { rotate: 360deg; } }
@keyframes tx-mf-upload { 50% { translate: 0 -4px; } }
@keyframes tx-mf-drop { 50% { opacity: 0.4; scale: 1.02; } }
@keyframes tx-mf-shake-a { 0% { translate: -10px; } 16% { translate: 10px; } 33% { translate: -8px; } 50% { translate: 8px; } 66% { translate: -4px; } 83% { translate: 4px; } 100% { translate: 0; } }
@keyframes tx-mf-shake-b { 0% { translate: -10px; } 16% { translate: 10px; } 33% { translate: -8px; } 50% { translate: 8px; } 66% { translate: -4px; } 83% { translate: 4px; } 100% { translate: 0; } }
@media (prefers-reduced-motion: reduce) {
  .tx-motion-form *, .tx-motion-form :deep(*), .tx-motion-form :deep(*::before), .tx-motion-form :deep(*::after) { animation: none !important; transition: none !important; }
}
</style>
