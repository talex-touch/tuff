declare module 'vue-sonner' {
  import type { DefineComponent, VNodeChild } from 'vue'

  export interface ToastOptions {
    id?: string | number
    description?: string
    duration?: number
    action?: unknown
    cancel?: unknown
    [key: string]: unknown
  }

  export type ToastContent = string | number | VNodeChild
  export type ToastId = string | number

  export interface ToastApi {
    (message?: ToastContent, options?: ToastOptions): ToastId
    success: (message?: ToastContent, options?: ToastOptions) => ToastId
    error: (message?: ToastContent, options?: ToastOptions) => ToastId
    info: (message?: ToastContent, options?: ToastOptions) => ToastId
    warning: (message?: ToastContent, options?: ToastOptions) => ToastId
    loading: (message?: ToastContent, options?: ToastOptions) => ToastId
    custom: (component: unknown, options?: ToastOptions) => ToastId
    dismiss: (id?: ToastId) => void
  }

  export const toast: ToastApi
  export const Toaster: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
}
