import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))
const mainIndexSource = readFileSync(join(currentDir, '../../index.ts'), 'utf8')
const moduleSource = readFileSync(join(currentDir, 'module.ts'), 'utf8')
const defaultConfigSource = readFileSync(join(currentDir, '../../config/default.ts'), 'utf8')
const appEntranceSource = readFileSync(
  join(currentDir, '../../../renderer/src/AppEntrance.vue'),
  'utf8'
)
const floatingBallSource = readFileSync(
  join(currentDir, '../../../renderer/src/views/assistant/FloatingBall.vue'),
  'utf8'
)
const voicePanelSource = readFileSync(
  join(currentDir, '../../../renderer/src/views/assistant/VoicePanel.vue'),
  'utf8'
)
const voiceDockSource = readFileSync(
  join(currentDir, '../../../renderer/src/views/assistant/VoiceDock.vue'),
  'utf8'
)
const settingAssistantSource = readFileSync(
  join(currentDir, '../../../renderer/src/views/base/settings/SettingAssistant.vue'),
  'utf8'
)
const assistantEventsSource = readFileSync(
  join(currentDir, '../../../../../../packages/utils/transport/events/assistant.ts'),
  'utf8'
).replaceAll('"', "'")

describe('Assistant module startup contract', () => {
  it('keeps the module loaded by app settings instead of an environment gate', () => {
    expect(mainIndexSource).toContain('assistantModule')
    expect(mainIndexSource).not.toContain('shouldLoadAssistantModule')
    expect(mainIndexSource).not.toContain('TUFF_ENABLE_ASSISTANT_EXPERIMENT')
    expect(mainIndexSource).not.toContain('moduleCtor === assistantModule')

    expect(moduleSource).not.toContain('TUFF_ENABLE_ASSISTANT_EXPERIMENT')
    expect(moduleSource).toContain('ASSISTANT_DEFAULT_ENABLED = false')
    expect(moduleSource).toContain('setting.assistant.enabled = ASSISTANT_DEFAULT_ENABLED')
  })

  it('keeps the single voice dock entry behind settings', () => {
    expect(defaultConfigSource).toContain("assistantType: 'voice-dock'")
    expect(defaultConfigSource).not.toContain("assistantType: 'floating-ball'")
    expect(defaultConfigSource).not.toContain("assistantType: 'voice-panel'")
    expect(defaultConfigSource).toContain("touchType: 'assistant'")
    expect(defaultConfigSource).toContain('show: false')
    expect(defaultConfigSource).toContain('transparent: true')

    expect(appEntranceSource).toContain("appEntranceMode === 'AssistantVoiceDock'")
    expect(appEntranceSource).toContain('<VoiceDock />')
    expect(appEntranceSource).not.toContain('<FloatingBall />')
    expect(appEntranceSource).not.toContain('<VoicePanel />')

    for (const expected of [
      'v-model="assistantEnabled"',
      'v-model="floatingBallEnabled"',
      'appSetting.floatingBall.enabled = value',
      'appSetting.assistant.enabled = true',
      'appSetting.floatingBall.enabled = false',
      'appSetting.voiceWake.enabled = false'
    ]) {
      expect(settingAssistantSource).toContain(expected)
    }
  })

  it('loads only the async VoiceDock renderer entry', () => {
    const escapedPath = './views/assistant/VoiceDock.vue'.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    expect(appEntranceSource).not.toMatch(
      new RegExp(`^\\s*import\\s+(?!\\()[^\\n]*['"]${escapedPath}['"][^\\n]*$`, 'm')
    )
    expect(appEntranceSource).toMatch(
      new RegExp(
        `const\\s+VoiceDock\\s*=\\s*defineAsyncComponent\\(\\s*\\(\\s*\\)\\s*=>\\s*import\\(\\s*['"]${escapedPath}['"]\\s*\\)\\s*\\)`
      )
    )
  })

  it('keeps the legacy VoicePanel and FloatingBall root classes inside the dock surfaces', () => {
    expect(voiceDockSource).toContain('<FloatingBall')
    expect(voiceDockSource).toContain('<VoicePanel')
    expect(voiceDockSource).toContain('managed-by-dock')
    expect(floatingBallSource).toContain('class="floating-ball-root"')
    expect(voicePanelSource).toContain('class="voice-panel-root"')
  })

  it('keeps one VoiceDock window for compact positioning and panel handoff', () => {
    for (const expected of [
      'getRuntimeConfig',
      "event('get-runtime-config')",
      'openVoicePanel',
      "event('open-voice-panel')",
      'updatePosition',
      "event('update-position')",
      'panelClosed',
      "event('closed')"
    ]) {
      expect(assistantEventsSource).toContain(expected)
    }

    for (const expected of [
      'AssistantEvents.floatingBall.getRuntimeConfig',
      'AssistantEvents.floatingBall.openVoicePanel',
      'AssistantEvents.floatingBall.updatePosition',
      'AssistantEvents.voice.panelClosed'
    ]) {
      expect(moduleSource).toContain(expected)
    }
    for (const expected of [
      '@mousedown="onPointerDown"',
      'Math.round(event.screenX - dragState.offsetX)',
      'AssistantEvents.floatingBall.updatePosition'
    ]) {
      expect(floatingBallSource).toContain(expected)
    }
    expect(floatingBallSource).not.toContain('@click=')
    expect(floatingBallSource).not.toContain('onBallClick')
    expect(floatingBallSource).not.toContain('openVoicePanel')
    expect(floatingBallSource).not.toContain('getRuntimeConfig')
    expect(floatingBallSource).not.toContain('useI18n')
  })

  it('keeps VoiceDock opening protected from blur auto-hide until the UI handoff finishes', () => {
    const openVoicePanelBlock = moduleSource.match(
      /private async showVoicePanel\(source: string\): Promise<void> \{[\s\S]*?\n {2}private hideVoicePanel\(\): void \{/
    )?.[0]

    expect(openVoicePanelBlock).toBeTruthy()
    expect(openVoicePanelBlock).toContain('this.beginVoicePanelAutoHideSuppression()')
    expect(openVoicePanelBlock).toContain('try {')
    expect(openVoicePanelBlock).toMatch(/this\.applyVoiceDockBounds\(/)
    expect(openVoicePanelBlock).toMatch(/\w+\.window\.show\(\)/)
    expect(openVoicePanelBlock).toMatch(/\w+\.window\.focus\(\)/)
    expect(openVoicePanelBlock).toContain('this.transport.broadcastToWindow')
    expect(openVoicePanelBlock).toContain('AssistantEvents.voice.panelOpened')
    expect(openVoicePanelBlock).not.toContain('this.transport.sendTo')
    expect(openVoicePanelBlock).toContain('} finally {')
    expect(openVoicePanelBlock).toContain('this.releaseVoicePanelAutoHideSuppression()')
  })
})
