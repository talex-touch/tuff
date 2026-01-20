import type {
  IService,
  IServiceCenter,
  IServiceEvent,
  IServiceHandler
} from '@talex-touch/utils/service'
import type { TalexTouch } from '../types'
import path from 'node:path'
import { suffix2Service } from '@talex-touch/utils/service/protocol'
import { getTuffTransportMain } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { dialog } from 'electron'
import fse from 'fs-extra'
import { TalexEvents, touchEventBus } from '../core/eventbus/touch-event'
import './protocol-handler'

class ServiceCenter implements IServiceCenter {
  rootPath: string

  serviceMap: Map<string, IServiceHandler> = new Map()

  constructor(rootPath: string) {
    this.rootPath = rootPath
  }

  /**
   * Unsafe method, please use regService instead
   */
  regServiceBySymbolStr(symbol: string, handler: IServiceHandler): void {
    this.serviceMap.set(symbol, handler)
  }

  regService(service: IService, handler: IServiceHandler): boolean {
    // if (this.hasService(service)) return false;

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
    return /* this.serviceMap.has(symbol) &&  */ !!this.serviceMap.get(symbol)?.pluginScope
  }

  getPerPath(serviceID: string) {
    return path.join(this.rootPath, `${serviceID}.json`)
  }

  async save() {
    const promises = new Array<Function>()
    this.serviceMap.forEach((handler, service) =>
      promises.push(() => {
        fse.writeJSONSync(
          this.getPerPath(service),
          JSON.stringify({
            pluginScope: handler.pluginScope,
            service
          })
        )
      })
    )

    await Promise.all(promises)
  }
}

let serviceCenter: ServiceCenter

const serviceRegisterEvent = defineRawEvent<{ service: string }, boolean>('service:reg')
const serviceUnregisterEvent = defineRawEvent<{ service: string }, boolean>('service:unreg')
const serviceHandleEvent = defineRawEvent<{ data: any }, any>('service:handle')

export function genServiceCenter(rootPath?: string): IServiceCenter {
  if (!serviceCenter) {
    serviceCenter = new ServiceCenter(rootPath!)
  }

  return serviceCenter
}

export default {
  name: Symbol('ServiceCenter'),
  filePath: 'services',
  listeners: new Array<Function>(),
  transport: null as ReturnType<typeof getTuffTransportMain> | null,
  modulePath: undefined as any,
  init(ctx: any) {
    const channel = ctx.app.channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    this.transport = getTuffTransportMain(channel as any, keyManager as any)
    this.modulePath = ctx.file?.dirPath

    touchEventBus.on(TalexEvents.APP_SECONDARY_LAUNCH, (event: any) => {
      // AppSecondaryLaunch
      const { argv } = event

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
              'Error',
              `The type ${extName} has no plugin to handle, please install in plugin market!`
            )
            return
          }

          console.log('[service] File ext protocol', service)

          serviceCenter.useService(service, {
            path: arg,
            type: 'file',
            name: path.basename(arg),
            extName,
            service
          })
        } else {
          // Folder not support
          dialog.showErrorBox('Error', 'Folder not support yet!')
        }
      })
    })

    const perPath = this.modulePath

    genServiceCenter(perPath)

    const transport = this.transport
    if (!transport) return

    this.listeners.push(
      transport.on(serviceRegisterEvent, async (payload, context) => {
        const { service } = payload || {}
        const plugin = context.plugin?.name

        if (!service || !plugin) return false

        if (serviceCenter.hasServiceBySymbolStr(service)) return false

        console.log(`[Service] Plugin register service as ${service}`)

        serviceCenter.regServiceBySymbolStr(service, {
          pluginScope: plugin,
          async handle(event, _data) {
            console.log(`[Service] Plugin ${plugin} handle service: ${service}`, event, _data)
            const data = {
              ..._data,
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

    this.listeners.push(
      transport.on(serviceUnregisterEvent, (payload, context) => {
        const { service } = payload || {}
        const plugin = context.plugin?.name

        if (!service || !plugin) return false

        if (!serviceCenter.hasServiceBySymbolStr(service)) return false

        serviceCenter.unRegService(service)
        return true
      })
    )
  },
  destroy() {
    this.listeners.forEach((listener) => listener())

    serviceCenter.save()
  }
} as any as TalexTouch.IModule<TalexEvents>
