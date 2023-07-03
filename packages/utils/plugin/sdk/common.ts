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

export * from './window';