import type { IService } from '../../../service'
import { useChannel } from '../channel'

type ServiceHandler = (data: any) => unknown

export function regService(service: IService, handler: ServiceHandler): boolean {
  const channel = useChannel('[Plugin SDK] Service registration requires renderer channel.')
  const res = !!channel.sendSync('service:reg', { service: service.name })

  if (res)
    onHandleService(service, handler)

  return res
}

export function unRegService(service: IService): boolean {
  const channel = useChannel('[Plugin SDK] Service unregistration requires renderer channel.')
  return !!channel.sendSync('service:unreg', { service: service.name })
}

export function onHandleService(service: IService, handler: ServiceHandler) {
  const channel = useChannel('[Plugin SDK] Service handling requires renderer channel.')
  channel.regChannel('service:handle', ({ data: _data }) => {
    const { data } = _data

    // console.log('service:handle', data, service)

    if (data.service === service.name) {
      return handler(data)
    }

    return false
  })
}
