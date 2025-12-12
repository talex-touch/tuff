export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
}

const toasts = ref<Toast[]>([])

let toastId = 0

export function useToast() {
  function show(options: Omit<Toast, 'id'>) {
    const id = `toast-${++toastId}`
    const toast: Toast = {
      id,
      duration: 5000,
      ...options,
    }
    toasts.value.push(toast)

    if (toast.duration && toast.duration > 0) {
      setTimeout(() => {
        remove(id)
      }, toast.duration)
    }

    return id
  }

  function remove(id: string) {
    const index = toasts.value.findIndex(t => t.id === id)
    if (index > -1) {
      toasts.value.splice(index, 1)
    }
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
    toasts: readonly(toasts),
    show,
    remove,
    success,
    error,
    warning,
    info,
  }
}
