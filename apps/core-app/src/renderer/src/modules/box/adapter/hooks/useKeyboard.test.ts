import type { IProviderActivate, TuffItem } from '@talex-touch/utils'
import type { Ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { BoxMode } from '..'
import {
  clearCoreBoxAttachment,
  handleCoreBoxEscapeKey,
  hasCoreBoxAttachment,
  resolveQuickActionsItem
} from './useKeyboard'

function createFocusedItem(): TuffItem {
  return {
    id: 'stale-feature-entry',
    kind: 'feature',
    source: {
      id: 'plugin-features',
      type: 'plugin'
    },
    render: {
      basic: {
        title: '智能问答'
      }
    },
    meta: {
      pluginName: 'touch-intelligence',
      featureId: 'intelligence-ask'
    }
  } as TuffItem
}

function createActiveWidgetItem(): TuffItem {
  return {
    id: 'intelligence-widget',
    kind: 'feature',
    source: {
      id: 'plugin-features',
      type: 'plugin'
    },
    render: {
      mode: 'custom',
      custom: {
        type: 'vue',
        content: 'touch-intelligence::intelligence-ask',
        data: {
          status: 'ready',
          answer: 'Response succeeded with answer.'
        }
      },
      basic: {
        title: '智能问答：hello'
      }
    },
    actions: [
      {
        id: 'copy-answer',
        type: 'execute',
        label: '复制回答'
      }
    ],
    meta: {
      pluginName: 'touch-intelligence',
      featureId: 'intelligence-ask',
      status: 'ready',
      defaultAction: 'intelligence-action',
      actionId: 'copy-answer',
      payload: {
        prompt: 'hello',
        answer: 'Response succeeded with answer.'
      }
    }
  } as TuffItem
}

describe('resolveQuickActionsItem', () => {
  it('prefers the active plugin widget item over a stale focused result', () => {
    const activeWidget = createActiveWidgetItem()
    const activation: IProviderActivate = {
      id: 'plugin-features',
      meta: {
        pluginName: 'touch-intelligence',
        featureId: 'intelligence-ask',
        feature: activeWidget
      }
    }

    const resolved = resolveQuickActionsItem([createFocusedItem()], 0, [activation])

    expect(resolved).toBe(activeWidget)
    expect(resolved?.actions?.[0]?.id).toBe('copy-answer')
  })

  it('falls back to the focused result when no active plugin widget exists', () => {
    const focused = createFocusedItem()

    expect(resolveQuickActionsItem([focused], 0, null)).toBe(focused)
  })
})

describe('CoreBox attachment keyboard helpers', () => {
  it('treats clipboard images as attachments', () => {
    expect(
      hasCoreBoxAttachment(
        {
          mode: BoxMode.INPUT,
          file: { buffer: null, paths: [] }
        },
        {
          last: {
            type: 'image',
            content: 'data:image/png;base64,preview'
          }
        }
      )
    ).toBe(true)
  })

  it('does not treat absent visible clipboard content as an attachment', () => {
    expect(
      hasCoreBoxAttachment(
        {
          mode: BoxMode.INPUT,
          file: { buffer: null, paths: [] }
        },
        {}
      )
    ).toBe(false)
  })

  it('clears file mode back to plain input mode', () => {
    const boxOptions = {
      mode: BoxMode.FILE,
      file: { iconPath: '/tmp/a.png', paths: ['/tmp/a.png'] }
    }
    const clearClipboard = vi.fn()

    clearCoreBoxAttachment(boxOptions, clearClipboard)

    expect(clearClipboard).toHaveBeenCalledWith({ remember: true })
    expect(boxOptions.mode).toBe(BoxMode.INPUT)
    expect(boxOptions.file).toEqual({ buffer: null, paths: [] })
  })
})

function createEscapeEvent(): KeyboardEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn()
  } as unknown as KeyboardEvent
}

function createEscapeOptions(overrides?: {
  overlayVisible?: boolean
  searchVal?: Ref<string>
  clearClipboard?: ReturnType<typeof vi.fn>
}) {
  const event = createEscapeEvent()
  const isMetaOverlayVisible = vi.fn(async () => overrides?.overlayVisible === true)
  const hideMetaOverlay = vi.fn(async () => undefined)
  const clearClipboard = overrides?.clearClipboard ?? vi.fn()
  const handleExit = vi.fn(async () => undefined)
  const searchVal = overrides?.searchVal ?? ref('')

  return {
    event,
    isMetaOverlayVisible,
    hideMetaOverlay,
    boxOptions: {
      mode: BoxMode.INPUT,
      file: { buffer: null, paths: [] }
    },
    clipboardOptions: {
      last: {
        type: 'image',
        content: 'data:image/png;base64,preview'
      }
    },
    clearClipboard,
    activeCount: 0,
    handleExit,
    searchVal
  }
}

describe('handleCoreBoxEscapeKey', () => {
  it('closes MetaOverlay before clearing visible attachments', async () => {
    const options = createEscapeOptions({ overlayVisible: true })

    const result = await handleCoreBoxEscapeKey(options)

    expect(result).toBe('overlay')
    expect(options.event.preventDefault).toHaveBeenCalledTimes(1)
    expect(options.event.stopPropagation).toHaveBeenCalledTimes(1)
    expect(options.isMetaOverlayVisible).toHaveBeenCalledTimes(1)
    expect(options.hideMetaOverlay).toHaveBeenCalledTimes(1)
    expect(options.clearClipboard).not.toHaveBeenCalled()
  })

  it('clears attachments after confirming MetaOverlay is not visible', async () => {
    const options = createEscapeOptions({ overlayVisible: false })

    const result = await handleCoreBoxEscapeKey(options)

    expect(result).toBe('attachment')
    expect(options.clearClipboard).toHaveBeenCalledWith({ remember: true })
    expect(options.handleExit).not.toHaveBeenCalled()
  })
})
