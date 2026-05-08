import { createPluginTuffTransport } from '../../transport'
import { PluginEvents } from '../../transport/events'
import { useChannel } from './channel'

export interface TempPluginFileCreateOptions {
  ext?: string
  text?: string
  base64?: string
  prefix?: string
  /**
   * Optional retention in milliseconds.
   * If omitted, the host will apply a default plugin temp retention policy.
   */
  retentionMs?: number
}

export interface TempPluginFileResult {
  url: string
  path?: string
  sizeBytes: number
  createdAt: number
}

export function useTempPluginFiles() {
  const channel = useChannel('[Plugin SDK] Temp files require plugin renderer context with $channel available.')
  const transport = createPluginTuffTransport(channel)

  return {
    async create(options: TempPluginFileCreateOptions): Promise<TempPluginFileResult> {
      const res = await transport.send(PluginEvents.tempFile.create, options ?? {})
      if (!res || typeof res !== 'object') {
        throw new Error('[Plugin SDK] temp-file:create returned invalid response')
      }
      return res as TempPluginFileResult
    },

    async delete(url: string): Promise<boolean> {
      const res = await transport.send(PluginEvents.tempFile.delete, { url })
      if (res && typeof res === 'object' && 'success' in res) {
        return Boolean((res as any).success)
      }
      return Boolean(res)
    },
  }
}
