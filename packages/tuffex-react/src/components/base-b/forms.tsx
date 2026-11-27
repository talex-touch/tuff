import type {
  CSSProperties,
  FormEvent,
  FormHTMLAttributes,
  HTMLAttributes,
  ReactElement,
  ReactNode,
} from 'react'
import type { TxDialogProps } from '../TxDialog'
import type { TxDrawerProps } from '../TxDrawer'
import {
  Children,
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useControllableState } from '../../hooks/useControllableState'
import { cn, toCssUnit } from '../../utils/cn'
import { TxButton } from '../TxButton'
import { TxDialog } from '../TxDialog'
import { TxDrawer } from '../TxDrawer'

// ============================================================================
// 17. TxForm + TxFormItem + TxFormRow + TxFormErrorSummary (form)
// ============================================================================

export type TxFormValues = Record<string, any>
export type TxFormLayout = 'stacked' | 'side' | 'auto' | 'inline'
export type TxFormLabelPosition = 'left' | 'right' | 'top'
export type TxFormLabelAlign = 'start' | 'end'
export type TxFormSize = 'small' | 'medium' | 'large'
export type TxFormValidateOn = 'blur' | 'submit'
export type TxFormRequiredMark = 'asterisk' | 'optional' | 'none'
export type TxFormItemWidth = 'xs' | 'sm' | 'md' | 'lg' | 'full'
export type TxFormRuleLevel = 'error' | 'warning'
export type TxFormRuleType = 'email' | 'url' | 'number' | 'integer'

export interface TxFormValidatorContext {
  signal: AbortSignal
  path: string
}

export interface TxFormRule {
  required?: boolean
  type?: TxFormRuleType
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  pattern?: RegExp
  message?: string
  level?: TxFormRuleLevel
  deps?: string[]
  validator?: (
    value: unknown,
    rule: TxFormRule,
    model: TxFormValues,
    context: TxFormValidatorContext,
  ) => boolean | string | Promise<boolean | string>
}

export type TxFormRules = Record<string, TxFormRule | TxFormRule[]>

export interface TxFormStandardSchemaIssue {
  readonly message: string
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined
}

export type TxFormStandardSchemaResult
  = | { readonly value: unknown, readonly issues?: undefined }
    | { readonly issues: ReadonlyArray<TxFormStandardSchemaIssue> }

export interface TxFormStandardSchema {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) => TxFormStandardSchemaResult | Promise<TxFormStandardSchemaResult>
  }
}

export interface TxFormFieldMessage {
  level: TxFormRuleLevel
  message: string
}

export interface TxFormFieldRegistration {
  prop: string
  label?: string
  rules: TxFormRule[]
  required?: boolean
  fieldId: string
}

export interface TxFormContextValue {
  formId: string
  values: TxFormValues
  layout: TxFormLayout
  labelAlign: TxFormLabelAlign
  labelWidth?: string | number
  requiredMark: TxFormRequiredMark
  validateOn: TxFormValidateOn
  size: TxFormSize
  disabled: boolean
  readOnly: boolean
  errors: Record<string, TxFormFieldMessage>
  rootError: string | null
  submitting: boolean
  getFieldValue: (prop: string) => unknown
  setFieldValue: (prop: string, value: unknown) => void
  registerField: (field: TxFormFieldRegistration) => () => void
  validateField: (prop: string) => Promise<boolean>
  clearValidate: (props?: string[]) => void
  getFieldId: (prop: string) => string
  getFieldLabel: (prop: string) => string
}

const FormContext = createContext<TxFormContextValue | null>(null)

export function useTxForm(): TxFormContextValue | null {
  return useContext(FormContext)
}

export interface TxFormItemContextValue {
  prop?: string
  fieldId: string
  invalid: boolean
  error?: string
  warning?: string
  disabled: boolean
  readOnly: boolean
  onBlur: () => void
}

const FormItemContext = createContext<TxFormItemContextValue | null>(null)

export function useTxFormItem(): TxFormItemContextValue | null {
  return useContext(FormItemContext)
}

function parsePathSegments(path: string): string[] {
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
}

function getByPath(obj: TxFormValues, path: string): unknown {
  const segments = parsePathSegments(path)
  let current: unknown = obj
  for (const seg of segments) {
    if (current === null || current === undefined || typeof current !== 'object')
      return undefined
    current = (current as Record<string, unknown>)[seg]
  }
  return current
}

function setByPath(obj: TxFormValues, path: string, value: unknown): TxFormValues {
  const segments = parsePathSegments(path)
  if (segments.length === 0)
    return obj
  const clone: TxFormValues = Array.isArray(obj) ? [...obj] as unknown as TxFormValues : { ...obj }
  let cursor: Record<string, unknown> = clone
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i]!
    const nextSeg = segments[i + 1]!
    const existing = cursor[seg]
    const nextObj = existing && typeof existing === 'object'
      ? (Array.isArray(existing) ? [...existing] : { ...existing })
      : (/^\d+$/.test(nextSeg) ? [] : {})
    cursor[seg] = nextObj
    cursor = nextObj as Record<string, unknown>
  }
  cursor[segments[segments.length - 1]!] = value
  return clone
}

function isValueEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === '' || value === false)
    return true
  if (Array.isArray(value))
    return value.length === 0
  return false
}

const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@.]+(?:\.[^\s@.]+)*$/
const URL_RE = /^https?:\/\/\S+$/i

async function evaluateRule(
  rule: TxFormRule,
  value: unknown,
  label: string,
  values: TxFormValues,
  prop: string,
  signal: AbortSignal,
): Promise<TxFormFieldMessage | null> {
  const level: TxFormRuleLevel = rule.level ?? 'error'

  if (rule.required && isValueEmpty(value))
    return { level, message: rule.message ?? `${label} is required` }

  if (!isValueEmpty(value)) {
    if (rule.type === 'email' && (typeof value !== 'string' || !EMAIL_RE.test(value)))
      return { level, message: rule.message ?? `${label} must be an email address` }
    if (rule.type === 'url' && (typeof value !== 'string' || !URL_RE.test(value)))
      return { level, message: rule.message ?? `${label} must be a web address` }
    if (rule.type === 'number' && !Number.isFinite(Number(value)))
      return { level, message: rule.message ?? `${label} must be a number` }
    if (rule.type === 'integer' && !Number.isInteger(Number(value)))
      return { level, message: rule.message ?? `${label} must be a whole number` }
    if (rule.min !== undefined && Number(value) < rule.min)
      return { level, message: rule.message ?? `${label} must be at least ${rule.min}` }
    if (rule.max !== undefined && Number(value) > rule.max)
      return { level, message: rule.message ?? `${label} must be at most ${rule.max}` }
    if (rule.minLength !== undefined && (typeof value === 'string' || Array.isArray(value)) && value.length < rule.minLength)
      return { level, message: rule.message ?? `${label} needs at least ${rule.minLength} items` }
    if (rule.maxLength !== undefined && (typeof value === 'string' || Array.isArray(value)) && value.length > rule.maxLength)
      return { level, message: rule.message ?? `${label} allows at most ${rule.maxLength} items` }
    if (rule.pattern && (typeof value !== 'string' || !rule.pattern.test(value)))
      return { level, message: rule.message ?? `${label} is not in the expected format` }
  }

  if (rule.validator) {
    const res = await rule.validator(value, rule, values, { signal, path: prop })
    if (res === false)
      return { level, message: rule.message ?? `${label} is invalid` }
    if (typeof res === 'string' && res.trim().length > 0)
      return { level, message: res }
  }

  return null
}

function normalizeRules(input?: TxFormRule | TxFormRule[]): TxFormRule[] {
  if (!input)
    return []
  return Array.isArray(input) ? input : [input]
}

export interface TxFormHandle {
  validate: (props?: string[]) => Promise<boolean>
  validateField: (prop: string) => Promise<boolean>
  resetFields: (nextValues?: TxFormValues) => void
  clearValidate: (props?: string[]) => void
  setErrors: (errors: Record<string, string>) => void
  setRootError: (message: string | null) => void
  getValues: () => TxFormValues
  setFieldValue: (prop: string, value: unknown) => void
}

export interface TxFormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> {
  id?: string
  model?: TxFormValues
  values?: TxFormValues
  defaultValues?: TxFormValues
  rules?: TxFormRules
  schema?: TxFormStandardSchema
  layout?: TxFormLayout
  labelPosition?: TxFormLabelPosition
  labelAlign?: TxFormLabelAlign
  labelWidth?: string | number
  requiredMark?: TxFormRequiredMark
  validateOn?: TxFormValidateOn
  size?: TxFormSize
  disabled?: boolean
  readOnly?: boolean
  onValuesChange?: (values: TxFormValues) => void
  onValidate?: (valid: boolean) => void
  onSubmit?: (values: TxFormValues, event?: FormEvent<HTMLFormElement>) => unknown
  onSubmitSuccess?: (values: TxFormValues) => void
}

export const TxForm = forwardRef<TxFormHandle, TxFormProps>((
  {
    id,
    model,
    values,
    defaultValues,
    rules,
    schema,
    layout,
    labelPosition,
    labelAlign,
    labelWidth,
    requiredMark = 'asterisk',
    validateOn = 'blur',
    size = 'medium',
    disabled = false,
    readOnly = false,
    onValuesChange,
    onValidate,
    onSubmit,
    onSubmitSuccess,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
  const autoId = useId()
  const formId = id ?? `tx-form-${autoId.replace(/:/g, '')}`
  const controlledValues = values ?? model
  const [currentValues, setCurrentValues] = useControllableState<TxFormValues>({
    value: controlledValues,
    defaultValue: defaultValues ?? {},
    onChange: onValuesChange,
  })
  const initialValuesRef = useRef<TxFormValues>(controlledValues ?? defaultValues ?? {})
  const [errors, setErrorsState] = useState<Record<string, TxFormFieldMessage>>({})
  const [rootError, setRootError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fieldsRef = useRef<Map<string, TxFormFieldRegistration>>(new Map())

  const resolvedLayout: TxFormLayout = layout ?? (
    labelPosition === 'top'
      ? 'stacked'
      : labelPosition === 'left' || labelPosition === 'right'
        ? 'side'
        : 'auto'
  )
  const resolvedLabelAlign: TxFormLabelAlign = labelAlign ?? (labelPosition === 'left' ? 'start' : 'end')

  const registerField = useCallback((field: TxFormFieldRegistration) => {
    fieldsRef.current.set(field.prop, field)
    return () => {
      fieldsRef.current.delete(field.prop)
    }
  }, [])

  const getFieldId = useCallback((prop: string) => {
    return fieldsRef.current.get(prop)?.fieldId ?? `${formId}-${prop}`
  }, [formId])

  const getFieldLabel = useCallback((prop: string) => {
    return fieldsRef.current.get(prop)?.label ?? prop
  }, [])

  const getFieldValue = useCallback((prop: string) => getByPath(currentValues, prop), [currentValues])

  const setFieldValue = useCallback((prop: string, nextVal: unknown) => {
    const next = setByPath(currentValues, prop, nextVal)
    setCurrentValues(next)
    setErrorsState((prev) => {
      if (!(prop in prev))
        return prev
      const copy = { ...prev }
      delete copy[prop]
      return copy
    })
  }, [currentValues, setCurrentValues])

  const clearValidate = useCallback((props?: string[]) => {
    if (!props || props.length === 0) {
      setErrorsState({})
      setRootError(null)
      return
    }
    setErrorsState((prev) => {
      const copy = { ...prev }
      for (const p of props)
        delete copy[p]
      return copy
    })
  }, [])

  const collectRulesForProp = useCallback((prop: string): TxFormRule[] => {
    const fieldReg = fieldsRef.current.get(prop)
    const formRules = normalizeRules(rules?.[prop])
    const itemRules = fieldReg ? [...fieldReg.rules] : []
    const combined = [...formRules, ...itemRules]
    if (fieldReg?.required && !combined.some(r => r.required))
      combined.unshift({ required: true })
    return combined
  }, [rules])

  const validateField = useCallback(async (prop: string): Promise<boolean> => {
    const fieldRules = collectRulesForProp(prop)
    const label = getFieldLabel(prop)
    const val = getByPath(currentValues, prop)
    const controller = new AbortController()
    let message: TxFormFieldMessage | null = null
    for (const rule of fieldRules) {
      message = await evaluateRule(rule, val, label, currentValues, prop, controller.signal)
      if (message)
        break
    }
    setErrorsState((prev) => {
      const copy = { ...prev }
      if (message)
        copy[prop] = message
      else
        delete copy[prop]
      return copy
    })
    return !message || message.level === 'warning'
  }, [collectRulesForProp, currentValues, getFieldLabel])

  const validate = useCallback(async (targetProps?: string[]): Promise<boolean> => {
    const propSet = new Set<string>(targetProps ?? [
      ...fieldsRef.current.keys(),
      ...Object.keys(rules ?? {}),
    ])
    const nextErrors: Record<string, TxFormFieldMessage> = {}
    const controller = new AbortController()

    for (const prop of propSet) {
      const fieldRules = collectRulesForProp(prop)
      const label = getFieldLabel(prop)
      const val = getByPath(currentValues, prop)
      for (const rule of fieldRules) {
        const res = await evaluateRule(rule, val, label, currentValues, prop, controller.signal)
        if (res) {
          nextErrors[prop] = res
          break
        }
      }
    }

    if (schema && !targetProps) {
      const schemaRes = await schema['~standard'].validate(currentValues)
      if (schemaRes.issues && schemaRes.issues.length > 0) {
        for (const issue of schemaRes.issues) {
          const path = (issue.path ?? [])
            .map(seg => typeof seg === 'object' && seg !== null && 'key' in seg ? String(seg.key) : String(seg))
            .join('.')
          if (path) {
            if (!nextErrors[path])
              nextErrors[path] = { level: 'error', message: issue.message }
          }
          else {
            setRootError(issue.message)
          }
        }
      }
    }

    if (targetProps) {
      setErrorsState((prev) => {
        const copy = { ...prev }
        for (const p of propSet) {
          if (nextErrors[p])
            copy[p] = nextErrors[p]!
          else
            delete copy[p]
        }
        return copy
      })
    }
    else {
      setErrorsState(nextErrors)
    }

    const valid = Object.values(nextErrors).every(entry => entry.level !== 'error')
    onValidate?.(valid)
    return valid
  }, [collectRulesForProp, currentValues, getFieldLabel, onValidate, rules, schema])

  const resetFields = useCallback((nextValues?: TxFormValues) => {
    setCurrentValues(nextValues ? { ...nextValues } : { ...initialValuesRef.current })
    setErrorsState({})
    setRootError(null)
  }, [setCurrentValues])

  const setErrors = useCallback((map: Record<string, string>) => {
    setErrorsState((prev) => {
      const copy = { ...prev }
      for (const [k, msg] of Object.entries(map))
        copy[k] = { level: 'error', message: msg }
      return copy
    })
  }, [])

  useImperativeHandle(ref, () => ({
    validate,
    validateField,
    resetFields,
    clearValidate,
    setErrors,
    setRootError,
    getValues: () => ({ ...currentValues }),
    setFieldValue,
  }), [clearValidate, currentValues, resetFields, setErrors, setFieldValue, validate, validateField])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (disabled || submitting)
      return
    setRootError(null)
    const valid = await validate()
    if (!valid)
      return
    setSubmitting(true)
    try {
      const snapshot = { ...currentValues }
      const result = await onSubmit?.(snapshot, event)
      if (result !== false)
        onSubmitSuccess?.(snapshot)
    }
    catch (err) {
      setRootError(err instanceof Error ? err.message : 'Submission failed')
    }
    finally {
      setSubmitting(false)
    }
  }

  const ctx = useMemo<TxFormContextValue>(() => ({
    formId,
    values: currentValues,
    layout: resolvedLayout,
    labelAlign: resolvedLabelAlign,
    labelWidth,
    requiredMark,
    validateOn,
    size,
    disabled,
    readOnly,
    errors,
    rootError,
    submitting,
    getFieldValue,
    setFieldValue,
    registerField,
    validateField,
    clearValidate,
    getFieldId,
    getFieldLabel,
  }), [
    clearValidate,
    currentValues,
    disabled,
    errors,
    formId,
    getFieldId,
    getFieldLabel,
    getFieldValue,
    labelWidth,
    readOnly,
    registerField,
    requiredMark,
    resolvedLabelAlign,
    resolvedLayout,
    rootError,
    setFieldValue,
    size,
    submitting,
    validateField,
    validateOn,
  ])

  return (
    <FormContext.Provider value={ctx}>
      <form
        id={formId}
        noValidate
        className={cn(
          'tx-form',
          `tx-form--${resolvedLayout}`,
          `tx-form--label-${resolvedLabelAlign}`,
          `tx-form--${size}`,
          { 'is-disabled': disabled, 'is-readonly': readOnly },
          className,
        )}
        style={{
          ...(labelWidth ? { '--tx-form-label-max': toCssUnit(labelWidth) } : {}),
          ...style,
        } as CSSProperties}
        onSubmit={handleSubmit}
        {...rest}
      >
        {rootError && (
          <div className="tx-form__root-error" role="alert">
            {rootError}
          </div>
        )}
        <div className="tx-form__body">{children}</div>
      </form>
    </FormContext.Provider>
  )
})
TxForm.displayName = 'TxForm'

export interface TxFormItemProps extends HTMLAttributes<HTMLDivElement> {
  label?: ReactNode
  prop?: string
  name?: string
  rules?: TxFormRule | TxFormRule[]
  required?: boolean
  help?: ReactNode
  hint?: string
  width?: TxFormItemWidth
  showMessage?: boolean
  inline?: boolean
}

export const TxFormItem = forwardRef<HTMLDivElement, TxFormItemProps>((
  {
    label,
    prop,
    name,
    rules,
    required,
    help,
    hint,
    width,
    showMessage = true,
    inline = false,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
  const form = useTxForm()
  const fieldProp = prop ?? name
  const autoFieldId = useId()
  const fieldId = fieldProp && form ? `${form.formId}-${fieldProp}` : autoFieldId
  const normalizedRules = useMemo(() => normalizeRules(rules), [rules])
  const labelText = typeof label === 'string' ? label : fieldProp

  useEffect(() => {
    if (!form || !fieldProp)
      return
    return form.registerField({
      prop: fieldProp,
      label: labelText,
      rules: normalizedRules,
      required,
      fieldId,
    })
  }, [fieldId, fieldProp, form, labelText, normalizedRules, required])

  const fieldMsg = fieldProp && form ? form.errors[fieldProp] : undefined
  const isError = fieldMsg?.level === 'error'
  const isWarning = fieldMsg?.level === 'warning'
  const isRequired = Boolean(required || normalizedRules.some(r => r.required)) && !form?.readOnly

  const handleFieldBlur = useCallback(() => {
    if (form && fieldProp && form.validateOn === 'blur')
      void form.validateField(fieldProp)
  }, [fieldProp, form])

  const itemCtx = useMemo<TxFormItemContextValue>(() => ({
    prop: fieldProp,
    fieldId,
    invalid: isError,
    error: isError ? fieldMsg?.message : undefined,
    warning: isWarning ? fieldMsg?.message : undefined,
    disabled: Boolean(form?.disabled),
    readOnly: Boolean(form?.readOnly),
    onBlur: handleFieldBlur,
  }), [fieldId, fieldMsg?.message, fieldProp, form?.disabled, form?.readOnly, handleFieldBlur, isError, isWarning])

  return (
    <FormItemContext.Provider value={itemCtx}>
      <div
        ref={ref}
        className={cn(
          'tx-form-item',
          width ? `tx-form-item--w-${width}` : undefined,
          {
            'is-error': isError,
            'is-warning': isWarning,
            'is-required': isRequired,
            'is-inline': inline,
          },
          className,
        )}
        style={style}
        onBlur={handleFieldBlur}
        {...rest}
      >
        {label !== undefined && label !== null && (
          <div className="tx-form-item__label-wrap">
            <label htmlFor={fieldId} className="tx-form-item__label">
              <span>{label}</span>
              {isRequired && form?.requiredMark !== 'none' && form?.requiredMark !== 'optional' && (
                <span className="tx-form-item__required" aria-hidden="true">*</span>
              )}
              {!isRequired && form?.requiredMark === 'optional' && (
                <span className="tx-form-item__optional">(optional)</span>
              )}
            </label>
            {hint && (
              <span className="tx-form-item__hint" title={hint} aria-label={hint} tabIndex={0}>
                ?
              </span>
            )}
          </div>
        )}

        <div className="tx-form-item__control">
          {children}
          {showMessage && fieldMsg
            ? (
                <div
                  className={cn('tx-form-item__message', isError ? 'is-error' : 'is-warning')}
                  role={isError ? 'alert' : 'status'}
                >
                  {fieldMsg.message}
                </div>
              )
            : help
              ? <div className="tx-form-item__help">{help}</div>
              : null}
        </div>
      </div>
    </FormItemContext.Provider>
  )
})
TxFormItem.displayName = 'TxFormItem'

export interface TxFormRowProps extends HTMLAttributes<HTMLDivElement> {
  label?: ReactNode
  condensed?: boolean
}

export const TxFormRow = forwardRef<HTMLDivElement, TxFormRowProps>((
  { label, condensed = false, className, style, children, ...rest },
  ref,
) => (
  <div
    ref={ref}
    className={cn('tx-form-row', { 'is-condensed': condensed }, className)}
    style={style}
    {...rest}
  >
    {label && <div className="tx-form-row__label">{label}</div>}
    <div className="tx-form-row__items">{children}</div>
  </div>
))
TxFormRow.displayName = 'TxFormRow'

export interface TxFormErrorSummaryProps extends HTMLAttributes<HTMLDivElement> {
  title?: string
  errors?: Record<string, string>
  rootError?: string | null
}

export const TxFormErrorSummary = forwardRef<HTMLDivElement, TxFormErrorSummaryProps>((
  { title = 'There is a problem', errors: propErrors, rootError: propRootError, className, style, ...rest },
  ref,
) => {
  const form = useTxForm()
  const entries = useMemo(() => {
    if (propErrors)
      return Object.entries(propErrors).map(([prop, message]) => ({ prop, message }))
    if (!form)
      return []
    return Object.entries(form.errors)
      .filter(([, entry]) => entry.level === 'error')
      .map(([prop, entry]) => ({ prop, message: entry.message }))
  }, [form, propErrors])

  const resolvedRootError = propRootError !== undefined ? propRootError : (form?.rootError ?? null)
  if (entries.length === 0 && !resolvedRootError)
    return null

  return (
    <div
      ref={ref}
      role="alert"
      className={cn('tx-form-error-summary', className)}
      style={style}
      {...rest}
    >
      <div className="tx-form-error-summary__title">{title}</div>
      {resolvedRootError && <p className="tx-form-error-summary__root">{resolvedRootError}</p>}
      {entries.length > 0 && (
        <ul className="tx-form-error-summary__list">
          {entries.map(({ prop, message }) => (
            <li key={prop}>
              <a
                href={`#${form?.getFieldId(prop) ?? prop}`}
                onClick={(e) => {
                  const id = form?.getFieldId(prop) ?? prop
                  const el = document.getElementById(id)
                  if (el) {
                    e.preventDefault()
                    el.focus()
                  }
                }}
              >
                {message}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})
TxFormErrorSummary.displayName = 'TxFormErrorSummary'

// ============================================================================
// 18. TxModalForm (modal-form)
// ============================================================================

export interface TxModalFormRenderContext {
  values: TxFormValues
  setFieldValue: (prop: string, value: unknown) => void
}

export interface TxModalFormProps extends Omit<TxFormProps, 'model' | 'values' | 'defaultValues' | 'children' | 'title'> {
  open?: boolean
  visible?: boolean
  defaultOpen?: boolean
  title?: ReactNode
  width?: string
  initialValues?: TxFormValues
  submitText?: string
  cancelText?: string
  modalProps?: Partial<TxDialogProps>
  onOpenChange?: (open: boolean) => void
  children?: ReactNode | ((ctx: TxModalFormRenderContext) => ReactNode)
}

export const TxModalForm = forwardRef<TxFormHandle, TxModalFormProps>((
  {
    open,
    visible,
    defaultOpen = false,
    title = 'Edit',
    width = '480px',
    initialValues,
    submitText = 'Save',
    cancelText = 'Cancel',
    modalProps,
    onOpenChange,
    onSubmit,
    onSubmitSuccess,
    onValidate,
    children,
    ...formRest
  },
  ref,
) => {
  const [isOpen, setIsOpen] = useControllableState({
    value: open ?? visible,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  })
  const [mounted, setMounted] = useState(false)
  const [draft, setDraft] = useState<TxFormValues>(() => ({ ...(initialValues ?? {}) }))
  const formRef = useRef<TxFormHandle | null>(null)
  const formId = useId()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen)
      setDraft({ ...(initialValues ?? {}) })
  }, [initialValues, isOpen])

  useImperativeHandle(ref, () => ({
    validate: props => formRef.current?.validate(props) ?? Promise.resolve(true),
    validateField: prop => formRef.current?.validateField(prop) ?? Promise.resolve(true),
    resetFields: next => formRef.current?.resetFields(next),
    clearValidate: props => formRef.current?.clearValidate(props),
    setErrors: errs => formRef.current?.setErrors(errs),
    setRootError: msg => formRef.current?.setRootError(msg),
    getValues: () => formRef.current?.getValues() ?? { ...draft },
    setFieldValue: (prop, val) => setDraft(prev => setByPath(prev, prop, val)),
  }), [draft])

  const setFieldValue = useCallback((prop: string, val: unknown) => {
    setDraft(prev => setByPath(prev, prop, val))
  }, [])

  if (!mounted)
    return null

  return (
    <TxDialog
      {...modalProps}
      open={isOpen}
      onOpenChange={setIsOpen}
      title={title}
      width={width}
      footer={(
        <div className="tx-modal-form__actions">
          <TxButton variant="secondary" onClick={() => setIsOpen(false)}>{cancelText}</TxButton>
          <TxButton variant="primary" nativeType="submit" form={formId}>{submitText}</TxButton>
        </div>
      )}
    >
      <TxForm
        ref={formRef}
        id={formId}
        values={draft}
        onValuesChange={setDraft}
        onValidate={onValidate}
        onSubmit={onSubmit}
        onSubmitSuccess={(vals) => {
          onSubmitSuccess?.(vals)
          setIsOpen(false)
        }}
        {...formRest}
      >
        {typeof children === 'function' ? children({ values: draft, setFieldValue }) : children}
      </TxForm>
    </TxDialog>
  )
})
TxModalForm.displayName = 'TxModalForm'

// ============================================================================
// 19. TxDrawerForm (drawer-form)
// ============================================================================

export interface TxDrawerFormProps extends Omit<TxFormProps, 'model' | 'values' | 'defaultValues' | 'children' | 'title'> {
  open?: boolean
  visible?: boolean
  defaultOpen?: boolean
  title?: ReactNode
  initialValues?: TxFormValues
  submitText?: string
  cancelText?: string
  drawerProps?: Partial<TxDrawerProps>
  onOpenChange?: (open: boolean) => void
  children?: ReactNode | ((ctx: TxModalFormRenderContext) => ReactNode)
}

export const TxDrawerForm = forwardRef<TxFormHandle, TxDrawerFormProps>((
  {
    open,
    visible,
    defaultOpen = false,
    title = 'Edit',
    initialValues,
    submitText = 'Save',
    cancelText = 'Cancel',
    drawerProps,
    onOpenChange,
    onSubmit,
    onSubmitSuccess,
    onValidate,
    children,
    ...formRest
  },
  ref,
) => {
  const [isOpen, setIsOpen] = useControllableState({
    value: open ?? visible,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  })
  const [mounted, setMounted] = useState(false)
  const [draft, setDraft] = useState<TxFormValues>(() => ({ ...(initialValues ?? {}) }))
  const formRef = useRef<TxFormHandle | null>(null)
  const formId = useId()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen)
      setDraft({ ...(initialValues ?? {}) })
  }, [initialValues, isOpen])

  useImperativeHandle(ref, () => ({
    validate: props => formRef.current?.validate(props) ?? Promise.resolve(true),
    validateField: prop => formRef.current?.validateField(prop) ?? Promise.resolve(true),
    resetFields: next => formRef.current?.resetFields(next),
    clearValidate: props => formRef.current?.clearValidate(props),
    setErrors: errs => formRef.current?.setErrors(errs),
    setRootError: msg => formRef.current?.setRootError(msg),
    getValues: () => formRef.current?.getValues() ?? { ...draft },
    setFieldValue: (prop, val) => setDraft(prev => setByPath(prev, prop, val)),
  }), [draft])

  const setFieldValue = useCallback((prop: string, val: unknown) => {
    setDraft(prev => setByPath(prev, prop, val))
  }, [])

  if (!mounted)
    return null

  return (
    <TxDrawer
      {...drawerProps}
      open={isOpen}
      onOpenChange={setIsOpen}
      title={title}
      footer={(
        <div className="tx-drawer-form__actions">
          <TxButton variant="secondary" onClick={() => setIsOpen(false)}>{cancelText}</TxButton>
          <TxButton variant="primary" nativeType="submit" form={formId}>{submitText}</TxButton>
        </div>
      )}
    >
      <TxForm
        ref={formRef}
        id={formId}
        values={draft}
        onValuesChange={setDraft}
        onValidate={onValidate}
        onSubmit={onSubmit}
        onSubmitSuccess={(vals) => {
          onSubmitSuccess?.(vals)
          setIsOpen(false)
        }}
        {...formRest}
      >
        {typeof children === 'function' ? children({ values: draft, setFieldValue }) : children}
      </TxForm>
    </TxDrawer>
  )
})
TxDrawerForm.displayName = 'TxDrawerForm'

// ============================================================================
// 20. TxStepsForm + TxFormStep (steps-form)
// ============================================================================

export interface TxFormStepProps extends HTMLAttributes<HTMLDivElement> {
  title: string
  description?: string
  fields?: string[]
}

export const TxFormStep = forwardRef<HTMLDivElement, TxFormStepProps>((
  { title, description, className, children, ...rest },
  ref,
) => (
  <div ref={ref} className={cn('tx-form-step', className)} data-step-title={title} {...rest}>
    {description && <p className="tx-form-step__description">{description}</p>}
    {children}
  </div>
))
TxFormStep.displayName = 'TxFormStep'

export interface TxStepsFormStepConfig {
  key?: string
  title: string
  description?: string
  fields?: string[]
  content: ReactNode
}

export interface TxStepsFormProps extends Omit<TxFormProps, 'children'> {
  active?: number
  defaultActive?: number
  steps?: TxStepsFormStepConfig[]
  prevText?: string
  nextText?: string
  submitText?: string
  onActiveChange?: (step: number) => void
  children?: ReactNode
}

export const TxStepsForm = forwardRef<TxFormHandle, TxStepsFormProps>((
  {
    active,
    defaultActive = 0,
    steps,
    prevText = 'Back',
    nextText = 'Next',
    submitText = 'Submit',
    onActiveChange,
    onSubmit,
    onSubmitSuccess,
    onValidate,
    className,
    children,
    ...formRest
  },
  ref,
) => {
  const [activeStep, setActiveStep] = useControllableState<number>({
    value: active,
    defaultValue: defaultActive,
    onChange: onActiveChange,
  })
  const formRef = useRef<TxFormHandle | null>(null)

  const resolvedSteps = useMemo<TxStepsFormStepConfig[]>(() => {
    if (steps && steps.length > 0)
      return steps
    const list: TxStepsFormStepConfig[] = []
    Children.forEach(children, (child, idx) => {
      if (isValidElement<TxFormStepProps>(child)) {
        list.push({
          key: child.key ? String(child.key) : String(idx),
          title: child.props.title ?? `Step ${idx + 1}`,
          description: child.props.description,
          fields: child.props.fields,
          content: child as ReactElement,
        })
      }
    })
    return list
  }, [children, steps])

  const clampedStep = Math.min(Math.max(0, activeStep), Math.max(0, resolvedSteps.length - 1))
  const currentStep = resolvedSteps[clampedStep]
  const isFirst = clampedStep === 0
  const isLast = clampedStep >= resolvedSteps.length - 1

  useImperativeHandle(ref, () => ({
    validate: props => formRef.current?.validate(props) ?? Promise.resolve(true),
    validateField: prop => formRef.current?.validateField(prop) ?? Promise.resolve(true),
    resetFields: next => formRef.current?.resetFields(next),
    clearValidate: props => formRef.current?.clearValidate(props),
    setErrors: errs => formRef.current?.setErrors(errs),
    setRootError: msg => formRef.current?.setRootError(msg),
    getValues: () => formRef.current?.getValues() ?? {},
    setFieldValue: (prop, val) => formRef.current?.setFieldValue(prop, val),
  }), [])

  const handleNext = async () => {
    const stepFields = currentStep?.fields
    const valid = stepFields && stepFields.length > 0
      ? await (formRef.current?.validate(stepFields) ?? Promise.resolve(true))
      : await (formRef.current?.validate() ?? Promise.resolve(true))
    if (valid && !isLast)
      setActiveStep(clampedStep + 1)
  }

  return (
    <TxForm
      ref={formRef}
      className={cn('tx-steps-form', className)}
      onSubmit={onSubmit}
      onSubmitSuccess={onSubmitSuccess}
      onValidate={onValidate}
      {...formRest}
    >
      <ol className="tx-steps-form__header" aria-label="Form steps">
        {resolvedSteps.map((step, idx) => {
          const isCurrent = idx === clampedStep
          const isDone = idx < clampedStep
          return (
            <li
              key={step.key ?? idx}
              aria-current={isCurrent ? 'step' : undefined}
              className={cn('tx-steps-form__step', {
                'is-active': isCurrent,
                'is-done': isDone,
              })}
            >
              <span className="tx-steps-form__index">{isDone ? '✓' : idx + 1}</span>
              <span className="tx-steps-form__meta">
                <span className="tx-steps-form__title">{step.title}</span>
                {step.description && <span className="tx-steps-form__desc">{step.description}</span>}
              </span>
            </li>
          )
        })}
      </ol>

      <div className="tx-steps-form__content">
        {currentStep?.content}
      </div>

      <div className="tx-steps-form__actions">
        {!isFirst && (
          <TxButton variant="secondary" onClick={() => setActiveStep(clampedStep - 1)}>
            {prevText}
          </TxButton>
        )}
        {!isLast
          ? (
              <TxButton variant="primary" onClick={() => void handleNext()}>
                {nextText}
              </TxButton>
            )
          : (
              <TxButton variant="primary" nativeType="submit">
                {submitText}
              </TxButton>
            )}
      </div>
    </TxForm>
  )
})
TxStepsForm.displayName = 'TxStepsForm'
