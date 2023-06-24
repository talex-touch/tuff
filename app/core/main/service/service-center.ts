import fse from "fs-extra";
import path from "path";
import { TalexTouch } from "../types";
import type { IService, IServiceCenter, IServiceEvent, IServiceHandler } from "@talex-touch/utils/service";
import { ChannelType } from '@talex-touch/utils/channel';
import { TalexEvents, touchEventBus, AppSecondaryLaunch } from "../core/eventbus/touch-event";
import { suffix2Service } from '@talex-touch/utils/service/protocol'
import { dialog } from "electron";

class ServiceCenter implements IServiceCenter {

  rootPath: string

  perMap: Map<Symbol, IServiceHandler> = new Map()

  constructor(rootPath: string) {
    this.rootPath = rootPath
  }

  /**
   * Unsafe method, please use regService instead 
   */
  regServiceBySymbolStr(symbol: string, handler: IServiceHandler): void {
    this.perMap.set(Symbol(symbol), handler)
  }

  regService(service: IService, handler: IServiceHandler): boolean {
    if (this.hasService(service)) return false;

    this.perMap.set(service.id, handler)
    return true
  }

  unRegService(service: IService): boolean {
    if (!this.hasService(service)) return false;

    this.perMap.delete(service.id)
    return true
  }

  /**
   * Unsafe method, please use unRegService instead
   */
  unRegServiceBySymbolStr(symbol: string) {
    this.perMap.delete(Symbol(symbol))
  }

  useService(service: IService, data: object): boolean | Promise<boolean> {
    const handler = this.perMap.get(service.id)

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
    return this.perMap.has(service.id)
  }

  hasServiceBySymbolStr(symbol: string): boolean {
    return this.perMap.has(Symbol(symbol)) && !!this.perMap.get(Symbol(symbol))?.pluginScope
  }

  getPerPath(serviceID: Symbol) {
    return path.join(this.rootPath, serviceID.description + ".json")
  }

  async save() {
    const promises = []
    this.perMap.forEach((handler, service) => promises.push(() => {

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
    serviceCenter = new ServiceCenter(rootPath)
  }

  return serviceCenter
}

export default {
  name: Symbol("ServiceCenter"),
  filePath: "services",
  listeners: new Array<Function>,
  init() {

    touchEventBus.on(TalexEvents.APP_SECONDARY_LAUNCH, (event: AppSecondaryLaunch) => {
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

    const perPath = this.modulePath

    genServiceCenter(perPath)

    this.listeners.push(
      this.touchChannel.regChannel(ChannelType.PLUGIN, 'service:reg', ({ data, reply, plugin }) => {
        const { service } = data

        if (serviceCenter.hasServiceBySymbolStr(service)) return reply(false)

        serviceCenter.regServiceBySymbolStr(service, {
          pluginScope: plugin,
          handle(event, data) {
            this.touchChannel.send(ChannelType.PLUGIN, 'service:handle', { event, data })
          }
        })

        reply(true)
      })
    )

    this.listeners.push(
      this.touchChannel.regChannel(ChannelType.PLUGIN, 'service:unreg', ({ data, reply }) => {
        const { service } = data

        if (!serviceCenter.hasServiceBySymbolStr(service)) return reply(false)

        serviceCenter.unRegService(service)
      })
    )
  },
  destroy() {
    this.listeners.forEach(listener => listener())

    serviceCenter.save()
  },
} as TalexTouch.IModule;
