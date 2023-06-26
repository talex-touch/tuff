import { genChannel } from './../../channel';
import { IService } from "../../../service";

export function regService(service: IService, handler: Function): boolean {
  const res = !!genChannel().sendSync('service:reg', { service: service.name })

  if (res)
    onHandleService(service, handler)

  return res
}

export function unRegService(service: IService): boolean {
  return !!genChannel().sendSync('service:unreg', { service: service.name })
}

export function onHandleService(service: IService, handler: Function) {
  // @ts-ignore
  genChannel().regChannel('service:handle', ({ data: _data }) => {
    const { data } = _data

    // console.log('service:handle', data, service)

    if (data.service === service.name) {
      return handler(data)
    }

    return false
  })
}