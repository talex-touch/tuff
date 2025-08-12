import fse from "fs-extra";
import path from "path";
import { TalexTouch } from "../types";
import type { IService, IServiceCenter, IServiceEvent, IServiceHandler } from "@talex-touch/utils/service";
import { ChannelType } from '@talex-touch/utils/channel';
import { TalexEvents, touchEventBus } from "../core/eventbus/touch-event";
import { suffix2Service } from '@talex-touch/utils/service/protocol'
import { dialog } from "electron";
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
    if (!this.hasService(service)) return false;

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

    if (!handler) return false;

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
    return /* this.serviceMap.has(symbol) &&  */!!this.serviceMap.get(symbol)?.pluginScope
  }

  getPerPath(serviceID: string) {
    return path.join(this.rootPath, serviceID + ".json")
  }

  async save() {
    const promises = new Array<Function>()
    this.serviceMap.forEach((handler, service) => promises.push(() => {

      fse.writeJSONSync(this.getPerPath(service), JSON.stringify({
        pluginScope: handler.pluginScope,
        service: service
      }))
    }))

    await Promise.all(promises)
  }
}

let serviceCenter: ServiceCenter

export function genServiceCenter(rootPath?: string): IServiceCenter {
  if (!serviceCenter) {
    serviceCenter = new ServiceCenter(rootPath!)
  }

  return serviceCenter
}

export default {
  name: Symbol("ServiceCenter"),
  filePath: "services",
  listeners: new Array<Function>,
  init() {
    const touchChannel = this['touchChannel']

    touchEventBus.on(TalexEvents.APP_SECONDARY_LAUNCH, (event: any) => {
      // AppSecondaryLaunch
      const { argv } = event

      const arr = argv.slice(1)
      if (arr.length === 0) return;

      // check each arg (if path)
      arr.forEach(arg => {
        if (!path.isAbsolute(arg)) return;

        if (!fse.pathExistsSync(arg)) return;

        if (fse.statSync(arg).isFile()) {
          let extName = path.extname(arg)

          if (extName.startsWith('.')) {
            extName = extName.slice(1)
          }

          const service = suffix2Service(extName)

          if (!service) {
            dialog.showErrorBox("Error", "The type " + extName + " has no plugin to handle, please install in plugin market!")
            return;
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
          dialog.showErrorBox("Error", "Folder not support yet!")
        }
      })
    })

    const perPath = this['modulePath']

    genServiceCenter(perPath)

    this['listeners'].push(
      this['touchChannel'].regChannel(ChannelType.PLUGIN, 'service:reg', ({ data, plugin }) => {
        const { service } = data

        if (serviceCenter.hasServiceBySymbolStr(service)) return false

        console.log('[Service] Plugin register service as ' + service)

        serviceCenter.regServiceBySymbolStr(service, {
          pluginScope: plugin,
          handle(event, _data) {
            console.log('[Service] Plugin ' + plugin + ' handle service: ' + service, event, _data)
            const data = {
              ..._data,
              service: event.service.name
            }

            const res = touchChannel.sendSync(ChannelType.PLUGIN, 'service:handle', { plugin, data })

            event.setCancelled(res === true)

          }
        })

        return true
      })
    )

    this['listeners'].push(
      this['touchChannel'].regChannel(ChannelType.PLUGIN, 'service:unreg', ({ data }) => {
        const { service } = data

        if (!serviceCenter.hasServiceBySymbolStr(service)) return false

        serviceCenter.unRegService(service)
        return true
      })
    )
  },
  destroy() {
    this['listeners'].forEach(listener => listener())

    serviceCenter.save()
  },
} as TalexTouch.IModule;
