// @vitest-environment jsdom
import type {
  LoadPersistedCanvasSessionResult,
  SavePersistedCanvasSessionResult,
  TdsPersistedCanvasSession
} from '~/components/tds-canvas/canvas-session-client'
import type { WorkspaceFileAiActionPayload } from '~/components/preview/workspace-file-tree'
import type {
  TdsCanvasAddFramePayload,
  TdsCanvasAskFramePayload,
  TdsCanvasFrame,
  TdsCanvasLintCount,
  TdsCanvasNote,
  TdsCanvasSendNotesPayload
} from '~/components/tds-canvas/types'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

enableAutoUnmount(afterEach)

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn()
}))

const captureMocks = vi.hoisted(() => ({
  isElectron: false,
  captureFrameAndProbe: vi.fn(),
  releaseCaptureSession: vi.fn(async (_sessionKey: string) => true)
}))

const sessionStoreMocks = vi.hoisted(() => {
  const remoteSessions = new Map<string, TdsPersistedCanvasSession>()
  return {
    remoteSessions,
    loadPersistedCanvasSession: vi.fn(
      async (conversationId: string): Promise<LoadPersistedCanvasSessionResult> => {
        const stored = remoteSessions.get(conversationId)
        return stored
          ? { status: 'loaded', session: JSON.parse(JSON.stringify(stored)) }
          : { status: 'missing' }
      }
    ),
    savePersistedCanvasSession: vi.fn(
      async (
        conversationId: string,
        session: TdsPersistedCanvasSession
      ): Promise<SavePersistedCanvasSessionResult> => {
        remoteSessions.set(conversationId, JSON.parse(JSON.stringify(session)))
        return { ok: true }
      }
    ),
    deletePersistedCanvasSession: vi.fn(async (conversationId: string) => {
      return remoteSessions.delete(conversationId)
    })
  }
})

vi.mock('@talex-touch/utils/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talex-touch/utils/env')>()
  return {
    ...actual,
    isElectronRenderer: () => captureMocks.isElectron
  }
})

vi.mock('~/components/tds-canvas/canvas-session-client', () => ({
  loadPersistedCanvasSession: (conversationId: string) =>
    sessionStoreMocks.loadPersistedCanvasSession(conversationId),
  savePersistedCanvasSession: (conversationId: string, session: TdsPersistedCanvasSession) =>
    sessionStoreMocks.savePersistedCanvasSession(conversationId, session),
  deletePersistedCanvasSession: (conversationId: string) =>
    sessionStoreMocks.deletePersistedCanvasSession(conversationId)
}))

vi.mock('~/modules/tds-lint/live-capture-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/modules/tds-lint/live-capture-client')>()
  return {
    ...actual,
    captureFrameAndProbe: (...args: Parameters<typeof actual.captureFrameAndProbe>) =>
      captureMocks.captureFrameAndProbe(...args),
    releaseCaptureSession: (...args: Parameters<typeof actual.releaseCaptureSession>) =>
      captureMocks.releaseCaptureSession(...args)
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) => {
      if (typeof paramsOrFallback === 'string') return paramsOrFallback
      if (paramsOrFallback && typeof paramsOrFallback === 'object') {
        return `${key}:${JSON.stringify(paramsOrFallback)}`
      }
      return key
    }
  })
}))

vi.mock('vue-sonner', () => ({
  toast: toastMocks
}))

vi.mock('@talex-touch/tuffex/popover', () => ({
  TxPopover: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<div><div @click="$emit(\'update:modelValue\', !modelValue)"><slot name="reference" /></div><div v-if="modelValue"><slot /></div></div>'
  }
}))

const TdsDesignCanvasStub = vi.hoisted(() => ({
  name: 'TdsDesignCanvas',
  props: {
    frames: { type: Array, required: true },
    notes: { type: Array, default: () => [] },
    selectedFrameId: { type: String, default: null },
    labels: { type: Object, default: () => ({}) },
    aiActionsEnabled: { type: Boolean, default: true },
    lintCounts: { type: Object, default: () => ({}) },
    initialHistory: { type: Object, default: null },
    themeCss: { type: String, default: '' },
    canvasPattern: { type: String, default: 'dots' },
    frameBitmaps: { type: Object, default: () => ({}) }
  },
  emits: [
    'update:frames',
    'update:notes',
    'update:history',
    'select-frame',
    'add-frame',
    'delete-frame',
    'open-lint',
    'send-notes-to-ai',
    'ask-frame-ai'
  ],
  template: `
    <div
      data-testid="tds-design-canvas-stub"
      :data-frame-count="frames.length"
      :data-canvas-pattern="canvasPattern"
    >
      <div
        v-for="frame in frames"
        :key="frame.id"
        class="stub-frame"
        :data-frame-id="frame.id"
        :data-device-id="frame.deviceId"
        :data-errors="lintCounts[frame.id]?.errors ?? 0"
        :data-warnings="lintCounts[frame.id]?.warnings ?? 0"
      >
        {{ frame.title }}
      </div>
      <footer class="stub-statusbar">
        <slot name="status-left" />
        <slot name="status-pending-notes" />
        <slot name="status-add" />
        <slot name="status-more-items" :close="() => {}" />
      </footer>
    </div>
  `
}))

const selectPackSpy = vi.hoisted(() => vi.fn())

vi.mock('~/components/tds-canvas/TdsDesignCanvas.vue', () => ({
  default: TdsDesignCanvasStub
}))

vi.mock('~/modules/tds-theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/modules/tds-theme')>()
  return {
    ...actual,
    useTdsThemePack: () => {
      const api = actual.useTdsThemePack()
      return {
        ...api,
        selectPack: (id: string, options?: Parameters<typeof api.selectPack>[1]) => {
          selectPackSpy(id, options)
          return api.selectPack(id, options)
        }
      }
    }
  }
})

import {
  exportThemePackAsCss,
  TDS_OBSIDIAN_COBALT_PACK,
  TDS_PAPER_INK_PACK,
  useTdsThemePack
} from '~/modules/tds-theme'
import { __resetHomeSideCanvasSessionsForTesting } from './canvas-session-cache'
import HomeSideCanvasPane from './HomeSideCanvasPane.vue'

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((resolver) => {
    resolve = resolver
  })
  return { promise, resolve }
}

function makeAssistantMessage(
  id: string,
  content: string,
  options: { status?: ConversationMessage['status']; parts?: ConversationMessage['parts'] } = {}
): ConversationMessage {
  return {
    id,
    role: 'assistant',
    content,
    status: options.status ?? 'complete',
    ...(options.parts ? { parts: options.parts } : {})
  }
}

describe('HomeSideCanvasPane', () => {
  beforeEach(() => {
    captureMocks.isElectron = false
    captureMocks.captureFrameAndProbe.mockReset()
    captureMocks.releaseCaptureSession.mockClear()
    sessionStoreMocks.remoteSessions.clear()
    sessionStoreMocks.loadPersistedCanvasSession.mockReset()
    sessionStoreMocks.loadPersistedCanvasSession.mockImplementation(
      async (conversationId: string): Promise<LoadPersistedCanvasSessionResult> => {
        const stored = sessionStoreMocks.remoteSessions.get(conversationId)
        return stored
          ? { status: 'loaded', session: JSON.parse(JSON.stringify(stored)) }
          : { status: 'missing' }
      }
    )
    sessionStoreMocks.savePersistedCanvasSession.mockReset()
    sessionStoreMocks.savePersistedCanvasSession.mockImplementation(
      async (
        conversationId: string,
        session: TdsPersistedCanvasSession
      ): Promise<SavePersistedCanvasSessionResult> => {
        sessionStoreMocks.remoteSessions.set(conversationId, JSON.parse(JSON.stringify(session)))
        return { ok: true }
      }
    )
    sessionStoreMocks.deletePersistedCanvasSession.mockReset()
    __resetHomeSideCanvasSessionsForTesting()
    window.sessionStorage.clear()
    window.localStorage.clear()
    useTdsThemePack().resetPack()
    vi.clearAllMocks()
  })

  afterEach(() => {
    __resetHomeSideCanvasSessionsForTesting()
    window.sessionStorage.clear()
    window.localStorage.clear()
    useTdsThemePack().resetPack()
  })

  it('auto-collects closed HTML and SVG fences from assistant messages into laid-out frames', async () => {
    const messages: ConversationMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: '```html\n<title>Ignored User Html</title><div>user</div>\n```',
        status: 'complete'
      },
      makeAssistantMessage(
        'asst-1',
        [
          'Here are two screens:',
          '```html',
          '<!doctype html><html><head><title>Mobile Login</title></head><body><main style="max-width:393px">Hello</main></body></html>',
          '```',
          '```ts',
          'export const ignored = 1',
          '```',
          '```svg',
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><title>Brand Mark</title><circle cx="60" cy="60" r="40" /></svg>',
          '```'
        ].join('\n')
      ),
      makeAssistantMessage(
        'asst-streaming',
        '```html\n<title>Streaming Frame</title><div>partial</div>\n```',
        { status: 'streaming' }
      )
    ]

    const wrapper = mount(HomeSideCanvasPane, {
      props: {
        messages,
        conversationId: 'conv-auto-1'
      }
    })
    await flushPromises()

    const canvas = wrapper.findComponent(TdsDesignCanvasStub)
    const frames = canvas.props('frames') as TdsCanvasFrame[]

    expect(frames).toHaveLength(2)
    expect(frames[0]).toMatchObject({
      id: 'asst-1:fence:0',
      title: 'Mobile Login',
      kind: 'html',
      deviceId: 'iphone-17-pro',
      sourceRef: 'message:asst-1'
    })
    expect(frames[1]).toMatchObject({
      id: 'asst-1:fence:2',
      title: 'Brand Mark',
      kind: 'svg',
      deviceId: 'responsive',
      sourceRef: 'message:asst-1'
    })
    // Laid out neatly without overlapping on the canvas.
    expect(frames[1]!.x).toBeGreaterThan(frames[0]!.x)
  })

  it('adds starter frames from any tds-devices preset with zero static lint issues', async () => {
    const wrapper = mount(HomeSideCanvasPane, {
      props: {
        messages: [],
        conversationId: 'conv-add-1'
      }
    })
    await flushPromises()

    // Open preset popover and add iPhone 17 Pro starter frame.
    await wrapper.get('[data-testid="canvas-add-frame-trigger"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="canvas-preset-option-iphone-17-pro"]').trigger('click')
    await flushPromises()

    const canvas = wrapper.findComponent(TdsDesignCanvasStub)
    let frames = canvas.props('frames') as TdsCanvasFrame[]
    expect(frames).toHaveLength(1)
    expect(frames[0]!.deviceId).toBe('iphone-17-pro')
    expect(frames[0]!.kind).toBe('html')

    // Starter frame must pass static TDS lint with 0 errors and 0 warnings.
    const counts = canvas.props('lintCounts') as Record<string, TdsCanvasLintCount>
    expect(counts[frames[0]!.id]).toEqual({ errors: 0, warnings: 0 })

    // Also supports adding frames via TdsDesignCanvas `add-frame` emit (e.g. Desktop HD / iPad).
    const addPayload: TdsCanvasAddFramePayload = {
      deviceId: 'ipad-pro-11',
      kind: 'html',
      title: 'Tablet Dashboard'
    }
    canvas.vm.$emit('add-frame', addPayload)
    await flushPromises()

    frames = canvas.props('frames') as TdsCanvasFrame[]
    expect(frames).toHaveLength(2)
    expect(frames[1]).toMatchObject({
      deviceId: 'ipad-pro-11',
      title: 'Tablet Dashboard'
    })
    expect(frames[1]!.x).toBeGreaterThan(frames[0]!.x)
  })

  it('computes live static lintCounts per frame and forwards lint fixes via ai-action', async () => {
    const flawedHtml = [
      '<!doctype html>',
      '<html><head><title>Landing</title><style>',
      'body { height: 100vh; color: var(--shell-nonexistent-token); }',
      '</style></head>',
      '<body><img src="https://cdn.example.com/hero.png" class="border-2" /></body></html>'
    ].join('\n')

    const wrapper = mount(HomeSideCanvasPane, {
      props: {
        messages: [makeAssistantMessage('asst-lint', `\`\`\`html\n${flawedHtml}\n\`\`\``)],
        conversationId: 'conv-lint-1',
        aiActionsEnabled: true
      }
    })
    await flushPromises()

    const canvas = wrapper.findComponent(TdsDesignCanvasStub)
    const frames = canvas.props('frames') as TdsCanvasFrame[]
    const frameId = frames[0]!.id
    const lintCounts = canvas.props('lintCounts') as Record<string, TdsCanvasLintCount>

    // remote-asset-url + undefined-tds-token (errors) + viewport-unit-canvas + thick-border-or-glow (warnings)
    expect(lintCounts[frameId]!.errors).toBeGreaterThanOrEqual(2)
    expect(lintCounts[frameId]!.warnings).toBeGreaterThanOrEqual(2)

    // Opening lint from canvas opens TdsLintPopover for that frame.
    canvas.vm.$emit('open-lint', frameId)
    await flushPromises()

    expect(wrapper.find('[data-testid="tds-lint-popover"]').exists()).toBe(true)

    // Toggling anti-slop off reduces warning count reactively.
    const warningsBefore = (canvas.props('lintCounts') as Record<string, TdsCanvasLintCount>)[
      frameId
    ]!.warnings
    await wrapper.get('[data-testid="tds-lint-antislop-toggle"]').trigger('click')
    await flushPromises()
    const warningsAfter = (canvas.props('lintCounts') as Record<string, TdsCanvasLintCount>)[
      frameId
    ]!.warnings
    expect(warningsAfter).toBeLessThan(warningsBefore)

    // Clicking "Send to AI to fix" emits exact WorkspaceFileAiActionPayload.
    await wrapper.get('[data-testid="tds-lint-send-ai"]').trigger('click')
    await flushPromises()

    const emitted = wrapper.emitted('ai-action')
    expect(emitted).toHaveLength(1)
    const payload = emitted![0]![0] as WorkspaceFileAiActionPayload
    expect(payload.mode).toBe('send')
    expect(payload.filePath).toBe('message:asst-lint')
    expect(payload.displayPath).toBe('Landing')
    expect(payload.prompt).toContain('remote-asset-url')
    expect(payload.prompt).toContain('undefined-tds-token')
  })

  it('forwards pin notes and ask-frame-ai as ai-action events and persists state per conversation', async () => {
    const messages = [
      makeAssistantMessage(
        'asst-notes',
        '```html\n<title>Pricing</title><main><h1>Plans</h1></main>\n```'
      )
    ]

    const wrapper = mount(HomeSideCanvasPane, {
      props: {
        messages,
        conversationId: 'conv-notes-1',
        aiActionsEnabled: true
      }
    })
    await flushPromises()

    const canvas = wrapper.findComponent(TdsDesignCanvasStub)
    const frames = canvas.props('frames') as TdsCanvasFrame[]
    const frameId = frames[0]!.id

    // Add a pending pin note via TdsDesignCanvas update:notes emit.
    const note: TdsCanvasNote = {
      id: 'note-1',
      frameId,
      xRatio: 0.4,
      yRatio: 0.25,
      text: 'Increase heading contrast and tighten card spacing',
      resolved: false,
      createdAt: 1700000000000
    }
    canvas.vm.$emit('update:notes', [note])
    await flushPromises()

    // Toolbar shows quick "Send pending notes to AI" button with pending count badge.
    expect(wrapper.find('[data-testid="canvas-send-notes-bar"]').exists()).toBe(true)

    // Emitting send-notes-to-ai forwards exact WorkspaceFileAiActionPayload and resolves sent notes.
    const sendPayload: TdsCanvasSendNotesPayload = {
      prompt: 'Please update [Pricing] @ (40%, 25%): Increase heading contrast',
      noteIds: ['note-1']
    }
    canvas.vm.$emit('send-notes-to-ai', sendPayload)
    await flushPromises()

    const aiActions = wrapper.emitted('ai-action')
    expect(aiActions).toHaveLength(1)
    const firstPayload = aiActions![0]![0] as WorkspaceFileAiActionPayload
    expect(firstPayload.mode).toBe('send')
    expect(firstPayload.prompt).toBe(sendPayload.prompt)
    expect(firstPayload.filePath).toBe('canvas://conv-notes-1')

    const notesAfterSend = canvas.props('notes') as TdsCanvasNote[]
    expect(notesAfterSend[0]!.resolved).toBe(true)

    // Ask-frame-ai also forwards via ai-action.
    const askPayload: TdsCanvasAskFramePayload = {
      frameId,
      prompt: 'Switch to two-column pricing layout'
    }
    canvas.vm.$emit('ask-frame-ai', askPayload)
    await flushPromises()
    expect(wrapper.emitted('ai-action')).toHaveLength(2)
    expect((wrapper.emitted('ai-action')![1]![0] as WorkspaceFileAiActionPayload).prompt).toContain(
      'Switch to two-column pricing layout'
    )

    // Reposition frame and verify in-memory session cache persists per conversation across remount
    // without writing assistant HTML/SVG source, history blobs, or pin notes to browser storage.
    const movedFrames: TdsCanvasFrame[] = [{ ...frames[0]!, x: 240, y: 120 }]
    canvas.vm.$emit('update:frames', movedFrames)
    await flushPromises()

    expect(window.sessionStorage.length).toBe(0)
    const serializedLocalStorage = JSON.stringify(window.localStorage)
    expect(serializedLocalStorage).not.toContain('tuff.home.tdsCanvas')
    expect(serializedLocalStorage).not.toContain('<h1>Plans</h1>')
    expect(serializedLocalStorage).not.toContain('Increase heading contrast')

    wrapper.unmount()

    const remounted = mount(HomeSideCanvasPane, {
      props: {
        messages,
        conversationId: 'conv-notes-1'
      }
    })
    await flushPromises()

    const restoredCanvas = remounted.findComponent(TdsDesignCanvasStub)
    const restoredFrames = restoredCanvas.props('frames') as TdsCanvasFrame[]
    expect(restoredFrames[0]).toMatchObject({ id: frameId, x: 240, y: 120 })
    expect((restoredCanvas.props('notes') as TdsCanvasNote[])[0]!.resolved).toBe(true)

    // Switching to another conversation isolates canvas state cleanly.
    await remounted.setProps({ conversationId: 'conv-notes-2', messages: [] })
    await flushPromises()
    expect(remounted.findComponent(TdsDesignCanvasStub).props('frames')).toEqual([])
  })

  it('extracts fences from message.parts, respects deleted auto frames, and restores on sync', async () => {
    const messages: ConversationMessage[] = [
      makeAssistantMessage('asst-parts', '', {
        parts: [
          {
            type: 'text',
            text: '```html\n<!doctype html><html><head><title>Parts Card</title></head><body><div>OK</div></body></html>\n```'
          }
        ]
      })
    ]

    const wrapper = mount(HomeSideCanvasPane, {
      props: {
        messages,
        conversationId: 'conv-parts-1'
      }
    })
    await flushPromises()

    const canvas = wrapper.findComponent(TdsDesignCanvasStub)
    let frames = canvas.props('frames') as TdsCanvasFrame[]
    expect(frames).toHaveLength(1)
    expect(frames[0]!.title).toBe('Parts Card')

    // Deleting an auto frame records it so message updates do not immediately resurrect it.
    canvas.vm.$emit('delete-frame', frames[0]!.id)
    await flushPromises()
    expect(canvas.props('frames') as TdsCanvasFrame[]).toHaveLength(0)

    await wrapper.setProps({
      messages: [
        ...messages,
        makeAssistantMessage('asst-parts-2', 'Plain text reply with no fences')
      ]
    })
    await flushPromises()
    expect(canvas.props('frames') as TdsCanvasFrame[]).toHaveLength(0)

    // Clicking "Sync from chat" explicitly restores chat frames.
    await wrapper.get('[data-testid="canvas-sync-messages"]').trigger('click')
    await flushPromises()
    frames = canvas.props('frames') as TdsCanvasFrame[]
    expect(frames).toHaveLength(1)
    expect(frames[0]!.title).toBe('Parts Card')
  })

  it('supports sending pending notes directly from the host toolbar button', async () => {
    const wrapper = mount(HomeSideCanvasPane, {
      props: {
        messages: [
          makeAssistantMessage('asst-bar', '```html\n<title>Checkout</title><main>Pay</main>\n```')
        ],
        conversationId: 'conv-bar-1',
        aiActionsEnabled: true
      }
    })
    await flushPromises()

    const canvas = wrapper.findComponent(TdsDesignCanvasStub)
    const frameId = (canvas.props('frames') as TdsCanvasFrame[])[0]!.id
    canvas.vm.$emit('update:notes', [
      {
        id: 'bar-note-1',
        frameId,
        xRatio: 0.5,
        yRatio: 0.5,
        text: 'Align CTA button to bottom safe area',
        resolved: false,
        createdAt: 1700000000001
      }
    ])
    await flushPromises()

    await wrapper.get('[data-testid="canvas-send-notes-bar"]').trigger('click')
    await flushPromises()

    const emitted = wrapper.emitted('ai-action')
    expect(emitted).toHaveLength(1)
    const payload = emitted![0]![0] as WorkspaceFileAiActionPayload
    expect(payload.mode).toBe('send')
    expect(payload.prompt).toContain('Align CTA button to bottom safe area')
    expect(payload.prompt).toContain('Checkout')
    expect((canvas.props('notes') as TdsCanvasNote[])[0]!.resolved).toBe(true)
  })

  it('switches canvas style packs, passes themeCss and canvasPattern, persists per conversation, and applies to app', async () => {
    const wrapper = mount(HomeSideCanvasPane, {
      props: {
        messages: [],
        conversationId: 'conv-theme-1'
      }
    })
    await flushPromises()

    const canvas = wrapper.findComponent(TdsDesignCanvasStub)
    expect(canvas.props('canvasPattern')).toBe('dots')
    expect(canvas.props('themeCss')).toContain('tds-apple-neutral')

    // Mockup export labels are localized and passed down to TdsDesignCanvas.
    const labels = canvas.props('labels') as Record<string, string>
    expect(labels.mockupExport).toBe('home.sidePanel.canvasMockupExport')
    expect(labels.mockupDialogTitle).toBe('home.sidePanel.canvasMockupDialogTitle')
    expect(labels.mockupExportPrintHtml).toBe('home.sidePanel.canvasMockupExportPrintHtml')

    // Open Style Pack popover and preview Obsidian Studio on the canvas only.
    await wrapper.get('[data-testid="canvas-theme-pack-trigger"]').trigger('click')
    await flushPromises()

    await wrapper
      .get('[data-testid="canvas-theme-pack-option-tds-obsidian-cobalt"]')
      .trigger('click')
    await flushPromises()

    expect(canvas.props('themeCss')).toBe(exportThemePackAsCss(TDS_OBSIDIAN_COBALT_PACK))
    expect(canvas.props('canvasPattern')).toBe('grid')
    // Previewing on canvas must NOT change the desktop app theme pack until explicitly applied.
    expect(selectPackSpy).not.toHaveBeenCalled()
    expect(useTdsThemePack().activePackId.value).toBe('tds-apple-neutral')

    // Switch preview to Editorial Paper and verify sessionStorage persists across remount.
    await wrapper.get('[data-testid="canvas-theme-pack-option-tds-paper-ink"]').trigger('click')
    await flushPromises()
    expect(canvas.props('themeCss')).toBe(exportThemePackAsCss(TDS_PAPER_INK_PACK))
    expect(canvas.props('canvasPattern')).toBe('paper-grain')

    wrapper.unmount()

    const remounted = mount(HomeSideCanvasPane, {
      props: {
        messages: [],
        conversationId: 'conv-theme-1'
      }
    })
    await flushPromises()

    const restoredCanvas = remounted.findComponent(TdsDesignCanvasStub)
    expect(restoredCanvas.props('themeCss')).toBe(exportThemePackAsCss(TDS_PAPER_INK_PACK))
    expect(restoredCanvas.props('canvasPattern')).toBe('paper-grain')

    // Switching conversation isolates canvasThemePackId cleanly.
    await remounted.setProps({ conversationId: 'conv-theme-2' })
    await flushPromises()
    expect(remounted.findComponent(TdsDesignCanvasStub).props('canvasPattern')).toBe('dots')

    // Switch back and click "Apply to App" to apply Editorial Paper to CoreApp desktop shell.
    await remounted.setProps({ conversationId: 'conv-theme-1' })
    await flushPromises()
    await remounted.get('[data-testid="canvas-theme-pack-trigger"]').trigger('click')
    await flushPromises()
    await remounted.get('[data-testid="canvas-theme-apply-to-app"]').trigger('click')
    await flushPromises()

    expect(selectPackSpy).toHaveBeenCalledTimes(1)
    expect(selectPackSpy).toHaveBeenCalledWith('tds-paper-ink', undefined)
    expect(useTdsThemePack().activePackId.value).toBe('tds-paper-ink')
    expect(toastMocks.success).toHaveBeenCalledTimes(1)
  })

  it('runs bounded background capture + live DOM probe in Electron, forwards frameBitmaps, and merges DOM lint issues', async () => {
    vi.useFakeTimers()
    const sampleBitmap =
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q=='
    try {
      captureMocks.isElectron = true
      captureMocks.captureFrameAndProbe.mockResolvedValue({
        ok: true,
        bitmapDataUrl: sampleBitmap,
        domIssues: [
          {
            ruleId: 'contrast-fail',
            phase: 'dom',
            severity: 'error',
            category: 'contrast',
            message: 'Text in `p.hint` has WCAG 2.1 contrast 2.10:1',
            fixHint: 'Use --shell-text-primary',
            selector: 'p.hint'
          }
        ],
        fromCache: false
      })

      const wrapper = mount(HomeSideCanvasPane, {
        props: {
          messages: [
            makeAssistantMessage(
              'asst-live',
              '```html\n<!doctype html><html><head><title>Live Screen</title></head><body><p class="hint">Low contrast</p></body></html>\n```'
            )
          ],
          conversationId: 'conv-live-1',
          active: true
        }
      })

      await vi.advanceTimersByTimeAsync(300)
      await flushPromises()

      const canvas = wrapper.findComponent(TdsDesignCanvasStub)
      const frames = canvas.props('frames') as TdsCanvasFrame[]
      const frameId = frames[0]!.id

      expect(captureMocks.captureFrameAndProbe).toHaveBeenCalledTimes(1)
      expect((canvas.props('frameBitmaps') as Record<string, string>)[frameId]).toBe(sampleBitmap)

      const counts = canvas.props('lintCounts') as Record<string, TdsCanvasLintCount>
      expect(counts[frameId]?.errors).toBe(1)

      // Opening lint popover surfaces the live DOM issue
      canvas.vm.$emit('open-lint', frameId)
      await flushPromises()
      const issues = wrapper.findAll('[data-testid="tds-lint-issue"]')
      expect(issues.some((node) => node.attributes('data-rule-id') === 'contrast-fail')).toBe(true)

      wrapper.unmount()
      expect(captureMocks.releaseCaptureSession).toHaveBeenCalledWith('canvas:conv-live-1')
    } finally {
      vi.useRealTimers()
    }
  })

  it('safely falls back trigger swatch dot to dark.primary when a custom pack omits light.primary', async () => {
    const themeApi = useTdsThemePack()
    const imported = themeApi.importPackJson(
      JSON.stringify({
        schemaVersion: 1,
        meta: {
          id: 'custom-dark-accent',
          name: 'Custom Dark Accent',
          description: 'Partial custom pack omitting light.primary',
          version: '1.0.0',
          author: 'Test'
        },
        tokens: {
          light: {
            bg: '#ffffff',
            textPrimary: '#1d1d1f'
          },
          dark: {
            bg: '#111113',
            textPrimary: '#f5f5f7',
            primary: '#879dff',
            onPrimary: '#0c1438'
          }
        }
      })
    )
    expect(imported.valid).toBe(true)

    const wrapper = mount(HomeSideCanvasPane, {
      props: {
        messages: [],
        conversationId: 'conv-custom-dot'
      }
    })
    await flushPromises()

    await wrapper.get('[data-testid="canvas-theme-pack-trigger"]').trigger('click')
    await flushPromises()
    await wrapper
      .get('[data-testid="canvas-theme-pack-option-custom-dark-accent"]')
      .trigger('click')
    await flushPromises()

    const dotStyle = wrapper.get('.HomeSideCanvasPane-ThemeTriggerDot').attributes('style') ?? ''
    expect(dotStyle).toMatch(/background-color:\s*(?:#879dff|rgb\(135,\s*157,\s*255\))/i)
  })

  it('forwards localized mockup export error labels through canvasLabels', async () => {
    const wrapper = mount(HomeSideCanvasPane, {
      props: {
        messages: [],
        conversationId: 'conv-export-labels'
      }
    })
    await flushPromises()

    const canvas = wrapper.findComponent(TdsDesignCanvasStub)
    const labels = canvas.props('labels') as Record<string, string>
    expect(labels.mockupExportFailed).toBe('home.sidePanel.canvasMockupExportFailed')
    expect(labels.mockupExportPngFailed).toBe('home.sidePanel.canvasMockupExportPngFailed')
  })

  it('persists canvas session to main-process store in Electron and hydrates after simulated app restart without Web Storage', async () => {
    vi.useFakeTimers()
    try {
      captureMocks.isElectron = true
      const messages = [
        makeAssistantMessage(
          'asst-persist',
          '```html\n<title>Studio</title><main><h1>Persisted Board</h1></main>\n```'
        )
      ]

      const wrapper = mount(HomeSideCanvasPane, {
        props: {
          messages,
          conversationId: 'conv-restart-1',
          active: false
        }
      })
      await flushPromises()

      const canvas = wrapper.findComponent(TdsDesignCanvasStub)
      const initialFrames = canvas.props('frames') as TdsCanvasFrame[]
      expect(initialFrames).toHaveLength(1)
      const frameId = initialFrames[0]!.id

      // Move frame, add pin note, record history snapshot, and pick Editorial Paper theme pack
      canvas.vm.$emit('update:frames', [{ ...initialFrames[0]!, x: 320, y: 160 }])
      canvas.vm.$emit('update:notes', [
        {
          id: 'note-restart-1',
          frameId,
          xRatio: 0.25,
          yRatio: 0.75,
          text: 'Keep generous margin around hero',
          resolved: false,
          createdAt: 1700000000500
        }
      ])
      canvas.vm.$emit('update:history', {
        blobs: { snapHash1: '<main>v1</main>' },
        entries: [
          {
            id: 'entry-1',
            label: 'Checkpoint 1',
            createdAt: 1700000000501,
            frameSnapshots: [
              {
                id: frameId,
                title: 'Studio',
                kind: 'html',
                deviceId: initialFrames[0]!.deviceId,
                showShell: true,
                x: 0,
                y: 0,
                sourceHash: 'snapHash1'
              }
            ]
          }
        ],
        cursor: 0
      })
      await wrapper.get('[data-testid="canvas-theme-pack-trigger"]').trigger('click')
      await flushPromises()
      await wrapper.get('[data-testid="canvas-theme-pack-option-tds-paper-ink"]').trigger('click')
      await flushPromises()

      // Debounced persistence fires after 350ms
      await vi.advanceTimersByTimeAsync(400)
      await flushPromises()

      expect(sessionStoreMocks.savePersistedCanvasSession).toHaveBeenCalled()
      expect(sessionStoreMocks.remoteSessions.has('conv-restart-1')).toBe(true)

      // Zero plaintext Web Storage writes for canvas sessions
      expect(window.sessionStorage.length).toBe(0)
      const serializedLocalStorage = JSON.stringify(window.localStorage)
      expect(serializedLocalStorage).not.toContain('Persisted Board')
      expect(serializedLocalStorage).not.toContain('Keep generous margin around hero')

      // Simulate full Electron app restart: unmount AND clear process-local in-memory session cache
      wrapper.unmount()
      __resetHomeSideCanvasSessionsForTesting()

      const remounted = mount(HomeSideCanvasPane, {
        props: {
          messages,
          conversationId: 'conv-restart-1',
          active: false
        }
      })
      await flushPromises()

      expect(sessionStoreMocks.loadPersistedCanvasSession).toHaveBeenCalledWith('conv-restart-1')
      const restoredCanvas = remounted.findComponent(TdsDesignCanvasStub)
      const restoredFrames = restoredCanvas.props('frames') as TdsCanvasFrame[]
      expect(restoredFrames[0]).toMatchObject({ id: frameId, x: 320, y: 160 })
      expect((restoredCanvas.props('notes') as TdsCanvasNote[])[0]!.text).toBe(
        'Keep generous margin around hero'
      )
      expect(restoredCanvas.props('initialHistory')).toMatchObject({
        cursor: 0,
        blobs: { snapHash1: '<main>v1</main>' }
      })
      expect(restoredCanvas.props('canvasPattern')).toBe('paper-grain')
      expect(restoredCanvas.props('themeCss')).toBe(exportThemePackAsCss(TDS_PAPER_INK_PACK))
    } finally {
      vi.useRealTimers()
    }
  })

  it('falls back cleanly to in-memory Map outside Electron and drops stale async hydrations on conversation switch', async () => {
    // 1. Non-Electron mode never calls main-process IPC
    captureMocks.isElectron = false
    const webWrapper = mount(HomeSideCanvasPane, {
      props: {
        messages: [
          makeAssistantMessage('asst-web', '```html\n<title>WebOnly</title><p>Hi</p>\n```')
        ],
        conversationId: 'conv-web-only'
      }
    })
    await flushPromises()
    expect(sessionStoreMocks.loadPersistedCanvasSession).not.toHaveBeenCalled()
    expect(sessionStoreMocks.savePersistedCanvasSession).not.toHaveBeenCalled()
    webWrapper.unmount()

    // 2. Rapid switch in Electron ignores slow stale load response from previous conversation
    captureMocks.isElectron = true
    const slowLoad = createDeferred<LoadPersistedCanvasSessionResult>()
    sessionStoreMocks.loadPersistedCanvasSession.mockImplementation((convId: string) => {
      if (convId === 'conv-slow') {
        return slowLoad.promise
      }
      return Promise.resolve({
        status: 'loaded',
        session: {
          version: 1,
          frames: [],
          notes: [],
          selectedFrameId: null,
          history: { blobs: {}, entries: [], cursor: -1 },
          deletedAutoFrameIds: [],
          antiSlop: true,
          canvasThemePackId: 'tds-obsidian-cobalt'
        }
      })
    })

    const raceWrapper = mount(HomeSideCanvasPane, {
      props: {
        messages: [],
        conversationId: 'conv-slow',
        active: false
      }
    })
    await flushPromises()

    await raceWrapper.setProps({ conversationId: 'conv-fast' })
    await flushPromises()
    expect(raceWrapper.findComponent(TdsDesignCanvasStub).props('canvasPattern')).toBe('grid')

    // Now resolve slow conv-slow response — must be discarded so conv-fast stays intact
    slowLoad.resolve({
      status: 'loaded',
      session: {
        version: 1,
        frames: [],
        notes: [],
        selectedFrameId: null,
        history: { blobs: {}, entries: [], cursor: -1 },
        deletedAutoFrameIds: [],
        antiSlop: true,
        canvasThemePackId: 'tds-paper-ink'
      }
    })
    await flushPromises()
    expect(raceWrapper.findComponent(TdsDesignCanvasStub).props('canvasPattern')).toBe('grid')
  })

  it('wires deterministic contentDigest to TdsLintPopover so 1-pass auto-fix triggers once per frame and antiSlop revision', async () => {
    const flawedHtml = [
      '<!doctype html>',
      '<html><head><title>Hero Card</title></head>',
      '<body><img src="https://cdn.example.com/banner.png" class="border-2" /></body></html>'
    ].join('\n')

    const wrapper = mount(HomeSideCanvasPane, {
      props: {
        messages: [makeAssistantMessage('asst-autofix', `\`\`\`html\n${flawedHtml}\n\`\`\``)],
        conversationId: 'conv-autofix-1',
        aiActionsEnabled: true
      }
    })
    await flushPromises()

    const canvas = wrapper.findComponent(TdsDesignCanvasStub)
    const frameId = (canvas.props('frames') as TdsCanvasFrame[])[0]!.id
    canvas.vm.$emit('open-lint', frameId)
    await flushPromises()

    const autoFixToggle = wrapper.get('[data-testid="tds-lint-autofix-toggle"]')
    expect(autoFixToggle.attributes('aria-checked')).toBe('false')
    expect(wrapper.emitted('ai-action')).toBeUndefined()

    // Enabling auto-fix dispatches 1 pass for the current frame digest.
    await autoFixToggle.trigger('click')
    await flushPromises()
    expect(wrapper.emitted('ai-action')).toHaveLength(1)
    expect((wrapper.emitted('ai-action')![0]![0] as WorkspaceFileAiActionPayload).prompt).toContain(
      'remote-asset-url'
    )

    // Re-opening lint on identical frame does not loop.
    canvas.vm.$emit('open-lint', frameId)
    await flushPromises()
    expect(wrapper.emitted('ai-action')).toHaveLength(1)

    // Toggling anti-slop changes the digest and permits 1 fresh pass.
    await wrapper.get('[data-testid="tds-lint-antislop-toggle"]').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('ai-action')).toHaveLength(2)
  })

  it('never overwrites saved disk session or seeds chat frames when load fails, and recovers cleanly on retry', async () => {
    vi.useFakeTimers()
    try {
      captureMocks.isElectron = true
      const savedSession: TdsPersistedCanvasSession = {
        version: 1,
        frames: [
          {
            id: 'saved-frame-1',
            title: 'Saved Board',
            kind: 'html',
            source:
              '<html><head><title>Saved Board</title></head><body><h1>Saved</h1></body></html>',
            deviceId: 'desktop-hd',
            showShell: true,
            x: 120,
            y: 80
          }
        ],
        notes: [],
        selectedFrameId: 'saved-frame-1',
        history: { blobs: {}, entries: [], cursor: -1 },
        deletedAutoFrameIds: [],
        antiSlop: true,
        canvasThemePackId: 'tds-paper-ink'
      }

      sessionStoreMocks.loadPersistedCanvasSession.mockResolvedValueOnce({
        status: 'error',
        error: 'SQLITE_BUSY'
      })

      const messages = [
        makeAssistantMessage(
          'asst-seed',
          '```html\n<title>Chat Seed</title><body><p>Should not overwrite disk</p></body>\n```'
        )
      ]

      const wrapper = mount(HomeSideCanvasPane, {
        props: {
          messages,
          conversationId: 'conv-load-err',
          active: false
        }
      })
      await flushPromises()

      // Failed load must NOT seed frames from chat or persist anything to disk.
      const canvas = wrapper.findComponent(TdsDesignCanvasStub)
      expect(canvas.props('frames')).toEqual([])
      expect(wrapper.find('[data-testid="canvas-persistence-error"]').exists()).toBe(true)
      expect(
        wrapper.get('[data-testid="canvas-persistence-error"]').attributes('data-error-kind')
      ).toBe('load')
      expect(toastMocks.error).toHaveBeenCalledWith('home.sidePanel.canvasSessionLoadFailed')

      // Even if new messages arrive or timers elapse, disk save is NEVER called after load error.
      await wrapper.setProps({
        messages: [
          ...messages,
          makeAssistantMessage('asst-seed-2', '```html\n<title>More</title><div>2</div>\n```')
        ]
      })
      await vi.advanceTimersByTimeAsync(1000)
      await flushPromises()
      expect(canvas.props('frames')).toEqual([])
      expect(sessionStoreMocks.savePersistedCanvasSession).not.toHaveBeenCalled()

      // Clicking Retry after storage recovers loads the saved session cleanly.
      sessionStoreMocks.loadPersistedCanvasSession.mockResolvedValueOnce({
        status: 'loaded',
        session: savedSession
      })
      await wrapper.get('[data-testid="canvas-persistence-retry"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-testid="canvas-persistence-error"]').exists()).toBe(false)
      const restoredFrames = canvas.props('frames') as TdsCanvasFrame[]
      expect(restoredFrames.some((frame) => frame.id === 'saved-frame-1')).toBe(true)
      expect(canvas.props('canvasPattern')).toBe('paper-grain')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps null or blank conversationId strictly in-memory in Electron without calling disk IPC', async () => {
    vi.useFakeTimers()
    try {
      captureMocks.isElectron = true
      const messages = [
        makeAssistantMessage('asst-anon', '```html\n<title>Scratchpad</title><p>Temp</p>\n```')
      ]

      const wrapper = mount(HomeSideCanvasPane, {
        props: {
          messages,
          conversationId: null,
          active: false
        }
      })
      await flushPromises()

      const canvas = wrapper.findComponent(TdsDesignCanvasStub)
      expect((canvas.props('frames') as TdsCanvasFrame[]).length).toBe(1)

      // Mutate frame and switch to whitespace-only conversationId.
      const currentFrames = canvas.props('frames') as TdsCanvasFrame[]
      canvas.vm.$emit('update:frames', [{ ...currentFrames[0]!, x: 99, y: 77 }])
      await vi.advanceTimersByTimeAsync(600)
      await flushPromises()

      await wrapper.setProps({ conversationId: '   ' })
      await vi.advanceTimersByTimeAsync(600)
      await flushPromises()
      wrapper.unmount()

      expect(sessionStoreMocks.loadPersistedCanvasSession).not.toHaveBeenCalled()
      expect(sessionStoreMocks.savePersistedCanvasSession).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries transient autosave failures without losing newer edits, surfaces permanent limit errors, and guards manual frame limit', async () => {
    vi.useFakeTimers()
    try {
      captureMocks.isElectron = true
      const wrapper = mount(HomeSideCanvasPane, {
        props: {
          messages: [
            makeAssistantMessage('asst-save', '```html\n<title>Board</title><p>V1</p>\n```')
          ],
          conversationId: 'conv-autosave-1',
          active: false
        }
      })
      await flushPromises()

      // Let initial seed save succeed cleanly.
      await vi.advanceTimersByTimeAsync(400)
      await flushPromises()
      expect(wrapper.get('[data-testid="home-side-canvas-pane"]').attributes('data-unsaved')).toBe(
        'false'
      )
      sessionStoreMocks.savePersistedCanvasSession.mockClear()

      const canvas = wrapper.findComponent(TdsDesignCanvasStub)
      const baseFrame = (canvas.props('frames') as TdsCanvasFrame[])[0]!

      // 1. Transient failure keeps snapshot unsaved and retries cleanly on backoff.
      sessionStoreMocks.savePersistedCanvasSession
        .mockResolvedValueOnce({ ok: false, error: 'IPC_TIMEOUT', permanent: false })
        .mockResolvedValueOnce({ ok: true })

      canvas.vm.$emit('update:frames', [{ ...baseFrame, x: 111, y: 222 }])
      await vi.advanceTimersByTimeAsync(400)
      await flushPromises()

      expect(sessionStoreMocks.savePersistedCanvasSession).toHaveBeenCalledTimes(1)
      expect(wrapper.get('[data-testid="home-side-canvas-pane"]').attributes('data-unsaved')).toBe(
        'true'
      )

      // Backoff retry succeeds at 1000ms and clears unsaved state.
      await vi.advanceTimersByTimeAsync(1100)
      await flushPromises()
      expect(sessionStoreMocks.savePersistedCanvasSession).toHaveBeenCalledTimes(2)
      expect(wrapper.get('[data-testid="home-side-canvas-pane"]').attributes('data-unsaved')).toBe(
        'false'
      )

      // 2. Newer edit arriving during a failing in-flight save is never overwritten by stale state.
      sessionStoreMocks.savePersistedCanvasSession.mockClear()
      const firstSaveDeferred = createDeferred<SavePersistedCanvasSessionResult>()
      sessionStoreMocks.savePersistedCanvasSession
        .mockImplementationOnce(() => firstSaveDeferred.promise)
        .mockImplementationOnce(async (convId, session) => {
          sessionStoreMocks.remoteSessions.set(convId, JSON.parse(JSON.stringify(session)))
          return { ok: true }
        })

      canvas.vm.$emit('update:frames', [{ ...baseFrame, x: 300, y: 10 }])
      await vi.advanceTimersByTimeAsync(400)
      await flushPromises()
      expect(sessionStoreMocks.savePersistedCanvasSession).toHaveBeenCalledTimes(1)

      // While x=300 save is still in flight, user moves frame to x=555.
      canvas.vm.$emit('update:frames', [{ ...baseFrame, x: 555, y: 20 }])
      firstSaveDeferred.resolve({ ok: false, error: 'IPC_TIMEOUT', permanent: false })
      await flushPromises()
      await vi.advanceTimersByTimeAsync(400)
      await flushPromises()

      expect(sessionStoreMocks.savePersistedCanvasSession).toHaveBeenCalledTimes(2)
      const secondSavedSession = sessionStoreMocks.savePersistedCanvasSession.mock
        .calls[1]![1] as TdsPersistedCanvasSession
      expect(secondSavedSession.frames[0]!.x).toBe(555)
      expect(wrapper.get('[data-testid="home-side-canvas-pane"]').attributes('data-unsaved')).toBe(
        'false'
      )

      // 3. Permanent size-cap failure stops retrying, stays unsaved, and displays localized error.
      sessionStoreMocks.savePersistedCanvasSession.mockClear()
      toastMocks.error.mockClear()
      sessionStoreMocks.savePersistedCanvasSession.mockResolvedValueOnce({
        ok: false,
        error: 'CANVAS_SESSION_TOO_LARGE:5000000>4194304',
        permanent: true
      })

      canvas.vm.$emit('update:frames', [{ ...baseFrame, x: 700, y: 30 }])
      await vi.advanceTimersByTimeAsync(400)
      await flushPromises()

      expect(sessionStoreMocks.savePersistedCanvasSession).toHaveBeenCalledTimes(1)
      expect(wrapper.get('[data-testid="home-side-canvas-pane"]').attributes('data-unsaved')).toBe(
        'true'
      )
      expect(wrapper.find('[data-testid="canvas-persistence-error"]').exists()).toBe(true)
      expect(wrapper.get('[data-testid="canvas-persistence-error"]').text()).toContain(
        'home.sidePanel.canvasSessionSaveTooLarge'
      )
      expect(toastMocks.error).toHaveBeenCalledWith('home.sidePanel.canvasSessionSaveTooLarge')

      // Advancing timers further must NOT auto-retry a permanent failure.
      await vi.advanceTimersByTimeAsync(5000)
      await flushPromises()
      expect(sessionStoreMocks.savePersistedCanvasSession).toHaveBeenCalledTimes(1)

      // 3b. Frame-source and history-blob size caps also map to canvasSessionSaveTooLarge without retrying.
      for (const sizeErrorCode of [
        'CANVAS_FRAME_SOURCE_TOO_LARGE:600000>524288',
        'CANVAS_HISTORY_BLOB_TOO_LARGE:600000>524288'
      ]) {
        sessionStoreMocks.savePersistedCanvasSession.mockClear()
        toastMocks.error.mockClear()
        sessionStoreMocks.savePersistedCanvasSession.mockResolvedValueOnce({
          ok: false,
          error: sizeErrorCode,
          permanent: true
        })
        canvas.vm.$emit('update:frames', [{ ...baseFrame, x: 705, y: 31 }])
        await vi.advanceTimersByTimeAsync(400)
        await flushPromises()
        expect(sessionStoreMocks.savePersistedCanvasSession).toHaveBeenCalledTimes(1)
        expect(wrapper.get('[data-testid="canvas-persistence-error"]').text()).toContain(
          'home.sidePanel.canvasSessionSaveTooLarge'
        )
        expect(toastMocks.error).toHaveBeenCalledWith('home.sidePanel.canvasSessionSaveTooLarge')
        await vi.advanceTimersByTimeAsync(5000)
        await flushPromises()
        expect(sessionStoreMocks.savePersistedCanvasSession).toHaveBeenCalledTimes(1)
      }

      // 3c. Queued/flushed save racing with conversation deletion drops silently (no retry, no error toast).
      sessionStoreMocks.savePersistedCanvasSession.mockClear()
      toastMocks.error.mockClear()
      sessionStoreMocks.savePersistedCanvasSession.mockResolvedValueOnce({
        ok: false,
        error: 'CANVAS_SESSION_CONVERSATION_DELETED',
        permanent: true
      })
      canvas.vm.$emit('update:frames', [{ ...baseFrame, x: 708, y: 32 }])
      await vi.advanceTimersByTimeAsync(400)
      await flushPromises()
      expect(sessionStoreMocks.savePersistedCanvasSession).toHaveBeenCalledTimes(1)
      expect(wrapper.get('[data-testid="home-side-canvas-pane"]').attributes('data-unsaved')).toBe(
        'false'
      )
      expect(wrapper.find('[data-testid="canvas-persistence-error"]').exists()).toBe(false)
      expect(toastMocks.error).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(5000)
      await flushPromises()
      expect(sessionStoreMocks.savePersistedCanvasSession).toHaveBeenCalledTimes(1)

      // 4. Flush on conversation switch checks save result too (surfaces permanent error on flush,
      //    and drops CANVAS_SESSION_CONVERSATION_DELETED silently without error toast).
      sessionStoreMocks.savePersistedCanvasSession.mockClear()
      toastMocks.error.mockClear()
      sessionStoreMocks.savePersistedCanvasSession.mockResolvedValueOnce({
        ok: false,
        error: 'CANVAS_SESSION_CONVERSATION_DELETED',
        permanent: true
      })
      canvas.vm.$emit('update:frames', [{ ...baseFrame, x: 709, y: 33 }])
      await wrapper.setProps({ conversationId: 'conv-autosave-deleted-next', messages: [] })
      await flushPromises()
      expect(sessionStoreMocks.savePersistedCanvasSession).toHaveBeenCalledTimes(1)
      expect(toastMocks.error).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(5000)
      await flushPromises()
      expect(sessionStoreMocks.savePersistedCanvasSession).toHaveBeenCalledTimes(1)

      // Switch back and verify flush surfaces permanent frame-limit error.
      await wrapper.setProps({ conversationId: 'conv-autosave-1' })
      await flushPromises()
      sessionStoreMocks.savePersistedCanvasSession.mockClear()
      toastMocks.error.mockClear()
      sessionStoreMocks.savePersistedCanvasSession.mockResolvedValueOnce({
        ok: false,
        error: 'CANVAS_SESSION_FRAME_LIMIT:65>64',
        permanent: true
      })
      const restoredAutosaveCanvas = wrapper.findComponent(TdsDesignCanvasStub)
      restoredAutosaveCanvas.vm.$emit('update:frames', [{ ...baseFrame, x: 710, y: 35 }])
      // Switch conversation BEFORE the 350ms debounce fires -> triggers flushPendingRemotePersist.
      await wrapper.setProps({ conversationId: 'conv-autosave-2', messages: [] })
      await flushPromises()
      expect(sessionStoreMocks.savePersistedCanvasSession).toHaveBeenCalledTimes(1)
      expect(toastMocks.error).toHaveBeenCalledWith(
        'home.sidePanel.canvasSessionSaveFrameLimit:{"max":64}'
      )

      // 5. Guard manual frame addition at MAX_CANVAS_FRAMES (64) with localized feedback.
      toastMocks.warning.mockClear()
      const sixtyFourFrames: TdsCanvasFrame[] = Array.from({ length: 64 }, (_, idx) => ({
        id: `frame-cap-${idx}`,
        title: `Frame ${idx + 1}`,
        kind: 'html',
        source: `<html><body>${idx}</body></html>`,
        deviceId: 'desktop-hd',
        showShell: true,
        x: idx * 20,
        y: 0
      }))
      const nextCanvas = wrapper.findComponent(TdsDesignCanvasStub)
      nextCanvas.vm.$emit('update:frames', sixtyFourFrames)
      await flushPromises()
      expect((nextCanvas.props('frames') as TdsCanvasFrame[]).length).toBe(64)

      nextCanvas.vm.$emit('add-frame', {
        deviceId: 'iphone-17-pro',
        kind: 'html',
        title: 'Overflow 65'
      } satisfies TdsCanvasAddFramePayload)
      await flushPromises()

      expect((nextCanvas.props('frames') as TdsCanvasFrame[]).length).toBe(64)
      expect(toastMocks.warning).toHaveBeenCalledWith(
        'home.sidePanel.canvasFrameLimitReached:{"max":64}'
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('preserves loaded disk session when mutations or messages arrive while async hydration is in flight', async () => {
    vi.useFakeTimers()
    try {
      captureMocks.isElectron = true
      const pendingLoad = createDeferred<LoadPersistedCanvasSessionResult>()
      sessionStoreMocks.loadPersistedCanvasSession.mockReturnValueOnce(pendingLoad.promise)

      const wrapper = mount(HomeSideCanvasPane, {
        props: {
          messages: [
            makeAssistantMessage(
              'asst-hydrate',
              '```html\n<title>Chat Frame</title><body><p>Chat</p></body>\n```'
            )
          ],
          conversationId: 'conv-hydrating-1',
          active: false
        }
      })
      await flushPromises()

      // Hydration is in flight: pane exposes loading state and disables toolbar mutations.
      expect(
        wrapper.get('[data-testid="home-side-canvas-pane"]').attributes('data-hydrating')
      ).toBe('true')
      expect(wrapper.find('[data-testid="canvas-session-loading"]').exists()).toBe(true)
      expect(
        (wrapper.get('[data-testid="canvas-add-frame-trigger"]').element as HTMLButtonElement)
          .disabled
      ).toBe(true)

      // Provisional mutations emitted while hydration is in flight must be ignored and never persisted.
      const canvas = wrapper.findComponent(TdsDesignCanvasStub)
      canvas.vm.$emit('add-frame', {
        deviceId: 'iphone-17-pro',
        kind: 'html',
        title: 'Provisional Frame'
      } satisfies TdsCanvasAddFramePayload)
      canvas.vm.$emit('update:frames', [
        {
          id: 'provisional-1',
          title: 'Provisional',
          kind: 'html',
          source: '<div>provisional</div>',
          deviceId: 'desktop-hd',
          showShell: true,
          x: 0,
          y: 0
        }
      ])
      await vi.advanceTimersByTimeAsync(600)
      await flushPromises()
      expect(sessionStoreMocks.savePersistedCanvasSession).not.toHaveBeenCalled()

      // Now resolve hydration with the saved disk session (which intentionally deleted the auto frame).
      pendingLoad.resolve({
        status: 'loaded',
        session: {
          version: 1,
          frames: [
            {
              id: 'disk-frame-1',
              title: 'Saved Disk Frame',
              kind: 'html',
              source: '<html><body><h1>From Disk</h1></body></html>',
              deviceId: 'ipad-pro-11',
              showShell: true,
              x: 420,
              y: 180
            }
          ],
          notes: [],
          selectedFrameId: 'disk-frame-1',
          history: { blobs: {}, entries: [], cursor: -1 },
          deletedAutoFrameIds: ['asst-hydrate:fence:0'],
          antiSlop: false,
          canvasThemePackId: 'tds-obsidian-cobalt'
        }
      })
      await flushPromises()

      expect(
        wrapper.get('[data-testid="home-side-canvas-pane"]').attributes('data-hydrating')
      ).toBe('false')
      expect(wrapper.find('[data-testid="canvas-session-loading"]').exists()).toBe(false)
      const frames = canvas.props('frames') as TdsCanvasFrame[]
      expect(frames).toHaveLength(1)
      expect(frames[0]).toMatchObject({ id: 'disk-frame-1', x: 420, y: 180 })
      expect(canvas.props('canvasPattern')).toBe('grid')
      // Nothing changed relative to disk -> no spurious write.
      await vi.advanceTimersByTimeAsync(500)
      await flushPromises()
      expect(sessionStoreMocks.savePersistedCanvasSession).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
