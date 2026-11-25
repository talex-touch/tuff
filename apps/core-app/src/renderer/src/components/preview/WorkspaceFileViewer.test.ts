// @vitest-environment jsdom

import type { SelectionPayload } from '@talex-touch/tuffex/selection-actions'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

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
    template: '<div><slot name="reference" /><div v-if="modelValue"><slot /></div></div>'
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

import WorkspaceFileViewer from './WorkspaceFileViewer.vue'

describe('WorkspaceFileViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
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

    expect(wrapper.find('[data-testid="file-viewer-comments-dock"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="file-viewer-comment-item"]')).toHaveLength(1)

    await wrapper.get('[data-testid="file-viewer-comments-send-all"]').trigger('click')
    await flushPromises()

    const batchEmit = wrapper.emitted('ai-action')?.[1]?.[0] as { mode: string; prompt: string }
    expect(batchEmit.mode).toBe('send')
    expect(batchEmit.prompt).toContain('这里口径需要补充 OCR 边界')
    expect(wrapper.find('[data-testid="file-viewer-comments-dock"]').exists()).toBe(false)
  })
})
