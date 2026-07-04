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
      'this.beginVoicePanelAutoHideSuppression()',
      'this.releaseVoicePanelAutoHideSuppression()',
      'floatingBallWindowPending',
      'createFloatingBallWindow',
      'voicePanelWindowPending',
      'createVoicePanelWindow',
      'updateFloatingBallPosition',
      'setPosition(nextX, nextY)',
      'this.pendingPosition = { x: nextX, y: nextY }',
      'this.schedulePositionPersist()',
      'setting.floatingBall.position = { ...this.pendingPosition }',
      'saveMainConfig(StorageList.APP_SETTING, setting, { force: true })'
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

  it('keeps VoicePanel opening protected from blur auto-hide until the UI handoff finishes', () => {
    const openVoicePanelBlock = moduleSource.match(
      /private async showVoicePanel\(source: string\): Promise<void> \{[\s\S]*?\n {2}private hideVoicePanel\(\): void \{/
    )?.[0]

    expect(openVoicePanelBlock).toBeTruthy()
    expect(openVoicePanelBlock).toContain('this.beginVoicePanelAutoHideSuppression()')
    expect(openVoicePanelBlock).toContain('try {')
    expect(openVoicePanelBlock).toContain('voiceWindow.window.setBounds')
    expect(openVoicePanelBlock).toContain('voiceWindow.window.show()')
    expect(openVoicePanelBlock).toContain('voiceWindow.window.focus()')
    expect(openVoicePanelBlock).toContain('this.transport.broadcastToWindow')
    expect(openVoicePanelBlock).toContain('AssistantEvents.voice.panelOpened')
    expect(openVoicePanelBlock).not.toContain('this.transport.sendTo')
    expect(openVoicePanelBlock).toContain('} finally {')
    expect(openVoicePanelBlock).toContain('this.releaseVoicePanelAutoHideSuppression()')
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

  it('routes clipboard image translation through typed assistant transport events', () => {
    expect(assistantEventsSource).toContain('AssistantClipboardImageTranslateResponse')
    expect(assistantEventsSource).toContain('AssistantScreenshotCaptureResponse')
    expect(assistantEventsSource).toContain('AssistantScreenshotSaveResponse')
    expect(assistantEventsSource).toContain('translateClipboardImage')
    expect(assistantEventsSource).toContain('captureScreenshot')
    expect(assistantEventsSource).toContain('saveScreenshot')
    expect(assistantEventsSource).toContain('translateScreenshot')
    expect(assistantEventsSource).toContain("event('translate-clipboard-image')")
    expect(assistantEventsSource).toContain("event('capture-screenshot')")
    expect(assistantEventsSource).toContain("event('save-screenshot')")
    expect(assistantEventsSource).toContain("event('translate-screenshot')")
    expect(assistantEventsSource).toContain('translateClipboardImage: translateClipboardImageEvent')
    expect(assistantEventsSource).toContain('SCREENSHOT_PERMISSION_DENIED')
    expect(assistantEventsSource).toContain('SCREENSHOT_UNSUPPORTED')
    expect(assistantEventsSource).toContain('SCREENSHOT_UNAVAILABLE')
    expect(moduleSource).toContain('AssistantEvents.voice.translateClipboardImage')
    expect(moduleSource).toContain('AssistantEvents.voice.captureScreenshot')
    expect(moduleSource).toContain('AssistantEvents.voice.saveScreenshot')
    expect(moduleSource).toContain('AssistantEvents.voice.translateScreenshot')
    expect(moduleSource).toContain('handleClipboardImageTranslate')
    expect(moduleSource).toContain('handleScreenshotCapture')
    expect(moduleSource).toContain('handleScreenshotSave')
    expect(moduleSource).toContain('handleScreenshotTranslate')
    expect(moduleSource).toContain('translateClipboardImage')
    expect(moduleSource).toContain('openPinWindow: true')
    expect(moduleSource).toContain('voicePanelAutoHideSuppressionDepth')
    expect(moduleSource).toContain('beginVoicePanelAutoHideSuppression')
    expect(moduleSource).toContain('releaseVoicePanelAutoHideSuppression')
    expect(moduleSource).toContain('setTimeout(() => {')
    expect(moduleSource).toContain('this.voicePanelAutoHideSuppressionDepth - 1')
    expect(voicePanelSource).toContain('AssistantEvents.voice.translateClipboardImage')
    expect(voicePanelSource).toContain('AssistantEvents.voice.captureScreenshot')
    expect(voicePanelSource).toContain('AssistantEvents.voice.saveScreenshot')
    expect(voicePanelSource).toContain('AssistantEvents.voice.translateScreenshot')
    expect(voicePanelSource).toContain('translateClipboardImage(): Promise<void>')
    expect(voicePanelSource).toContain('captureScreenshot(): Promise<void>')
    expect(voicePanelSource).toContain('saveScreenshot(): Promise<void>')
    expect(voicePanelSource).toContain('translateScreenshot(): Promise<void>')
    expect(voicePanelSource).toContain('translatingClipboardImage')
    expect(voicePanelSource).toContain('capturingScreenshot')
    expect(voicePanelSource).toContain('savingScreenshot')
    expect(voicePanelSource).toContain('screenshotPreview')
    expect(voicePanelSource).toContain('translatingScreenshot')
    expect(voicePanelSource).not.toContain('assistant:voice-panel:capture-screenshot')
    expect(voicePanelSource).not.toContain('assistant:voice-panel:save-screenshot')
    expect(voicePanelSource).not.toContain('assistant:voice-panel:translate-screenshot')

    const clipboardTranslateBlock = moduleSource.match(
      /private async handleClipboardImageTranslate\([\s\S]*?\n {2}private async handleScreenshotCapture/
    )?.[0]
    expect(clipboardTranslateBlock).toBeTruthy()
    expect(clipboardTranslateBlock).not.toContain('SCREENSHOT_UNAVAILABLE')
    expect(clipboardTranslateBlock).not.toContain('getNativeScreenshotService')
    expect(clipboardTranslateBlock).not.toContain("target: 'cursor-display'")
    expect(clipboardTranslateBlock).not.toContain("output: 'data-url'")
    expect(clipboardTranslateBlock).not.toContain('writeClipboard: false')
    expect(clipboardTranslateBlock).not.toContain('translateImageBase64')

    const screenshotCaptureBlock = moduleSource.match(
      /private async handleScreenshotCapture\([\s\S]*?\n {2}private async handleScreenshotSave/
    )?.[0]
    expect(screenshotCaptureBlock).toBeTruthy()
    expect(screenshotCaptureBlock).toContain('mapScreenshotUnavailableCode')
    expect(screenshotCaptureBlock).toContain('SCREENSHOT_UNAVAILABLE')
    expect(screenshotCaptureBlock).toContain('getNativeScreenshotService')
    expect(screenshotCaptureBlock).toContain("target: 'cursor-display'")
    expect(screenshotCaptureBlock).toContain("output: 'data-url'")
    expect(screenshotCaptureBlock).toContain('writeClipboard: true')
    expect(screenshotCaptureBlock).not.toContain('translateImageBase64')

    const screenshotSaveBlock = moduleSource.match(
      /private async handleScreenshotSave\([\s\S]*?\n {2}private async handleScreenshotTranslate/
    )?.[0]
    expect(screenshotSaveBlock).toBeTruthy()
    expect(screenshotSaveBlock).toContain('mapScreenshotUnavailableCode')
    expect(screenshotSaveBlock).toContain('SCREENSHOT_UNAVAILABLE')
    expect(screenshotSaveBlock).toContain('SAVE_FAILED')
    expect(screenshotSaveBlock).toContain('getNativeScreenshotService')
    expect(screenshotSaveBlock).toContain("target: 'cursor-display'")
    expect(screenshotSaveBlock).toContain("output: 'tfile'")
    expect(screenshotSaveBlock).toContain('writeClipboard: false')
    expect(screenshotSaveBlock).toContain('dialog.showSaveDialog')
    expect(screenshotSaveBlock).toContain('fs.copyFile')
    expect(screenshotSaveBlock).not.toContain('translateImageBase64')

    const screenshotTranslateBlock = moduleSource.match(
      /private async handleScreenshotTranslate\([\s\S]*?\n {2}private destroyFloatingBallWindow/
    )?.[0]
    expect(screenshotTranslateBlock).toBeTruthy()
    expect(screenshotTranslateBlock).toContain('mapScreenshotUnavailableCode')
    expect(screenshotTranslateBlock).toContain('SCREENSHOT_UNAVAILABLE')
    expect(screenshotTranslateBlock).toContain('getNativeScreenshotService')
    expect(screenshotTranslateBlock).toContain("target: 'cursor-display'")
    expect(screenshotTranslateBlock).toContain("output: 'data-url'")
    expect(screenshotTranslateBlock).toContain('writeClipboard: false')
    expect(screenshotTranslateBlock).toContain('translateImageBase64')
  })

  it('maps clipboard image translation failures to localized recovery hints', () => {
    for (const expected of [
      'AssistantClipboardImageTranslateErrorCode',
      'CLIPBOARD_IMAGE_TRANSLATE_ERROR_KEYS',
      'ASSISTANT_DISABLED',
      'IMAGE_UNAVAILABLE',
      'SCENE_UNAVAILABLE',
      'formatClipboardImageTranslateError(response?.code, response?.error)'
    ]) {
      expect(voicePanelSource).toContain(expected)
    }

    for (const expected of [
      'imageTranslateAssistantDisabled',
      'clipboardImageTranslateImageUnavailable',
      'imageTranslateProviderUnavailable',
      'clipboardImageTranslating',
      'clipboardImageTranslateReady',
      'clipboardImageTranslateFailed',
      'captureScreenshot',
      'saveScreenshot',
      'screenshotCapturing',
      'screenshotCapturingShort',
      'screenshotSaving',
      'screenshotSavingShort',
      'screenshotCaptureReady',
      'screenshotCaptureFailed',
      'screenshotPermissionDenied',
      'screenshotUnsupported',
      'screenshotCaptureUnavailable',
      'screenshotSaveReady',
      'screenshotSaveFailed',
      'screenshotPreviewAlt',
      'screenshotPreviewMeta',
      'screenshotCopied',
      'screenshotSavedPath',
      'screenshotTranslateUnavailable',
      'screenshotTranslateImageUnavailable'
    ]) {
      expect(voicePanelSource).toContain(expected)
      expect(zhLocaleSource).toContain(expected)
      expect(enLocaleSource).toContain(expected)
    }

    expect(voicePanelSource).toContain('SCREENSHOT_UNAVAILABLE')
    expect(voicePanelSource).toContain('SCREENSHOT_TRANSLATE_ERROR_KEYS')
    expect(zhLocaleSource).toContain('screenshotTranslateProviderUnavailable')
    expect(enLocaleSource).toContain('screenshotTranslateProviderUnavailable')
    expect(zhLocaleSource).toContain('screenshotTranslatePermissionDenied')
    expect(enLocaleSource).toContain('screenshotTranslatePermissionDenied')
  })
})
