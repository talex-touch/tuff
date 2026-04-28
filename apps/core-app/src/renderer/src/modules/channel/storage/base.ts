import { initializeRendererStorage } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'

const transport = useTuffTransport()

initializeRendererStorage(transport)
