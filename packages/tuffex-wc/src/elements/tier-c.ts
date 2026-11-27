import type { PropSchema } from '../runtime/coerce'
import TxMarkdownView from '@tuffex-src/markdown-view/src/TxMarkdownView.vue'
import TxStreamText from '@tuffex-src/stream-text/src/TxStreamText.vue'
import { computed, defineComponent, h, useHost } from 'vue'
import { coercePropsBySchema } from '../runtime/coerce'
import {
  buildRawVueProps,
  createTxCustomElement,
  createTxCustomElementFromComponent,
  getHostSlotNodes,
} from '../runtime/factory'
import '@tuffex-src/markdown-view/src/github-markdown.css'

// 31. tx-stream-text (stream-text)
export const streamTextBundle = createTxCustomElement({
  tag: 'tx-stream-text',
  component: TxStreamText,
  props: {
    content: 'string-or-json',
    streaming: 'boolean',
    wordMs: 'number',
    maxLagMs: 'number',
    drainMs: 'number',
    pauseMs: 'number',
    reveal: 'string',
    caret: 'boolean',
    reserve: 'boolean',
    paced: 'boolean',
    appear: 'boolean',
    tag: 'string',
    locale: 'string',
  },
  transformProps: (coerced, { host }) => {
    if (coerced.content !== undefined)
      return coerced
    const fallbackText = getHostSlotNodes(host, 'default')
      .map(n => n.textContent ?? '')
      .join('')
    return {
      ...coerced,
      content: fallbackText,
    }
  },
  emits: ['state-change', 'done', 'cite'],
  exposeMethods: ['replay', 'skip', 'state'],
  slots: ['caret'],
})

// 32. tx-markdown-view (markdown-view)
const MARKDOWN_VIEW_SCHEMA: PropSchema = {
  content: 'string',
  sanitize: 'boolean',
  theme: 'string',
}

const TxMarkdownViewWcWrapper = defineComponent({
  name: 'Wc_tx-markdown-view',
  props: buildRawVueProps(MARKDOWN_VIEW_SCHEMA),
  setup(rawProps) {
    const host = useHost()
    const initialSlotMarkdown = getHostSlotNodes(host, 'default')
      .map(n => n.textContent ?? '')
      .join('')
      .trim()

    const coercedProps = computed(() => coercePropsBySchema(rawProps as Record<string, unknown>, MARKDOWN_VIEW_SCHEMA))

    return () => {
      const p = coercedProps.value
      const content = typeof p.content === 'string' && p.content.length > 0
        ? p.content
        : initialSlotMarkdown
      return h(TxMarkdownView, {
        ...p,
        content,
      })
    }
  },
})

export const markdownViewBundle = createTxCustomElementFromComponent('tx-markdown-view', TxMarkdownViewWcWrapper)

export const TxStreamTextElement = streamTextBundle.ElementClass
export const defineTxStreamText = streamTextBundle.define

export const TxMarkdownViewElement = markdownViewBundle.ElementClass
export const defineTxMarkdownView = markdownViewBundle.define

export const TIER_C_BUNDLES = [
  streamTextBundle,
  markdownViewBundle,
] as const
