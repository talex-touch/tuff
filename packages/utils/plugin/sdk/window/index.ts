import type {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  WebContents,
} from 'electron'
import type { PluginWindowNewRequest } from '../../../transport/events/types'
import { createPluginTuffTransport } from '../../../transport'
import { PluginEvents } from '../../../transport/events'
import { useChannel } from '../channel'

export async function createWindow(
  options: BrowserWindowConstructorOptions & { file?: string } & { url?: string },
): Promise<number> {
  const channel = useChannel('[Plugin SDK] Window creation requires renderer channel.')
  const transport = createPluginTuffTransport(channel as any)
  const res = await transport.send(PluginEvents.window.new, { ...options } as PluginWindowNewRequest)
  if (res.error)
    throw new Error(res.error)
  if (typeof res.id !== 'number')
    throw new Error('[Plugin SDK] Window creation did not return a window id.')

  return res.id
}

export async function toggleWinVisible(id: number, visible?: boolean): Promise<boolean> {
  const channel = useChannel('[Plugin SDK] Window visibility requires renderer channel.')
  const transport = createPluginTuffTransport(channel as any)
  const res = await transport.send(PluginEvents.window.visible, visible !== undefined ? { id, visible } : { id })
  if (res.error)
    throw new Error(res.error)
  if (typeof res.visible !== 'boolean')
    throw new Error('[Plugin SDK] Window visibility did not return a boolean result.')

  return res.visible
}

export async function setWindowProperty(id: number, property: WindowProperties): Promise<boolean> {
  const channel = useChannel('[Plugin SDK] Window property requires renderer channel.')
  const transport = createPluginTuffTransport(channel as any)
  const res = await transport.send(PluginEvents.window.property, { id, property })
  if (res.error)
    throw new Error(res.error)
  if (typeof res.success !== 'boolean')
    throw new Error('[Plugin SDK] Window property update did not return a boolean result.')

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
