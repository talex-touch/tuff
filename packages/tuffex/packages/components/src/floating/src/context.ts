import type { InjectionKey } from 'vue'

export interface FloatingContext {
  registerElement: (id: string, element: HTMLDivElement, depth: number) => void
  unregisterElement: (id: string) => void
}

export const TX_FLOATING_CONTEXT_KEY: InjectionKey<FloatingContext> = Symbol('TxFloatingContext')
