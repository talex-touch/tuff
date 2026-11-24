// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file */
import type { VueWrapper } from '@vue/test-utils'
import type { ITuffTransport } from '@talex-touch/utils/transport'
import * as rendererSdk from '@talex-touch/utils/renderer'
import * as rendererTransport from '@talex-touch/utils/transport'
import * as environment from '@talex-touch/utils/env'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { AgentWorkspaceEvents } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import { createAppSdk } from '@talex-touch/utils/transport/sdk/domains/app'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import {
  cleanPathCandidate,
  extractLineNumber,
  extractPathFromEvent,
  extractWebUrlFromEvent,
  isHttpWebUrl,
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
  {
    name: 'temporary space absolute html path',
    raw: '/private/tmp/tuff-spaces/daa3de7e/login.html',
    path: '/private/tmp/tuff-spaces/daa3de7e/login.html'
  },
  {
    name: 'file URL',
    raw: 'file:///private/tmp/tuff-spaces/daa3de7e/login.html',
    path: '/private/tmp/tuff-spaces/daa3de7e/login.html'
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

describe('cleanPathCandidate & extractLineNumber', () => {
  it.each(pathCases)('cleans $name without losing the path', ({ raw, path }) => {
    expect(cleanPathCandidate(raw)).toBe(path)
  })

  it('extracts optional line numbers from path strings', () => {
    expect(extractLineNumber('src/main.ts:42')).toBe(42)
    expect(extractLineNumber('`docs/TODO.md:10:20`')).toBe(10)
    expect(extractLineNumber('login.html')).toBeUndefined()
  })
})

describe('isPotentialFilePath & isHttpWebUrl', () => {
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
  ])('rejects $name as file path', ({ raw }) => {
    expect(isPotentialFilePath(raw)).toBe(false)
  })

  it('recognizes HTTP(S) web URLs', () => {
    expect(isHttpWebUrl('https://example.com/foo')).toBe(true)
    expect(isHttpWebUrl('http://localhost:5173/')).toBe(true)
    expect(isHttpWebUrl('file:///tmp/login.html')).toBe(false)
    expect(isHttpWebUrl('login.html')).toBe(false)
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
      event.preventDefault()
    },
    { once: true }
  )
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  return path
}

describe('extractPathFromEvent & extractWebUrlFromEvent', () => {
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

  it('extracts http(s) web URLs from anchors and inline code', () => {
    const anchor = document.createElement('a')
    anchor.setAttribute('href', 'https://example.com/docs')
    anchor.textContent = 'Docs'
    let url: string | null = null
    anchor.addEventListener(
      'click',
      (event) => {
        url = extractWebUrlFromEvent(event)
        event.preventDefault()
      },
      { once: true }
    )
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(url).toBe('https://example.com/docs')
  })
})

function mountFileLinks(
  projectRoot: string | undefined,
  extra?: { resolveRelativePath?: (candidatePath: string) => string | null }
) {
  const openFileExternalSpy = vi.fn(async (_payload?: unknown) => ({ opened: true }))
  const transport = {
    send: async (event: unknown, payload?: unknown) => {
      if (event === AppEvents.system.getCwd) return '/workspace/cwd'
      if (event === AgentWorkspaceEvents.openFileExternal) return openFileExternalSpy(payload)
      if (event === AppEvents.system.openApp) return
      if (event === AppEvents.system.openExternal) return
      throw new Error('Unexpected transport event')
    }
  } as unknown as ITuffTransport
  const sdk = createAppSdk(transport)
  const openExternal = vi.spyOn(sdk, 'openExternal')
  vi.spyOn(rendererSdk, 'useAppSdk').mockReturnValue(sdk)
  vi.spyOn(rendererTransport, 'useTuffTransport').mockReturnValue(transport)
  vi.spyOn(environment, 'isElectronRenderer').mockReturnValue(true)

  const onOpenRight = vi.fn()
  const onOpenWebRight = vi.fn()
  const onOpenFileInBrowser = vi.fn()
  const onOpenWebInBrowser = vi.fn()
  const onOpenFileExternal = vi.fn()
  const onOpenWebExternal = vi.fn()
  const root = ref(projectRoot)

  const wrapper = mount(
    defineComponent({
      setup() {
        const container = ref<HTMLElement | null>(null)
        useFileLinkClick({
          container,
          projectRoot: root,
          resolveRelativePath: extra?.resolveRelativePath,
          onOpenRight,
          onOpenWebRight,
          onOpenFileInBrowser,
          onOpenWebInBrowser,
          onOpenFileExternal,
          onOpenWebExternal
        })
        return () =>
          h('div', { ref: container }, [
            h('code', { class: 'file-code' }, '`docs/plan-prd/TODO-AI.md:10:20`'),
            h('code', { class: 'login-code' }, 'login.html'),
            h('a', { class: 'web-link', href: 'https://example.com/guide' }, 'Example Guide'),
            h('pre', [h('code', { class: 'code-block' }, 'login.html')]),
            h('span', { class: 'prose' }, 'This is ordinary prose')
          ])
      }
    }),
    {
      global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en: {} } })] }
    }
  )
  wrappers.push(wrapper)
  return {
    wrapper,
    onOpenRight,
    onOpenWebRight,
    onOpenFileInBrowser,
    onOpenWebInBrowser,
    onOpenFileExternal,
    onOpenWebExternal,
    openFileExternalSpy,
    openExternal,
    root
  }
}

function click(target: Element, modifiers: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...modifiers
  })
  target.dispatchEvent(event)
  return event
}

describe('useFileLinkClick', () => {
  it('opens marked file paths in the right sidebar on default plain click (no modifier)', () => {
    const { wrapper, onOpenRight, onOpenFileInBrowser } = mountFileLinks('/workspace/project')

    const event = click(wrapper.get('.file-code').element)

    expect(onOpenRight).toHaveBeenCalledExactlyOnceWith({
      absolutePath: '/workspace/project/docs/plan-prd/TODO-AI.md',
      displayPath: 'docs/plan-prd/TODO-AI.md',
      line: 10
    })
    expect(onOpenFileInBrowser).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })

  it('opens http(s) links in the right sidebar on default plain click', () => {
    const { wrapper, onOpenWebRight, onOpenWebInBrowser } = mountFileLinks('/workspace/project')

    const event = click(wrapper.get('.web-link').element)

    expect(onOpenWebRight).toHaveBeenCalledExactlyOnceWith('https://example.com/guide')
    expect(onOpenWebInBrowser).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })

  it.each([
    { name: 'Command+Option', modifiers: { metaKey: true, altKey: true } },
    { name: 'Control+Alt', modifiers: { ctrlKey: true, altKey: true } }
  ])(
    '$name+Click opens web links in the built-in browser instead of the sidebar',
    ({ modifiers }) => {
      const { wrapper, onOpenWebRight, onOpenWebInBrowser } = mountFileLinks('/workspace/project')

      const event = click(wrapper.get('.web-link').element, modifiers)

      expect(onOpenWebInBrowser).toHaveBeenCalledExactlyOnceWith('https://example.com/guide')
      expect(onOpenWebRight).not.toHaveBeenCalled()
      expect(event.defaultPrevented).toBe(true)
    }
  )

  it.each([
    { name: 'Command+Option', modifiers: { metaKey: true, altKey: true } },
    { name: 'Control+Alt', modifiers: { ctrlKey: true, altKey: true } }
  ])(
    '$name+Click opens file links in the built-in browser instead of the sidebar',
    ({ modifiers }) => {
      const { wrapper, onOpenRight, onOpenFileInBrowser } = mountFileLinks(
        '/private/tmp/tuff-spaces/abc'
      )

      const event = click(wrapper.get('.login-code').element, modifiers)

      expect(onOpenFileInBrowser).toHaveBeenCalledExactlyOnceWith({
        absolutePath: '/private/tmp/tuff-spaces/abc/login.html',
        displayPath: 'login.html'
      })
      expect(onOpenRight).not.toHaveBeenCalled()
      expect(event.defaultPrevented).toBe(true)
    }
  )

  it('uses smart conversation path resolution for relative filenames like login.html', () => {
    const { wrapper, onOpenRight } = mountFileLinks(undefined, {
      resolveRelativePath: (candidate) =>
        candidate === 'login.html' ? '/private/tmp/tuff-spaces/conv-1/login.html' : null
    })

    click(wrapper.get('.login-code').element)

    expect(onOpenRight).toHaveBeenCalledExactlyOnceWith({
      absolutePath: '/private/tmp/tuff-spaces/conv-1/login.html',
      displayPath: 'login.html'
    })
  })

  it('Command+Shift+Click opens files externally instead of the sidebar', () => {
    const { wrapper, onOpenRight, onOpenFileExternal } = mountFileLinks('/workspace/project')

    const event = click(wrapper.get('.file-code').element, { metaKey: true, shiftKey: true })

    expect(onOpenFileExternal).toHaveBeenCalledExactlyOnceWith({
      absolutePath: '/workspace/project/docs/plan-prd/TODO-AI.md',
      displayPath: 'docs/plan-prd/TODO-AI.md',
      line: 10
    })
    expect(onOpenRight).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })

  it('does not hijack plain clicks inside fenced code blocks or ordinary prose', () => {
    const { wrapper, onOpenRight } = mountFileLinks('/workspace/project')

    const blockEvent = click(wrapper.get('.code-block').element)
    const proseEvent = click(wrapper.get('.prose').element)

    expect(onOpenRight).not.toHaveBeenCalled()
    expect(blockEvent.defaultPrevented).toBe(false)
    expect(proseEvent.defaultPrevented).toBe(false)
  })

  it('does not hijack plain click when the user has selected text', () => {
    const { wrapper, onOpenRight } = mountFileLinks('/workspace/project')
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      toString: () => 'login.html'
    } as unknown as Selection)

    const event = click(wrapper.get('.login-code').element)

    expect(onOpenRight).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('resolves relative paths against main-process cwd when no workspace root is available', async () => {
    const { wrapper, onOpenRight } = mountFileLinks(undefined)
    await Promise.resolve()

    click(wrapper.get('.file-code').element)

    expect(onOpenRight).toHaveBeenCalledExactlyOnceWith({
      absolutePath: '/workspace/cwd/docs/plan-prd/TODO-AI.md',
      displayPath: 'docs/plan-prd/TODO-AI.md',
      line: 10
    })
  })
})

describe('useFileLinkClick path & link marking', () => {
  it('marks inline file paths and web links, skips prose and code blocks, and follows streamed nodes', async () => {
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
    expect(wrapper.get('.word').classes()).not.toContain('is-file-path')
    expect(wrapper.get('.url').classes()).toContain('is-web-link')
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
