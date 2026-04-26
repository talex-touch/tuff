import type {
  IService,
  IServiceCenter,
  IServiceEvent,
  IServiceHandler
} from '@talex-touch/utils/service'
import type { ModuleInitContext } from '@talex-touch/utils'
import type { TalexTouch } from '../types'
import path from 'node:path'
import { suffix2Service } from '@talex-touch/utils/service/protocol'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { dialog } from 'electron'
import fse from 'fs-extra'
import { TalexEvents, touchEventBus, type AppSecondaryLaunch } from '../core/eventbus/touch-event'
import { createLogger } from '../utils/logger'
import './protocol-handler'

const serviceLog = createLogger('ServiceCenter')

class ServiceCenter implements IServiceCenter {
  serviceMap: Map<string, IServiceHandler> = new Map()

  /**
   * Unsafe method, please use regService instead
   */
  regServiceBySymbolStr(symbol: string, handler: IServiceHandler): void {
    this.serviceMap.set(symbol, handler)
  }

  regService(service: IService, handler: IServiceHandler): boolean {
    this.serviceMap.set(service.id.description!, handler)
    return true
  }

  unRegService(service: IService): boolean {
    if (!this.hasService(service)) return false

    this.serviceMap.delete(service.id.description!)
    return true
  }

  /**
   * Unsafe method, please use unRegService instead
   */
  unRegServiceBySymbolStr(symbol: string) {
    this.serviceMap.delete(symbol)
  }

  useService(service: IService, data: object): boolean | Promise<boolean> {
    const handler = this.serviceMap.get(service.name)

    if (!handler) return false

    let cancelled = false

    const event: IServiceEvent = {
      service,
      setCancelled(_cancelled: boolean) {
        cancelled = _cancelled
      },
      isCancelled() {
        return cancelled
      }
    }

    return handler.handle(event, data)
  }

  hasService(service: IService): boolean {
    return this.serviceMap.has(service.id.description!)
  }

  hasServiceBySymbolStr(symbol: string): boolean {
    return !!this.serviceMap.get(symbol)?.pluginScope
  }
}

let serviceCenter: ServiceCenter

const serviceRegisterEvent = defineRawEvent<{ service: string }, boolean>('service:reg')
const serviceUnregisterEvent = defineRawEvent<{ service: string }, boolean>('service:unreg')
const serviceHandleEvent = defineRawEvent<{ data: Record<string, unknown> }, unknown>(
  'service:handle'
)

type ServiceCenterModuleState = {
  transport: ReturnType<typeof getTuffTransportMain> | null
  listeners: Array<() => void>
}

export function genServiceCenter(): IServiceCenter {
  if (!serviceCenter) {
    serviceCenter = new ServiceCenter()
  }

  return serviceCenter
}

export default {
  name: Symbol('ServiceCenter'),
  listeners: [] as Array<() => void>,
  transport: null as ReturnType<typeof getTuffTransportMain> | null,
  init(ctx: ModuleInitContext<TalexEvents>) {
    const channel = (ctx.app as { channel?: unknown } | null | undefined)?.channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    const moduleState = this as unknown as ServiceCenterModuleState
    moduleState.transport = getTuffTransportMain(channel, keyManager)

    touchEventBus.on(TalexEvents.APP_SECONDARY_LAUNCH, (event) => {
      // AppSecondaryLaunch
      const { argv } = event as AppSecondaryLaunch

      const arr = argv.slice(1)
      if (arr.length === 0) return

      // check each arg (if path)
      arr.forEach((arg) => {
        if (!path.isAbsolute(arg)) return

        if (!fse.pathExistsSync(arg)) return

        if (fse.statSync(arg).isFile()) {
          let extName = path.extname(arg)

          if (extName.startsWith('.')) {
            extName = extName.slice(1)
          }

          const service = suffix2Service(extName)

          if (!service) {
            dialog.showErrorBox(
              'Unsupported File Type',
              `No plugin is registered to handle ".${extName}" files. Install a compatible plugin from the plugin store.`
            )
            return
          }

          serviceLog.info('Dispatching secondary-launch file to plugin service', {
            meta: {
              extName,
              serviceName: service.name
            }
          })

          serviceCenter.useService(service, {
            path: arg,
            type: 'file',
            name: path.basename(arg),
            extName,
            service
          })
        } else {
          dialog.showErrorBox(
            'Unsupported Input',
            'Folder input is not supported by plugin services.'
          )
        }
      })
    })

    genServiceCenter()

    const transport = moduleState.transport
    if (!transport) return

    moduleState.listeners.push(
      transport.on(serviceRegisterEvent, async (payload, context) => {
        const { service } = payload || {}
        const plugin = context.plugin?.name

        if (!service || !plugin) return false

        if (serviceCenter.hasServiceBySymbolStr(service)) return false

        serviceLog.info('Plugin registered service', {
          meta: {
            plugin,
            service
          }
        })

        serviceCenter.regServiceBySymbolStr(service, {
          pluginScope: plugin,
          async handle(event, _data) {
            serviceLog.debug('Forwarding service event to plugin', {
              meta: {
                plugin,
                service,
                serviceName: event.service.name
              }
            })
            const data = {
              ...(_data as Record<string, unknown>),
              service: event.service.name
            }

            const res = await transport.sendToPlugin(plugin, serviceHandleEvent, { data })
            event.setCancelled(res === true)
            return res
          }
        })

        return true
      })
    )

    moduleState.listeners.push(
      transport.on(serviceUnregisterEvent, (payload, context) => {
        const { service } = payload || {}
        const plugin = context.plugin?.name

        if (!service || !plugin) return false

        if (!serviceCenter.hasServiceBySymbolStr(service)) return false

        serviceCenter.unRegServiceBySymbolStr(service)
        return true
      })
    )
  },
  destroy() {
    const moduleState = this as unknown as ServiceCenterModuleState
    moduleState.listeners.forEach((listener) => listener())
  }
} as TalexTouch.IModule<TalexEvents>
