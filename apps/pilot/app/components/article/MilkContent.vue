<script setup lang="ts">
import type { App } from 'vue'
import { defaultValueCtx, Editor, editorViewOptionsCtx, rootCtx, SchemaReady } from '@milkdown/core'
import { katexOptionsCtx, math } from '@milkdown/plugin-math'
import { prism, prismConfig } from '@milkdown/plugin-prism'
import { codeBlockSchema, commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { nord } from '@milkdown/theme-nord'
import { $view, outline, replaceAll } from '@milkdown/utils'
import c from 'refractor/c'
import cpp from 'refractor/cpp'
import css from 'refractor/css'
import java from 'refractor/java'
import javascript from 'refractor/javascript'
import jsx from 'refractor/jsx'
import markdown from 'refractor/markdown'
import python from 'refractor/python'
import tsx from 'refractor/tsx'
import typescript from 'refractor/typescript'
import { createApp } from 'vue'
import type { MarkmapRenderer } from '~/components/article/renderers/markmap-renderer'
import RenderCodeHeader from '~/components/article/components/RenderCodeHeader.vue'
import { createMarkmapRenderer, reportMarkmapError, resolveMarkmapErrorMessage } from '~/components/article/renderers/markmap-renderer'
import { renderMermaidSvg, reportMermaidError, resolveMermaidErrorMessage } from '~/components/article/renderers/mermaid-renderer'
import { useRichArticle } from '~/composables/rich-article'
import '@milkdown/theme-nord/style.css'
import '~/components/render/style.css'
import 'prism-themes/themes/prism-nord.css'
import 'katex/dist/katex.min.css'

const props = withDefaults(defineProps<{
  content: string
  disableRich?: boolean
  stickyCodeHeader?: boolean
}>(), {
  disableRich: false,
  stickyCodeHeader: true,
})
const emits = defineEmits(['outline'])

const editorDom = ref<HTMLElement>()
let editorInstance: Awaited<ReturnType<typeof Editor.make>> | null = null
let watchStopHandle: ReturnType<typeof watch> | null = null
let renderToken = 0
let renderTimer: ReturnType<typeof setTimeout> | null = null
let pendingContent = ''
let lastRenderedContent = ''
let richDestroy: (() => void) | null = null

const MARKDOWN_RENDER_FLUSH_MS = 16
const previewableCodeLangSet = new Set<string>()
const inlinePreviewCodeLangSet = new Set(['html', 'svg', 'mermaid', 'flowchart', 'mindmap'])
const mermaidCodeLangSet = new Set(['mermaid', 'flowchart'])
const expandableCodeLangSet = new Set(['html'])

function normalizeCodeLanguage(value: unknown): string {
  const language = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return language || 'text'
}

function createPreviewLoadingNode(className: string, text = '渲染中...') {
  const loading = document.createElement('div')
  loading.className = className
  const spinner = document.createElement('span')
  spinner.className = 'RichCodePreview-MermaidSpinner'
  spinner.setAttribute('aria-hidden', 'true')
  const loadingText = document.createElement('span')
  loadingText.textContent = text
  loading.appendChild(spinner)
  loading.appendChild(loadingText)
  return loading
}

async function renderMermaidInto(
  code: string,
  target: HTMLElement,
  options: {
    loadingClassName: string
    errorClassName: string
    isStale?: () => boolean
  },
) {
  const isStale = options.isStale
  const loading = createPreviewLoadingNode(options.loadingClassName, 'Mermaid 渲染中...')
  target.replaceChildren(loading)

  try {
    const renderResult = await renderMermaidSvg(code, {
      idPrefix: 'rich-code-mermaid-preview',
      isStale,
    })

    if (!renderResult || !target.isConnected || isStale?.()) {
      return
    }

    target.innerHTML = renderResult.svg
    renderResult.bindFunctions?.(target)
  }
  catch (error) {
    if (!target.isConnected || isStale?.()) {
      return
    }

    reportMermaidError('MilkContent', error)

    const errorView = document.createElement('pre')
    errorView.className = options.errorClassName
    errorView.textContent = `[Mermaid 渲染失败]\n${resolveMermaidErrorMessage(error)}`
    target.replaceChildren(errorView)
  }
}

async function renderMermaidPreview(code: string, target: HTMLElement) {
  await renderMermaidInto(code, target, {
    loadingClassName: 'RichCodePreview-MermaidStatus',
    errorClassName: 'RichCodePreview-MermaidError',
  })
}

async function renderMarkmapInto(
  code: string,
  target: HTMLElement,
  options: {
    loadingClassName: string
    errorClassName: string
    isStale?: () => boolean
    onReady?: (renderer: MarkmapRenderer) => void
  },
) {
  const isStale = options.isStale
  const loading = createPreviewLoadingNode(options.loadingClassName, 'Mindmap 渲染中...')
  target.replaceChildren(loading)

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.classList.add('EditorCode-InlineMindmapSvg')
  target.replaceChildren(svg)

  let renderer: MarkmapRenderer | null = null
  try {
    renderer = await createMarkmapRenderer(svg)
    if (isStale?.()) {
      renderer.destroy()
      return
    }

    renderer.update(code)
    options.onReady?.(renderer)
  }
  catch (error) {
    renderer?.destroy()
    if (!target.isConnected || isStale?.()) {
      return
    }

    reportMarkmapError('MilkContent', error)
    const errorView = document.createElement('pre')
    errorView.className = options.errorClassName
    errorView.textContent = `[Mindmap 渲染失败]\n${resolveMarkmapErrorMessage(error)}`
    target.replaceChildren(errorView)
  }
}

function renderSvgInto(code: string, target: HTMLElement, errorClassName: string) {
  const wrapper = document.createElement('div')
  wrapper.className = 'EditorCode-InlineSvgHost'
  wrapper.innerHTML = code
  const svg = wrapper.querySelector('svg')
  if (!svg) {
    const errorView = document.createElement('pre')
    errorView.className = errorClassName
    errorView.textContent = '[SVG 预览失败]\n未检测到有效的 <svg> 根节点。'
    target.replaceChildren(errorView)
    return
  }
  target.replaceChildren(wrapper)
}

function renderHtmlInto(code: string, target: HTMLElement) {
  const wrapper = document.createElement('div')
  wrapper.className = 'EditorCode-InlineHtmlHost'
  const iframe = document.createElement('iframe')
  iframe.className = 'EditorCode-InlineFrame'
  iframe.setAttribute('sandbox', 'allow-scripts')
  iframe.srcdoc = code
  wrapper.appendChild(iframe)
  target.replaceChildren(wrapper)
}

async function renderInlineCodePreview(
  language: string,
  code: string,
  target: HTMLElement,
  options: {
    isStale?: () => boolean
    onMarkmapReady?: (renderer: MarkmapRenderer) => void
  } = {},
) {
  if (mermaidCodeLangSet.has(language)) {
    await renderMermaidInto(code, target, {
      loadingClassName: 'EditorCode-InlinePreviewStatus',
      errorClassName: 'EditorCode-InlinePreviewError',
      isStale: options.isStale,
    })
    return
  }

  if (language === 'mindmap') {
    await renderMarkmapInto(code, target, {
      loadingClassName: 'EditorCode-InlinePreviewStatus',
      errorClassName: 'EditorCode-InlinePreviewError',
      isStale: options.isStale,
      onReady: options.onMarkmapReady,
    })
    return
  }

  const loading = createPreviewLoadingNode('EditorCode-InlinePreviewStatus')
  target.replaceChildren(loading)

  if (!target.isConnected || options.isStale?.()) {
    return
  }

  try {
    if (language === 'svg') {
      renderSvgInto(code, target, 'EditorCode-InlinePreviewError')
      return
    }
    if (language === 'html') {
      renderHtmlInto(code, target)
      return
    }
  }
  catch (error) {
    if (!target.isConnected || options.isStale?.()) {
      return
    }
    const errorView = document.createElement('pre')
    errorView.className = 'EditorCode-InlinePreviewError'
    errorView.textContent = `[预览失败]\n${resolveMermaidErrorMessage(error)}`
    target.replaceChildren(errorView)
    return
  }

  const errorView = document.createElement('pre')
  errorView.className = 'EditorCode-InlinePreviewError'
  errorView.textContent = `[预览失败]\n当前语言 ${language} 暂不支持内联预览。`
  target.replaceChildren(errorView)
}

function openCodePreview(language: string, code: string) {
  const legacyMasks = document.querySelectorAll<HTMLElement>('.RichCodePreview-Mask')
  legacyMasks.forEach(mask => mask.remove())
  const normalizedLanguage = normalizeCodeLanguage(language)

  const mask = document.createElement('div')
  mask.className = 'RichCodePreview-Mask'

  const panel = document.createElement('div')
  panel.className = 'RichCodePreview-Panel'

  const header = document.createElement('div')
  header.className = 'RichCodePreview-Header'

  const title = document.createElement('span')
  title.textContent = `${normalizedLanguage.toUpperCase()} 预览`

  const closeDom = document.createElement('button')
  closeDom.className = 'RichCodePreview-Close'
  closeDom.type = 'button'
  closeDom.textContent = '关闭'

  const body = document.createElement('div')
  body.className = 'RichCodePreview-Body'

  header.appendChild(title)
  header.appendChild(closeDom)

  if (mermaidCodeLangSet.has(normalizedLanguage)) {
    const mermaidWrapper = document.createElement('div')
    mermaidWrapper.className = 'RichCodePreview-Mermaid'
    body.appendChild(mermaidWrapper)
    void renderMermaidPreview(code, mermaidWrapper)
  }
  else {
    const iframe = document.createElement('iframe')
    iframe.className = 'RichCodePreview-Frame'
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.srcdoc = code
    body.appendChild(iframe)
  }

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

function createReadonlyCodeBlockView() {
  return (node: any) => {
    let currentNode = node
    let currentLanguage = ''
    let currentMode: 'preview' | 'code' = 'code'
    let headerApp: App<Element> | null = null
    let inlinePreviewRenderTimer: ReturnType<typeof setTimeout> | null = null
    let inlinePreviewRenderToken = 0
    let inlineMarkmapRenderer: MarkmapRenderer | null = null

    const dom = document.createElement('div')
    dom.className = 'rich-article EditorCode EditorCode--Readonly'
    if (props.stickyCodeHeader) {
      dom.classList.add('EditorCode--Sticky')
    }

    const chrome = document.createElement('div')
    chrome.className = 'EditorCode-Chrome'

    const headerHost = document.createElement('div')
    headerHost.className = 'EditorCode-HeaderHost'

    const content = document.createElement('div')
    content.className = 'EditorCode-Content'

    const pre = document.createElement('pre')
    const code = document.createElement('code')
    const inlinePreview = document.createElement('div')
    inlinePreview.className = 'EditorCode-InlinePreview'
    pre.appendChild(code)

    content.appendChild(pre)
    content.appendChild(inlinePreview)
    chrome.appendChild(headerHost)
    chrome.appendChild(content)
    dom.appendChild(chrome)

    function clearInlineMarkmapRenderer() {
      inlineMarkmapRenderer?.destroy()
      inlineMarkmapRenderer = null
    }

    function clearInlinePreviewRenderTimer() {
      if (!inlinePreviewRenderTimer) {
        return
      }
      clearTimeout(inlinePreviewRenderTimer)
      inlinePreviewRenderTimer = null
    }

    function invalidateInlinePreviewRender() {
      inlinePreviewRenderToken += 1
      clearInlinePreviewRenderTimer()
      clearInlineMarkmapRenderer()
    }

    function scheduleInlinePreviewRender() {
      if (!inlinePreviewCodeLangSet.has(currentLanguage) || currentMode !== 'preview') {
        return
      }

      clearInlinePreviewRenderTimer()
      inlinePreviewRenderTimer = setTimeout(() => {
        inlinePreviewRenderTimer = null
        const token = ++inlinePreviewRenderToken
        void renderInlineCodePreview(
          currentLanguage,
          code.textContent || '',
          inlinePreview,
          {
            isStale: () => {
              return token !== inlinePreviewRenderToken
                || !dom.isConnected
                || !inlinePreviewCodeLangSet.has(currentLanguage)
                || currentMode !== 'preview'
            },
            onMarkmapReady: (renderer) => {
              clearInlineMarkmapRenderer()
              inlineMarkmapRenderer = renderer
            },
          },
        )
      }, 0)
    }

    function applyMode() {
      const previewMode = inlinePreviewCodeLangSet.has(currentLanguage) && currentMode === 'preview'
      pre.style.display = previewMode ? 'none' : 'block'
      inlinePreview.style.display = previewMode ? 'flex' : 'none'

      if (previewMode) {
        scheduleInlinePreviewRender()
      }
      else {
        invalidateInlinePreviewRender()
      }
    }

    function updateMode(mode: 'preview' | 'code') {
      if (!inlinePreviewCodeLangSet.has(currentLanguage)) {
        return
      }
      currentMode = mode
      mountHeader()
      applyMode()
    }

    function mountHeader() {
      headerApp?.unmount()
      const useInlinePreview = inlinePreviewCodeLangSet.has(currentLanguage)
      headerApp = createApp(RenderCodeHeader, {
        language: currentLanguage,
        mode: currentMode,
        toggleable: useInlinePreview,
        expandable: currentMode === 'preview' && expandableCodeLangSet.has(currentLanguage),
        previewable: !useInlinePreview && previewableCodeLangSet.has(currentLanguage),
        codeResolver: () => code.textContent || '',
        onPreview: ({ language, code: previewCode }: { language: string, code: string }) => {
          openCodePreview(language, previewCode)
        },
        onModeChange: (mode: 'preview' | 'code') => {
          updateMode(mode)
        },
        onExpand: ({ language, code: previewCode }: { language: string, code: string }) => {
          openCodePreview(language, previewCode)
        },
      })
      headerApp.mount(headerHost)
    }

    function syncLanguage(nodeData: any) {
      const nextLanguage = normalizeCodeLanguage(nodeData?.attrs?.language)
      const languageChanged = nextLanguage !== currentLanguage
      currentLanguage = nextLanguage
      if (languageChanged) {
        currentMode = inlinePreviewCodeLangSet.has(currentLanguage) ? 'preview' : 'code'
      }
      code.className = ''
      code.classList.add(`language-${currentLanguage}`)
      mountHeader()
      applyMode()
      scheduleInlinePreviewRender()
    }

    syncLanguage(currentNode)

    return {
      dom,
      contentDOM: code,
      destroy: () => {
        invalidateInlinePreviewRender()
        headerApp?.unmount()
        headerApp = null
      },
      stopEvent: (event: Event) => {
        const target = event.target
        return target instanceof Element && Boolean(target.closest('.EditorCode-Header'))
      },
      update: (nextNode: any) => {
        if (nextNode.type !== currentNode.type) {
          return false
        }
        currentNode = nextNode
        syncLanguage(nextNode)
        scheduleInlinePreviewRender()
        return true
      },
    }
  }
}

function clearRenderTimer() {
  if (!renderTimer) {
    return
  }
  clearTimeout(renderTimer)
  renderTimer = null
}

async function applyMarkdownContent(content: string) {
  if (!editorInstance || content === lastRenderedContent) {
    return
  }

  const currentToken = ++renderToken

  try {
    editorInstance.action(replaceAll(content || ''))
  }
  catch (error) {
    const msg = typeof error?.message === 'string' ? error.message : ''
    if (!msg.includes('SchemaReady')) {
      throw error
    }

    await editorInstance.action(async (ctx) => {
      await ctx.wait(SchemaReady)
    })

    if (currentToken !== renderToken || !editorInstance)
      return

    editorInstance.action(replaceAll(content || ''))
  }

  if (currentToken !== renderToken || !editorInstance) {
    return
  }

  lastRenderedContent = content || ''

  if (props.disableRich)
    return

  setTimeout(() => {
    if (!editorInstance)
      return

    if (editorDom.value instanceof HTMLElement) {
      richDestroy = useRichArticle(editorDom.value)
    }

    const _outline = editorInstance.action(outline)(editorInstance.ctx)

    emits('outline', _outline)
  }, 10)
}

function flushPendingContent() {
  clearRenderTimer()
  if (!editorInstance) {
    return
  }
  void applyMarkdownContent(pendingContent)
}

function scheduleRenderContentFlush() {
  if (renderTimer) {
    return
  }
  renderTimer = setTimeout(() => {
    renderTimer = null
    flushPendingContent()
  }, MARKDOWN_RENDER_FLUSH_MS)
}

onMounted(async () => {
  editorInstance = await Editor.make()
    .config(nord)
    .config((ctx) => {
      ctx.set(defaultValueCtx, props.content || '')
      ctx.set(rootCtx, editorDom.value)

      ctx.set(katexOptionsCtx.key, {})

      ctx.update(editorViewOptionsCtx, prev => ({
        ...prev,
        editable: () => false,
      }))

      ctx.set(prismConfig.key, {
        configureRefractor: (refractor) => {
          refractor.register(markdown)
          refractor.register(css)
          refractor.register(javascript)
          refractor.register(typescript)
          refractor.register(jsx)
          refractor.register(tsx)
          refractor.register(cpp)
          refractor.register(c)
          refractor.register(python)
          refractor.register(java)
        },
      })
    })
    .use(commonmark)
    .use(gfm)
    .use(prism)
    .use(
      $view(codeBlockSchema.node, () => createReadonlyCodeBlockView()),
    )
    .use(math)
    .create()

  pendingContent = props.content || ''
  lastRenderedContent = props.content || ''

  watchStopHandle = watch(
    () => props.content,
    (content) => {
      pendingContent = content || ''
      if (!editorInstance)
        return
      scheduleRenderContentFlush()
    },
    { immediate: true },
  )
})

onBeforeUnmount(() => {
  clearRenderTimer()
  watchStopHandle?.()
  watchStopHandle = null
  richDestroy?.()
  richDestroy = null

  if (editorInstance) {
    void editorInstance.destroy()
    editorInstance = null
  }
})
</script>

<template>
  <div ref="editorDom" class="MilkContent markdown-body milkdown-theme-nord prose" />
</template>

<style lang="scss" src="./style.scss"></style>
