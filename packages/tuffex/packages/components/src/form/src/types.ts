export type FormLabelPosition = 'left' | 'right' | 'top'

export type FormSize = 'small' | 'medium' | 'large'

export interface FormRule {
  required?: boolean
  message?: string
  validator?: (value: any, rule: FormRule, model: Record<string, any>) => boolean | string | Promise<boolean | string>
}

export type FormRules = Record<string, FormRule | FormRule[]>

export interface FormProps {
  model?: Record<string, any>
  rules?: FormRules
  labelPosition?: FormLabelPosition
  labelWidth?: string | number
  size?: FormSize
  disabled?: boolean
}

export interface FormEmits {
  (e: 'validate', valid: boolean): void
}

export interface FormItemProps {
  label?: string
  prop?: string
  rules?: FormRule | FormRule[]
  required?: boolean
  showMessage?: boolean
  inline?: boolean
}

export interface FormItemEmits {
  (e: 'validate', valid: boolean): void
}
