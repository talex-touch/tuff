export interface PluginStandardChannelData {
  name: string
  header: {
    status: 'reply' | 'request'
    type: any
    plugin?: string
  }
  code: number
  data?: any
  plugin?: string
  reply: (code: any, data: any) => void
}

export interface PluginChannelClient {
  regChannel: (eventName: string, callback: (event: any) => any) => () => void
  unRegChannel: (eventName: string, callback: (event: any) => any) => boolean
  send: (eventName: string, arg?: any) => Promise<any>
  sendSync: (eventName: string, arg?: any) => any
}
