import type { ASTNode, Store } from '@openuidev/lang-core'
import type { InjectionKey, Ref, VNodeChild } from 'vue'

export interface OpenUIAction {
  type: string
  params?: Record<string, unknown>
  context?: string
}
export interface OpenUIContext {
  store: Store
  version: Ref<number>
  streaming: Readonly<Ref<boolean>>
  labels: Readonly<Ref<Record<string, string>>>
  resolveImage?: (query: string) => Promise<string | null>
  trigger: (plan: unknown, label?: string, form?: string) => void
  registerField: (form: string, read: () => { label: string, value: unknown }) => () => void
  evaluate: (node: ASTNode, extraScope?: Record<string, unknown>) => unknown
  notice: (message: string) => void
}
export interface OpenUIRenderProps {
  props: Record<string, unknown>
  renderNode: (node: unknown, path?: string) => VNodeChild
  statementId?: string
}
export const OPENUI_CONTEXT: InjectionKey<OpenUIContext> = Symbol('tx-ai-openui')
export const OPENUI_FORM: InjectionKey<string> = Symbol('tx-ai-openui-form')
