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

  const handleSetVisibility = ({ visible }: { visible: boolean }) => {
    if (boxOptions) {
      boxOptions.inputVisible = visible
    }
  }

  const handleRequestValue = () => {
    const input = searchVal?.value || ''
    return { input }
  }

  const unregSetVisibility = transport.on(CoreBoxEvents.input.setVisibility, handleSetVisibility)

  const unregRequestValue = transport.on(CoreBoxEvents.input.requestValue, handleRequestValue)

  onBeforeUnmount(() => {
    unregSetVisibility()
    unregRequestValue()
  })
}
