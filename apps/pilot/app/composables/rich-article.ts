import type { App } from 'vue'
import { createApp } from 'vue'
import RenderCodeHeader from '~/components/article/components/RenderCodeHeader.vue'

type RichArticleDestroy = () => void

interface IRichFunc {
  destroy: () => void
  init: () => void
}

const previewableLangSet = new Set(['html', 'svg'])

function resolveCodeLanguage(preDom: HTMLElement, codeDom: HTMLElement): string {
  const attrSource = [
    preDom.getAttribute('data-language') || '',
    codeDom.getAttribute('data-language') || '',
  ].join(' ')
  const classSource = `${preDom.className || ''} ${codeDom.className || ''}`
  const langSource = `${attrSource} ${classSource}`
  const match = langSource.match(/(?:lang|language)-([\w-]+)/i)

  return (match?.[1] || 'text').toLowerCase()
}

function openCodePreview(language: string, code: string) {
  const legacyMasks = document.querySelectorAll<HTMLElement>('.RichCodePreview-Mask')
  legacyMasks.forEach(mask => mask.remove())

  const mask = document.createElement('div')
  mask.className = 'RichCodePreview-Mask'

  const panel = document.createElement('div')
  panel.className = 'RichCodePreview-Panel'

  const header = document.createElement('div')
  header.className = 'RichCodePreview-Header'

  const title = document.createElement('span')
  title.textContent = `${language.toUpperCase()} 预览`

  const closeDom = document.createElement('button')
  closeDom.className = 'RichCodePreview-Close'
  closeDom.type = 'button'
  closeDom.textContent = '关闭'

  const body = document.createElement('div')
  body.className = 'RichCodePreview-Body'

  const iframe = document.createElement('iframe')
  iframe.className = 'RichCodePreview-Frame'
  iframe.setAttribute('sandbox', 'allow-scripts')
  iframe.srcdoc = code

  header.appendChild(title)
  header.appendChild(closeDom)
  body.appendChild(iframe)
  panel.appendChild(header)
  panel.appendChild(body)
  mask.appendChild(panel)

  function closePreview() {
    document.removeEventListener('keydown', onKeydown)
    mask.remove()
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closePreview()
    }
  }

  closeDom.addEventListener('click', closePreview)
  mask.addEventListener('click', (event) => {
    if (event.target === mask) {
      closePreview()
    }
  })

  document.addEventListener('keydown', onKeydown)
  document.body.appendChild(mask)
}

function createCodeBlockRich(editor: HTMLElement): IRichFunc {
  const mountedApps = new Map<HTMLElement, App<Element>>()

  function pruneUnmountedApps() {
    mountedApps.forEach((app, wrapper) => {
      if (wrapper.isConnected) {
        return
      }

      app.unmount()
      mountedApps.delete(wrapper)
    })
  }

  function resolveEditorRoot(): HTMLElement {
    const root = editor.querySelector('.editor')
    return root instanceof HTMLElement ? root : editor
  }

  function enhanceCodeBlock(preDom: HTMLElement) {
    const codeDom = preDom.querySelector('code')
    if (!(codeDom instanceof HTMLElement)) {
      return
    }

    const parentDom = preDom.parentElement
    if (!parentDom) {
      return
    }

    const language = resolveCodeLanguage(preDom, codeDom)

    const wrapper = document.createElement('div')
    wrapper.className = 'rich-article EditorCode EditorCode--Readonly'

    const headerHost = document.createElement('div')
    headerHost.className = 'EditorCode-HeaderHost'

    const content = document.createElement('div')
    content.className = 'EditorCode-Content'

    parentDom.insertBefore(wrapper, preDom)
    content.appendChild(preDom)
    wrapper.appendChild(headerHost)
    wrapper.appendChild(content)

    const app = createApp(RenderCodeHeader, {
      language,
      previewable: previewableLangSet.has(language),
      codeResolver: () => codeDom.textContent || '',
      onPreview: ({ language: previewLang, code }: { language: string, code: string }) => {
        openCodePreview(previewLang, code)
      },
    })

    app.mount(headerHost)
    mountedApps.set(wrapper, app)
  }

  function genCodeEnhancement() {
    const root = resolveEditorRoot()

    root.querySelectorAll('pre').forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return
      }

      if (node.closest('.EditorCode')) {
        return
      }

      enhanceCodeBlock(node)
    })
  }

  return {
    init() {
      pruneUnmountedApps()
      genCodeEnhancement()
    },
    destroy() {
      mountedApps.forEach((app) => {
        app.unmount()
      })
      mountedApps.clear()
    },
  }
}

const richMap = new WeakMap<HTMLElement, IRichFunc>()

export function useRichArticle(editorDom: HTMLElement): RichArticleDestroy {
  let rich = richMap.get(editorDom)
  if (!rich) {
    rich = createCodeBlockRich(editorDom)
    richMap.set(editorDom, rich)
  }
  rich.init()

  return () => {
    const activeRich = richMap.get(editorDom)
    if (!activeRich) {
      return
    }
    activeRich.destroy()
    richMap.delete(editorDom)
  }
}
