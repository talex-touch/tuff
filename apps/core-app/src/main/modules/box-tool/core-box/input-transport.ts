import type { TuffQuery } from '@talex-touch/utils'
import { ChannelType } from '@talex-touch/utils/channel'
import { createLogger } from '../../../utils/logger'
import pluginFeaturesAdapter from '../../plugin/adapters/plugin-features-adapter'
import { coreBoxTransport } from './transport/core-box-transport'
import { windowManager } from './window'

export interface CoreBoxInputChange {
  input?: string
  query?: TuffQuery
  source?: 'renderer' | 'initial' | 'ui-monitor'
}

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
    coreBoxTransport.register<CoreBoxInputChange>(
      ChannelType.MAIN,
      'core-box:input-change',
      (data) => {
        this.handleRendererInput(data)
      }
    )
  }

  private handleRendererInput(payload: CoreBoxInputChange): void {
    const query = this.normalizeQuery(payload)

    coreBoxInputLog.debug('Dispatching input change', {
      meta: {
        text: query.text,
        hasInputs: Boolean(query.inputs?.length)
      }
    })

    windowManager.forwardInputChange({
      input: query.text,
      query,
      source: 'renderer'
    })

    pluginFeaturesAdapter.handleActiveFeatureInput(query)
  }

  private normalizeQuery(payload: CoreBoxInputChange): TuffQuery {
    if (payload.query) {
      return payload.query
    }

    return {
      text: payload.input ?? '',
      inputs: []
    }
  }
}

export const coreBoxInputTransport = CoreBoxInputTransport.getInstance()
