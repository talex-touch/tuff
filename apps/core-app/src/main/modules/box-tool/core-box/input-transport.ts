import type { CoreBoxInputChangeRequest } from '@talex-touch/utils/transport/events/types'
import { ChannelType } from '@talex-touch/utils/channel'
import { createLogger } from '../../../utils/logger'
import { coreBoxTransport } from './transport/core-box-transport'
import { coreBoxInputForwarding } from './input-forwarding'

const coreBoxInputLog = createLogger('CoreBox').child('InputTransport')

class CoreBoxInputTransport {
  private static instance: CoreBoxInputTransport

  public static getInstance(): CoreBoxInputTransport {
    if (!CoreBoxInputTransport.instance) {
      CoreBoxInputTransport.instance = new CoreBoxInputTransport()
    }
    return CoreBoxInputTransport.instance
  }

  public register(): void {
    coreBoxTransport.register<CoreBoxInputChangeRequest>(
      ChannelType.MAIN,
      'core-box:input-change',
      (data) => {
        this.handleRendererInput(data)
      }
    )
  }

  private handleRendererInput(payload: CoreBoxInputChangeRequest): void {
    const normalized = coreBoxInputForwarding.normalize(payload)

    coreBoxInputLog.debug('Dispatching input change', {
      meta: {
        source: normalized.source,
        text: normalized.query.text,
        hasInputs: Boolean(normalized.query.inputs?.length)
      }
    })

    void coreBoxInputForwarding.forward(normalized)
  }
}

export const coreBoxInputTransport = CoreBoxInputTransport.getInstance()
