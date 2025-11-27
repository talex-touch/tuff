import { initStorageChannel } from '@talex-touch/utils/renderer'
import { initStorageSubscription } from '@talex-touch/utils/renderer/storage/storage-subscription'
import { touchChannel } from '~/modules/channel/channel-core'

initStorageChannel(touchChannel)
initStorageSubscription(touchChannel)
