// @vitest-environment jsdom
import type { TuffItem } from '@talex-touch/utils'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TuffItemPreviewer from './TuffItemPreviewer.vue'

const harness = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send: harness.send })
}))

vi.mock('@talex-touch/utils/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, isElectronRenderer: () => true }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    // Mirrors the real interpolating `t` for the one message the pane builds with params.
    t: (key: string, params?: Record<string, string>) =>
      params?.app ? `${key}:${params.app}` : key
  })
}))

// The pane composes these; it does not own their rendering, and the real ones drag in editors,
// markdown renderers and players that have nothing to do with the info pane.
vi.mock('./preview', () => {
  const stub = (name: string) => ({
    name,
    props: ['item', 'resourceUrl', 'searchQuery'],
    template: `<div class="preview-stub preview-stub--${name}" />`
  })

  return {
    AudioPreview: stub('AudioPreview'),
    CodePreview: stub('CodePreview'),
    DefaultPreview: stub('DefaultPreview'),
    ImagePreview: stub('ImagePreview'),
    MarkdownPreview: stub('MarkdownPreview'),
    TextPreview: stub('TextPreview'),
    VideoPreview: stub('VideoPreview')
  }
})

vi.mock('~/modules/platform/renderer-platform', () => ({
  getCurrentRendererPlatformState: () => ({ isMac: true })
}))

interface ApplicationAnswer {
  success: boolean
  application?: { identifier: string; displayName: string; icon: string | null } | null
}

/**
 * The host transport is the only thing this pane talks to; everything else it renders is real.
 * No test asserts "send was called" — the answers below only exist to drive the rendered row.
 */
function routeHostEvents(application: ApplicationAnswer): void {
  harness.send.mockImplementation(async (event: unknown) => {
    if (event === AppEvents.fileIndex.defaultApplication) return application
    if (event === AppEvents.fileIndex.previewResource) return { success: false }
    throw new Error(`unexpected host event: ${String(event)}`)
  })
}

function fileItem(path: string, sourceName = 'Documents'): TuffItem {
  return {
    id: `file:${path}`,
    kind: 'file',
    source: { id: 'file-provider', type: 'file', name: sourceName },
    render: { mode: 'default', basic: { title: path.split('/').pop() ?? path } },
    meta: { file: { path } }
  } as unknown as TuffItem
}

let wrapper: VueWrapper | null = null

function mountPreviewer(item: TuffItem): VueWrapper {
  wrapper?.unmount()
  wrapper = mount(TuffItemPreviewer, { props: { item } })
  return wrapper
}

/**
 * The 来源 row renders the icon and then the label stack: name on top, identifier underneath
 * when one resolved. Every branch renders the icon slot, so it is a stable landmark for the row.
 */
function sourceRow(): HTMLElement {
  return wrapper!.get('.source-icon').element.parentElement as HTMLElement
}

function sourceRowParts(): { name: string; identifier: string | null } {
  const stack = sourceRow().lastElementChild as HTMLElement
  const identifier = stack.querySelector('small')
  return {
    name: stack.firstElementChild?.textContent?.trim() ?? '',
    identifier: identifier ? (identifier.textContent?.trim() ?? '') : null
  }
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  harness.send.mockReset()
})

describe('TuffItemPreviewer scroll container', () => {
  it('roots the pane in the results scroller instead of leaving an unresolved txscroll element', () => {
    routeHostEvents({ success: true, application: null })

    const pane = mountPreviewer(fileItem('/Users/demo/Pictures/photo.png'))

    expect(pane.find('.tx-scroll').exists()).toBe(true)
    // An unregistered component renders as an inert custom element, which leaves the pane with
    // no scroll container at all — `.TuffItemAddon` then clips everything below the fold.
    expect(pane.find('txscroll').exists()).toBe(false)
    expect(pane.get('.tx-scroll').find('.preview-area').exists()).toBe(true)
    expect(pane.get('.tx-scroll').text()).toContain('/Users/demo/Pictures/photo.png')
  })
})

describe('TuffItemPreviewer source row', () => {
  it('labels the source row with the application the OS associates with the file', async () => {
    routeHostEvents({
      success: true,
      application: {
        identifier: 'com.apple.Preview',
        displayName: 'Preview',
        icon: 'tfile:///icons/com.apple.Preview.png'
      }
    })

    const pane = mountPreviewer(fileItem('/Users/demo/Pictures/photo.png'))
    await flushPromises()

    // The resolved application replaces the index source label, and the row carries its icon.
    expect(sourceRowParts()).toEqual({ name: 'Preview', identifier: 'com.apple.Preview' })
    expect(sourceRow().querySelector('img.source-icon')?.getAttribute('src')).toBe(
      'tfile:///icons/com.apple.Preview.png'
    )

    const openWith = pane.get('.open-with-action')
    expect(openWith.attributes('aria-label')).toContain('Preview')
    expect(openWith.text()).toContain('Preview')

    await openWith.trigger('click')
    expect(pane.emitted('openWith')).toEqual([['com.apple.Preview']])
    expect(pane.emitted('openItem')).toBeUndefined()
  })

  it('keeps the index source label when the host resolves no application', async () => {
    for (const answer of [{ success: true }, { success: true, application: null }] as const) {
      routeHostEvents(answer)

      const pane = mountPreviewer(fileItem('/Users/demo/Pictures/photo.png', 'Documents'))
      await flushPromises()

      expect(sourceRowParts()).toEqual({ name: 'Documents', identifier: null })
      expect(sourceRow().querySelector('img')).toBeNull()
      expect(pane.text()).not.toContain('undefined')
      expect(pane.find('.open-with-action').attributes('aria-label')).not.toContain('undefined')
    }
  })

  it('keeps the newest file application when an earlier lookup answers last', async () => {
    const pending = new Map<string, (answer: ApplicationAnswer) => void>()
    harness.send.mockImplementation((event: unknown, payload: unknown) => {
      if (event !== AppEvents.fileIndex.defaultApplication)
        return Promise.resolve({ success: false })
      const { path } = payload as { path: string }
      return new Promise<ApplicationAnswer>((resolve) => pending.set(path, resolve))
    })

    mountPreviewer(fileItem('/Users/demo/Pictures/first.png'))
    await wrapper!.setProps({ item: fileItem('/Users/demo/Pictures/second.png') })

    pending.get('/Users/demo/Pictures/second.png')?.({
      success: true,
      application: {
        identifier: 'com.apple.QuickTimePlayerX',
        displayName: 'QuickTime Player',
        icon: null
      }
    })
    await flushPromises()
    pending.get('/Users/demo/Pictures/first.png')?.({
      success: true,
      application: { identifier: 'com.apple.Preview', displayName: 'Preview', icon: null }
    })
    await flushPromises()

    expect(sourceRowParts()).toEqual({
      name: 'QuickTime Player',
      identifier: 'com.apple.QuickTimePlayerX'
    })
  })
})

describe('TuffItemPreviewer application metadata', () => {
  it.each([
    { name: 'application', kind: 'app', path: '/Applications/Example.app' },
    { name: 'indexed bundle', kind: 'file', path: '/Library/Example.bundle' }
  ])('shows the bundle id, version and creation date of an $name', async ({ kind, path }) => {
    routeHostEvents({ success: true, application: null })
    const pane = mountPreviewer({
      id: path,
      kind,
      source: { id: 'apps', type: 'application', name: 'Applications' },
      render: { mode: 'default', basic: { title: 'Example' } },
      meta: {
        app: {
          path,
          bundleId: 'com.example.Reader',
          version: '2.5.1',
          createdAt: '2026-06-17T10:30:00.000Z'
        },
        ...(kind === 'file'
          ? { file: { path, isDir: true, created_at: '2026-06-18T12:00:00.000Z' } }
          : {})
      }
    } as TuffItem)
    await flushPromises()

    const infoRows = pane.get('h3').element.parentElement!.querySelectorAll('h3 + div > div')
    const valueFor = (label: string) =>
      Array.from(infoRows)
        .find((row) => row.firstElementChild?.textContent?.trim() === label)
        ?.lastElementChild?.textContent?.trim()

    expect(valueFor('fileInfo.bundleId')).toBe('com.example.Reader')
    expect(valueFor('fileInfo.version')).toBe('2.5.1')
    expect(valueFor('fileInfo.createdAt')).toBe('2026-06-17T10:30:00.000Z')
  })
})

describe('TuffItemPreviewer deep match snippet', () => {
  it('renders matching snippet card with kind, page and score badges', async () => {
    routeHostEvents({ success: true, application: null })
    const pane = mountPreviewer({
      id: '/Documents/lease.pdf',
      kind: 'file',
      source: { id: 'files', type: 'file', name: 'Files' },
      render: { mode: 'default', basic: { title: 'lease.pdf' } },
      meta: {
        file: { path: '/Documents/lease.pdf' },
        deepMatch: {
          kind: 'semantic',
          snippet: 'Tenant shall not keep any pets without written consent',
          pageNumber: 4,
          score: 0.94,
          matchTerm: 'pets'
        }
      }
    } as TuffItem)
    await flushPromises()

    const text = pane.text()
    expect(text).toContain('fileInfo.deepMatchTitle')
    expect(text).toContain('fileInfo.deepMatchSemantic')
    expect(text).toContain('Tenant shall not keep any')
    expect(pane.find('mark').text()).toBe('pets')
  })
})

describe('TuffItemPreviewer original UTF16 snippet rendering', () => {
  it('renders hostile markup as literal text and highlights original entity and emoji offsets', async () => {
    routeHostEvents({ success: true, application: null })
    const snippet = '<img src=x onerror=alert(1)> &amp; 🐾 pets'
    const entity = snippet.indexOf('&amp;')
    const emoji = snippet.indexOf('🐾')
    const item = fileItem('/Documents/lease.pdf')
    item.meta!.deepMatch = {
      kind: 'semantic',
      snippet,
      pageNumber: 4,
      score: 0.94,
      matchTerm: 'img',
      highlightRanges: [
        { start: entity, end: entity + 5 },
        { start: emoji, end: emoji + 2 }
      ]
    }
    const pane = mountPreviewer(item)
    await flushPromises()
    const card = pane.get('.deep-match-snippet')
    expect(card.element.textContent).toBe(snippet)
    expect(card.findAll('mark').map((mark) => mark.text())).toEqual(['&amp;', '🐾'])
    expect(card.find('img').exists()).toBe(false)
    expect(card.find('script').exists()).toBe(false)
  })

  it('honors explicit empty ranges instead of inventing literal highlights for semantic terms', async () => {
    routeHostEvents({ success: true, application: null })
    const item = fileItem('/Documents/lease.pdf')
    item.meta!.deepMatch = {
      kind: 'semantic',
      snippet: 'No pets are permitted.',
      matchTerm: 'pets',
      highlightRanges: []
    }
    const pane = mountPreviewer(item)
    await flushPromises()
    expect(pane.get('.deep-match-snippet').text()).toBe('No pets are permitted.')
    expect(pane.get('.deep-match-snippet').findAll('mark')).toEqual([])
  })
})
