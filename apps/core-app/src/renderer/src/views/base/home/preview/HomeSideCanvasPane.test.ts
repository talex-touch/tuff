// @vitest-environment jsdom
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
  info: vi.fn()
}))

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
    initialHistory: { type: Object, default: null }
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
    <div data-testid="tds-design-canvas-stub" :data-frame-count="frames.length">
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
    </div>
  `
}))

vi.mock('~/components/tds-canvas/TdsDesignCanvas.vue', () => ({
  default: TdsDesignCanvasStub
}))

import HomeSideCanvasPane from './HomeSideCanvasPane.vue'

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
    window.sessionStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    window.sessionStorage.clear()
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

    // Reposition frame and verify sessionStorage persists per conversation across remount.
    const movedFrames: TdsCanvasFrame[] = [{ ...frames[0]!, x: 240, y: 120 }]
    canvas.vm.$emit('update:frames', movedFrames)
    await flushPromises()

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
})
