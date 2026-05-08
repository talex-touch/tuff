import { describe, expect, it } from 'vitest'
import { getPluginChannelPreludeCode } from '../transport/prelude'
import { readFileSync } from 'node:fs'

describe('plugin channel sendSync hard-cut', () => {
  it('does not emit ipcRenderer.sendSync in the plugin prelude', () => {
    const source = getPluginChannelPreludeCode({ uniqueKey: 'test-key' })

    expect(source).not.toContain('ipcRenderer.sendSync')
    expect(source).toContain('plugin_channel_send_sync_removed')
  })

  it('replies through ipcRenderer.send instead of renderer event sender', () => {
    const source = getPluginChannelPreludeCode({ uniqueKey: 'test-key' })

    expect(source).toContain("ipcRenderer.send(\n              '@plugin-process-message'")
    expect(source).not.toContain('e.sender.send')
  })

  it('does not expose sendSync on renderer SDK channel types', () => {
    const channelClientSource = readFileSync('plugin/sdk/channel-client.ts', 'utf8')
    const rendererTypesSource = readFileSync('plugin/sdk/types.ts', 'utf8')

    expect(channelClientSource).not.toContain('sendSync:')
    expect(rendererTypesSource).not.toContain('sendSync(')
    expect(rendererTypesSource).not.toContain('sendSync:')
  })
})
