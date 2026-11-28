import type { HTMLAttributes } from 'react'
import { hasDocument, hasWindow } from '@talex-touch/tuffex-core'
import DOMPurify from 'dompurify'
import { Marked } from 'marked'
import { forwardRef, useEffect, useMemo, useState } from 'react'
import { cn } from '../utils/cn'

export type TxMarkdownViewTheme = 'auto' | 'light' | 'dark'

export interface TxMarkdownViewProps extends HTMLAttributes<HTMLDivElement> {
  content: string
  sanitize?: boolean
  theme?: TxMarkdownViewTheme
}

function resolveAutoTheme(): 'light' | 'dark' {
  if (!hasDocument())
    return 'light'
  const root = document.documentElement
  const body = document.body
  const dataTheme = root.getAttribute('data-theme') || body?.getAttribute('data-theme')
  if (dataTheme === 'dark')
    return 'dark'
  if (dataTheme === 'light')
    return 'light'
  if (root.classList.contains('dark') || body?.classList.contains('dark'))
    return 'dark'
  return 'light'
}

export const TxMarkdownView = forwardRef<HTMLDivElement, TxMarkdownViewProps>((
  {
    content,
    sanitize = true,
    theme = 'auto',
    className,
    ...rest
  },
  ref,
) => {
  const markedInstance = useMemo(() => new Marked({ gfm: true, breaks: true }), [])
  const [autoTheme, setAutoTheme] = useState<'light' | 'dark'>(() => resolveAutoTheme())

  useEffect(() => {
    if (theme !== 'auto' || !hasDocument() || typeof MutationObserver === 'undefined')
      return

    setAutoTheme(resolveAutoTheme())
    const observer = new MutationObserver(() => {
      setAutoTheme(resolveAutoTheme())
    })
    const init: MutationObserverInit = { attributes: true, attributeFilter: ['class', 'data-theme'] }
    observer.observe(document.documentElement, init)
    if (document.body)
      observer.observe(document.body, init)

    return () => observer.disconnect()
  }, [theme])

  const html = useMemo(() => {
    const raw = markedInstance.parse(content ?? '') as string
    if (!sanitize)
      return raw
    if (hasWindow() && typeof DOMPurify?.sanitize === 'function')
      return DOMPurify.sanitize(raw)
    return ''
  }, [markedInstance, content, sanitize])

  const resolvedTheme: 'light' | 'dark' = theme === 'auto' ? autoTheme : theme === 'dark' ? 'dark' : 'light'

  return (
    <div
      ref={ref}
      className={cn('tx-md tx-markdown-view', resolvedTheme, className)}
      data-theme={resolvedTheme}
      {...rest}
    >
      <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
})
