import { markRaw } from 'vue'
import { toast } from 'vue-sonner'
import SonnerDialogToast, {
  type SonnerDialogAction
} from '~/components/base/sonner/SonnerDialogToast.vue'
import SonnerPromptToast from '~/components/base/sonner/SonnerPromptToast.vue'

export interface SonnerDialogOptions<T = string> {
  title?: string
  message?: string
  description?: string
  actions: Array<SonnerDialogAction & { value: T }>
  duration?: number
  onDismiss?: () => T
}

export interface SonnerPromptOptions {
  title?: string
  message?: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
  defaultValue?: string
  validator?: (value: string) => true | string
}

export function showSonnerDialog<T = string>(options: SonnerDialogOptions<T>) {
  let resolved = false
  let toastId: number | string
  let resolveResult: (value: T) => void

  const result = new Promise<T>((resolve) => {
    resolveResult = resolve
  })

  const finish = (value: T) => {
    if (resolved) return
    resolved = true
    toast.dismiss(toastId)
    resolveResult(value)
  }

  toastId = toast.custom(markRaw(SonnerDialogToast), {
    duration: options.duration ?? Infinity,
    dismissible: false,
    closeButton: false,
    componentProps: {
      title: options.title,
      message: options.message,
      description: options.description,
      actions: options.actions.map((action) => ({
        ...action,
        onSelect: () => finish(action.value)
      }))
    },
    onDismiss: () => {
      if (options.onDismiss) finish(options.onDismiss())
    }
  })

  return { id: toastId, result }
}

export function showSonnerPrompt(options: SonnerPromptOptions) {
  let resolved = false
  let toastId: number | string
  let resolveResult: (value: string | null) => void

  const result = new Promise<string | null>((resolve) => {
    resolveResult = resolve
  })

  const finish = (value: string | null) => {
    if (resolved) return
    resolved = true
    toast.dismiss(toastId)
    resolveResult(value)
  }

  toastId = toast.custom(markRaw(SonnerPromptToast), {
    duration: Infinity,
    dismissible: false,
    closeButton: false,
    componentProps: {
      title: options.title,
      message: options.message,
      placeholder: options.placeholder,
      confirmText: options.confirmText,
      cancelText: options.cancelText,
      defaultValue: options.defaultValue,
      validator: options.validator,
      onConfirm: (value: string) => finish(value),
      onCancel: () => finish(null)
    },
    onDismiss: () => finish(null)
  })

  return { id: toastId, result }
}
