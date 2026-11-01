import type { StreamMarkdownCodePreview } from '@talex-touch/tuffex/stream-markdown'
import type { Ref } from 'vue'
import { ref, watch } from 'vue'

export interface CodePreviewTab {
  id: string
  lang: string
  /** The document's own `<title>`, or the language and a number when it has none. */
  title: string
  srcdoc: string
}

const TITLE_PATTERN = /<title[^>]*>([^<]*)<\/title>/i

// A preview belongs to the thread it was opened from, so a thread switch drops them.
export function useCodePreviewTabs(conversationId: Ref<string | null>) {
  const tabs = ref<CodePreviewTab[]>([])
  const activeId = ref<string | null>(null)
  const numbering = new Map<string, number>()
  let sequence = 0

  function titleFor(preview: StreamMarkdownCodePreview): string {
    const declared = TITLE_PATTERN.exec(preview.code)?.[1]?.trim()
    if (declared) return declared
    const next = (numbering.get(preview.lang) ?? 0) + 1
    numbering.set(preview.lang, next)
    return `${preview.lang.toUpperCase()} ${next}`
  }

  function open(preview: StreamMarkdownCodePreview): void {
    const existing = tabs.value.find(
      (tab) => tab.lang === preview.lang && tab.srcdoc === preview.srcdoc
    )
    if (existing) {
      activeId.value = existing.id
      return
    }
    const id = `code-preview-${++sequence}`
    tabs.value = [
      ...tabs.value,
      { id, lang: preview.lang, title: titleFor(preview), srcdoc: preview.srcdoc }
    ]
    activeId.value = id
  }

  function select(id: string): void {
    activeId.value = id
  }

  function close(id: string): void {
    const index = tabs.value.findIndex((tab) => tab.id === id)
    if (index < 0) return
    tabs.value = tabs.value.filter((tab) => tab.id !== id)
    if (activeId.value === id)
      activeId.value = tabs.value[Math.min(index, tabs.value.length - 1)]?.id ?? null
  }

  function reset(): void {
    tabs.value = []
    activeId.value = null
    numbering.clear()
  }

  watch(conversationId, reset)

  return { tabs, activeId, open, select, close }
}
