// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import type {
  AssistantClipboardImageTranslateResponse,
  AssistantScreenshotDisplay,
  AssistantScreenshotRegionSelectionResponse,
  AssistantScreenshotTranslateResponse
} from '@talex-touch/utils/transport/events/assistant'
import {
  voiceApiEvents,
  type VoiceAsrStreamEvent
} from '@talex-touch/utils/transport/sdk/domains/voice'
import VoicePanel from './VoicePanel.vue'

const transportSendMock = vi.hoisted(() => vi.fn())
const transportOnMock = vi.hoisted(() => vi.fn())
const transportStreamMock = vi.hoisted(() => vi.fn())

const messages: Record<string, string> = {
  'assistant.voicePanel.textOnly': 'Text input only',
  'assistant.voicePanel.translateClipboardImage': 'Translate clipboard image',
  'assistant.voicePanel.translateScreenshot': 'Translate screenshot',
  'assistant.voicePanel.captureScreenshot': 'Capture screenshot',
  'assistant.voicePanel.saveScreenshot': 'Save screenshot',
  'assistant.voicePanel.screenshotPermissionDenied': 'Screenshot permission denied',
  'assistant.voicePanel.openScreenshotPermissionSettings': 'Open screenshot settings',
  'assistant.voicePanel.screenshotPermissionSettingsOpened': 'Screenshot settings opened',
  'assistant.voicePanel.screenshotPermissionSettingsUnavailable': 'Screenshot settings unavailable',
  'assistant.voicePanel.screenshotTextFallbackMetadata': 'OCR: {ocr}; Translation: {translation}',
  'assistant.voicePanel.screenshotImageTranslateRouteTitle': 'Image translation route',
  'assistant.voicePanel.screenshotImageTranslateRouteStage': '{capability}: {route}',
  'assistant.voicePanel.screenshotImageTranslateRouteStageLatency': '{stage} · {latency} ms',
  'assistant.voicePanel.screenshotImageTranslateRouteSummary': '{duration} ms total · Run {runId}',
  'assistant.voicePanel.openIntelligenceSettings': 'Open AI provider settings',
  'assistant.voicePanel.intelligenceSettingsOpened':
    'AI provider settings opened. Check login, quota, and provider status, then retry.',
  'assistant.voicePanel.intelligenceSettingsUnavailable':
    'Could not open AI provider settings. Open Intelligence from the main window.',
  'assistant.voicePanel.imageTranslateProviderUnavailable':
    'Image translation is unavailable. Check login, quota, or provider status.',
  'assistant.voicePanel.permissionDenied': 'Microphone permission denied',
  'assistant.voicePanel.openMicrophonePermissionSettings': 'Open microphone settings',
  'assistant.voicePanel.microphonePermissionSettingsOpened': 'Microphone settings opened',
  'assistant.voicePanel.microphonePermissionSettingsUnavailable': 'Microphone settings unavailable',
  'assistant.voicePanel.retryVoiceInput': 'Retry voice input',
  'assistant.voicePanel.voicePreparing': 'Preparing voice capture',
  'assistant.voicePanel.voiceTranscribing': 'Transcribing voice',
  'assistant.voicePanel.voiceTranscribed': 'Voice transcribed',
  'assistant.voicePanel.voiceTranscribeFailed': 'Voice transcription failed',
  'assistant.voicePanel.startListening': 'Start listening',
  'assistant.voicePanel.stopListening': 'Stop listening'
}

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: transportSendMock,
    stream: transportStreamMock,
    on: transportOnMock
  })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string> | string) => {
      const template = messages[key] ?? (typeof values === 'string' ? values : key)
      return template.replace(/\{(\w+)\}/g, (_match, name: string) =>
        typeof values === 'object' && values ? (values[name] ?? '') : ''
      )
    }
  })
}))

let clipboardImageResponse: AssistantClipboardImageTranslateResponse
let screenshotResponse: AssistantScreenshotTranslateResponse
let permissionRequestResult: boolean
let intelligenceSettingsOpenResult: boolean
let screenshotDisplaysResponse: AssistantScreenshotDisplay[]
let screenshotRegionSelectionResponse: AssistantScreenshotRegionSelectionResponse
let submitResponse: Promise<{ accepted: boolean }>
let closePanelResponse: Promise<void>
type VoiceStreamCallbacks = {
  onData?: (event: VoiceAsrStreamEvent) => unknown
  onError?: (error: Error) => unknown
  onEnd?: () => unknown
}

interface ControlledVoiceStream {
  readonly cancel: Mock
  readonly controller: Readonly<{ cancel: Mock }>
  connect(
    event: unknown,
    payload: unknown,
    callbacks: VoiceStreamCallbacks
  ): Readonly<{ cancel: Mock }>
  request(): { event: unknown; payload: unknown }
  emitData(event: VoiceAsrStreamEvent): Promise<void>
  emitEnd(): Promise<void>
  emitError(error: Error): Promise<void>
}

function createControlledVoiceStream(): ControlledVoiceStream {
  let event: unknown
  let payload: unknown
  let callbacks: VoiceStreamCallbacks | undefined
  const cancel = vi.fn()
  const controller = Object.freeze({ cancel })

  return {
    cancel,
    controller,
    connect(nextEvent, nextPayload, nextCallbacks) {
      event = nextEvent
      payload = nextPayload
      callbacks = nextCallbacks
      return controller
    },
    request() {
      return { event, payload }
    },
    async emitData(nextEvent) {
      await callbacks?.onData?.(nextEvent)
    },
    async emitEnd() {
      await callbacks?.onEnd?.()
    },
    async emitError(error) {
      await callbacks?.onError?.(error)
    }
  }
}

let voiceWakeRuntimeEnabled: boolean
let voiceStream: ControlledVoiceStream

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

beforeEach(() => {
  voiceWakeRuntimeEnabled = false
  voiceStream = createControlledVoiceStream()
  clipboardImageResponse = {
    success: false,
    code: 'IMAGE_UNAVAILABLE'
  }
  screenshotResponse = {
    success: false,
    code: 'SCREENSHOT_PERMISSION_DENIED'
  }
  permissionRequestResult = true
  intelligenceSettingsOpenResult = true
  screenshotDisplaysResponse = []
  screenshotRegionSelectionResponse = {
    success: false,
    canceled: true
  }
  submitResponse = Promise.resolve({ accepted: true })
  closePanelResponse = Promise.resolve()
  transportSendMock.mockReset()
  transportStreamMock.mockReset()
  transportOnMock.mockReset()
  transportOnMock.mockReturnValue(() => undefined)
  transportStreamMock.mockImplementation(async (event, payload, options) =>
    voiceStream.connect(event, payload, options as VoiceStreamCallbacks)
  )
  transportSendMock.mockImplementation(
    async (event: { toEventName: () => string }): Promise<unknown> => {
      switch (event.toEventName()) {
        case 'assistant:floating-ball:get-runtime-config':
          return {
            enabled: voiceWakeRuntimeEnabled,
            language: 'en-US',
            wakeWords: [],
            cooldownMs: 1,
            continuous: false,
            assistantName: 'Test Assistant',
            openPanelOnWake: false
          }
        case 'assistant:voice-panel:list-screenshot-displays':
          return screenshotDisplaysResponse
        case 'assistant:voice-panel:submit':
          return submitResponse
        case 'assistant:voice-panel:close':
          return closePanelResponse
        case 'assistant:voice-panel:select-screenshot-region':
          return screenshotRegionSelectionResponse
        case 'assistant:voice-panel:capture-screenshot':
          return {
            success: true,
            tfileUrl: 'tfile:///tmp/native/screenshots/screenshot.png',
            width: 2560,
            height: 1440,
            displayName: 'Studio Display',
            wroteClipboard: true
          }
        case 'assistant:voice-panel:translate-clipboard-image':
          return clipboardImageResponse
        case 'assistant:voice-panel:open-intelligence-settings':
          return intelligenceSettingsOpenResult
        case 'assistant:voice-panel:translate-screenshot':
          return screenshotResponse
        case 'assistant:voice-panel:save-screenshot':
          return { success: false, canceled: true }
        case 'system:permission:request':
          return permissionRequestResult
        default:
          throw new Error(`Unexpected transport event: ${event.toEventName()}`)
      }
    }
  )
})

async function mountVoicePanel() {
  const wrapper = mount(VoicePanel)
  await flushPromises()
  return wrapper
}

function hasTransportEventName(event: unknown): event is { toEventName: () => string } {
  return (
    !!event &&
    typeof event === 'object' &&
    'toEventName' in event &&
    typeof event.toEventName === 'function'
  )
}

function findButton(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === label)
  if (!button) {
    throw new Error(`Could not find button: ${label}`)
  }
  return button
}

function screenshotTransportCalls(eventName: string) {
  return transportSendMock.mock.calls.filter(
    ([event]) => hasTransportEventName(event) && event.toEventName() === eventName
  )
}

function voicePanelSubmitCalls() {
  return screenshotTransportCalls('assistant:voice-panel:submit')
}

function voicePanelCloseCalls() {
  return screenshotTransportCalls('assistant:voice-panel:close')
}

function dispatchEnter(textarea: HTMLTextAreaElement, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'Enter',
    ...init
  })
  textarea.dispatchEvent(event)
  return event
}

function dispatchEscape(init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'Escape',
    ...init
  })
  window.dispatchEvent(event)
  return event
}

async function openVoicePanel(): Promise<void> {
  const panelOpenedHandler = transportOnMock.mock.calls[0]?.[1]
  if (typeof panelOpenedHandler !== 'function') {
    throw new Error('VoicePanel did not register its panel-open handler')
  }
  await panelOpenedHandler()
  await flushPromises()
}

describe('VoicePanel keyboard submission', () => {
  it('focuses the text input for every panel-open event', async () => {
    const wrapper = mount(VoicePanel, { attachTo: document.body })
    await flushPromises()
    const textarea = wrapper.find<HTMLTextAreaElement>('textarea')

    await openVoicePanel()
    expect(document.activeElement).toBe(textarea.element)

    textarea.element.blur()
    await openVoicePanel()
    expect(document.activeElement).toBe(textarea.element)

    wrapper.unmount()
  })

  it('submits typed text through the manual submit event on plain Enter', async () => {
    const wrapper = await mountVoicePanel()
    const textarea = wrapper.find<HTMLTextAreaElement>('textarea')
    await textarea.setValue('Summarize the release notes')

    const event = dispatchEnter(textarea.element)
    expect(event.defaultPrevented).toBe(true)
    await flushPromises()

    const submitCalls = voicePanelSubmitCalls()
    expect(submitCalls).toHaveLength(1)
    expect(submitCalls[0]?.[0]).toMatchObject({
      namespace: 'assistant',
      module: 'voice-panel',
      action: 'submit'
    })
    expect(submitCalls[0]?.[1]).toEqual({
      text: 'Summarize the release notes',
      source: 'manual'
    })

    wrapper.unmount()
  })

  it.each([
    { name: 'Shift+Enter', init: { shiftKey: true } },
    { name: 'an IME-composing Enter', init: { isComposing: true } }
  ])('keeps $name available for multiline text without submitting', async ({ init }) => {
    const wrapper = await mountVoicePanel()
    const textarea = wrapper.find<HTMLTextAreaElement>('textarea')
    await textarea.setValue('First line')

    const event = dispatchEnter(textarea.element, init)
    expect(event.defaultPrevented).toBe(false)
    await flushPromises()

    expect(voicePanelSubmitCalls()).toHaveLength(0)
    expect(textarea.element.value).toBe('First line')

    wrapper.unmount()
  })

  it('suppresses repeated Enter submissions until the first submit settles', async () => {
    const deferredSubmit = createDeferred<{ accepted: boolean }>()
    submitResponse = deferredSubmit.promise
    const wrapper = await mountVoicePanel()
    const textarea = wrapper.find<HTMLTextAreaElement>('textarea')
    await textarea.setValue('Run the duplicate check')

    dispatchEnter(textarea.element)
    dispatchEnter(textarea.element)

    expect(voicePanelSubmitCalls()).toHaveLength(1)

    deferredSubmit.resolve({ accepted: true })
    await flushPromises()

    wrapper.unmount()
  })

  it('marks text contributed by a shared Voice Session final event as voice-origin on Enter submit', async () => {
    voiceWakeRuntimeEnabled = true
    const wrapper = await mountVoicePanel()
    await openVoicePanel()
    await vi.waitFor(() => expect(transportStreamMock).toHaveBeenCalledTimes(1))
    await voiceStream.emitData({ type: 'final', text: 'Dictated request' })
    await flushPromises()
    const textarea = wrapper.find<HTMLTextAreaElement>('textarea')

    dispatchEnter(textarea.element)
    await flushPromises()

    const submitCalls = voicePanelSubmitCalls()
    expect(submitCalls).toHaveLength(1)
    expect(submitCalls[0]?.[0]).toMatchObject({
      namespace: 'assistant',
      module: 'voice-panel',
      action: 'submit'
    })
    expect(submitCalls[0]?.[1]).toEqual({
      text: 'Dictated request',
      source: 'voice'
    })

    wrapper.unmount()
  })
})

describe('VoicePanel Escape dismissal', () => {
  it('prevents a cancelable Escape and sends the typed close event without a payload', async () => {
    const wrapper = await mountVoicePanel()

    const event = dispatchEscape()
    expect(event.defaultPrevented).toBe(true)
    await flushPromises()

    const closeCalls = voicePanelCloseCalls()
    expect(closeCalls).toHaveLength(1)
    expect(closeCalls[0]?.[0]).toMatchObject({
      namespace: 'assistant',
      module: 'voice-panel',
      action: 'close'
    })
    expect(closeCalls[0]?.[1]).toBeUndefined()

    wrapper.unmount()
  })

  it('suppresses repeated Escape close requests until the first close settles', async () => {
    const deferredClose = createDeferred<void>()
    closePanelResponse = deferredClose.promise
    const wrapper = await mountVoicePanel()

    const firstEscape = dispatchEscape()
    const secondEscape = dispatchEscape()

    expect(firstEscape.defaultPrevented).toBe(true)
    expect(secondEscape.defaultPrevented).toBe(true)
    expect(voicePanelCloseCalls()).toHaveLength(1)

    deferredClose.resolve()
    await flushPromises()
    wrapper.unmount()
  })

  it.each([
    { name: 'an IME-composing Escape', init: { isComposing: true }, preemptivelyPrevented: false },
    { name: 'an already-defaultPrevented Escape', init: {}, preemptivelyPrevented: true }
  ])('does not close for $name', async ({ init, preemptivelyPrevented }) => {
    const wrapper = await mountVoicePanel()
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
      ...init
    })
    if (preemptivelyPrevented) event.preventDefault()

    window.dispatchEvent(event)
    await flushPromises()

    expect(event.defaultPrevented).toBe(preemptivelyPrevented)
    expect(voicePanelCloseCalls()).toHaveLength(0)
    wrapper.unmount()
  })

  it('removes its global Escape listener after unmount', async () => {
    const wrapper = await mountVoicePanel()
    wrapper.unmount()

    const event = dispatchEscape()
    await flushPromises()

    expect(event.defaultPrevented).toBe(false)
    expect(voicePanelCloseCalls()).toHaveLength(0)
  })
})

async function selectScreenshotRegionTarget(wrapper: VueWrapper, displayId: string): Promise<void> {
  await wrapper.find('.screenshot-target-field select').setValue('region')
  await wrapper.find('.screenshot-region-display-field select').setValue(displayId)
}

async function surfaceScreenshotPermissionRecovery(wrapper: VueWrapper) {
  await findButton(wrapper, 'Translate screenshot').trigger('click')
  await flushPromises()

  expect(wrapper.find('.error-text').text()).toBe('Screenshot permission denied')
  expect(wrapper.find('.permission-recovery-btn').exists()).toBe(true)
}

describe('VoicePanel shared Voice Session', () => {
  it('renders partial and final shared-SDK events, then releases the stream on end', async () => {
    voiceWakeRuntimeEnabled = true
    const wrapper = await mountVoicePanel()
    await openVoicePanel()

    await vi.waitFor(() => expect(transportStreamMock).toHaveBeenCalledTimes(1))
    expect(voiceStream.request()).toEqual({
      event: voiceApiEvents.asrStream,
      payload: { language: 'en-US', cleanup: true, delivery: 'none' }
    })

    await voiceStream.emitData({ type: 'partial', text: 'draft phrase' })
    await flushPromises()
    expect(wrapper.find('.interim-text').text()).toBe('draft phrase')

    await voiceStream.emitData({
      type: 'final',
      text: 'final phrase',
      delivery: { method: 'none', reason: 'target-unavailable' }
    })
    await flushPromises()
    expect(wrapper.find<HTMLTextAreaElement>('textarea').element.value).toBe('final phrase')
    expect(wrapper.find('.interim-text').exists()).toBe(false)

    await voiceStream.emitEnd()
    await flushPromises()
    expect(findButton(wrapper, 'Start listening').exists()).toBe(true)

    wrapper.unmount()
  })

  it('surfaces a shared stream error and cancels an explicitly stopped session', async () => {
    voiceWakeRuntimeEnabled = true
    const wrapper = await mountVoicePanel()
    await openVoicePanel()

    await vi.waitFor(() => expect(transportStreamMock).toHaveBeenCalledTimes(1))
    await voiceStream.emitError(new Error('Voice gateway unavailable'))
    await flushPromises()
    expect(wrapper.find('.error-text').text()).toBe('Voice gateway unavailable')

    await findButton(wrapper, 'Start listening').trigger('click')
    await vi.waitFor(() => expect(transportStreamMock).toHaveBeenCalledTimes(2))
    await findButton(wrapper, 'Stop listening').trigger('click')
    expect(voiceStream.cancel).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })
})

describe('VoicePanel screenshot permission recovery', () => {
  it('opens screen recording settings after a denied screenshot action', async () => {
    const wrapper = await mountVoicePanel()
    await surfaceScreenshotPermissionRecovery(wrapper)

    await wrapper.find('.permission-recovery-btn').trigger('click')
    await flushPromises()

    const eventNames = transportSendMock.mock.calls.map(([event]) => {
      if (!hasTransportEventName(event)) {
        throw new Error('Transport call did not receive an event')
      }
      return event.toEventName()
    })
    expect(eventNames).toContain('system:permission:request')
    expect(transportSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'system',
        module: 'permission',
        action: 'request'
      }),
      'screenRecording'
    )
    expect(wrapper.find('.status-text').text()).toBe('Screenshot settings opened')
    expect(wrapper.find('.error-text').exists()).toBe(false)

    wrapper.unmount()
  })

  it('reports unavailable settings instead of a successful recovery', async () => {
    permissionRequestResult = false
    const wrapper = await mountVoicePanel()
    await surfaceScreenshotPermissionRecovery(wrapper)

    await wrapper.find('.permission-recovery-btn').trigger('click')
    await flushPromises()

    expect(wrapper.find('.error-text').text()).toBe('Screenshot settings unavailable')
    expect(wrapper.find('.status-text').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Screenshot settings opened')

    wrapper.unmount()
  })
})

describe('VoicePanel Intelligence settings recovery', () => {
  async function surfaceProviderRecovery(wrapper: VueWrapper): Promise<void> {
    await findButton(wrapper, 'Translate clipboard image').trigger('click')
    await flushPromises()

    expect(wrapper.find('.error-text').text()).toBe(
      'Image translation is unavailable. Check login, quota, or provider status.'
    )
    expect(wrapper.find('.intelligence-recovery-btn').exists()).toBe(true)
  }

  it('opens Intelligence settings after a provider translation failure and clears the error', async () => {
    clipboardImageResponse = {
      success: false,
      code: 'SCENE_UNAVAILABLE'
    }
    const wrapper = await mountVoicePanel()
    await surfaceProviderRecovery(wrapper)

    await wrapper.find('.intelligence-recovery-btn').trigger('click')
    await flushPromises()

    const [event, payload] = transportSendMock.mock.calls.at(-1) ?? []
    expect(hasTransportEventName(event) && event.toEventName()).toBe(
      'assistant:voice-panel:open-intelligence-settings'
    )
    expect(event).toMatchObject({
      namespace: 'assistant',
      module: 'voice-panel',
      action: 'open-intelligence-settings'
    })
    expect(payload).toBeUndefined()
    expect(wrapper.find('.intelligence-recovery-btn').exists()).toBe(false)
    expect(wrapper.find('.error-text').exists()).toBe(false)
    expect(wrapper.find('.status-text').text()).toBe(
      'AI provider settings opened. Check login, quota, and provider status, then retry.'
    )

    wrapper.unmount()
  })

  it('keeps provider recovery actionable when Intelligence settings cannot be opened', async () => {
    clipboardImageResponse = {
      success: false,
      code: 'SCENE_UNAVAILABLE'
    }
    intelligenceSettingsOpenResult = false
    const wrapper = await mountVoicePanel()
    await surfaceProviderRecovery(wrapper)

    await wrapper.find('.intelligence-recovery-btn').trigger('click')
    await flushPromises()

    expect(wrapper.find('.error-text').text()).toBe(
      'Could not open AI provider settings. Open Intelligence from the main window.'
    )
    expect(wrapper.find('.intelligence-recovery-btn').exists()).toBe(true)
    expect(wrapper.find('.status-text').exists()).toBe(false)

    wrapper.unmount()
  })

  it.each([
    {
      name: 'clipboard image is unavailable',
      label: 'Translate clipboard image',
      setResponse: () => {
        clipboardImageResponse = { success: false, code: 'IMAGE_UNAVAILABLE' }
      }
    },
    {
      name: 'screenshot permission is denied',
      label: 'Translate screenshot',
      setResponse: () => {
        screenshotResponse = { success: false, code: 'SCREENSHOT_PERMISSION_DENIED' }
      }
    }
  ])('does not offer Intelligence settings when $name', async ({ label, setResponse }) => {
    setResponse()
    const wrapper = await mountVoicePanel()

    await findButton(wrapper, label).trigger('click')
    await flushPromises()

    expect(wrapper.find('.intelligence-recovery-btn').exists()).toBe(false)

    wrapper.unmount()
  })
  it.each([
    { code: 'OCR_UNAVAILABLE', showsIntelligenceRecovery: true },
    { code: 'TEXT_TRANSLATE_UNAVAILABLE', showsIntelligenceRecovery: true },
    { code: 'SCREENSHOT_UNAVAILABLE', showsIntelligenceRecovery: false }
  ] as const)(
    'shows Intelligence recovery $showsIntelligenceRecovery for screenshot $code',
    async ({ code, showsIntelligenceRecovery }) => {
      screenshotResponse = { success: false, code }
      const wrapper = await mountVoicePanel()

      await findButton(wrapper, 'Translate screenshot').trigger('click')
      await flushPromises()

      expect(wrapper.find('.intelligence-recovery-btn').exists()).toBe(showsIntelligenceRecovery)

      wrapper.unmount()
    }
  )

  it.each([
    {
      source: 'clipboard',
      code: 'QUOTA_CHECK_UNAVAILABLE',
      label: 'Translate clipboard image',
      eventName: 'assistant:voice-panel:translate-clipboard-image',
      payload: { targetLang: 'zh' },
      reason: 'Quota verification is unavailable, so the request was blocked.',
      recovery: 'Retry after quota storage recovers or inspect Intelligence quota configuration.',
      expected:
        'Quota verification unavailable: Retry later. If this continues, inspect Intelligence quota storage and configuration.'
    },
    {
      source: 'clipboard',
      code: 'NEXUS_AUTH_REQUIRED',
      label: 'Translate clipboard image',
      eventName: 'assistant:voice-panel:translate-clipboard-image',
      payload: { targetLang: 'zh' },
      reason: 'Nexus provider requires a signed-in account.',
      recovery: 'Sign in to Nexus or switch to another enabled provider.',
      expected: 'Sign in required: Sign in to Tuff Nexus, then retry this AI request.'
    },
    {
      source: 'screenshot',
      code: 'QUOTA_CHECK_UNAVAILABLE',
      label: 'Translate screenshot',
      eventName: 'assistant:voice-panel:translate-screenshot',
      payload: { targetLang: 'zh', target: 'cursor-display' },
      reason: 'Quota verification is unavailable, so the request was blocked.',
      recovery: 'Retry after quota storage recovers or inspect Intelligence quota configuration.',
      expected:
        'Quota verification unavailable: Retry later. If this continues, inspect Intelligence quota storage and configuration.'
    },
    {
      source: 'screenshot',
      code: 'NEXUS_AUTH_REQUIRED',
      label: 'Translate screenshot',
      eventName: 'assistant:voice-panel:translate-screenshot',
      payload: { targetLang: 'zh', target: 'cursor-display' },
      reason: 'Nexus provider requires a signed-in account.',
      recovery: 'Sign in to Nexus or switch to another enabled provider.',
      expected: 'Sign in required: Sign in to Tuff Nexus, then retry this AI request.'
    }
  ] as const)(
    'renders $source $code recovery and opens Intelligence settings',
    async ({ source, code, label, eventName, payload, reason, recovery, expected }) => {
      const response = { success: false, code, reason, recovery }
      if (source === 'clipboard') {
        clipboardImageResponse = response
      } else {
        screenshotResponse = response
      }
      const wrapper = await mountVoicePanel()

      await findButton(wrapper, label).trigger('click')
      await flushPromises()

      const translationCalls = screenshotTransportCalls(eventName)
      expect(translationCalls).toHaveLength(1)
      expect(translationCalls[0]?.[1]).toEqual(payload)
      expect(wrapper.find('.error-text').text()).toBe(expected)
      expect(wrapper.find('.intelligence-recovery-btn').exists()).toBe(true)

      await wrapper.find('.intelligence-recovery-btn').trigger('click')
      await flushPromises()

      expect(
        screenshotTransportCalls('assistant:voice-panel:open-intelligence-settings')
      ).toHaveLength(1)

      wrapper.unmount()
    }
  )

  it.each([
    {
      source: 'clipboard',
      code: 'INVALID_REQUEST',
      label: 'Translate clipboard image',
      eventName: 'assistant:voice-panel:translate-clipboard-image',
      payload: { targetLang: 'zh' },
      reason: 'The image translation request is invalid.'
    },
    {
      source: 'screenshot',
      code: 'UNKNOWN',
      label: 'Translate screenshot',
      eventName: 'assistant:voice-panel:translate-screenshot',
      payload: { targetLang: 'zh', target: 'cursor-display' },
      reason: 'The image translation failed unexpectedly.'
    }
  ] as const)(
    'keeps $source $code recovery visible without Intelligence settings',
    async ({ source, code, label, eventName, payload, reason }) => {
      const response = { success: false, code, reason }
      if (source === 'clipboard') {
        clipboardImageResponse = response
      } else {
        screenshotResponse = response
      }
      const wrapper = await mountVoicePanel()

      await findButton(wrapper, label).trigger('click')
      await flushPromises()

      const translationCalls = screenshotTransportCalls(eventName)
      expect(translationCalls).toHaveLength(1)
      expect(translationCalls[0]?.[1]).toEqual(payload)
      expect(wrapper.find('.error-text').text()).toBe(`AI request failed: ${reason}`)
      expect(wrapper.find('.intelligence-recovery-btn').exists()).toBe(false)

      wrapper.unmount()
    }
  )
})

describe('VoicePanel screenshot display selection', () => {
  it('loads available displays and sends the selected display with screenshot capture', async () => {
    screenshotDisplaysResponse = [
      {
        id: 'display-external',
        name: 'External Display',
        friendlyName: 'Studio Display',
        x: 1440,
        y: 0,
        width: 2560,
        height: 1440,
        scaleFactor: 2,
        rotation: 0,
        isPrimary: false
      }
    ]
    const wrapper = await mountVoicePanel()

    const modeSelect = wrapper.find('.screenshot-target-field select')
    expect(modeSelect.find('option[value="display"]').attributes('disabled')).toBeUndefined()
    await modeSelect.setValue('display')

    const displaySelect = wrapper.find('.screenshot-target-field:nth-child(2) select')
    expect(displaySelect.findAll('option').map((option) => option.text())).toEqual([
      'Studio Display · 2560 × 1440'
    ])
    await displaySelect.setValue('display-external')
    await findButton(wrapper, 'Capture screenshot').trigger('click')
    await flushPromises()

    const captureCalls = transportSendMock.mock.calls.filter(
      ([event]) =>
        hasTransportEventName(event) &&
        event.toEventName() === 'assistant:voice-panel:capture-screenshot'
    )
    expect(captureCalls).toHaveLength(1)
    expect(captureCalls[0]?.[1]).toEqual({ target: 'display', displayId: 'display-external' })

    wrapper.unmount()
  })
})

describe('VoicePanel screenshot region selection', () => {
  const display: AssistantScreenshotDisplay = {
    id: 'display-external',
    name: 'External Display',
    friendlyName: 'Studio Display',
    x: 1440,
    y: 0,
    width: 2560,
    height: 1440,
    scaleFactor: 2,
    rotation: 0,
    isPrimary: false
  }
  const resource = {
    tfileUrl: 'tfile:///managed/assistant-region.png',
    mimeType: 'image/png' as const,
    width: 640,
    height: 360,
    sizeBytes: 2048
  }

  it.each([
    { label: 'Capture screenshot', eventName: 'assistant:voice-panel:capture-screenshot' },
    { label: 'Translate screenshot', eventName: 'assistant:voice-panel:translate-screenshot' }
  ])('forwards a managed interactive capture to $label', async ({ label, eventName }) => {
    screenshotDisplaysResponse = [display]
    screenshotRegionSelectionResponse = {
      success: true,
      resource
    }
    const wrapper = await mountVoicePanel()
    await selectScreenshotRegionTarget(wrapper, display.id)

    await findButton(wrapper, label).trigger('click')
    await flushPromises()

    const selectionCalls = screenshotTransportCalls(
      'assistant:voice-panel:select-screenshot-region'
    )
    expect(selectionCalls).toHaveLength(1)
    expect(selectionCalls[0]?.[1]).toEqual({ target: 'display', displayId: display.id })

    const actionCalls = screenshotTransportCalls(eventName)
    expect(actionCalls).toHaveLength(1)
    expect(actionCalls[0]?.[1]).toEqual(
      eventName === 'assistant:voice-panel:translate-screenshot'
        ? { targetLang: 'zh', target: 'resource', tfileUrl: resource.tfileUrl, resource }
        : { target: 'resource', tfileUrl: resource.tfileUrl, resource }
    )

    wrapper.unmount()
  })

  it.each([
    { label: 'Capture screenshot', eventName: 'assistant:voice-panel:capture-screenshot' },
    { label: 'Translate screenshot', eventName: 'assistant:voice-panel:translate-screenshot' },
    { label: 'Save screenshot', eventName: 'assistant:voice-panel:save-screenshot' }
  ])('does not invoke $label work when selection is canceled', async ({ label, eventName }) => {
    screenshotDisplaysResponse = [display]
    const wrapper = await mountVoicePanel()
    await selectScreenshotRegionTarget(wrapper, display.id)

    await findButton(wrapper, label).trigger('click')
    await flushPromises()

    expect(
      screenshotTransportCalls('assistant:voice-panel:select-screenshot-region')[0]?.[1]
    ).toEqual({ target: 'display', displayId: display.id })
    expect(screenshotTransportCalls(eventName)).toHaveLength(0)

    wrapper.unmount()
  })
})

describe('VoicePanel screenshot OCR fallback', () => {
  it('renders OCR text and provider models, then clears stale fallback content on capture', async () => {
    screenshotResponse = {
      success: true,
      mode: 'ocr-text',
      sourceText: 'Invoice total',
      targetText: '合计金额',
      fallback: {
        degradedReason: 'IMAGE_TRANSLATE_SCENE_UNAVAILABLE',
        ocr: {
          provider: 'ocr-provider',
          model: 'ocr-model',
          traceId: 'ocr-trace',
          latencyMs: 17,
          engine: 'cloud'
        },
        translation: {
          provider: 'translation-provider',
          model: 'translation-model',
          traceId: 'translation-trace',
          latencyMs: 23
        }
      }
    }
    const wrapper = await mountVoicePanel()

    await findButton(wrapper, 'Translate screenshot').trigger('click')
    await flushPromises()

    const fallbackCard = wrapper.find('.screenshot-text-fallback')
    expect(fallbackCard.text()).toContain('Invoice total')
    expect(fallbackCard.text()).toContain('合计金额')
    expect(fallbackCard.text()).toContain('OCR: ocr-provider / ocr-model')
    expect(fallbackCard.text()).toContain('Translation: translation-provider / translation-model')

    await findButton(wrapper, 'Capture screenshot').trigger('click')
    await flushPromises()

    expect(wrapper.find('.screenshot-text-fallback').exists()).toBe(false)
    expect(wrapper.find('.screenshot-preview').exists()).toBe(true)

    wrapper.unmount()
  })
})

describe('VoicePanel image translation route metadata', () => {
  const metadata = {
    runId: 'run-image-translation',
    sceneId: 'corebox.screenshot.translate',
    durationMs: 147,
    stages: [
      {
        capability: 'vision.ocr',
        providerId: 'provider-1',
        providerName: 'Nexus Vision',
        model: 'vision-ocr-v2',
        latencyMs: 17
      }
    ]
  }

  function expectRouteCard(wrapper: VueWrapper) {
    const routeCard = wrapper.find('.screenshot-image-translate-route')
    expect(routeCard.exists()).toBe(true)
    expect(routeCard.text()).toContain('Nexus Vision')
    expect(routeCard.text()).toContain('vision-ocr-v2')
    expect(routeCard.text()).toContain('147 ms')
    expect(routeCard.text()).toContain('run-image-translation')
  }

  it('renders translated screenshot and clipboard route details, then clears them before a new capture', async () => {
    screenshotResponse = {
      success: true,
      mode: 'translated-image',
      translatedImageBase64: 'dHJhbnNsYXRlZA==',
      metadata
    }
    const wrapper = await mountVoicePanel()

    await findButton(wrapper, 'Translate screenshot').trigger('click')
    await flushPromises()

    expectRouteCard(wrapper)

    await findButton(wrapper, 'Capture screenshot').trigger('click')
    await flushPromises()

    expect(wrapper.find('.screenshot-image-translate-route').exists()).toBe(false)
    expect(wrapper.find('.screenshot-preview').exists()).toBe(true)

    clipboardImageResponse = {
      success: true,
      translatedImageBase64: 'dHJhbnNsYXRlZA==',
      metadata
    }
    await findButton(wrapper, 'Translate clipboard image').trigger('click')
    await flushPromises()

    expectRouteCard(wrapper)

    wrapper.unmount()
  })
})
