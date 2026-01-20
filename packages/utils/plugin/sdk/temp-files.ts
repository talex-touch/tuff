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
  sizeBytes: number
  createdAt: number
}

export function useTempPluginFiles() {
  const channel = useChannel('[Plugin SDK] Temp files require plugin renderer context with $channel available.')

  return {
    async create(options: TempPluginFileCreateOptions): Promise<TempPluginFileResult> {
      const res = await channel.send('temp-file:create', options ?? {})
      if (!res || typeof res !== 'object') {
        throw new Error('[Plugin SDK] temp-file:create returned invalid response')
      }
      return res as TempPluginFileResult
    },

    async delete(url: string): Promise<boolean> {
      const res = await channel.send('temp-file:delete', { url })
      if (res && typeof res === 'object' && 'success' in res) {
        return Boolean((res as any).success)
      }
      return Boolean(res)
    },
  }
}
