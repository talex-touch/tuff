import type {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  WebContents,
} from 'electron'
import { useChannel } from '../channel'

export function createWindow(options: BrowserWindowConstructorOptions & { file?: string } & { url?: string }): number {
  const channel = useChannel('[Plugin SDK] Window creation requires renderer channel.')
  const res = channel.sendSync('window:new', options)
  if (res.error)
    throw new Error(res.error)

  return res.id
}

export function toggleWinVisible(id: number, visible?: boolean): boolean {
  const channel = useChannel('[Plugin SDK] Window visibility requires renderer channel.')
  const res = channel.sendSync('window:visible', visible !== undefined ? { id, visible } : { id })
  if (res.error)
    throw new Error(res.error)

  return res.visible
}

export function setWindowProperty(id: number, property: WindowProperties): boolean {
  const channel = useChannel('[Plugin SDK] Window property requires renderer channel.')
  const res = channel.sendSync('window:property', { id, property })
  if (res.error)
    throw new Error(res.error)

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
