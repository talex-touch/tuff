import type { ASTNode, Store } from '@openuidev/lang-core'
import type { InjectionKey, Ref, VNodeChild } from 'vue'

export interface OpenUIAction {
  type: string
  params?: Record<string, unknown>
  context?: string
}

export interface OpenUIContext {
  store: Store
  /** Fine-grained reactive state read; tracks only the requested `$var` key. */
  readState: (name: string) => unknown
  /** Writes a state variable through the store and syncs only changed keys. */
  writeState: (name: string, value: unknown, options?: { pristine?: boolean }) => void
  /** Evaluates only the immediate props of one element without recursing into child elements. */
  evaluateProps: (typeName: string, rawProps: Record<string, unknown>) => Record<string, unknown>
  /** Stable renderer for nested OpenUI values/elements at a deterministic path. */
  renderNode: (node: unknown, path?: string) => VNodeChild
  streaming: Readonly<Ref<boolean>>
  labels: Readonly<Ref<Record<string, string>>>
  allowRemoteImages: Readonly<Ref<boolean>>
  allowSessionRemoteImages: () => void
  resolveImage?: (query: string) => Promise<string | null>
  trigger: (plan: unknown, label?: string, form?: string) => void
  registerField: (form: string, read: () => { label: string, value: unknown }) => () => void
  evaluate: (node: ASTNode, extraScope?: Record<string, unknown>) => unknown
  notice: (message: string) => void
}

export interface OpenUIRenderProps {
  props: Record<string, unknown>
  renderNode?: (node: unknown, path?: string) => VNodeChild
  nodePath?: string
  statementId?: string
}

export const OPENUI_CONTEXT: InjectionKey<OpenUIContext> = Symbol('tx-ai-openui')
export const OPENUI_FORM: InjectionKey<string> = Symbol('tx-ai-openui-form')
