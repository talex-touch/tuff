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
import RenderCodeHeader from '~/components/article/components/RenderCodeHeader.vue'
import { useRichArticle } from '~/composables/rich-article'
import '@milkdown/theme-nord/style.css'
import '~/components/render/style.css'
import 'prism-themes/themes/prism-nord.css'
import 'katex/dist/katex.min.css'

const props = withDefaults(defineProps<{
  content: string
  disableRich?: boolean
}>(), {
  disableRich: false,
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
const previewableCodeLangSet = new Set(['html', 'svg'])

function normalizeCodeLanguage(value: unknown): string {
  const language = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return language || 'text'
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

function createReadonlyCodeBlockView() {
  return (node: any) => {
    let currentNode = node
    let currentLanguage = normalizeCodeLanguage(currentNode?.attrs?.language)
    let headerApp: App<Element> | null = null

    const dom = document.createElement('div')
    dom.className = 'rich-article EditorCode EditorCode--Readonly'

    const headerHost = document.createElement('div')
    headerHost.className = 'EditorCode-HeaderHost'

    const content = document.createElement('div')
    content.className = 'EditorCode-Content'

    const pre = document.createElement('pre')
    const code = document.createElement('code')
    pre.appendChild(code)

    content.appendChild(pre)
    dom.appendChild(headerHost)
    dom.appendChild(content)

    function mountHeader() {
      headerApp?.unmount()
      headerApp = createApp(RenderCodeHeader, {
        language: currentLanguage,
        previewable: previewableCodeLangSet.has(currentLanguage),
        codeResolver: () => code.textContent || '',
        onPreview: ({ language, code: previewCode }: { language: string, code: string }) => {
          openCodePreview(language, previewCode)
        },
      })
      headerApp.mount(headerHost)
    }

    function syncLanguage(nodeData: any) {
      currentLanguage = normalizeCodeLanguage(nodeData?.attrs?.language)
      code.className = ''
      code.classList.add(`language-${currentLanguage}`)
      mountHeader()
    }

    syncLanguage(currentNode)

    return {
      dom,
      contentDOM: code,
      destroy: () => {
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

async function applyMarkdownContent(content) {
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

      ctx.set(katexOptionsCtx.key, {

      })

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

<style lang="scss">
@import './style.scss';
</style>
