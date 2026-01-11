import { initStorageChannel, initStorageTransport } from '@talex-touch/utils/renderer'
import { initStorageSubscription } from '@talex-touch/utils/renderer/storage/storage-subscription'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { touchChannel } from '~/modules/channel/channel-core'

const transport = useTuffTransport()

initStorageChannel(touchChannel)
initStorageTransport(transport)
initStorageSubscription(touchChannel, transport)
