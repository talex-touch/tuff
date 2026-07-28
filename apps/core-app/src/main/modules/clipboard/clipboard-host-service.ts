import type { PluginSecurityContext } from '@talex-touch/utils/transport'
import type {
  PluginBusinessClipboardCopyRequest,
  PluginBusinessClipboardCopyResult,
  PluginBusinessClipboardReadRequest,
  PluginBusinessClipboardReadResult,
  PluginBusinessClipboardWriteRequest
} from '../plugin/host/plugin-business-capabilities'

export interface ClipboardHostService {
  read(
    request: PluginBusinessClipboardReadRequest,
    context: PluginSecurityContext,
    signal: AbortSignal
  ): PluginBusinessClipboardReadResult | Promise<PluginBusinessClipboardReadResult>
  write(
    request: PluginBusinessClipboardWriteRequest,
    context: PluginSecurityContext,
    signal: AbortSignal
  ): void | Promise<void>
  copyAndPaste(
    request: PluginBusinessClipboardCopyRequest,
    context: PluginSecurityContext,
    signal: AbortSignal
  ): PluginBusinessClipboardCopyResult | Promise<PluginBusinessClipboardCopyResult>
}

let current: { token: symbol; service: ClipboardHostService } | null = null

export function registerClipboardHostService(service: ClipboardHostService): () => void {
  const token = Symbol('clipboard-host-service')
  current = { token, service }
  return () => {
    if (current?.token === token) current = null
  }
}

export function getClipboardHostService(): ClipboardHostService | null {
  return current?.service ?? null
}
