import { genChannel } from './../../channel';
import { IService } from "../../../service";

export function regService(service: IService, handler: Function): boolean {
  const res = !!genChannel().sendSync('service:reg', { service: service.description })

  if (res)
    onHandleService(service, handler)

  return res
}

export function unRegService(service: IService): boolean {
  return !!genChannel().sendSync('service:unreg', { service: service.description })
}

export function onHandleService(service: IService, handler: Function) {
  genChannel().regChannel('service:handle', ({ data: _data }) => {
    const { event, data } = _data

    if (event.service.description === service.description) {
      handler(data)
    }
  })
}