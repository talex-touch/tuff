import { h } from 'vue'
import { touchChannel } from '../channel/channel-core'
import { blowMention, popperMention } from '../mention/dialog-mention'
import PluginApplyInstall from '~/components/plugin/action/mention/PluginApplyInstall.vue'

const bufferCache = new Map<string, Buffer>()

export function getBufferedFile(name: string): Buffer | undefined {
  return bufferCache.get(name)
}

export function clearBufferedFile(name: string): void {
  bufferCache.delete(name)
}

async function handlePluginDrop(file: File): Promise<boolean> {
  console.log('[DropperResolver] Handling dropped file:', file)

  if (file.name.endsWith('.touch-plugin')) {
    console.warn('[DropperResolver] Deprecated plugin format: .touch-plugin')
    await blowMention('Fatal Error', 'Sorry, the plugin is deprecated, we only support .tpex now.')
    return true
  }

  if (file.name.endsWith('.tpex')) {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    console.log(`[DropperResolver] Resolving .tpex plugin: ${file.name}`)

    // Cache the buffer before sending it to the main process
    bufferCache.set(file.name, buffer)

    const data = touchChannel.sendSync('drop:plugin', {
      name: file.name,
      buffer: buffer,
      size: file.size
    })

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
      console.log('[DropperResolver] Plugin manifest resolved:', manifest)
      await popperMention(manifest.name, () => {
        return h(PluginApplyInstall, { manifest, path, fileName: file.name })
      })
    }
    return true
  }

  return false
}

function parseFile(file: File): any {
  return {
    lastModified: file.lastModified,
    name: file.name,
    path: file['path'],
    size: file.size,
    type: file.type
  }
}

export function useDropperResolver(): void {
  document.addEventListener('drop', async (e) => {
    e.preventDefault()
    console.log('[DropperResolver] Drop event detected.', e)

    const files = e.dataTransfer?.files
    if (!files || files.length === 0) {
      console.log('[DropperResolver] No files dropped.')
      return
    }

    console.log(`[DropperResolver] ${files.length} file(s) dropped.`)

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

    console.log('[DropperResolver] Sending drop event to main process.', option)
    touchChannel.send('drop', option)
  })

  document.addEventListener('dragover', (e) => {
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
  })
}
