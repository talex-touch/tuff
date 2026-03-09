<script setup lang="ts">
import { Milkdown, useEditor } from '@milkdown/vue'
import { Editor, defaultValueCtx, editorViewOptionsCtx, rootCtx } from '@milkdown/kit/core'
import { nord } from '@milkdown/theme-nord'
import { blockquoteSchema, codeBlockSchema, commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { listener } from '@milkdown/kit/plugin/listener'
import { history } from '@milkdown/kit/plugin/history'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { trailing } from '@milkdown/kit/plugin/trailing'
import { TooltipProvider, tooltipFactory } from '@milkdown/kit/plugin/tooltip'
import { SlashProvider, slashFactory } from '@milkdown/kit/plugin/slash'
import { prism, prismConfig } from '@milkdown/plugin-prism'
import { $view, replaceAll } from '@milkdown/kit/utils'
import '@milkdown/theme-nord/style.css'
import 'katex/dist/katex.min.css'
import 'prism-themes/themes/prism-nord.css'
import './style.scss'

import markdown from 'refractor/lang/markdown'
import css from 'refractor/lang/css'
import javascript from 'refractor/lang/javascript'
import typescript from 'refractor/lang/typescript'
import jsx from 'refractor/lang/jsx'
import tsx from 'refractor/lang/tsx'
import cpp from 'refractor/lang/cpp'
import c from 'refractor/lang/c'
import python from 'refractor/lang/python'
import java from 'refractor/lang/java'
import { useNodeViewFactory } from '@prosemirror-adapter/vue'
import EditorCodeBlock from '~/components/article/components/EditorCodeBlock.vue'
import EditorBlockQuote from '~/components/article/components/EditorBlockQuote.vue'

const props = defineProps<{
  content: string
  readonly: boolean
}>()

function useSlashPluginView(view: any) {
  const contentDom = document.createElement('div')

  const slashProvider = new SlashProvider({
    content: contentDom,
  })

  return {
    update: (updatedView: any, prevState: any) => {
      slashProvider.update(updatedView, prevState)
    },
    destroy: () => {
      slashProvider.destroy()
      contentDom.remove()
    },
  }
}

function tooltipPluginView(view: any) {
  const content = document.createElement('div')

  const provider = new TooltipProvider({
    content,
  })

  return {
    update: (updatedView: any, prevState: any) => {
      provider.update(updatedView, prevState)
    },
    destroy: () => {
      provider.destroy()
      content.remove()
    },
  }
}

const nodeViewFactory = useNodeViewFactory()

const slash = slashFactory('my-slash')
const tooltip = tooltipFactory('my-tooltip')

const editor = useEditor((root) => {
  return Editor.make()
    .config(nord)
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, props.content || '')

      ctx.update(editorViewOptionsCtx, prev => ({
        ...prev,
        editable: () => !props.readonly,
      }))

      ctx.set(slash.key, {
        view: useSlashPluginView,
      })

      ctx.set(tooltip.key, {
        view: tooltipPluginView,
      })

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
    .use(slash)
    .use(tooltip)
    .use(gfm)
    .use(clipboard)
    .use(history)
    .use(prism)
    .use(trailing)
    .use(listener)
    .use(
      $view(codeBlockSchema.node, () => nodeViewFactory({ component: EditorCodeBlock })),
    )
    .use(
      $view(blockquoteSchema.node, () => nodeViewFactory({ component: EditorBlockQuote })),
    )
})

function applyRenderContent(content: string) {
  const instance = editor.get()
  if (!instance)
    return

  instance.action(replaceAll(content || ''))
}

watch(
  () => editor.loading.value,
  (loading) => {
    if (loading)
      return

    applyRenderContent(props.content)
  },
  { immediate: true },
)

watch(
  () => props.content,
  (content) => {
    if (editor.loading.value)
      return

    applyRenderContent(content)
  },
  { immediate: true },
)
</script>

<template>
  <Milkdown class="MilkContent" />
</template>
