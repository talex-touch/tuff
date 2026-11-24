import type { Ref } from 'vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { AppSdk } from '@talex-touch/utils/transport/sdk/domains/app'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { hasDocument, hasWindow, isElectronRenderer } from '@talex-touch/utils/env'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { AgentWorkspaceEvents } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import { toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'

export interface FileLinkPayload {
  absolutePath: string
  displayPath: string
  line?: number
}

export interface FileLinkClickOptions {
  /** The transcript/chat body element containing messages */
  container: Ref<HTMLElement | null>
  /** Authoritative workspace root (project root or temporary space) */
  projectRoot: Ref<string | undefined>
  /** Optional conversation id forwarded to host file operations */
  conversationId?: Ref<string | null>
  /** Optional smart resolver for relative paths (e.g. matching files created in this thread) */
  resolveRelativePath?: (candidatePath: string) => string | null
  /** Default click (or ⌘+Click) on a local file path: open in the docked right sidebar */
  onOpenRight: (payload: FileLinkPayload) => void
  /** Default click (or ⌘+Click) on an http(s) URL: open in the docked right sidebar */
  onOpenWebRight?: (url: string) => void
  /** ⌥⌘+Click (Ctrl+Alt+Click) on a local file: open in Tuff's built-in browser */
  onOpenFileInBrowser?: (payload: FileLinkPayload) => void
  /** ⌥⌘+Click (Ctrl+Alt+Click) on an http(s) URL: open in Tuff's built-in browser */
  onOpenWebInBrowser?: (url: string) => void
  /** ⇧⌘+Click on a local file: open with system default app */
  onOpenFileExternal?: (payload: FileLinkPayload) => void
  /** ⇧⌘+Click on an http(s) URL: open with system default browser */
  onOpenWebExternal?: (url: string) => void
}

const FILE_EXT_REGEX =
  /\.(md|markdown|mdc|mdx|txt|json|yaml|yml|ts|tsx|js|jsx|mjs|cjs|vue|svelte|astro|css|scss|less|sass|html|htm|xml|csv|sql|sh|bash|zsh|fish|py|rs|go|java|kt|swift|rb|php|dart|c|cpp|h|hpp|cs|toml|ini|conf|cfg|env|log|lock|diff|patch|svg|png|jpg|jpeg|gif|webp|bmp|ico|avif|pdf)$/i

const HTTP_URL_REGEX = /^https?:\/\/\S+$/i

function decodeFileUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!/^file:\/\//i.test(trimmed)) return trimmed
  try {
    const parsed = new URL(trimmed)
    let pathname = decodeURIComponent(parsed.pathname)
    // Windows file:///C:/... -> C:/...
    if (/^\/[a-zA-Z]:\//.test(pathname)) {
      pathname = pathname.slice(1)
    }
    return pathname
  } catch {
    return trimmed
  }
}

export function extractLineNumber(raw: string): number | undefined {
  let cleaned = raw.trim()
  cleaned = cleaned.replace(/^['"`([<{“‘]+|['"`)}\]>,”’.]+$/g, '').trim()
  const match = /:(\d+)(?::\d+)?$/.exec(cleaned)
  if (!match?.[1]) return undefined
  const value = Number.parseInt(match[1], 10)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

export function cleanPathCandidate(raw: string): string {
  let cleaned = raw.trim()
  // Strip enclosing quotes, backticks, brackets and braces
  cleaned = cleaned.replace(/^['"`([<{“‘]+|['"`)}\]>,”’.]+$/g, '')
  if (/^file:\/\//i.test(cleaned)) {
    cleaned = decodeFileUrl(cleaned)
  }
  // Strip trailing line numbers, e.g. :12 or :12:34
  cleaned = cleaned.replace(/:\d+(:\d+)?$/, '')
  return cleaned.trim()
}

export function isHttpWebUrl(raw: string): boolean {
  const cleaned = raw.trim().replace(/^['"`([<{“‘]+|['"`)}\]>,”’.]+$/g, '')
  if (!HTTP_URL_REGEX.test(cleaned)) return false
  try {
    const parsed = new URL(cleaned)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname)
  } catch {
    return false
  }
}

export function cleanWebUrlCandidate(raw: string): string | null {
  const cleaned = raw.trim().replace(/^['"`([<{“‘]+|['"`)}\]>,”’.]+$/g, '')
  if (!isHttpWebUrl(cleaned)) return null
  try {
    return new URL(cleaned).href
  } catch {
    return null
  }
}

export function isPotentialFilePath(raw: string): boolean {
  const trimmed = raw.trim().replace(/^['"`([<{“‘]+|['"`)}\]>,”’.]+$/g, '')
  if (!trimmed || trimmed.length < 2) return false
  if (/^(https?|mailto|ftp|tel|chrome|data|javascript):/i.test(trimmed)) return false
  if (/[\r\n\t]/.test(trimmed)) return false

  if (/^file:\/\//i.test(trimmed)) {
    const decoded = cleanPathCandidate(trimmed)
    return decoded.length >= 2
  }

  const p = cleanPathCandidate(trimmed)
  if (!p || p.length < 2) return false

  // 1. Absolute paths (POSIX, Windows, or tilde home)
  if (p.startsWith('/') || p.startsWith('~/') || /^[a-zA-Z]:[\\/]/.test(p)) {
    return true
  }

  // 2. Explicit relative paths
  if (p.startsWith('./') || p.startsWith('../') || p.startsWith('.\\') || p.startsWith('..\\')) {
    return true
  }

  // 3. Implicit relative paths containing path separators
  if ((p.includes('/') || p.includes('\\')) && (FILE_EXT_REGEX.test(p) || !p.includes(' '))) {
    return true
  }

  // 4. Single filenames with known file extensions (no spaces)
  if (!p.includes(' ') && FILE_EXT_REGEX.test(p)) {
    return true
  }

  return false
}

export function resolveAbsolutePath(candidatePath: string, rootDir?: string | null): string {
  const cleaned = cleanPathCandidate(candidatePath)
  if (cleaned.startsWith('/') || cleaned.startsWith('~/') || /^[a-zA-Z]:[\\/]/.test(cleaned)) {
    return cleaned
  }
  const base = rootDir && rootDir.trim() ? rootDir.trim() : ''
  if (!base) return cleaned

  const normalizedBase = base.endsWith('/') || base.endsWith('\\') ? base.slice(0, -1) : base
  const normalizedChild = cleaned.replace(/^\.[\\/]/, '')
  return `${normalizedBase}/${normalizedChild}`
}

export function isBrowserOpenModifier(event: MouseEvent): boolean {
  return (event.metaKey || event.ctrlKey) && event.altKey
}

export function isExternalOpenModifier(event: MouseEvent): boolean {
  return (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey
}

interface CaretPosition {
  offsetNode: Node
  offset: number
}

interface DocumentWithCaretPosition {
  caretPositionFromPoint?: (x: number, y: number) => CaretPosition | null
  caretRangeFromPoint?: (x: number, y: number) => Range | null
}

export function extractWebUrlFromEvent(event: MouseEvent): string | null {
  const target = event.target
  if (!(target instanceof HTMLElement)) return null

  const anchor = target.closest('a[href]')
  if (anchor instanceof HTMLAnchorElement) {
    const href = anchor.getAttribute('href')?.trim()
    if (href) {
      const cleaned = cleanWebUrlCandidate(href)
      if (cleaned) return cleaned
    }
  }

  const codeEl = target.closest('code:not(pre code)')
  if (codeEl) {
    const text = codeEl.textContent?.trim()
    if (text) {
      const cleaned = cleanWebUrlCandidate(text)
      if (cleaned) return cleaned
    }
  }

  return null
}

function extractRawPathFromEvent(event: MouseEvent): string | null {
  const target = event.target
  if (!(target instanceof HTMLElement)) return null

  // 1. <a> link element
  const anchor = target.closest('a')
  if (anchor) {
    const href = anchor.getAttribute('href')
    if (href && isPotentialFilePath(href)) {
      return href.trim()
    }
    const text = anchor.textContent?.trim()
    if (text && isPotentialFilePath(text)) {
      return text
    }
  }

  // 2. <code> inline element
  const codeEl = target.closest('code')
  if (codeEl) {
    const text = codeEl.textContent?.trim()
    if (text && isPotentialFilePath(text)) {
      return text
    }
  }

  // 3. Plain text under caret position
  if (hasDocument()) {
    const doc = document as DocumentWithCaretPosition
    let node: Node | null = null
    let offset = 0
    if (typeof doc.caretPositionFromPoint === 'function') {
      const pos = doc.caretPositionFromPoint(event.clientX, event.clientY)
      if (pos) {
        node = pos.offsetNode
        offset = pos.offset
      }
    } else if (typeof doc.caretRangeFromPoint === 'function') {
      const range = doc.caretRangeFromPoint(event.clientX, event.clientY)
      if (range) {
        node = range.startContainer
        offset = range.startOffset
      }
    }

    if (node && node.nodeType === Node.TEXT_NODE && node.textContent) {
      const fullText = node.textContent
      let start = offset
      while (start > 0 && !/[\s"'`()[\]<>{},;]/.test(fullText[start - 1] ?? '')) {
        start--
      }
      let end = offset
      while (end < fullText.length && !/[\s"'`()[\]<>{},;]/.test(fullText[end] ?? '')) {
        end++
      }
      const candidate = fullText.slice(start, end).trim()
      if (isPotentialFilePath(candidate)) {
        return candidate
      }
    }
  }

  // 4. Target element direct text if short
  const directText = target.textContent?.trim()
  if (directText && directText.length <= 260 && isPotentialFilePath(directText)) {
    return directText
  }

  return null
}

export function extractPathFromEvent(event: MouseEvent): string | null {
  const raw = extractRawPathFromEvent(event)
  return raw ? cleanPathCandidate(raw) : null
}

function isInsideInteractiveChrome(target: HTMLElement): boolean {
  return Boolean(
    target.closest(
      'button, input, textarea, select, [role="menuitem"], .HomePage-ComposerGroup, .HomePage-MsgActions'
    )
  )
}

function hasActiveTextSelection(): boolean {
  if (!hasWindow() || typeof window.getSelection !== 'function') return false
  const selection = window.getSelection()
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim().length > 0)
}

export function useFileLinkClick(options: FileLinkClickOptions) {
  const { t } = useI18n()
  const transport = isElectronRenderer() ? useTuffTransport() : null
  const fallbackCwd = ref<string>('')

  // Resolve fallback working directory from main process once
  if (transport) {
    void transport
      .send(AppEvents.system.getCwd)
      .then((cwd) => {
        if (typeof cwd === 'string' && cwd.trim()) {
          fallbackCwd.value = cwd.trim()
        }
      })
      .catch(() => {})
  }

  function resolveAppSdk(): AppSdk | null {
    try {
      return typeof useAppSdk === 'function' ? useAppSdk() : null
    } catch {
      return null
    }
  }

  async function openPathWithSystem(path: string): Promise<void> {
    try {
      if (transport) {
        const result = await transport.send(AgentWorkspaceEvents.openFileExternal, {
          path,
          conversationId: options.conversationId?.value ?? null
        })
        if (result?.opened || result?.revealed) return
      }
      const appSdk = resolveAppSdk()
      if (appSdk) {
        await appSdk.openApp({ path })
        return
      }
      if (transport) {
        await transport.send(AppEvents.system.openApp, { path })
        return
      }
    } catch {
      toast.error(t('home.preview.openFailed') || '无法使用系统工具打开该文件')
    }
  }

  async function openUrlExternal(url: string): Promise<void> {
    try {
      const appSdk = resolveAppSdk()
      if (appSdk) {
        await appSdk.openExternal(url)
        return
      }
      if (transport) {
        await transport.send(AppEvents.system.openExternal, { url })
        return
      }
    } catch {
      toast.error(t('home.preview.openFailed') || '打开链接失败')
    }
  }

  function resolveFullFilePath(pathCandidate: string): string {
    const cleaned = cleanPathCandidate(pathCandidate)
    if (cleaned.startsWith('/') || cleaned.startsWith('~/') || /^[a-zA-Z]:[\\/]/.test(cleaned)) {
      return cleaned
    }
    const smart = options.resolveRelativePath?.(cleaned)
    if (smart) return smart
    const rootDir = options.projectRoot.value || fallbackCwd.value
    return resolveAbsolutePath(cleaned, rootDir)
  }

  async function handleContainerClick(event: MouseEvent): Promise<void> {
    if (event.button !== 0) return
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    if (isInsideInteractiveChrome(target)) return

    const browserMod = isBrowserOpenModifier(event)
    const externalMod = isExternalOpenModifier(event)
    const isCmd = event.metaKey || event.ctrlKey

    // Plain click yields to text selection drags so copying prose stays natural.
    if (!isCmd && hasActiveTextSelection()) return

    // 1. Web URLs (<a> with http(s) href, or inline <code> containing an exact http(s) URL)
    const webUrl = extractWebUrlFromEvent(event)
    if (webUrl) {
      event.preventDefault()
      event.stopPropagation()

      if (browserMod) {
        if (options.onOpenWebInBrowser) {
          options.onOpenWebInBrowser(webUrl)
        } else {
          await openUrlExternal(webUrl)
        }
        return
      }
      if (externalMod) {
        if (options.onOpenWebExternal) {
          options.onOpenWebExternal(webUrl)
        } else {
          await openUrlExternal(webUrl)
        }
        return
      }
      if (options.onOpenWebRight) {
        options.onOpenWebRight(webUrl)
      } else {
        await openUrlExternal(webUrl)
      }
      return
    }

    // 2. File paths:
    //    - Marked links (`.is-file-path` on inline `<code>` or file `<a href>`) open on plain click too!
    //    - Unmarked plain text paths (or code blocks) still require ⌘/Ctrl modifier so prose clicks stay clean.
    const markedEl = target.closest('.is-file-path, a[href]') as HTMLElement | null
    const isCodeBlock = Boolean(target.closest('pre code'))
    if (!isCmd && (!markedEl || isCodeBlock)) return
    if (isCodeBlock && !isCmd) return

    const rawCandidate = extractRawPathFromEvent(event)
    if (!rawCandidate) return
    const pathCandidate = cleanPathCandidate(rawCandidate)
    if (!pathCandidate) return
    const line = extractLineNumber(rawCandidate)

    event.preventDefault()
    event.stopPropagation()

    const fullPath = resolveFullFilePath(pathCandidate)
    const payload: FileLinkPayload = {
      absolutePath: fullPath,
      displayPath: pathCandidate,
      ...(line !== undefined ? { line } : {})
    }

    if (browserMod) {
      if (options.onOpenFileInBrowser) {
        options.onOpenFileInBrowser(payload)
      } else {
        await openPathWithSystem(fullPath)
      }
      return
    }

    if (externalMod) {
      if (options.onOpenFileExternal) {
        options.onOpenFileExternal(payload)
      } else {
        await openPathWithSystem(fullPath)
      }
      return
    }

    options.onOpenRight(payload)
  }

  let hoveredEl: HTMLElement | null = null

  function defaultLinkTooltip(targetLabel: string): string {
    const primary = t('home.fileLink.clickTitle') || '点击在右侧边栏打开'
    const secondary = t('home.fileLink.optCmdClickTitle') || '⌥⌘ 点击在内置浏览器打开'
    return `${primary} · ${secondary}: ${targetLabel}`
  }

  function handleContainerPointerOver(event: PointerEvent): void {
    const target = event.target
    if (!(target instanceof HTMLElement)) {
      clearHoverState()
      return
    }

    const isCmd = event.metaKey || event.ctrlKey
    if (!isCmd) {
      clearHoverState()
      return
    }

    const webUrl = extractWebUrlFromEvent(event)
    const pathCandidate = webUrl ? null : extractPathFromEvent(event)
    const label = webUrl || pathCandidate
    if (label) {
      const codeOrAnchor = target.closest('code, a') as HTMLElement | null
      const el = codeOrAnchor ?? target
      if (hoveredEl && hoveredEl !== el) {
        clearHoverState()
      }
      hoveredEl = el
      el.classList.add('is-command-path-clickable')
      if (isBrowserOpenModifier(event)) {
        el.setAttribute(
          'title',
          `${t('home.fileLink.optCmdClickTitle') || '⌥⌘ 点击在内置浏览器打开'}: ${label}`
        )
      } else if (isExternalOpenModifier(event)) {
        el.setAttribute(
          'title',
          `${t('home.fileLink.shiftCmdClickTitle') || '⇧⌘ 点击用系统工具打开'}: ${label}`
        )
      } else {
        el.setAttribute(
          'title',
          `${t('home.fileLink.clickTitle') || '点击在右侧边栏打开'}: ${label}`
        )
      }
    } else {
      clearHoverState()
    }
  }

  function clearHoverState(): void {
    if (hoveredEl) {
      hoveredEl.classList.remove('is-command-path-clickable')
      if (hoveredEl.classList.contains('is-file-path')) restingFileTitle(hoveredEl)
      else if (hoveredEl.classList.contains('is-web-link')) restingWebTitle(hoveredEl)
      else hoveredEl.removeAttribute('title')
      hoveredEl = null
    }
  }

  function restingFileTitle(el: HTMLElement): void {
    const path = el.dataset.filePath
    if (path) el.setAttribute('title', defaultLinkTooltip(path))
  }

  function restingWebTitle(el: HTMLElement): void {
    const url = el.dataset.webUrl
    if (url) el.setAttribute('title', defaultLinkTooltip(url))
  }

  /**
   * Marks inline code file paths, file anchors, and http(s) links so users can immediately see
   * that clicking opens them in the docked right sidebar (and ⌥⌘+Click opens in the built-in browser).
   */
  function markPathElements(root: HTMLElement | null): void {
    if (!root) return
    for (const el of root.querySelectorAll<HTMLElement>('code:not(pre code), a[href]')) {
      if (isInsideInteractiveChrome(el)) continue
      const raw = el instanceof HTMLAnchorElement ? el.getAttribute('href') : el.textContent
      const text = raw?.trim() ?? ''
      const webUrl = text.length > 0 && text.length <= 2048 ? cleanWebUrlCandidate(text) : null

      if (webUrl) {
        if (el.classList.contains('is-file-path')) {
          el.classList.remove('is-file-path')
          delete el.dataset.filePath
        }
        if (el.dataset.webUrl === webUrl && el.classList.contains('is-web-link')) continue
        el.dataset.webUrl = webUrl
        el.classList.add('is-web-link')
        if (el !== hoveredEl) restingWebTitle(el)
        continue
      }

      if (el.classList.contains('is-web-link')) {
        el.classList.remove('is-web-link')
        delete el.dataset.webUrl
        el.removeAttribute('title')
      }

      const isPath = text.length > 0 && text.length <= 260 && isPotentialFilePath(text)
      if (isPath) {
        const path = cleanPathCandidate(text)
        if (el.dataset.filePath === path && el.classList.contains('is-file-path')) continue
        el.dataset.filePath = path
        el.classList.add('is-file-path')
        if (el !== hoveredEl) restingFileTitle(el)
      } else if (el.classList.contains('is-file-path')) {
        el.classList.remove('is-file-path')
        delete el.dataset.filePath
        el.removeAttribute('title')
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Meta' || event.key === 'Control') {
      options.container.value?.classList.add('has-command-active')
    }
  }

  function handleKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Meta' || event.key === 'Control') {
      options.container.value?.classList.remove('has-command-active')
      clearHoverState()
    }
  }

  let markFrame = 0
  let observer: MutationObserver | null = null

  function scheduleMark(): void {
    if (markFrame) return
    markFrame = requestAnimationFrame(() => {
      markFrame = 0
      markPathElements(options.container.value)
    })
  }

  onMounted(() => {
    const el = options.container.value
    if (el) {
      el.addEventListener('click', handleContainerClick, true)
      el.addEventListener('pointerover', handleContainerPointerOver)
      markPathElements(el)
      observer = new MutationObserver(scheduleMark)
      observer.observe(el, { childList: true, subtree: true, characterData: true })
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', clearHoverState)
  })

  onBeforeUnmount(() => {
    const el = options.container.value
    if (el) {
      el.removeEventListener('click', handleContainerClick, true)
      el.removeEventListener('pointerover', handleContainerPointerOver)
    }
    observer?.disconnect()
    observer = null
    if (markFrame) cancelAnimationFrame(markFrame)
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('keyup', handleKeyUp)
    window.removeEventListener('blur', clearHoverState)
    clearHoverState()
  })

  return {
    handleContainerClick
  }
}
