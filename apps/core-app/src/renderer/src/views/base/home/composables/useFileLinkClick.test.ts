// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file */
import type { VueWrapper } from '@vue/test-utils'
import type { ITuffTransport } from '@talex-touch/utils/transport'
import * as rendererSdk from '@talex-touch/utils/renderer'
import * as rendererTransport from '@talex-touch/utils/transport'
import * as environment from '@talex-touch/utils/env'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { createAppSdk } from '@talex-touch/utils/transport/sdk/domains/app'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import {
  cleanPathCandidate,
  extractPathFromEvent,
  isPotentialFilePath,
  resolveAbsolutePath,
  useFileLinkClick
} from './useFileLinkClick'

const wrappers: VueWrapper[] = []

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

const pathCases = [
  {
    name: 'implicit relative path',
    raw: 'docs/plan-prd/TODO-AI.md',
    path: 'docs/plan-prd/TODO-AI.md'
  },
  { name: 'dot relative path', raw: './src/index.ts', path: './src/index.ts' },
  { name: 'parent relative path', raw: '../package.json', path: '../package.json' },
  {
    name: 'POSIX absolute path',
    raw: '/Users/foo/project/file.md',
    path: '/Users/foo/project/file.md'
  },
  { name: 'Windows absolute path', raw: 'C:\\project\\file.ts', path: 'C:\\project\\file.ts' },
  { name: 'backticks', raw: '`docs/plan-prd/TODO-AI.md`', path: 'docs/plan-prd/TODO-AI.md' },
  { name: 'single quotes', raw: "'src/main.ts'", path: 'src/main.ts' },
  { name: 'double quotes and whitespace', raw: '  "src/main.ts"  ', path: 'src/main.ts' },
  { name: 'brackets', raw: '[docs/TODO.md]', path: 'docs/TODO.md' },
  { name: 'parentheses and line number', raw: '(docs/TODO.md:42)', path: 'docs/TODO.md' },
  { name: 'line number', raw: 'src/main.ts:10', path: 'src/main.ts' },
  { name: 'line and column', raw: 'src/main.ts:10:20', path: 'src/main.ts' },
  {
    name: 'Windows drive and line number',
    raw: 'C:\\project\\file.ts:10:20',
    path: 'C:\\project\\file.ts'
  }
]

describe('cleanPathCandidate', () => {
  it.each(pathCases)('cleans $name without losing the path', ({ raw, path }) => {
    expect(cleanPathCandidate(raw)).toBe(path)
  })
})

describe('isPotentialFilePath', () => {
  it.each(pathCases)('recognizes $name', ({ raw }) => {
    expect(isPotentialFilePath(raw)).toBe(true)
  })

  it.each([
    { name: 'HTTPS URL with a file extension', raw: 'https://example.com/foo.md' },
    { name: 'HTTP URL', raw: 'http://example.com/foo.md' },
    { name: 'quoted URL', raw: '`https://example.com/foo.md`' },
    { name: 'mailto URL', raw: 'mailto:foo@example.com' },
    { name: 'empty text', raw: '' },
    { name: 'whitespace', raw: '  \t\n ' },
    { name: 'plain sentence', raw: 'Please open the project documentation' },
    { name: 'multiple lines containing paths', raw: 'src/main.ts\nsrc/index.ts' }
  ])('rejects $name', ({ raw }) => {
    expect(isPotentialFilePath(raw)).toBe(false)
  })
})

describe('resolveAbsolutePath', () => {
  it.each([
    { name: 'POSIX', path: '/Users/foo/project/file.md' },
    { name: 'Windows', path: 'C:\\project\\file.ts' }
  ])('preserves $name absolute paths rather than prefixing the project root', ({ path }) => {
    expect(resolveAbsolutePath(path, '/different/project')).toBe(path)
  })

  it.each([
    {
      name: 'nested path',
      path: 'docs/plan-prd/TODO-AI.md',
      root: '/workspace/project',
      expected: '/workspace/project/docs/plan-prd/TODO-AI.md'
    },
    {
      name: 'dot prefix',
      path: './src/index.ts',
      root: '/workspace/project',
      expected: '/workspace/project/src/index.ts'
    },
    {
      name: 'trailing root separator',
      path: 'src/main.ts',
      root: '/workspace/project/',
      expected: '/workspace/project/src/main.ts'
    },
    {
      name: 'decorated path',
      path: '`src/main.ts:10:20`',
      root: '/workspace/project',
      expected: '/workspace/project/src/main.ts'
    }
  ])('joins $name with the supplied project root', ({ path, root, expected }) => {
    expect(resolveAbsolutePath(path, root)).toBe(expected)
  })
})

function extractFrom(target: HTMLElement): string | null {
  let path: string | null = null
  target.addEventListener(
    'click',
    (event) => {
      path = extractPathFromEvent(event)
      // Extraction is under test here, not the browser's anchor navigation.
      event.preventDefault()
    },
    { once: true }
  )
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  return path
}

describe('extractPathFromEvent', () => {
  it('extracts cleaned code text when a nested element receives the click', () => {
    const code = document.createElement('code')
    const child = document.createElement('span')
    child.textContent = '`docs/plan-prd/TODO-AI.md:10:20`'
    code.append(child)

    expect(extractFrom(child)).toBe('docs/plan-prd/TODO-AI.md')
  })

  it('prefers an anchor href over its different path-shaped label', () => {
    const anchor = document.createElement('a')
    anchor.setAttribute('href', './src/index.ts:10')
    const child = document.createElement('span')
    child.textContent = 'docs/other.md'
    anchor.append(child)

    expect(extractFrom(child)).toBe('./src/index.ts')
  })

  it.each([
    { name: 'missing href', href: null },
    { name: 'non-file href', href: 'https://example.com' }
  ])('uses path-shaped anchor text with a $name', ({ href }) => {
    const anchor = document.createElement('a')
    if (href !== null) anchor.setAttribute('href', href)
    anchor.textContent = "'src/main.ts:42'"

    expect(extractFrom(anchor)).toBe('src/main.ts')
  })

  it('extracts a path from direct plain text', () => {
    const target = document.createElement('span')
    target.textContent = '(docs/TODO.md:42)'

    expect(extractFrom(target)).toBe('docs/TODO.md')
  })

  it.each([
    { name: 'a web link', tag: 'a', text: 'https://example.com/foo.md' },
    { name: 'prose', tag: 'span', text: 'Please open the project documentation' }
  ])('does not extract a file from $name', ({ tag, text }) => {
    const target = document.createElement(tag)
    target.textContent = text
    if (target instanceof HTMLAnchorElement) target.href = text

    expect(extractFrom(target)).toBeNull()
  })
})

function mountFileLinks(projectRoot: string | undefined) {
  const transport = {
    send: async (event: unknown) => {
      if (event === AppEvents.system.getCwd) return '/workspace/cwd'
      if (event === AppEvents.system.openApp) return
      throw new Error('Unexpected transport event')
    }
  } as unknown as ITuffTransport
  const sdk = createAppSdk(transport)
  const openApp = vi.spyOn(sdk, 'openApp')
  vi.spyOn(rendererSdk, 'useAppSdk').mockReturnValue(sdk)
  vi.spyOn(rendererTransport, 'useTuffTransport').mockReturnValue(transport)
  vi.spyOn(environment, 'isElectronRenderer').mockReturnValue(true)
  const onOpenRight = vi.fn()
  const root = ref(projectRoot)
  const wrapper = mount(
    defineComponent({
      setup() {
        const container = ref<HTMLElement | null>(null)
        useFileLinkClick({ container, projectRoot: root, onOpenRight })
        return () =>
          h('div', { ref: container }, [
            h('code', '`docs/plan-prd/TODO-AI.md:10:20`'),
            h('span', 'This is ordinary prose')
          ])
      }
    }),
    {
      global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en: {} } })] }
    }
  )
  wrappers.push(wrapper)
  return { wrapper, onOpenRight, openApp, root }
}

function click(target: Element, modifiers: MouseEventInit): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...modifiers })
  target.dispatchEvent(event)
  return event
}

describe('useFileLinkClick', () => {
  it.each([
    { name: 'Command', modifiers: { metaKey: true } },
    { name: 'Control', modifiers: { ctrlKey: true } }
  ])(
    '$name+Click opens the cleaned path in the right pane and consumes navigation',
    ({ modifiers }) => {
      const { wrapper, onOpenRight, openApp } = mountFileLinks('/workspace/project')

      const event = click(wrapper.get('code').element, modifiers)

      expect(onOpenRight).toHaveBeenCalledExactlyOnceWith({
        absolutePath: '/workspace/project/docs/plan-prd/TODO-AI.md',
        displayPath: 'docs/plan-prd/TODO-AI.md'
      })
      expect(openApp).not.toHaveBeenCalled()
      expect(event.defaultPrevented).toBe(true)
    }
  )

  it('Command+Shift+Click opens the resolved path with the system instead of the right pane', () => {
    const { wrapper, onOpenRight, openApp } = mountFileLinks('/workspace/project')

    const event = click(wrapper.get('code').element, { metaKey: true, shiftKey: true })

    expect(openApp).toHaveBeenCalledExactlyOnceWith({
      path: '/workspace/project/docs/plan-prd/TODO-AI.md'
    })
    expect(onOpenRight).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })

  it('resolves relative paths against the main-process cwd when no project is selected', async () => {
    const { wrapper, onOpenRight } = mountFileLinks(undefined)
    // The already-resolved transport response must reach the composable before the click.
    await Promise.resolve()

    click(wrapper.get('code').element, { metaKey: true })

    expect(onOpenRight).toHaveBeenCalledExactlyOnceWith({
      absolutePath: '/workspace/cwd/docs/plan-prd/TODO-AI.md',
      displayPath: 'docs/plan-prd/TODO-AI.md'
    })
  })

  it('uses the current project root when the selected project changes', () => {
    const { wrapper, root, onOpenRight } = mountFileLinks('/workspace/old-project')
    root.value = '/workspace/new-project'

    click(wrapper.get('code').element, { metaKey: true })

    expect(onOpenRight).toHaveBeenCalledExactlyOnceWith({
      absolutePath: '/workspace/new-project/docs/plan-prd/TODO-AI.md',
      displayPath: 'docs/plan-prd/TODO-AI.md'
    })
  })

  it.each([
    { name: 'regular click', selector: 'code', modifiers: {} },
    { name: 'Shift-only click', selector: 'code', modifiers: { shiftKey: true } },
    { name: 'Command+Click on prose', selector: 'span', modifiers: { metaKey: true } },
    {
      name: 'Command+Shift+Click on prose',
      selector: 'span',
      modifiers: { metaKey: true, shiftKey: true }
    }
  ])('leaves $name untouched', ({ selector, modifiers }) => {
    const { wrapper, onOpenRight, openApp } = mountFileLinks('/workspace/project')

    const event = click(wrapper.get(selector).element, modifiers)

    expect(onOpenRight).not.toHaveBeenCalled()
    expect(openApp).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('stops opening paths after the transcript is unmounted', () => {
    const { wrapper, onOpenRight, openApp } = mountFileLinks('/workspace/project')
    const code = wrapper.get('code').element
    wrapper.unmount()
    wrappers.splice(wrappers.indexOf(wrapper), 1)

    const event = click(code, { metaKey: true })

    expect(onOpenRight).not.toHaveBeenCalled()
    expect(openApp).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('useFileLinkClick path marking', () => {
  it('marks inline paths and file links, skips prose, URLs and code blocks, and follows streamed nodes', async () => {
    vi.spyOn(environment, 'isElectronRenderer').mockReturnValue(false)
    const extra = ref<string[]>([])
    const wrapper = mount(
      defineComponent({
        setup() {
          const container = ref<HTMLElement | null>(null)
          useFileLinkClick({ container, projectRoot: ref('/workspace'), onOpenRight: vi.fn() })
          return () =>
            h('div', { ref: container }, [
              h('code', { class: 'path' }, 'docs/plan-prd/TODO-AI.md'),
              h('code', { class: 'word' }, 'npm install'),
              h('a', { class: 'url', href: 'https://example.com/a.md' }, 'site'),
              h('pre', [h('code', { class: 'block' }, 'docs/plan-prd/TODO-AI.md')]),
              ...extra.value.map((text) => h('code', { class: 'late' }, text))
            ])
        }
      }),
      { global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en: {} } })] } }
    )
    wrappers.push(wrapper)

    expect(wrapper.get('.path').classes()).toContain('is-file-path')
    expect(wrapper.get('.path').attributes('title')).toContain('docs/plan-prd/TODO-AI.md')
    expect(wrapper.get('.word').classes()).not.toContain('is-file-path')
    expect(wrapper.get('.url').classes()).not.toContain('is-file-path')
    expect(wrapper.get('.block').classes()).not.toContain('is-file-path')

    extra.value = ['src/main.ts:10']
    await wrapper.vm.$nextTick()
    const frame = Promise.withResolvers<void>()
    requestAnimationFrame(() => frame.resolve())
    await frame.promise
    expect(wrapper.get('.late').classes()).toContain('is-file-path')
  })
})
