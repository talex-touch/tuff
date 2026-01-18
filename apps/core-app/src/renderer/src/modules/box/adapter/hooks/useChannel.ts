import type { Ref } from 'vue'
import type { IBoxOptions } from '..'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'

type BoxOptionsWithInputVisibility = IBoxOptions & { inputVisible?: boolean }

export function useChannel(
  boxOptions: BoxOptionsWithInputVisibility,
  searchVal?: Ref<string>
): void {
  const transport = useTuffTransport()

  transport.on(CoreBoxEvents.input.setVisibility, ({ visible }) => {
    if (boxOptions) {
      boxOptions.inputVisible = visible
    }
  })

  transport.on(CoreBoxEvents.input.requestValue, () => {
    const input = searchVal?.value || ''
    return { input }
  })
}
