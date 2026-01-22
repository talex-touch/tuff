import type { IService } from '../../../service'
import { useChannel } from '../channel'

type ServiceHandler = (data: any) => unknown

export async function regService(service: IService, handler: ServiceHandler): Promise<boolean> {
  const channel = useChannel('[Plugin SDK] Service registration requires renderer channel.')
  const res = !!(await channel.send('service:reg', { service: service.name }))

  if (res)
    onHandleService(service, handler)

  return res
}

export async function unRegService(service: IService): Promise<boolean> {
  const channel = useChannel('[Plugin SDK] Service unregistration requires renderer channel.')
  return !!(await channel.send('service:unreg', { service: service.name }))
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
