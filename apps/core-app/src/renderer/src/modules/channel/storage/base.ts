import type { IStorageChannel } from '@talex-touch/utils/renderer/storage'
import {
  initStorageChannel,
  initStorageTransport,
  tryUseChannel
} from '@talex-touch/utils/renderer'
import { initStorageSubscription } from '@talex-touch/utils/renderer/storage/storage-subscription'
import { useTuffTransport } from '@talex-touch/utils/transport'

const transport = useTuffTransport()
const channel = tryUseChannel()

initStorageTransport(transport)
const hasStorageChannel = (value: typeof channel): boolean =>
  !!value && typeof value.sendSync === 'function' && typeof value.unRegChannel === 'function'

if (hasStorageChannel(channel)) {
  initStorageChannel(channel as IStorageChannel)
  initStorageSubscription(channel as IStorageChannel, transport)
}
