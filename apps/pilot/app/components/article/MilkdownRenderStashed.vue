<script setup lang="ts">
import { Milkdown, useEditor } from '@milkdown/vue'
import { Editor, defaultValueCtx, editorViewOptionsCtx, rootCtx } from '@milkdown/kit/core'
import { nord } from '@milkdown/theme-nord'
import { imageBlockComponent } from '@milkdown/kit/component/image-block'
import { blockquoteKeymap, blockquoteSchema, codeBlockSchema, commonmark } from '@milkdown/kit/preset/commonmark'
import { codeBlockConfig } from '@milkdown/kit/component/code-block'
import { katexOptionsCtx, math } from '@milkdown/plugin-math'
import { gfm } from '@milkdown/kit/preset/gfm'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { history } from '@milkdown/kit/plugin/history'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { trailing } from '@milkdown/kit/plugin/trailing'
import { keymap as createKeymap } from '@milkdown/prose/keymap'
import { TooltipProvider, tooltipFactory } from '@milkdown/kit/plugin/tooltip'
import { SlashProvider, slashFactory } from '@milkdown/kit/plugin/slash'
import { prism, prismConfig } from '@milkdown/kit/plugin/prism'
import { $view, getMarkdown, outline, replaceAll } from '@milkdown/utils'
import { undoInputRule } from '@milkdown/prose/inputrules'
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
import { $endApi } from '~/composables/api/base'
import { globalOptions } from '~/constants'

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
      // ctx.set(defaultValueCtx, content.value)

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

      ctx.update(codeBlockConfig.key, defaultConfig => ({
        ...defaultConfig,
        view: nodeViewFactory({ component: EditorCodeBlock }),
      }))

      ctx.set(prismConfig.key, {
        configureRefractor: (refractor: any) => {
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
    // .use(math)
    .use(imageBlockComponent)
    // .use(
    //   $view(codeBlockSchema.node, () => nodeViewFactory({ component: EditorCodeBlock })),
    // )
    // .use(
    //   $view(blockquoteSchema.node, () => nodeViewFactory({ component: EditorBlockQuote })),
    // )
})

onMounted(() => {
  const exe = (num: number) => {
    if (!editor.get()) {
      if (num >= 15) {
        console.error('editor not ready (render)')
        return
      }

      setTimeout(() => exe(num + 1), 100)
      return
    }

    editor.get()?.action(replaceAll(props.content))
  }

  watchEffect(() => {
    const _ = [props.content]

    exe(0)
  })
})
</script>

<template>
  <Milkdown class="MilkContent" />
</template>
