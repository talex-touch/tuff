import type { ComputedRef } from 'vue'
import { watch } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { openers } from '~/modules/channel/storage'

interface RemoteOpener {
  bundleId: string
  name: string
  logo: string
  path?: string
  lastResolvedAt?: string
}

const pendingResolutions = new Map<string, Promise<void>>()

async function requestOpener(extension: string): Promise<void> {
  const normalized = extension.replace(/^\./, '').toLowerCase()
  if (!normalized || openers[normalized]) {
    return
  }

  if (pendingResolutions.has(normalized)) {
    return pendingResolutions.get(normalized)!
  }

  const promise = touchChannel
    .send('openers:resolve', { extension: normalized })
    .then((result: RemoteOpener | null) => {
      if (result && typeof result === 'object') {
        openers[normalized] = {
          bundleId: result.bundleId,
          name: result.name,
          logo: result.logo,
          path: result.path,
          lastResolvedAt: result.lastResolvedAt,
        }
      }
    })
    .catch((error) => {
      console.error(`[Openers] Failed to resolve opener for .${normalized}`, error)
    })
    .finally(() => {
      pendingResolutions.delete(normalized)
    })

  pendingResolutions.set(normalized, promise)
  return promise
}

export function useOpenerAutoResolve(extension: ComputedRef<string | null | undefined>): void {
  watch(
    extension,
    (ext) => {
      if (!ext)
        return
      void requestOpener(ext)
    },
    { immediate: true },
  )
}

export function getOpenerByExtension(extension?: string | null): RemoteOpener | undefined {
  if (!extension)
    return undefined
  const normalized = extension.replace(/^\./, '').toLowerCase()
  return openers[normalized] as RemoteOpener | undefined
}
