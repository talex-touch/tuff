import type { Ref } from 'vue'
import type { IBoxOptions } from '..'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { onBeforeUnmount } from 'vue'

type BoxOptionsWithInputVisibility = IBoxOptions & { inputVisible?: boolean }

export function useChannel(
  boxOptions: BoxOptionsWithInputVisibility,
  searchVal?: Ref<string>
): void {
  const transport = useTuffTransport()

  const unregSetVisibility = transport.on(CoreBoxEvents.input.setVisibility, ({ visible }) => {
    if (boxOptions) {
      boxOptions.inputVisible = visible
    }
  })

  const unregRequestValue = transport.on(CoreBoxEvents.input.requestValue, () => {
    const input = searchVal?.value || ''
    return { input }
  })

  onBeforeUnmount(() => {
    unregSetVisibility()
    unregRequestValue()
  })
}
