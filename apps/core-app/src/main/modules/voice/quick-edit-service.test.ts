/**
 * What a quick-edit session does with the instruction it heard, driven through the public session API.
 *
 * The pass has exactly one job — produce the text that should stand in the selection — and two
 * failure modes worth defending. It must never fall back to the transcript, because in an edit the
 * words *are* the instruction and delivering them would overwrite the passage with "把这段改短一点".
 * And it must never run the replacement through the dictation formatter, because the edit pass
 * already decided the final wording: a second pass through the terminal profile would strip the
 * punctuation the user just asked for.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const nativeAudioMock = vi.hoisted(() => ({
  getNativeAudioSupport: vi.fn(),
  startCapture: vi.fn(),
  pollCapture: vi.fn(),
  snapshotCapture: vi.fn(),
  stopCapture: vi.fn(),
  cancelCapture: vi.fn(),
  playAudio: vi.fn(),
  drainCapture: vi.fn(),
  typeText: vi.fn(),
  isAccessibilityTrusted: vi.fn()
}))

const polishPromptMocks = vi.hoisted(() => ({
  getVoicePolishPrompt: vi.fn((strength: string) => strength),
  wrapTranscription: vi.fn((transcript: string) => JSON.stringify({ transcription: transcript }))
}))

vi.mock('@talex-touch/tuff-native/audio', () => nativeAudioMock)

vi.mock('../clipboard', () => ({
  clipboardModule: { applyVoiceText: vi.fn() }
}))

vi.mock('../system/active-app', () => ({
  activeAppService: { getActiveApp: vi.fn() }
}))

vi.mock('../ai/intelligence-sdk', () => ({
  tuffIntelligence: {
    audio: { stt: vi.fn() },
    invoke: vi.fn()
  }
}))

vi.mock('../ai/intelligence-tts-service', () => ({
  intelligenceTtsService: { speak: vi.fn() }
}))
vi.mock('./voice-insights-store', () => ({
  voiceInsightsStore: {
    recordSuccess: vi.fn(async () => undefined),
    recordPolishPass: vi.fn(async () => undefined)
  }
}))
vi.mock('./voice-provider-runtime', () => ({
  getConfiguredAsrProvider: vi.fn(),
  getVoiceRecognitionLocation: vi.fn(() => 'cloud')
}))

vi.mock('./polish-prompt', () => ({
  getVoicePolishPrompt: polishPromptMocks.getVoicePolishPrompt,
  wrapTranscription: polishPromptMocks.wrapTranscription
}))

import * as nativeAudio from '@talex-touch/tuff-native/audio'
import type { VoiceDictateResult } from '@talex-touch/utils/transport/sdk/domains/voice'
import { clipboardModule } from '../clipboard'
import { activeAppService } from '../system/active-app'
import { tuffIntelligence } from '../ai/intelligence-sdk'
import type { ActiveAppInfo } from '../system/active-app'
import { appFormatContextFromActiveApp, formatDictationText } from './app-context'
import { getVoiceQuickEditPrompt } from './quick-edit-prompt'
import { resolvePolishTier, VoiceService } from './voice-service'

const support = nativeAudio.getNativeAudioSupport as unknown as ReturnType<typeof vi.fn>
const startCapture = nativeAudio.startCapture as unknown as ReturnType<typeof vi.fn>
const stopCapture = nativeAudio.stopCapture as unknown as ReturnType<typeof vi.fn>
const typeText = (nativeAudio as unknown as { typeText: ReturnType<typeof vi.fn> }).typeText
const isAccessibilityTrusted = (
  nativeAudio as unknown as { isAccessibilityTrusted: ReturnType<typeof vi.fn> }
).isAccessibilityTrusted
const applyVoiceText = clipboardModule.applyVoiceText as unknown as ReturnType<typeof vi.fn>
const getActiveApp = activeAppService.getActiveApp as unknown as ReturnType<typeof vi.fn>
const stt = tuffIntelligence.audio.stt as unknown as ReturnType<typeof vi.fn>
const invoke = tuffIntelligence.invoke as unknown as ReturnType<typeof vi.fn>

const SELECTION = '明天上午十点开会，请相关人员准时参加。'
/** 11 units — under the dictation polish gate, which an edit must not consult. */
const SHORT_INSTRUCTION = '短点'
/** The terminal profile drops the trailing full stop, so this is where formatting would show. */
const PUNCTUATED_REPLACEMENT = 'npm run build.'
/**
 * Well past the dictation length gate, so a session that reached the polish pass would run one.
 * It is still an instruction: no quoted payload, no cancel word.
 */
const LONG_INSTRUCTION =
  '把这段话说得更正式一点，去掉口语化的表达，并且把语气调整成对客户说话的样子，最后确认所有数字和日期都保持原来的含义不要改动，同时保持原有的换行和列表结构'

const NOTES_APP: ActiveAppInfo = {
  identifier: 'com.example.notes',
  displayName: 'Notes',
  bundleId: 'com.example.notes',
  processId: 123,
  executablePath: null,
  platform: 'macos',
  windowTitle: null,
  lastUpdated: 1
}

const TERMINAL_APP: ActiveAppInfo = {
  identifier: 'com.mitchellh.ghostty',
  displayName: 'Ghostty',
  bundleId: 'com.mitchellh.ghostty',
  processId: 456,
  executablePath: null,
  platform: 'macos',
  windowTitle: null,
  lastUpdated: 1
}

/** One press-to-speak edit session, exactly as the global gesture drives it. */
async function speakEdit(instruction: string, selection = SELECTION): Promise<VoiceDictateResult> {
  stt.mockResolvedValue({ result: { text: instruction, language: 'zh' } })
  const service = new VoiceService()
  const sessionId = await service.startSession({
    delivery: 'active-app',
    editTarget: { selection }
  })
  return await service.stopSession(sessionId, { cleanup: true })
}

describe('VoiceService quick edit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    support.mockReturnValue({ supported: true, platform: 'darwin' })
    startCapture.mockResolvedValue({ sessionId: 'native-session' })
    stopCapture.mockReturnValue({
      audio: Buffer.alloc(200),
      format: 'wav',
      sampleRate: 16000,
      channels: 1,
      durationMs: 3000,
      stoppedReason: 'manual'
    })
    getActiveApp.mockResolvedValue(NOTES_APP)
    applyVoiceText.mockResolvedValue({ success: true })
    isAccessibilityTrusted.mockReturnValue(true)
    typeText.mockReturnValue({ ok: true })
  })

  it('delivers a quoted literal over the selection without asking a model', async () => {
    const result = await speakEdit('改成「周三下午两点」')

    expect(result.text).toBe('周三下午两点')
    expect(result.delivery).toEqual({ method: 'native' })
    expect(typeText).toHaveBeenCalledWith('周三下午两点')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('delivers nothing and spends no call when the instruction cancels', async () => {
    const result = await speakEdit('算了')

    expect(result.text).toBe('')
    expect(result.delivery).toEqual({ method: 'none', reason: 'quick-edit-cancelled' })
    expect(invoke).not.toHaveBeenCalled()
    expect(typeText).not.toHaveBeenCalled()
    expect(applyVoiceText).not.toHaveBeenCalled()
  })

  it('rewrites an unquoted instruction with the edit prompt and both halves of the request', async () => {
    const instruction = '把这段话说得更正式一点'
    invoke.mockResolvedValue({ result: '明天上午十点开会。' })

    const result = await speakEdit(instruction)

    expect(result.text).toBe('明天上午十点开会。')
    expect(invoke).toHaveBeenCalledOnce()
    const [capability, request] = invoke.mock.calls[0] as [
      string,
      { messages: { role: string; content: string }[] }
    ]
    expect(capability).toBe('text.chat')
    expect(request.messages[0]).toEqual({ role: 'system', content: getVoiceQuickEditPrompt() })
    // The passage and the instruction are both inputs to the pass; the transcript is never the
    // replacement, and the selection never goes missing behind a prompt-shaped string.
    expect(JSON.parse(request.messages[1].content)).toMatchObject({
      selectedText: SELECTION,
      instruction
    })
  })

  it.each([
    ['an empty pass', (): void => void invoke.mockResolvedValue({ result: '   ' })],
    ['a rejected pass', (): void => void invoke.mockRejectedValue(new Error('provider down'))]
  ])('delivers nothing and reports quick-edit-failed for %s', async (_label, arrange) => {
    arrange()

    const result = await speakEdit('把这段话说得更正式一点')

    expect(result.text).toBe('')
    expect(result.delivery).toEqual({ method: 'none', reason: 'quick-edit-failed' })
    expect(typeText).not.toHaveBeenCalled()
    expect(applyVoiceText).not.toHaveBeenCalled()
  })

  it('sends a two-character instruction to the model rather than gating it out', async () => {
    invoke.mockResolvedValue({ result: '短。' })

    const result = await speakEdit(SHORT_INSTRUCTION)

    // The polish gate exists to keep a two-word dictation from costing a provider call. An
    // instruction is exactly the kind of utterance that is short, so the gate must not apply here.
    expect(invoke).toHaveBeenCalledOnce()
    expect(result.text).toBe('短。')
  })

  it('never runs the polish pass, even when the instruction is long enough to earn one', async () => {
    // The premise: if this text reached the dictation path it would be polished — it is well past
    // the length gate. An edit must not take that path, because the polish prompt rewrites a
    // transcript into what the speaker meant to type, and here the transcript is a request.
    expect(resolvePolishTier(LONG_INSTRUCTION)).not.toBe('short')
    invoke.mockResolvedValue({ result: '正式版本' })

    const result = await speakEdit(LONG_INSTRUCTION)

    expect(polishPromptMocks.getVoicePolishPrompt).not.toHaveBeenCalled()
    expect(invoke).toHaveBeenCalledOnce()
    expect(invoke.mock.calls[0]?.[0]).toBe('text.chat')
    expect(
      (invoke.mock.calls[0]?.[1] as { messages: { content: string }[] }).messages[0]?.content
    ).toBe(getVoiceQuickEditPrompt())
    expect(result.text).toBe('正式版本')
  })

  it('refuses to rewrite an empty passage, spending no call and delivering nothing', async () => {
    // Observed behaviour of the public API: `startSession` accepts an empty selection without
    // throwing, and the refusal happens at the rewrite, which skips the model entirely rather
    // than asking one to improve nothing.
    invoke.mockResolvedValue({ result: '正式版本' })
    const result = await speakEdit('把这段话说得更正式一点', '')

    expect(invoke).not.toHaveBeenCalled()
    expect(result.text).toBe('')
    expect(result.delivery).toEqual({ method: 'none', reason: 'quick-edit-failed' })
    expect(typeText).not.toHaveBeenCalled()
  })

  it('delivers the replacement unformatted, even for a target whose profile would rewrite it', async () => {
    getActiveApp.mockResolvedValue(TERMINAL_APP)
    // The premise of this test: this exact string through this exact target is not a no-op, so a
    // delivery that still holds it proves the formatter was skipped rather than idle.
    const formatContext = appFormatContextFromActiveApp(TERMINAL_APP)
    expect(formatDictationText(PUNCTUATED_REPLACEMENT, formatContext).text).toBe('npm run build')

    const result = await speakEdit(`改成「${PUNCTUATED_REPLACEMENT}」`)

    expect(result.text).toBe(PUNCTUATED_REPLACEMENT)
    expect(typeText).toHaveBeenCalledWith(PUNCTUATED_REPLACEMENT)
  })
})
