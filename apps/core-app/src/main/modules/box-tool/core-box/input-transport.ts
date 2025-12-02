import type { TuffQuery } from '@talex-touch/utils'
import type { TouchApp } from '../../../core/touch-app'
import { ChannelType } from '@talex-touch/utils/channel'
import { genTouchApp } from '../../../core'
import { createLogger } from '../../../utils/logger'
import pluginFeaturesAdapter from '../../plugin/adapters/plugin-features-adapter'
import { windowManager } from './window'

export interface CoreBoxInputChange {
  input?: string
  query?: TuffQuery
  source?: 'renderer'
}

const coreBoxInputLog = createLogger('CoreBox').child('InputTransport')

class CoreBoxInputTransport {
  private static instance: CoreBoxInputTransport
  private _touchApp: TouchApp | null = null

  private get touchApp(): TouchApp {
    if (!this._touchApp) {
      this._touchApp = genTouchApp()
    }
    return this._touchApp
  }

  public static getInstance(): CoreBoxInputTransport {
    if (!CoreBoxInputTransport.instance) {
      CoreBoxInputTransport.instance = new CoreBoxInputTransport()
    }
    return CoreBoxInputTransport.instance
  }

  public register(): void {
    this.touchApp.channel.regChannel(ChannelType.MAIN, 'core-box:input-change', ({ data }) => {
      this.handleRendererInput(data as CoreBoxInputChange)
    })
  }

  private handleRendererInput(payload: CoreBoxInputChange): void {
    const query = this.normalizeQuery(payload)

    coreBoxInputLog.debug('Dispatching input change', {
      text: query.text,
      hasInputs: Boolean(query.inputs?.length),
    })

    windowManager.forwardInputChange({
      input: query.text,
      query,
      source: 'renderer',
    })

    pluginFeaturesAdapter.handleActiveFeatureInput(query)
  }

  private normalizeQuery(payload: CoreBoxInputChange): TuffQuery {
    if (payload.query) {
      return payload.query
    }

    return {
      text: payload.input ?? '',
      inputs: [],
    }
  }
}

export const coreBoxInputTransport = CoreBoxInputTransport.getInstance()
