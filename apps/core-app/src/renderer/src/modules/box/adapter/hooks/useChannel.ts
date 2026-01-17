import type { Ref } from 'vue'
import type { StandardChannelData } from '@talex-touch/utils/channel'
import { DataCode } from '@talex-touch/utils'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { touchChannel } from '~/modules/channel/channel-core'
import type { IBoxOptions } from '..'

type BoxOptionsWithInputVisibility = IBoxOptions & { inputVisible?: boolean }

export function useChannel(
  boxOptions: BoxOptionsWithInputVisibility,
  searchVal?: Ref<string>
): void {
  const transport = useTuffTransport()

  touchChannel.regChannel('core-box:set-input-visibility', ({ data }: StandardChannelData) => {
    const visible = (data as { visible?: unknown } | null | undefined)?.visible === true
    if (boxOptions) {
      boxOptions.inputVisible = visible
    }
  })

  transport.on(CoreBoxEvents.input.setVisibility, ({ visible }) => {
    if (boxOptions) {
      boxOptions.inputVisible = visible
    }
  })

  touchChannel.regChannel('core-box:request-input-value', ({ reply }: StandardChannelData) => {
    const input = searchVal?.value || ''
    reply(DataCode.SUCCESS, { input })
  })

  transport.on(CoreBoxEvents.input.requestValue, () => {
    const input = searchVal?.value || ''
    return { input }
  })
}
