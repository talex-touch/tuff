import { ElLoading } from 'element-plus'
import { h } from 'vue'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import PluginApplyInstall from '~/components/plugin/action/mention/PluginApplyInstall.vue'
import { blowMention, popperMention } from '../mention/dialog-mention'

const bufferCache = new Map<string, Buffer>()
const transport = useTuffTransport()
const dropPluginEvent = defineRawEvent<any, any>('drop:plugin')
const dropEvent = defineRawEvent<any, void>('drop')

export function getBufferedFile(name: string): Buffer | undefined {
  return bufferCache.get(name)
}

export function clearBufferedFile(name: string): void {
  bufferCache.delete(name)
}

async function handlePluginDrop(file: File): Promise<boolean> {
  if (file.name.endsWith('.touch-plugin')) {
    await blowMention('Fatal Error', 'Sorry, the plugin is deprecated, we only support .tpex now.')
    return true
  }

  if (file.name.endsWith('.tpex')) {
    const loadingInstance = ElLoading.service({
      lock: true,
      text: 'Parsing plugin package...',
      background: 'rgba(0, 0, 0, 0.7)'
    })

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
        if (data.msg === '10091') {
          await blowMention('Install Error', 'The plugin has been irreversibly damaged!')
        } else if (data.msg === '10092') {
          await blowMention('Install Error', 'Unable to identify the file!')
        } else {
          await blowMention('Install Error', `An unknown error occurred: ${data.msg}`)
        }
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
      await blowMention('Install Error', 'Failed to read plugin file. Please try again.')
    }
    return true
  }

  return false
}

function parseFile(file: File): any {
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
