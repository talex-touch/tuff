import { genChannel } from '../channel';
import { IPluginFeature } from '../index'

export function regShortcut(key: string, func: Function) {
    const channel = genChannel()

    const res = channel.sendSync('shortcon:reg', { key })
    if ( res instanceof String ) throw new Error(String(res))
    if ( res === false ) return false;

    channel.regChannel('shortcon:trigger', ({ data }) => key === data.key && func())

    return true;
}

export function regFeature(feature: IPluginFeature): boolean {
  const channel = genChannel()

  return channel.sendSync('feature:reg', { feature })
}

export function unRegFeature(id: string): boolean {
  const channel = genChannel()

  return channel.sendSync('feature:unreg', { feature: id })
}

export * from './window';