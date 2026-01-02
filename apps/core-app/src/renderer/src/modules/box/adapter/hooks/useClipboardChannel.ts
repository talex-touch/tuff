import type { IClipboardItem } from './types'
import { touchChannel } from '~/modules/channel/channel-core'
import {
  createClipboardTransport,
  type ClipboardMetaUpdate,
  type ClipboardTransportHandlers
} from '../transport/clipboard-transport'

export type { ClipboardMetaUpdate }
export type ClipboardChannelHandlers = ClipboardTransportHandlers

const clipboardTransport = createClipboardTransport(touchChannel)

export function useClipboardChannel(handlers?: ClipboardChannelHandlers): () => void {
  if (!handlers) return () => {}
  return clipboardTransport.subscribe(handlers)
}

export async function getLatestClipboard(): Promise<IClipboardItem | null> {
  return clipboardTransport.getLatestAsync()
}

export function getLatestClipboardSync(): IClipboardItem | null {
  return clipboardTransport.getLatest()
}

export async function applyClipboardToActiveApp(item: IClipboardItem): Promise<boolean> {
  return clipboardTransport.applyToActiveApp(item)
}
