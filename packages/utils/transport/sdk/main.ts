import type { ITuffTransportMain } from '../types'
import { TuffMainTransport } from './main-transport'

export function getTuffTransportMain(
  channel: any,
  keyManager: any,
): ITuffTransportMain {
  return new TuffMainTransport(channel, keyManager)
}
