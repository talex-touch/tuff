import type { IStorageChannel } from '@talex-touch/utils/renderer/storage'
import { initStorageChannel, initStorageTransport, useChannel } from '@talex-touch/utils/renderer'
import { initStorageSubscription } from '@talex-touch/utils/renderer/storage/storage-subscription'
import { useTuffTransport } from '@talex-touch/utils/transport'

const transport = useTuffTransport()
const channel = resolveStorageChannel()

function hasStorageChannel(value: typeof channel): boolean {
  return !!value && typeof value.send === 'function' && typeof value.unRegChannel === 'function'
}

if (hasStorageChannel(channel)) {
  initStorageTransport(transport)
  initStorageChannel(channel as IStorageChannel)
  initStorageSubscription(channel as IStorageChannel, transport)
}

function resolveStorageChannel(): IStorageChannel | null {
  try {
    const resolved = useChannel()
    if (typeof resolved.send === 'function' && typeof resolved.unRegChannel === 'function') {
      return resolved as IStorageChannel
    }
  } catch {
    // Storage bootstrap can run before TouchChannel injection.
  }
  return null
}
