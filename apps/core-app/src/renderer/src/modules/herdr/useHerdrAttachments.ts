import type { AiAttachment } from '@talex-touch/tuffex/ai-elements'
import type { HerdrTerminalPutResult } from '@talex-touch/utils/transport/sdk/domains/herdr'
import type { Ref } from 'vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import {
  fileToHerdrBase64,
  HERDR_ATTACHMENT_TOO_LARGE_CODE,
  sanitizeHerdrUploadName
} from './herdr-conversation-adapter'

export interface UseHerdrAttachmentsOptions {
  address: Ref<string>
  isActive: () => boolean
  canUpload: () => boolean
  putFile: (terminal: string, name: string, dataBase64: string) => Promise<HerdrTerminalPutResult>
  focusInput: () => void
}

type StagedUploadOutcome =
  | { status: 'ready'; path: string }
  | { status: 'cancelled' }
  | { status: 'failed' }

interface StagedHerdrUpload {
  id: string
  path: string | null
  promise: Promise<StagedUploadOutcome>
}

export interface ResolvedHerdrAttachments {
  paths: string[]
  ids: string[]
  failed: boolean
}

/**
 * Stages files picked, pasted, or dropped into the Herdr composer via `herdr.put(terminal, name, base64)`.
 * Keeps `TxAttachmentTray` preview thumbnails and upload progress in sync, revokes object URLs cleanly,
 * and returns the staged terminal file paths ready to include in the sent prompt.
 */
export function useHerdrAttachments(options: UseHerdrAttachmentsOptions) {
  const { t } = useI18n()

  const pendingAttachments = ref<AiAttachment[]>([])
  const uploadsById = new Map<string, StagedHerdrUpload>()
  const objectUrls = new Set<string>()
  let generation = 0

  const isUploading = computed(() => pendingAttachments.value.some((item) => item.uploading))

  function revokeAllObjectUrls(): void {
    for (const url of objectUrls) {
      URL.revokeObjectURL(url)
    }
    objectUrls.clear()
  }

  function clearAttachments(): void {
    generation += 1
    uploadsById.clear()
    pendingAttachments.value = []
    revokeAllObjectUrls()
  }

  function removeAttachment(id: string): void {
    const target = pendingAttachments.value.find((item) => item.id === id)
    if (target?.kind === 'image' && objectUrls.delete(target.url)) {
      URL.revokeObjectURL(target.url)
    }
    uploadsById.delete(id)
    pendingAttachments.value = pendingAttachments.value.filter((item) => item.id !== id)
  }

  function toPendingAttachment(file: File, id: string): AiAttachment {
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      objectUrls.add(url)
      return { kind: 'image', id, url, name: file.name, uploading: true }
    }
    return {
      kind: 'file',
      id,
      name: file.name,
      size: file.size,
      mime: file.type,
      uploading: true
    }
  }

  function addFiles(files: File[]): void {
    if (files.length === 0) return
    const targetAddress = options.address.value.trim()
    if (!targetAddress || !options.canUpload()) {
      toast.error(t('herdr.stage.attachSessionOffline'))
      return
    }

    const activeGen = generation
    for (const file of files) {
      const id = crypto.randomUUID()
      const attachment = toPendingAttachment(file, id)
      pendingAttachments.value = [...pendingAttachments.value, attachment]

      const safeName = sanitizeHerdrUploadName(file.name)
      const entry: StagedHerdrUpload = {
        id,
        path: null,
        promise: Promise.resolve({ status: 'cancelled' })
      }
      uploadsById.set(id, entry)
      entry.promise = (async (): Promise<StagedUploadOutcome> => {
        try {
          const base64 = await fileToHerdrBase64(file)
          const result = await options.putFile(targetAddress, safeName, base64)
          if (activeGen !== generation || !uploadsById.has(id)) {
            return { status: 'cancelled' }
          }
          entry.path = result.path
          pendingAttachments.value = pendingAttachments.value.map((item) =>
            item.id === id ? { ...item, uploading: false } : item
          )
          return { status: 'ready', path: result.path }
        } catch (error) {
          if (activeGen === generation && uploadsById.has(id)) {
            removeAttachment(id)
            const code = (error as { code?: string } | null)?.code
            if (code === HERDR_ATTACHMENT_TOO_LARGE_CODE) {
              toast.error(t('herdr.stage.attachTooLarge', { name: file.name }))
            } else {
              const detail = error instanceof Error ? error.message : String(error)
              toast.error(t('herdr.stage.attachFailed', { name: file.name, error: detail }))
            }
            return { status: 'failed' }
          }
          return { status: 'cancelled' }
        }
      })()
    }
  }

  async function resolveStagedPaths(): Promise<ResolvedHerdrAttachments> {
    const activeGen = generation
    const snapshotEntries = pendingAttachments.value
      .map((item) => uploadsById.get(item.id))
      .filter((entry): entry is StagedHerdrUpload => Boolean(entry))

    const outcomes = await Promise.all(
      snapshotEntries.map(async (entry) => ({
        entry,
        outcome: entry.path ? ({ status: 'ready', path: entry.path } as const) : await entry.promise
      }))
    )

    if (activeGen !== generation) {
      return { paths: [], ids: [], failed: true }
    }

    if (outcomes.some((item) => item.outcome.status === 'failed')) {
      return { paths: [], ids: [], failed: true }
    }

    const paths: string[] = []
    const ids: string[] = []
    for (const { entry, outcome } of outcomes) {
      // Re-check membership after all awaits so items removed during wait are excluded.
      if (outcome.status === 'ready' && uploadsById.get(entry.id) === entry) {
        paths.push(outcome.path)
        ids.push(entry.id)
      }
    }
    return { paths, ids, failed: false }
  }

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
    event.preventDefault()
    addFiles(files)
  }

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

  watch(options.address, () => {
    clearAttachments()
  })

  onBeforeUnmount(() => {
    window.removeEventListener('paste', onPagePaste)
    clearAttachments()
  })

  return {
    pendingAttachments,
    isUploading,
    attachPreviewProps,
    attachOpenLabel,
    addFiles,
    removeAttachment,
    clearAttachments,
    resolveStagedPaths,
    isDragover,
    onPaste,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop
  }
}
