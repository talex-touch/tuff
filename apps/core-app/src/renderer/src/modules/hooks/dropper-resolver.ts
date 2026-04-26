import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { TxLoadingOverlay } from '@talex-touch/tuffex'
import { hasDocument } from '@talex-touch/utils/env'
import { h, render } from 'vue'
import PluginApplyInstall from '~/components/plugin/action/mention/PluginApplyInstall.vue'
import { resolvePluginApplyInstallErrorMessage } from '~/components/plugin/action/mention/plugin-apply-install-utils'
import { useI18nText } from '~/modules/lang'
import { blowMention, popperMention } from '../mention/dialog-mention'

const bufferCache = new Map<string, Buffer>()
const transport = useTuffTransport()
const { t } = useI18nText()
type DropPluginManifest = { name: string; [key: string]: unknown }
type DropPluginRequest = { name: string; buffer: Buffer; size: number }
type DropPluginResponse =
  | { status: 'error'; msg: string }
  | { status: 'success'; manifest: DropPluginManifest; path: string }
type DropFileInfo = { lastModified: number; name: string; size: number; type: string }
type DropEventPayload = {
  shift: boolean
  ctrl: boolean
  alt: boolean
  meta: boolean
  pageX: number
  pageY: number
  composed: boolean
  timeStamp: number
  type: string
  x: number
  y: number
  data: {
    files: DropFileInfo[]
    types: readonly string[]
  }
}

const dropPluginEvent = defineRawEvent<DropPluginRequest, DropPluginResponse>('drop:plugin')
const dropEvent = defineRawEvent<DropEventPayload, void>('drop')

function createLoadingOverlay(text: string) {
  if (!hasDocument()) {
    return { close: () => {} }
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const vnode = h(TxLoadingOverlay, {
    loading: true,
    fullscreen: true,
    text,
    background: 'rgba(0, 0, 0, 0.7)'
  })
  render(vnode, container)
  return {
    close: () => {
      render(null, container)
      container.remove()
    }
  }
}

export function getBufferedFile(name: string): Buffer | undefined {
  return bufferCache.get(name)
}

export function clearBufferedFile(name: string): void {
  bufferCache.delete(name)
}

async function handlePluginDrop(file: File): Promise<boolean> {
  if (!file.name.endsWith('.tpex')) {
    await blowMention(
      t('plugin.dropInstall.errorTitle'),
      t('plugin.dropInstall.unsupportedExtension')
    )
    return true
  }

  if (file.name.endsWith('.tpex')) {
    const loadingInstance = createLoadingOverlay(t('plugin.dropInstall.parsing'))

    try {
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Cache the buffer before sending it to the main process
      bufferCache.set(file.name, buffer)

      const data = await transport.send(dropPluginEvent, {
        name: file.name,
        buffer,
        size: file.size
      })

      loadingInstance.close()

      if (data.status === 'error') {
        console.error(`[DropperResolver] Error resolving plugin: ${data.msg}`)
        // Clear cache on error
        clearBufferedFile(file.name)
        await blowMention(
          t('plugin.dropInstall.errorTitle'),
          resolvePluginApplyInstallErrorMessage(data.msg, t)
        )
      } else {
        const { manifest, path } = data
        await popperMention(manifest.name, () => {
          return h(PluginApplyInstall, { manifest, path, fileName: file.name })
        })
      }
    } catch (error) {
      loadingInstance.close()
      console.error('[DropperResolver] Failed to process TPEX file:', error)
      clearBufferedFile(file.name)
      await blowMention(t('plugin.dropInstall.errorTitle'), t('plugin.dropInstall.readFailed'))
    }
    return true
  }

  return false
}

function parseFile(file: File): DropFileInfo {
  return {
    lastModified: file.lastModified,
    name: file.name,
    // path: file.path,
    size: file.size,
    type: file.type
  }
}

export function useDropperResolver(): void {
  document.addEventListener('drop', async (e) => {
    e.preventDefault()
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) {
      return
    }

    if (files.length === 1) {
      const file = files[0]
      if (file) {
        await handlePluginDrop(file)
        return
      }
    }

    const option = {
      shift: e.shiftKey,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      meta: e.metaKey,
      pageX: e.pageX,
      pageY: e.pageY,
      composed: e.composed,
      timeStamp: e.timeStamp,
      type: e.type,
      x: e.x,
      y: e.y,
      data: {
        files: [...files].map(parseFile),
        types: e.dataTransfer!.types
      }
    }

    transport.send(dropEvent, option).catch(() => {})
  })

  document.addEventListener('dragover', (e) => {
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
  })
}
