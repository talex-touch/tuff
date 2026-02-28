export interface PluginChannelClient {
  regChannel: (eventName: string, callback: (event: any) => any) => () => void
  unRegChannel?: (eventName: string, callback: (event: any) => any) => boolean
  send: (eventName: string, arg?: any) => Promise<any>
  sendSync?: (eventName: string, arg?: any) => any
}
