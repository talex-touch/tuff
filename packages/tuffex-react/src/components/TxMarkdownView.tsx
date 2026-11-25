import type { HTMLAttributes } from 'react'
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
  if (typeof document === 'undefined')
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

export const TxMarkdownView = forwardRef<HTMLDivElement, TxMarkdownViewProps>(function TxMarkdownView(
  {
    content,
    sanitize = true,
    theme = 'auto',
    className,
    ...rest
  },
  ref,
) {
  const markedInstance = useMemo(() => new Marked({ gfm: true, breaks: true }), [])
  const [autoTheme, setAutoTheme] = useState<'light' | 'dark'>(() => resolveAutoTheme())

  useEffect(() => {
    if (theme !== 'auto' || typeof document === 'undefined' || typeof MutationObserver === 'undefined')
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
    if (typeof window !== 'undefined' && typeof DOMPurify?.sanitize === 'function')
      return DOMPurify.sanitize(raw)
    return raw.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
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
