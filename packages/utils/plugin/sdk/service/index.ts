import type { IService } from '../../../service'
import { createPluginTuffTransport } from '../../../transport'
import { PluginEvents } from '../../../transport/events'
import { useChannel } from '../channel'

type ServiceHandler = (data: any) => unknown

export async function regService(service: IService, handler: ServiceHandler): Promise<boolean> {
  const channel = useChannel('[Plugin SDK] Service registration requires renderer channel.')
  const transport = createPluginTuffTransport(channel as any)
  const res = !!(await transport.send(PluginEvents.service.register, { service: service.name }))

  if (res)
    onHandleService(service, handler)

  return res
}

export async function unRegService(service: IService): Promise<boolean> {
  const channel = useChannel('[Plugin SDK] Service unregistration requires renderer channel.')
  const transport = createPluginTuffTransport(channel as any)
  return !!(await transport.send(PluginEvents.service.unregister, { service: service.name }))
}

export function onHandleService(service: IService, handler: ServiceHandler) {
  const channel = useChannel('[Plugin SDK] Service handling requires renderer channel.')
  const transport = createPluginTuffTransport(channel as any)
  transport.on(PluginEvents.service.handle, (data) => {

    // console.log('service:handle', data, service)

    if (data.service === service.name) {
      return handler(data)
    }

    return false
  })
}
