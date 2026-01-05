import { computed } from 'vue'
import { dismissToast, toast, toastStore } from '@talex-touch/tuffex/utils'

export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
}

const toasts = computed<Toast[]>(() =>
  toastStore.items.map(item => ({
    id: item.id,
    type: item.variant === 'success'
      ? 'success'
      : item.variant === 'warning'
        ? 'warning'
        : item.variant === 'danger'
          ? 'error'
          : 'info',
    title: item.title ?? '',
    message: item.description,
    duration: item.duration,
  })),
)

export function useToast() {
  function show(options: Omit<Toast, 'id'>) {
    const variant = options.type === 'success'
      ? 'success'
      : options.type === 'warning'
        ? 'warning'
        : options.type === 'error'
          ? 'danger'
          : 'default'

    return toast({
      title: options.title,
      description: options.message,
      duration: options.duration,
      variant,
    })
  }

  function remove(id: string) {
    dismissToast(id)
  }

  function success(title: string, message?: string) {
    return show({ type: 'success', title, message })
  }

  function error(title: string, message?: string) {
    return show({ type: 'error', title, message, duration: 8000 })
  }

  function warning(title: string, message?: string) {
    return show({ type: 'warning', title, message })
  }

  function info(title: string, message?: string) {
    return show({ type: 'info', title, message })
  }

  return {
    toasts,
    show,
    remove,
    success,
    error,
    warning,
    info,
  }
}
