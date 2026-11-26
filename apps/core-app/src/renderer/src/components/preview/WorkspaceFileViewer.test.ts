// @vitest-environment jsdom

import type { SelectionPayload } from '@talex-touch/tuffex/selection-actions'
import { AgentWorkspaceEvents } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import { TdsCaptureEvents } from '@talex-touch/utils/transport/sdk/domains/tds-capture'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { clearCaptureCache } from '~/modules/tds-lint/live-capture-client'

enableAutoUnmount(afterEach)

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  selection: null as null | { value: SelectionPayload | null },
  clearSelection: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key
  })
}))

vi.mock('vue-sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}))

vi.mock('@talex-touch/utils/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talex-touch/utils/env')>()
  return {
    ...actual,
    isElectronRenderer: () => true
  }
})

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send: mocks.send })
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useAppSdk: () => ({ showInFolder: vi.fn(async () => {}) })
}))

vi.mock('@talex-touch/tuffex/markdown-view', () => ({
  TxMarkdownView: {
    props: ['content'],
    template: '<div class="tx-md-stub">{{ content }}</div>'
  }
}))

vi.mock('@talex-touch/tuffex/skeleton', () => ({
  TxSkeleton: { template: '<div data-testid="skeleton" />' }
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
  }
}))

vi.mock('@talex-touch/tuffex/dropdown-menu', () => ({
  TxDropdownMenu: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<div><slot name="trigger" /><div v-if="modelValue"><slot /></div></div>'
  },
  TxDropdownItem: {
    emits: ['select'],
    template:
      '<button type="button" @click="$emit(\'select\')"><slot /><slot name="right" /></button>'
  }
}))

vi.mock('@talex-touch/tuffex/popover', () => ({
  TxPopover: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<div><div @click="$emit(\'update:modelValue\', !modelValue)"><slot name="reference" /></div><div v-if="modelValue"><slot /></div></div>'
  }
}))

vi.mock('@talex-touch/tuffex/selection-actions', () => ({
  useSelectionAnchor: () => {
    const sel = ref<SelectionPayload | null>(null)
    mocks.selection = sel
    return {
      selection: sel,
      clear: () => {
        mocks.clearSelection()
        sel.value = null
      }
    }
  },
  TxSelectionActions: {
    props: ['selection', 'actions', 'prompt'],
    emits: ['action', 'submit', 'update:prompt'],
    template: `
      <div data-testid="md-selection-actions">
        <button
          v-for="item in actions"
          :key="item.id"
          type="button"
          :data-testid="'sel-action-' + item.id"
          @click="$emit('action', { id: item.id, action: item, selection })"
        >{{ item.label }}</button>
        <button
          type="button"
          data-testid="sel-submit-custom"
          @click="$emit('submit', { prompt: '请补充风险点', selection })"
        >submit</button>
      </div>
    `
  }
}))

import { resetSessionReviewCommentsForTests } from './workspace-file-tree'
import WorkspaceFileViewer from './WorkspaceFileViewer.vue'

describe('WorkspaceFileViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearCaptureCache()
    window.sessionStorage.clear()
    resetSessionReviewCommentsForTests()
    mocks.send.mockResolvedValue({
      path: '/repo/docs/plan-prd/TODO-AI.md',
      name: 'TODO-AI.md',
      ext: 'md',
      kind: 'text',
      mimeType: 'text/markdown',
      size: 37683,
      truncated: false,
      mtimeMs: Date.now(),
      text: '# Tuff AI Stable TODO\n\n## 当前口径\n\nStable 只覆盖 CoreBox text.chat。'
    })
  })

  it('moves file path breadcrumbs and size to the bottom statusbar and keeps the header minimal', async () => {
    const wrapper = mount(WorkspaceFileViewer, {
      props: {
        filePath: '/repo/docs/plan-prd/TODO-AI.md',
        displayPath: 'docs/plan-prd/TODO-AI.md',
        workspaceRoot: '/repo',
        aiActionsEnabled: true,
        preferTreeForBreadcrumbs: true
      }
    })
    await flushPromises()

    // Header has no redundant filename, badge, size, or full path text.
    const headerText = wrapper.get('[data-testid="file-viewer-header"]').text()
    expect(headerText).not.toContain('TODO-AI.md')
    expect(headerText).not.toContain('36.8 KB')
    expect(headerText).not.toContain('/repo/docs')

    // Bottom statusbar displays interactive breadcrumbs and file size.
    const statusBar = wrapper.get('[data-testid="file-viewer-statusbar"]')
    expect(statusBar.get('[data-testid="file-viewer-status-size"]').text()).toBe('36.8 KB')
    const crumbs = statusBar.findAll('.WorkspaceFileViewer-CrumbBtn')
    expect(crumbs.map((c) => c.text())).toEqual(['repo', 'docs', 'plan-prd', 'TODO-AI.md'])

    // Clicking an ancestor breadcrumb reveals the folder in the file tree.
    await crumbs[2]!.trigger('click')
    expect(wrapper.emitted('reveal-dir')).toEqual([['/repo/docs/plan-prd']])
  })

  it('supports Markdown text selection quick AI actions and batched review comments', async () => {
    const wrapper = mount(WorkspaceFileViewer, {
      props: {
        filePath: '/repo/docs/plan-prd/TODO-AI.md',
        displayPath: 'docs/plan-prd/TODO-AI.md',
        workspaceRoot: '/repo',
        aiActionsEnabled: true
      }
    })
    await flushPromises()

    // Simulate user selecting text in rendered Markdown.
    mocks.selection!.value = {
      text: 'Stable 只覆盖 CoreBox text.chat。',
      rects: [{ left: 10, right: 120, top: 20, bottom: 40, width: 110, height: 20 } as DOMRect]
    }
    await flushPromises()

    expect(wrapper.find('[data-testid="md-selection-actions"]').exists()).toBe(true)

    // 1. Custom free-text prompt emits immediate send action.
    await wrapper.get('[data-testid="sel-submit-custom"]').trigger('click')
    const firstEmit = wrapper.emitted('ai-action')?.[0]?.[0] as { mode: string; prompt: string }
    expect(firstEmit.mode).toBe('send')
    expect(firstEmit.prompt).toContain('docs/plan-prd/TODO-AI.md')
    expect(firstEmit.prompt).toContain('> Stable 只覆盖 CoreBox text.chat。')
    expect(firstEmit.prompt).toContain('请补充风险点')

    // 2. Adding a review comment stores it in the comments dock and sends all comments to AI.
    mocks.selection!.value = {
      text: 'Stable 只覆盖 CoreBox text.chat。',
      rects: [{ left: 10, right: 120, top: 20, bottom: 40, width: 110, height: 20 } as DOMRect]
    }
    await flushPromises()

    await wrapper.get('[data-testid="sel-action-comment"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="file-viewer-comment-composer"]').exists()).toBe(true)

    await wrapper
      .get('[data-testid="file-viewer-comment-input"]')
      .setValue('这里口径需要补充 OCR 边界')
    await wrapper.get('[data-testid="file-viewer-comment-save"]').trigger('click')
    await flushPromises()

    // Review comments remain strictly in memory and never touch sessionStorage.
    expect(window.sessionStorage.length).toBe(0)
    expect(wrapper.find('[data-testid="file-viewer-comments-dock"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="file-viewer-comment-item"]')).toHaveLength(1)

    await wrapper.get('[data-testid="file-viewer-comments-send-all"]').trigger('click')
    await flushPromises()

    const batchEmit = wrapper.emitted('ai-action')?.[1]?.[0] as { mode: string; prompt: string }
    expect(batchEmit.mode).toBe('send')
    expect(batchEmit.prompt).toContain('这里口径需要补充 OCR 边界')
    expect(wrapper.find('[data-testid="file-viewer-comments-dock"]').exists()).toBe(false)
  })

  it('preserves unsent draft and queued review comments when host rejects the ai-action', async () => {
    let shouldAccept = false
    const wrapper = mount(WorkspaceFileViewer, {
      props: {
        filePath: '/repo/docs/plan-prd/TODO-AI.md',
        displayPath: 'docs/plan-prd/TODO-AI.md',
        workspaceRoot: '/repo',
        aiActionsEnabled: true,
        onAiAction: (payload: { settle?: (result: boolean | Promise<boolean>) => void }) => {
          payload.settle?.(Promise.resolve(shouldAccept))
        }
      }
    })
    await flushPromises()

    // 1. Draft "send now" stays open and preserves text when host rejects.
    mocks.selection!.value = {
      text: 'Stable 只覆盖 CoreBox text.chat。',
      rects: [{ left: 10, right: 120, top: 20, bottom: 40, width: 110, height: 20 } as DOMRect]
    }
    await flushPromises()
    await wrapper.get('[data-testid="sel-action-comment"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="file-viewer-comment-input"]').setValue('请先补单测')
    await wrapper.get('[data-testid="file-viewer-comment-send-now"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="file-viewer-comment-composer"]').exists()).toBe(true)
    expect(
      (wrapper.get('[data-testid="file-viewer-comment-input"]').element as HTMLTextAreaElement)
        .value
    ).toBe('请先补单测')

    // 2. Save to queue, then reject batch send -> queued comment stays intact.
    await wrapper.get('[data-testid="file-viewer-comment-save"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="file-viewer-comment-item"]')).toHaveLength(1)

    await wrapper.get('[data-testid="file-viewer-comments-send-all"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="file-viewer-comment-item"]')).toHaveLength(1)

    // 3. Once host accepts, queued comments clear cleanly.
    shouldAccept = true
    await wrapper.get('[data-testid="file-viewer-comments-send-all"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="file-viewer-comments-dock"]').exists()).toBe(false)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('keeps Responsive HTML preview full-bleed by default and supports device frame switcher, rotation, and shell toggle', async () => {
    mocks.send.mockResolvedValue({
      path: '/repo/demo/landing.html',
      name: 'landing.html',
      ext: 'html',
      kind: 'text',
      mimeType: 'text/html',
      size: 128,
      truncated: false,
      mtimeMs: Date.now(),
      text: '<!doctype html><html><body><h1>Hello Device</h1></body></html>'
    })

    const wrapper = mount(WorkspaceFileViewer, {
      props: {
        filePath: '/repo/demo/landing.html',
        displayPath: 'demo/landing.html',
        workspaceRoot: '/repo'
      }
    })
    await flushPromises()

    // Responsive is the default: full-bleed iframe directly without TdsDeviceFrame, strict CSP intact
    expect(wrapper.find('[data-testid="file-viewer-viewport-controls"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="file-viewer-device-frame"]').exists()).toBe(false)
    const defaultIframe = wrapper.get('iframe.WorkspaceFileViewer-Frame')
    expect(defaultIframe.attributes('sandbox')).toBe('allow-scripts allow-forms allow-modals')
    expect(defaultIframe.attributes('srcdoc')).toContain('Content-Security-Policy')
    expect(defaultIframe.attributes('srcdoc')).toContain("default-src 'none'")

    // Open viewport picker, search with Chinese keyword, pick iPhone 17 Pro
    await wrapper.get('[data-testid="file-viewer-viewport-trigger"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="file-viewer-viewport-search"]').setValue('手机')
    await flushPromises()
    expect(wrapper.find('[data-testid="file-viewer-viewport-option-iphone-17-pro"]').exists()).toBe(
      true
    )
    expect(wrapper.find('[data-testid="file-viewer-viewport-option-desktop-hd"]').exists()).toBe(
      false
    )

    await wrapper.get('[data-testid="file-viewer-viewport-option-iphone-17-pro"]').trigger('click')
    await flushPromises()

    // Sandboxed iframe is now wrapped inside TdsDeviceFrame with strict CSP preserved
    const frame = wrapper.get('[data-testid="file-viewer-device-frame"]')
    expect(frame.attributes('data-preset-id')).toBe('iphone-17-pro')
    expect(frame.attributes('data-orientation')).toBe('portrait')
    expect(frame.attributes('data-show-shell')).toBe('true')
    const framedIframe = frame.get('iframe.WorkspaceFileViewer-Frame')
    expect(framedIframe.attributes('sandbox')).toBe('allow-scripts allow-forms allow-modals')
    expect(framedIframe.attributes('srcdoc')).toContain("default-src 'none'")

    // Flip portrait -> landscape
    await wrapper.get('[data-testid="file-viewer-viewport-rotate"]').trigger('click')
    await flushPromises()
    expect(
      wrapper.get('[data-testid="file-viewer-device-frame"]').attributes('data-orientation')
    ).toBe('landscape')

    // Toggle device shell off and back on
    await wrapper.get('[data-testid="file-viewer-viewport-shell"]').trigger('click')
    await flushPromises()
    expect(
      wrapper.get('[data-testid="file-viewer-device-frame"]').attributes('data-show-shell')
    ).toBe('false')

    // Switching back to Responsive removes TdsDeviceFrame and restores full-bleed iframe
    await wrapper.get('[data-testid="file-viewer-viewport-trigger"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="file-viewer-viewport-option-responsive"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="file-viewer-device-frame"]').exists()).toBe(false)
    expect(wrapper.find('iframe.WorkspaceFileViewer-Frame').exists()).toBe(true)

    // Switching to source mode hides device viewport controls
    await wrapper.get('[data-testid="file-viewer-mode-source"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="file-viewer-viewport-controls"]').exists()).toBe(false)
  })

  it('enables device viewport switcher for SVG preview while preserving empty iframe sandbox', async () => {
    mocks.send.mockResolvedValue({
      path: '/repo/demo/icon.svg',
      name: 'icon.svg',
      ext: 'svg',
      kind: 'text',
      mimeType: 'image/svg+xml',
      size: 64,
      truncated: false,
      mtimeMs: Date.now(),
      text: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>'
    })

    const wrapper = mount(WorkspaceFileViewer, {
      props: {
        filePath: '/repo/demo/icon.svg',
        displayPath: 'demo/icon.svg',
        workspaceRoot: '/repo'
      }
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="file-viewer-viewport-controls"]').exists()).toBe(true)
    await wrapper.get('[data-testid="file-viewer-viewport-trigger"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="file-viewer-viewport-option-apple-watch-46"]').trigger('click')
    await flushPromises()

    const frame = wrapper.get('[data-testid="file-viewer-device-frame"]')
    expect(frame.attributes('data-preset-id')).toBe('apple-watch-46')
    // Watch is non-orientable so rotate button is hidden
    expect(wrapper.find('[data-testid="file-viewer-viewport-rotate"]').exists()).toBe(false)
    // SVG sandbox remains strictly empty
    expect(frame.get('iframe.WorkspaceFileViewer-Frame').attributes('sandbox')).toBe('')
  })

  it('runs live TDS static lint in HTML preview, toggles anti-slop rules, and sends structured fix prompts to AI', async () => {
    mocks.send.mockResolvedValue({
      path: '/repo/demo/sloppy.html',
      name: 'sloppy.html',
      ext: 'html',
      kind: 'text',
      mimeType: 'text/html',
      size: 320,
      truncated: false,
      mtimeMs: Date.now(),
      text: [
        '<!doctype html>',
        '<html><head><style>',
        '  body { min-height: 100vh; color: var(--shell-primry); }',
        '  h1 { background-clip: text; }',
        '</style></head>',
        '<body><img src="https://cdn.example.com/hero.png" /><h1>Hello</h1></body></html>'
      ].join('\n')
    })

    const wrapper = mount(WorkspaceFileViewer, {
      props: {
        filePath: '/repo/demo/sloppy.html',
        displayPath: 'demo/sloppy.html',
        workspaceRoot: '/repo',
        aiActionsEnabled: true
      }
    })
    await flushPromises()

    // Lint trigger pill reports live count (remote-asset-url + undefined-tds-token + viewport-unit-canvas + thick-border-or-glow = 4)
    expect(wrapper.get('[data-testid="tds-lint-count"]').text()).toBe('4')
    expect(wrapper.get('[data-testid="tds-lint-trigger"]').classes()).toContain('is-error')

    // Open popover and verify issues + rule ids
    await wrapper.get('[data-testid="tds-lint-trigger"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="tds-lint-popover"]').exists()).toBe(true)
    const ruleIdsBefore = wrapper
      .findAll('[data-testid="tds-lint-issue"]')
      .map((node) => node.attributes('data-rule-id'))
    expect(ruleIdsBefore).toEqual([
      'remote-asset-url',
      'undefined-tds-token',
      'viewport-unit-canvas',
      'thick-border-or-glow'
    ])

    // Toggling anti-slop off drops thick-border-or-glow immediately
    await wrapper.get('[data-testid="tds-lint-antislop-toggle"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="tds-lint-count"]').text()).toBe('3')
    const ruleIdsAfter = wrapper
      .findAll('[data-testid="tds-lint-issue"]')
      .map((node) => node.attributes('data-rule-id'))
    expect(ruleIdsAfter).toEqual([
      'remote-asset-url',
      'undefined-tds-token',
      'viewport-unit-canvas'
    ])

    // Clicking "Send to AI to fix" reuses dispatchAiAction('send', ...) with formatted fix prompt
    await wrapper.get('[data-testid="tds-lint-send-ai"]').trigger('click')
    await flushPromises()
    const aiAction = wrapper.emitted('ai-action')?.[0]?.[0] as {
      mode: string
      displayPath: string
      prompt: string
    }
    expect(aiAction.mode).toBe('send')
    expect(aiAction.displayPath).toBe('demo/sloppy.html')
    expect(aiAction.prompt).toContain('remote-asset-url')
    expect(aiAction.prompt).toContain('undefined-tds-token')
    expect(aiAction.prompt).toContain('viewport-unit-canvas')

    // Strict CSP sandbox remains untouched
    const iframe = wrapper.get('iframe.WorkspaceFileViewer-Frame')
    expect(iframe.attributes('sandbox')).toBe('allow-scripts allow-forms allow-modals')
    expect(iframe.attributes('srcdoc')).toContain("default-src 'none'")
  })

  it('runs debounced 300ms live DOM probe in Electron HTML preview, cancels on rapid file switch, and merges DOM + static issues', async () => {
    vi.useFakeTimers()
    try {
      mocks.send.mockImplementation(async (event: unknown, payload: Record<string, unknown>) => {
        if (event === AgentWorkspaceEvents.readFile) {
          if (payload.path === '/repo/demo/first.html') {
            return {
              path: '/repo/demo/first.html',
              name: 'first.html',
              ext: 'html',
              kind: 'text',
              mimeType: 'text/html',
              size: 120,
              truncated: false,
              mtimeMs: 1000,
              text: '<!doctype html><body><p>First page</p></body>'
            }
          }
          return {
            path: '/repo/demo/second.html',
            name: 'second.html',
            ext: 'html',
            kind: 'text',
            mimeType: 'text/html',
            size: 160,
            truncated: false,
            mtimeMs: 2000,
            text: '<!doctype html><body><img src="https://cdn.example.com/a.png" /><p class="muted">Low contrast</p></body>'
          }
        }
        if (event === TdsCaptureEvents.renderFrame) {
          return {
            ok: true,
            width: payload.width,
            height: payload.height,
            domProbeResult: [
              {
                ruleId: 'contrast-fail',
                phase: 'dom',
                severity: 'error',
                category: 'contrast',
                message: 'Text in `p.muted` has WCAG 2.1 contrast 2.20:1 (requires >= 4.5:1).',
                fixHint: 'Use --shell-text-primary',
                selector: 'p.muted'
              }
            ],
            durationMs: 14
          }
        }
        return null
      })

      const wrapper = mount(WorkspaceFileViewer, {
        props: {
          filePath: '/repo/demo/first.html',
          displayPath: 'demo/first.html',
          workspaceRoot: '/repo',
          aiActionsEnabled: true
        }
      })
      await flushPromises()

      // Before 300ms debounce elapses, switch to second.html -> first probe must be canceled!
      await vi.advanceTimersByTimeAsync(150)
      await wrapper.setProps({
        filePath: '/repo/demo/second.html',
        displayPath: 'demo/second.html'
      })
      await flushPromises()

      // Immediately has 1 static issue (remote-asset-url), no live DOM probe sent yet
      expect(wrapper.get('[data-testid="tds-lint-count"]').text()).toBe('1')
      const captureCallsBefore = mocks.send.mock.calls.filter(
        ([evt]) => evt === TdsCaptureEvents.renderFrame
      )
      expect(captureCallsBefore).toHaveLength(0)

      // After 300ms debounce, single DOM probe runs for second.html and merges contrast-fail!
      await vi.advanceTimersByTimeAsync(320)
      await flushPromises()

      const captureCallsAfter = mocks.send.mock.calls.filter(
        ([evt]) => evt === TdsCaptureEvents.renderFrame
      )
      expect(captureCallsAfter).toHaveLength(1)
      expect(captureCallsAfter[0]?.[1]?.srcdoc).toContain('Low contrast')
      expect(captureCallsAfter[0]?.[1]?.format).toBe('none')

      expect(wrapper.get('[data-testid="tds-lint-count"]').text()).toBe('2')
      await wrapper.get('[data-testid="tds-lint-trigger"]').trigger('click')
      await flushPromises()
      const ruleIds = wrapper
        .findAll('[data-testid="tds-lint-issue"]')
        .map((node) => node.attributes('data-rule-id'))
      expect(ruleIds).toEqual(['remote-asset-url', 'contrast-fail'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('scales TdsDeviceFrame cleanly inside 320px-460px narrow side-panel containers without clipping', async () => {
    const observerState: { callback: ResizeObserverCallback | null } = { callback: null }
    const originalRO = globalThis.ResizeObserver
    globalThis.ResizeObserver = class MockResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        observerState.callback = cb
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }

    try {
      mocks.send.mockResolvedValue({
        path: '/repo/demo/mobile.html',
        name: 'mobile.html',
        ext: 'html',
        kind: 'text',
        mimeType: 'text/html',
        size: 100,
        truncated: false,
        mtimeMs: Date.now(),
        text: '<!doctype html><body><main style="height:2400px">Long mobile page</main></body>'
      })

      const wrapper = mount(WorkspaceFileViewer, {
        props: {
          filePath: '/repo/demo/mobile.html',
          displayPath: 'demo/mobile.html',
          workspaceRoot: '/repo'
        }
      })
      await flushPromises()

      await wrapper.get('[data-testid="file-viewer-viewport-trigger"]').trigger('click')
      await flushPromises()
      await wrapper
        .get('[data-testid="file-viewer-viewport-option-iphone-17-pro"]')
        .trigger('click')
      await flushPromises()

      // Simulate narrow docked HomeSidePanel width (340px x 600px)
      observerState.callback?.(
        [{ contentRect: { width: 340, height: 600 } } as ResizeObserverEntry],
        {} as ResizeObserver
      )
      await nextTick()

      const frame = wrapper.get('[data-testid="file-viewer-device-frame"]')
      expect(frame.attributes('data-narrow')).toBe('true')
      const scale = Number(frame.attributes('data-scale'))
      expect(scale).toBeGreaterThan(0.1)
      expect(scale).toBeLessThan(1)
      // Scaled outer width (422 * scale) + padding must stay strictly within 340px container width
      expect(422 * scale).toBeLessThanOrEqual(340)
      // Scaled outer height (894 * scale) + meta bar (34px) must stay strictly within 600px container height
      expect(894 * scale + 34).toBeLessThanOrEqual(600)
    } finally {
      globalThis.ResizeObserver = originalRO
    }
  })
})
