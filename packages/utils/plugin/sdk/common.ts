import { genChannel } from '../channel';
import {
  BrowserWindowConstructorOptions
} from "electron";

export function regShortcut(key: string, func: Function) {
    const channel = genChannel()

    const res = channel.sendSync('shortcon:reg', { key })
    if ( res instanceof  String ) throw new Error(res)
    if ( res === false ) return false;

    channel.regChannel('shortcon:trigger', ({ data }) => key === data.key && func())

    return true;
}

export function createWindow(options: BrowserWindowConstructorOptions & { file?: string } & { url?: string }): number {
  const res = genChannel().sendSync('window:new', options)
  if ( res.error ) throw new Error(res.error)

  return res.id
}

export function toggleWinVisible(id: number, visible?: boolean): boolean {
    const res = genChannel().sendSync('window:visible', visible !== undefined ? { id, visible } : { id })
    if ( res.error ) throw new Error(res.error)

    return res.visible
}