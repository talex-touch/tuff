import { computed, ref } from 'vue'

export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
}

const toastItems = ref<Toast[]>([])
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>()

function clearToastTimer(id: string) {
  const timer = toastTimers.get(id)
  if (timer) {
    clearTimeout(timer)
    toastTimers.delete(id)
  }
}

function scheduleDismiss(id: string, duration?: number) {
  if (!duration || duration <= 0)
    return
  clearToastTimer(id)
  const timer = setTimeout(() => {
    removeToast(id)
  }, duration)
  toastTimers.set(id, timer)
}

function removeToast(id: string) {
  toastItems.value = toastItems.value.filter(item => item.id !== id)
  clearToastTimer(id)
}

function createToastId() {
  return `toast_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function useToast() {
  const toasts = computed(() => toastItems.value)

  function show(options: Omit<Toast, 'id'>) {
    const id = createToastId()
    const toast: Toast = {
      id,
      type: options.type,
      title: options.title,
      message: options.message,
      duration: options.duration ?? 4000,
    }

    toastItems.value = [...toastItems.value, toast]
    scheduleDismiss(id, toast.duration)
    return id
  }

  function remove(id: string) {
    removeToast(id)
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
