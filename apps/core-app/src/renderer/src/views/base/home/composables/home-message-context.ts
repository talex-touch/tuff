import type { InjectionKey, Ref } from 'vue'
import type { useMessageParts } from './useMessageParts'

/**
 * What every message row reads from the page. It is provided rather than passed down because the
 * state is the page's, not a row's: the stream virtualizes rows out of the DOM, and a form's draft
 * or a submitted lock must survive the row that showed it unmounting.
 */
export interface HomeMessageContext extends ReturnType<typeof useMessageParts> {
  attachPreviewProps: Ref<Record<string, unknown>>
  attachOpenLabel: (name: string) => string
  /** The pre-first-token verb, one ticker for the page: only the waiting row shows it. */
  thinkingVerb: Ref<string>
  thinkingLabel: Ref<string>
}

export const homeMessageContextKey: InjectionKey<HomeMessageContext> = Symbol('homeMessageContext')
