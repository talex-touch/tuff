import type { ComputedRef, InjectionKey } from 'vue'
import type { FormLabelPosition, FormRules, FormSize } from './types'

export interface FormItemContext {
  prop?: string
  validate: () => Promise<boolean>
  reset: () => void
  clearValidate: () => void
}

export interface FormContext {
  model?: Record<string, any>
  rules?: FormRules
  labelPosition: ComputedRef<FormLabelPosition>
  labelWidth: ComputedRef<string | number | undefined>
  size: ComputedRef<FormSize>
  disabled: ComputedRef<boolean>
  registerItem: (item: FormItemContext) => void
  unregisterItem: (item: FormItemContext) => void
}

export const TX_FORM_CONTEXT_KEY: InjectionKey<FormContext> = Symbol('TxFormContext')
