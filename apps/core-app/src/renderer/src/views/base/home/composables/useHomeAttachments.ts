import type { AiAttachment } from '@talex-touch/tuffex/ai-elements'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'

export interface HomeAttachmentsOptions {
  /** Whether this page is the one on screen; an off-screen page must not take a stray paste. */
  isActive: () => boolean
  /** Called when files are added, before they land in the tray (the browser landing switches mode). */
  onAdd: () => void
  /** Puts the caret back in the composer after a page-level paste. */
  focusInput: () => void
}

/**
 * The composer's attachment tray (memory-only: never in the provider payload, never persisted):
 * picking, pasting and dropping files, the object URLs they hold, and the preview wording.
 */
export function useHomeAttachments(options: HomeAttachmentsOptions) {
  const { t } = useI18n()

  const pendingAttachments = ref<AiAttachment[]>([])

  /**
   * Object URLs this surface created. Revoked wholesale on unmount rather than
   * per-message: the conversation is in-memory and keep-alive keeps this
   * component around, so the registry is bounded by the session, not leaked.
   */
  const objectUrls = new Set<string>()

  function toAttachment(file: File): AiAttachment {
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      objectUrls.add(url)
      return { kind: 'image', id: crypto.randomUUID(), url, name: file.name }
    }
    return {
      kind: 'file',
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      mime: file.type
    }
  }

  function addFiles(files: File[]): void {
    // Allowed while a reply streams, like typing: only sending waits for the turn to end.
    if (files.length === 0) return
    options.onAdd()
    pendingAttachments.value = [...pendingAttachments.value, ...files.map(toAttachment)]
  }

  function removeAttachment(id: string): void {
    const target = pendingAttachments.value.find((attachment) => attachment.id === id)
    if (target?.kind === 'image' && objectUrls.delete(target.url)) URL.revokeObjectURL(target.url)
    pendingAttachments.value = pendingAttachments.value.filter((attachment) => attachment.id !== id)
  }

  /**
   * The preview's own controls and announcements in the app's language. The tray names only the
   * buttons it has props for; everything else in the preview would stay at its English defaults.
   */
  const attachPreviewProps = computed(() => ({
    zoomLabel: t('home.attachViewer.zoom'),
    rotateLabel: t('home.attachViewer.rotate'),
    copyLabel: t('home.attachViewer.copy'),
    shareLabel: t('home.attachViewer.share'),
    downloadLabel: t('home.attachViewer.download'),
    menuLabel: t('home.attachViewer.menu'),
    indicatorLabel: t('home.attachViewer.strip'),
    copiedText: t('home.attachViewer.copied'),
    linkCopiedText: t('home.attachViewer.linkCopied'),
    copyFailedText: t('home.attachViewer.copyFailed'),
    indicatorItemFormatter: (current: number, total: number, name?: string) =>
      name
        ? t('home.attachViewer.itemNamed', { name, current, total })
        : t('home.attachViewer.item', { current, total }),
    labelFormatter: (label: string, name: string) => t('home.attachViewer.named', { label, name }),
    readoutLabelFormatter: (readout: string, label: string) =>
      t('home.attachViewer.readout', { readout, label })
  }))

  function attachOpenLabel(name: string): string {
    return t('home.attachViewer.named', { label: t('home.attachPreview'), name })
  }

  /** The files a paste carries — a copied picture arrives as one `image/png` file item. */
  function pastedFiles(event: ClipboardEvent): File[] {
    const files: File[] = []
    for (const item of Array.from(event.clipboardData?.items ?? [])) {
      if (item.kind !== 'file') continue
      const file = item.getAsFile()
      if (file) files.push(file)
    }
    return files
  }

  function onPaste(event: ClipboardEvent): void {
    const files = pastedFiles(event)
    if (files.length === 0) return
    // Keeps platform side text (a Finder-copied file pastes its name) out of the draft.
    event.preventDefault()
    addFiles(files)
  }

  /**
   * A picture pasted with the focus outside any field still lands in the composer: after a click on
   * the send button, on the thread or on nothing, ⌘V never reaches the textarea's own handler.
   * A paste into another field stays that field's; text pasted outside a field is dropped as before.
   */
  function onPagePaste(event: ClipboardEvent): void {
    if (event.defaultPrevented || !options.isActive()) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) return
    const files = pastedFiles(event)
    if (files.length === 0) return
    event.preventDefault()
    addFiles(files)
    options.focusInput()
  }

  window.addEventListener('paste', onPagePaste)

  /** Enter/leave fire per descendant — only the pair count says "still inside". */
  const dragDepth = ref(0)
  const isDragover = computed(() => dragDepth.value > 0)

  function dragHasFiles(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files')
  }

  function onDragEnter(event: DragEvent): void {
    if (!dragHasFiles(event)) return
    event.preventDefault()
    dragDepth.value += 1
  }

  function onDragOver(event: DragEvent): void {
    // Required — without it the browser refuses the drop.
    if (isDragover.value) event.preventDefault()
  }

  function onDragLeave(): void {
    dragDepth.value = Math.max(0, dragDepth.value - 1)
  }

  function onDrop(event: DragEvent): void {
    if (!isDragover.value) return
    event.preventDefault()
    dragDepth.value = 0
    addFiles(Array.from(event.dataTransfer?.files ?? []))
  }

  onBeforeUnmount(() => {
    window.removeEventListener('paste', onPagePaste)
    for (const url of objectUrls) URL.revokeObjectURL(url)
    objectUrls.clear()
  })

  return {
    pendingAttachments,
    attachPreviewProps,
    attachOpenLabel,
    addFiles,
    removeAttachment,
    isDragover,
    onPaste,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop
  }
}
