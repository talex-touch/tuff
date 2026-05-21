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
const settingAssistantSource = readFileSync(
  join(currentDir, '../../../renderer/src/views/base/settings/SettingAssistant.vue'),
  'utf8'
)
const zhLocaleSource = readFileSync(
  join(currentDir, '../../../renderer/src/modules/lang/zh-CN.json'),
  'utf8'
)
const enLocaleSource = readFileSync(
  join(currentDir, '../../../renderer/src/modules/lang/en-US.json'),
  'utf8'
)
const assistantEventsSource = readFileSync(
  join(currentDir, '../../../../../../packages/utils/transport/events/assistant.ts'),
  'utf8'
)

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

  it('keeps the floating ball MVP behind settings with a dedicated renderer entry', () => {
    for (const expected of [
      "assistantType: 'floating-ball'",
      "assistantType: 'voice-panel'",
      "touchType: 'assistant'",
      'show: false',
      'transparent: true'
    ]) {
      expect(defaultConfigSource).toContain(expected)
    }

    expect(appEntranceSource).toContain("appEntranceMode === 'AssistantFloatingBall'")
    expect(appEntranceSource).toContain('<FloatingBall />')
    expect(appEntranceSource).toContain("appEntranceMode === 'AssistantVoicePanel'")
    expect(appEntranceSource).toContain('<VoicePanel />')

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

  it('keeps floating ball window visibility, drag persistence, and click handoff wired', () => {
    for (const expected of [
      'getRuntimeConfig',
      "event('get-runtime-config')",
      'openVoicePanel',
      "event('open-voice-panel')",
      'updatePosition',
      "event('update-position')"
    ]) {
      expect(assistantEventsSource).toContain(expected)
    }

    for (const expected of [
      'AssistantEvents.floatingBall.getRuntimeConfig',
      'AssistantEvents.floatingBall.openVoicePanel',
      'AssistantEvents.floatingBall.updatePosition'
    ]) {
      expect(moduleSource).toContain(expected)
      expect(floatingBallSource).toContain(expected)
    }

    for (const expected of [
      "setAlwaysOnTop(true, 'floating')",
      'setVisibleOnAllWorkspaces(true',
      'setSkipTaskbar(true)',
      'showInactive()',
      'applyFloatingBallBounds',
      'floatingBallWindowPending',
      'createFloatingBallWindow',
      'voicePanelWindowPending',
      'createVoicePanelWindow',
      'updateFloatingBallPosition',
      'setPosition(nextX, nextY)',
      'this.pendingPosition = { x: nextX, y: nextY }',
      'this.schedulePositionPersist()',
      'setting.floatingBall.position = { ...this.pendingPosition }'
    ]) {
      expect(moduleSource).toContain(expected)
    }

    for (const expected of [
      '@mousedown="onPointerDown"',
      '@click="onBallClick"',
      "void openVoicePanel('click')",
      "window.addEventListener('mousemove', onPointerMove)",
      "window.addEventListener('mouseup', onPointerUp)",
      'updateFloatingBallPosition(nextX, nextY)'
    ]) {
      expect(floatingBallSource).toContain(expected)
    }
  })

  it('keeps floating ball runtime status localized', () => {
    expect(floatingBallSource).toContain('useI18n')

    for (const expected of [
      'assistant.floatingBall.voiceWakeOff',
      'assistant.floatingBall.listening',
      'assistant.floatingBall.clickToOpen',
      'assistant.floatingBall.unsupported',
      'assistant.floatingBall.permissionDenied',
      'assistant.floatingBall.recognitionError'
    ]) {
      expect(floatingBallSource).toContain(expected)
    }

    for (const expected of [
      'voiceWakeOff',
      'listening',
      'clickToOpen',
      'unsupported',
      'permissionDenied',
      'recognitionError'
    ]) {
      expect(zhLocaleSource).toContain(expected)
      expect(enLocaleSource).toContain(expected)
    }

    for (const hardcodedText of [
      '语音唤醒已关闭',
      '点击唤起语音助手',
      '当前环境不支持语音识别',
      '麦克风权限未授权',
      '语音识别异常'
    ]) {
      expect(floatingBallSource).not.toContain(hardcodedText)
    }
  })

  it('routes screenshot translation through typed assistant transport events', () => {
    expect(assistantEventsSource).toContain('translateScreenshot')
    expect(assistantEventsSource).toContain("event('translate-screenshot')")
    expect(moduleSource).toContain('AssistantEvents.voice.translateScreenshot')
    expect(moduleSource).toContain('handleScreenshotTranslate')
    expect(moduleSource).toContain('getNativeScreenshotService().capture')
    expect(moduleSource).toContain("target: 'cursor-display'")
    expect(moduleSource).toContain("output: 'data-url'")
    expect(moduleSource).toContain('writeClipboard: false')
    expect(moduleSource).toContain('translateImageBase64')
    expect(moduleSource).toContain('openPinWindow: true')
    expect(voicePanelSource).toContain('AssistantEvents.voice.translateScreenshot')
    expect(voicePanelSource).not.toContain('assistant:voice-panel:translate-screenshot')
  })

  it('maps screenshot translation failures to localized recovery hints', () => {
    for (const expected of [
      'AssistantScreenshotTranslateErrorCode',
      'SCREENSHOT_TRANSLATE_ERROR_KEYS',
      'ASSISTANT_DISABLED',
      'SCREENSHOT_UNAVAILABLE',
      'IMAGE_UNAVAILABLE',
      'SCENE_UNAVAILABLE',
      'formatScreenshotTranslateError(response?.code, response?.error)'
    ]) {
      expect(voicePanelSource).toContain(expected)
    }

    for (const expected of [
      'screenshotTranslateAssistantDisabled',
      'screenshotTranslatePermissionDenied',
      'screenshotTranslateImageUnavailable',
      'screenshotTranslateProviderUnavailable'
    ]) {
      expect(voicePanelSource).toContain(expected)
      expect(zhLocaleSource).toContain(expected)
      expect(enLocaleSource).toContain(expected)
    }
  })
})
