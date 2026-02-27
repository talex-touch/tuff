import type { TuffQuery } from '@talex-touch/utils'
import type { CoreBoxInputChangeRequest } from '@talex-touch/utils/transport/events/types'
import { createLogger } from '../../../utils/logger'
import pluginFeaturesAdapter from '../../plugin/adapters/plugin-features-adapter'
import { windowManager } from './window'

const coreBoxInputForwardingLog = createLogger('CoreBox').child('InputForwarding')

function buildFallbackQuery(input: string): TuffQuery {
  return {
    text: input,
    inputs: []
  }
}

class CoreBoxInputForwarding {
  private static instance: CoreBoxInputForwarding

  public static getInstance(): CoreBoxInputForwarding {
    if (!CoreBoxInputForwarding.instance) {
      CoreBoxInputForwarding.instance = new CoreBoxInputForwarding()
    }
    return CoreBoxInputForwarding.instance
  }

  public normalize(payload: Partial<CoreBoxInputChangeRequest>): CoreBoxInputChangeRequest {
    const input = payload.input ?? payload.query?.text ?? ''
    const query = payload.query
      ? {
          ...payload.query,
          text: payload.query.text ?? input
        }
      : buildFallbackQuery(input)

    return {
      input,
      query,
      source: payload.source ?? 'renderer'
    }
  }

  public async forward(payload: CoreBoxInputChangeRequest): Promise<boolean> {
    coreBoxInputForwardingLog.debug('Forwarding CoreBox input payload', {
      meta: {
        source: payload.source,
        inputLength: payload.input.length,
        hasInputs: Boolean(payload.query.inputs?.length)
      }
    })

    windowManager.forwardInputChange(payload)
    return pluginFeaturesAdapter.handleActiveFeatureInput(payload)
  }
}

export const coreBoxInputForwarding = CoreBoxInputForwarding.getInstance()
