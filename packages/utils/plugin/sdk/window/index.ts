import { genChannel } from '../../channel';
import {
  BrowserWindowConstructorOptions, BrowserWindow, WebContents
} from "electron";

export function createWindow(options: BrowserWindowConstructorOptions & { file?: string } & { url?: string }): number {
  const res = genChannel().sendSync('window:new', options)
  if (res.error) throw new Error(res.error)

  return res.id
}

export function toggleWinVisible(id: number, visible?: boolean): boolean {
  const res = genChannel().sendSync('window:visible', visible !== undefined ? { id, visible } : { id })
  if (res.error) throw new Error(res.error)

  return res.visible
}

export function setWindowProperty(id: number, property: {

}): boolean {
  const res = genChannel().sendSync('window:property', { id, property })
  if (res.error) throw new Error(res.error)

  return res.success
}

export type WindowProperty = {
  [P in keyof BrowserWindow]?: BrowserWindow[P]
}

export type WebContentsProperty = {
  [P in keyof WebContents]?: WebContents[P]
}

export interface WindowProperties {
  window?: WindowProperty
  webContents?: WebContentsProperty
}
