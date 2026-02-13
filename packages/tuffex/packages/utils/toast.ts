import { reactive } from 'vue'
import { getZIndex, nextZIndex } from './z-index-manager'

export type TxToastVariant = 'default' | 'success' | 'warning' | 'danger'

export interface TxToastItem {
  id: string
  title?: string
  description?: string
  variant?: TxToastVariant
  duration?: number
  createdAt: number
}

export interface TxToastOptions {
  id?: string
  title?: string
  description?: string
  variant?: TxToastVariant
  duration?: number
}

const DEFAULT_DURATION = 2600

export const toastStore = reactive({
  items: [] as TxToastItem[],
  zIndex: getZIndex(),
})

function generateId() {
  return `tx-toast-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function toast(options: TxToastOptions): string {
  toastStore.zIndex = nextZIndex()
  const id = options.id ?? generateId()
  const duration = options.duration ?? DEFAULT_DURATION

  const existingIndex = toastStore.items.findIndex(t => t.id === id)
  if (existingIndex !== -1) {
    toastStore.items.splice(existingIndex, 1)
  }

  const item: TxToastItem = {
    id,
    title: options.title,
    description: options.description,
    variant: options.variant ?? 'default',
    duration,
    createdAt: Date.now(),
  }

  toastStore.items.push(item)

  if (duration > 0) {
    window.setTimeout(() => {
      dismissToast(id)
    }, duration)
  }

  return id
}

export function dismissToast(id: string): void {
  const index = toastStore.items.findIndex(t => t.id === id)
  if (index !== -1) {
    toastStore.items.splice(index, 1)
  }
}

export function clearToasts(): void {
  toastStore.items.splice(0, toastStore.items.length)
}
