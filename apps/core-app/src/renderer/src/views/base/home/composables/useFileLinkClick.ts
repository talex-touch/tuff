import type { Ref } from 'vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { AppSdk } from '@talex-touch/utils/transport/sdk/domains/app'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'
export interface FileLinkClickOptions {
  /** The transcript/chat body element containing messages */
  container: Ref<HTMLElement | null>
  /** Project root path from current project */
  projectRoot: Ref<string | undefined>
  /** Callback when Command + Click (without Shift) asks to open on the right */
  onOpenRight: (payload: { absolutePath: string; displayPath: string }) => void
}

const FILE_EXT_REGEX =
  /\.(md|markdown|txt|json|yaml|yml|ts|tsx|js|jsx|mjs|cjs|vue|css|scss|html|htm|sh|bash|py|rs|go|java|c|cpp|h|hpp|toml|ini|env|log|svg|png|jpg|jpeg|gif|webp|pdf)$/i

export function cleanPathCandidate(raw: string): string {
  let cleaned = raw.trim()
  // Strip enclosing quotes, backticks, brackets and braces
  cleaned = cleaned.replace(/^['"`([<{“‘]+|['"`)}\]>,”’.]+$/g, '')
  // Strip trailing line numbers, e.g. :12 or :12:34
  cleaned = cleaned.replace(/:\d+(:\d+)?$/, '')
  return cleaned.trim()
}

export function isPotentialFilePath(raw: string): boolean {
  const p = cleanPathCandidate(raw)
  if (!p || p.length < 2) return false
  if (/^(https?|mailto|ftp|tel|chrome|data):/i.test(p)) return false
  if (/[\r\n\t]/.test(p)) return false

  // 1. Absolute paths
  if (p.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(p)) {
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
  if (cleaned.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(cleaned)) {
    return cleaned
  }
  const base = rootDir && rootDir.trim() ? rootDir.trim() : ''
  if (!base) return cleaned

  const normalizedBase = base.endsWith('/') || base.endsWith('\\') ? base.slice(0, -1) : base
  const normalizedChild = cleaned.replace(/^\.[\\/]/, '')
  return `${normalizedBase}/${normalizedChild}`
}

interface CaretPosition {
  offsetNode: Node
  offset: number
}

interface DocumentWithCaretPosition extends Document {
  caretPositionFromPoint?: (x: number, y: number) => CaretPosition | null
  caretRangeFromPoint?: (x: number, y: number) => Range | null
}

export function extractPathFromEvent(event: MouseEvent): string | null {
  const target = event.target
  if (!(target instanceof HTMLElement)) return null

  // 1. <a> link element
  const anchor = target.closest('a')
  if (anchor) {
    const href = anchor.getAttribute('href')
    if (href && isPotentialFilePath(href)) {
      return cleanPathCandidate(href)
    }
    const text = anchor.textContent?.trim()
    if (text && isPotentialFilePath(text)) {
      return cleanPathCandidate(text)
    }
  }

  // 2. <code> inline element
  const codeEl = target.closest('code')
  if (codeEl) {
    const text = codeEl.textContent?.trim()
    if (text && isPotentialFilePath(text)) {
      return cleanPathCandidate(text)
    }
  }

  // 3. Plain text under caret position
  if (typeof document !== 'undefined') {
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
        return cleanPathCandidate(candidate)
      }
    }
  }

  // 4. Target element direct text if short
  const directText = target.textContent?.trim()
  if (directText && directText.length <= 260 && isPotentialFilePath(directText)) {
    return cleanPathCandidate(directText)
  }

  return null
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

  async function openPathWithSystem(path: string): Promise<void> {
    try {
      let appSdk: AppSdk | null = null
      try {
        appSdk = typeof useAppSdk === 'function' ? useAppSdk() : null
      } catch {
        appSdk = null
      }
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

  async function handleContainerClick(event: MouseEvent): Promise<void> {
    const isCmd = event.metaKey || event.ctrlKey
    if (!isCmd) return

    const pathCandidate = extractPathFromEvent(event)
    if (!pathCandidate) return

    // Prevent default anchor navigation or text selection side-effects
    event.preventDefault()
    event.stopPropagation()

    const rootDir = options.projectRoot.value || fallbackCwd.value
    const fullPath = resolveAbsolutePath(pathCandidate, rootDir)

    if (event.shiftKey) {
      // Command + Shift + Click: Open with system default application
      await openPathWithSystem(fullPath)
    } else {
      // Command + Click: Open in right-side drawer
      options.onOpenRight({
        absolutePath: fullPath,
        displayPath: pathCandidate
      })
    }
  }

  let hoveredEl: HTMLElement | null = null

  function handleContainerPointerOver(event: PointerEvent): void {
    const isCmd = event.metaKey || event.ctrlKey
    if (!isCmd) {
      clearHoverState()
      return
    }

    const pathCandidate = extractPathFromEvent(event)
    const target = event.target
    if (pathCandidate && target instanceof HTMLElement) {
      const codeOrAnchor = target.closest('code, a') as HTMLElement | null
      const el = codeOrAnchor ?? target
      if (hoveredEl && hoveredEl !== el) {
        clearHoverState()
      }
      hoveredEl = el
      el.classList.add('is-command-path-clickable')
      if (event.shiftKey) {
        el.setAttribute(
          'title',
          `${t('home.fileLink.shiftCmdClickTitle') || '⇧⌘ 点击用系统工具打开'}: ${pathCandidate}`
        )
      } else {
        el.setAttribute(
          'title',
          `${t('home.fileLink.cmdClickTitle') || '⌘ 点击在右侧打开'}: ${pathCandidate}`
        )
      }
    } else {
      clearHoverState()
    }
  }

  function clearHoverState(): void {
    if (hoveredEl) {
      hoveredEl.classList.remove('is-command-path-clickable')
      // A marked path keeps its resting hint; anything else had no title of its own.
      if (hoveredEl.classList.contains('is-file-path')) restingTitle(hoveredEl)
      else hoveredEl.removeAttribute('title')
      hoveredEl = null
    }
  }

  function restingTitle(el: HTMLElement): void {
    const path = el.dataset.filePath
    if (path) el.setAttribute('title', `${t('home.fileLink.cmdClickTitle')}: ${path}`)
  }

  /**
   * Inline code and relative links that name a file read as plain text until ⌘ is held, so nothing
   * says they can be opened. Marked here, they carry a standing underline and a hover hint; code
   * blocks are left alone, a path inside a listing is content, not a link.
   */
  function markPathElements(root: HTMLElement | null): void {
    if (!root) return
    for (const el of root.querySelectorAll<HTMLElement>('code:not(pre code), a[href]')) {
      const raw = el instanceof HTMLAnchorElement ? el.getAttribute('href') : el.textContent
      const text = raw?.trim() ?? ''
      const isPath = text.length > 0 && text.length <= 260 && isPotentialFilePath(text)
      if (isPath) {
        const path = cleanPathCandidate(text)
        if (el.dataset.filePath === path && el.classList.contains('is-file-path')) continue
        el.dataset.filePath = path
        el.classList.add('is-file-path')
        if (el !== hoveredEl) restingTitle(el)
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
      // Streaming replaces nodes wholesale, so the marks follow the DOM rather than the data.
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
