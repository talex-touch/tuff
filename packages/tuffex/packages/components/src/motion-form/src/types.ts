// Adapted from Amicro, MIT License.
// Copyright (c) 2026 SYED  SUBHAN UDDIN
// Vue composition, controlled models, accessibility and lifecycle changes by TuffEx.
import type { VNodeChild } from 'vue'
import type { FileUploaderFile } from '../../file-uploader/src/types'
import type { TxSelectOption, TxSelectValue } from '../../select/src/types'

export const MOTION_FORM_VARIANTS = [
  'floating-label-input',
  'input-focus-glow',
  'password-toggle',
  'search-expand',
  'checkbox-draw',
  'radio-scale',
  'error-shake',
  'success-check',
  'select-dropdown',
  'multi-select-chips',
  'textarea-auto-grow',
  'otp-input',
  'file-upload-dropzone',
  'range-slider',
  'form-submit-button',
] as const

export type MotionFormVariant = typeof MOTION_FORM_VARIANTS[number]
export type MotionFormStatus = 'default' | 'loading' | 'success' | 'error'
export type MotionFormValue = string | number | boolean | TxSelectValue[] | FileUploaderFile[]
export type MotionFormOption = TxSelectOption

export interface MotionFormLabels {
  field: string
  showPassword: string
  hidePassword: string
  capsLock: string
  validate: string
  validating: string
  verified: string
  validationError: string
  submit: string
  submitting: string
  submitted: string
  submitError: string
  chooseFiles: string
  dropFiles: string
  fileHint: string
  searchOptions: string
  noOptions: string
  otpDigit: (index: number) => string
  removeOption: (label: string) => string
  removeFile: (name: string) => string
}

export const MOTION_FORM_DEFAULT_LABELS: MotionFormLabels = {
  field: 'Field',
  showPassword: 'Show password',
  hidePassword: 'Hide password',
  capsLock: 'CapsLock is on',
  validate: 'Validate',
  validating: 'Validating…',
  verified: 'Verified',
  validationError: 'Validation failed',
  submit: 'Submit',
  submitting: 'Submitting…',
  submitted: 'Submitted',
  submitError: 'Submission failed',
  chooseFiles: 'Choose files',
  dropFiles: 'Drop files here',
  fileHint: 'or click to browse',
  searchOptions: 'Search options',
  noOptions: 'No options',
  otpDigit: index => `Digit ${index} of 4`,
  removeOption: label => `Remove ${label}`,
  removeFile: name => `Remove ${name}`,
}

export interface MotionFormProps {
  variant?: MotionFormVariant
  /** Value contract depends on variant; see the variant/model table in the docs. */
  modelValue?: MotionFormValue
  label?: string
  placeholder?: string
  description?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  disabled?: boolean
  /** Text fields only; other controls use disabled. */
  readonly?: boolean
  required?: boolean
  status?: MotionFormStatus
  error?: string
  /** Change this to replay an unchanged validation error. */
  validationKey?: string | number
  labels?: Partial<MotionFormLabels>
  options?: MotionFormOption[]
  inputType?: 'text' | 'email' | 'number' | 'date'
  autocomplete?: string
  passwordVisible?: boolean
  rows?: number
  maxRows?: number
  maxLength?: number
  accept?: string
  multiple?: boolean
  maxFiles?: number
  min?: number
  max?: number
  step?: number
  formatValue?: (value: number) => string
  nativeType?: 'button' | 'submit'
  motion?: boolean
}

export interface MotionFormEmits {
  'update:modelValue': [value: MotionFormValue]
  'update:passwordVisible': [visible: boolean]
  change: [value: MotionFormValue]
  focus: [event: FocusEvent]
  blur: [event: FocusEvent]
  search: [query: string]
  validate: [value: MotionFormValue]
  submit: [value: MotionFormValue | undefined, event: MouseEvent]
  otpComplete: [value: string]
  filesSelected: [files: FileUploaderFile[]]
  fileRemove: [payload: { id: string, value: FileUploaderFile[] }]
}

export interface MotionFormSlots {
  label?: () => VNodeChild
  prefix?: () => VNodeChild
  suffix?: () => VNodeChild
  option?: (scope: { option: MotionFormOption, selected: boolean }) => VNodeChild
  chip?: (scope: { option: MotionFormOption }) => VNodeChild
  file?: (scope: { file: FileUploaderFile, remove: () => void }) => VNodeChild
  submit?: (scope: { status: MotionFormStatus, label: string }) => VNodeChild
  status?: (scope: { status: MotionFormStatus, error: string, value: MotionFormValue | undefined }) => VNodeChild
}
