<script setup lang="ts">
import { defaultValueCtx, Editor, editorViewOptionsCtx, rootCtx } from '@milkdown/kit/core'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { history } from '@milkdown/kit/plugin/history'
import { listener } from '@milkdown/kit/plugin/listener'
import { slashFactory, SlashProvider } from '@milkdown/kit/plugin/slash'
import { tooltipFactory, TooltipProvider } from '@milkdown/kit/plugin/tooltip'
import { trailing } from '@milkdown/kit/plugin/trailing'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { replaceAll } from '@milkdown/kit/utils'
import { prism, prismConfig } from '@milkdown/plugin-prism'
import { nord } from '@milkdown/theme-nord'
import { Milkdown, useEditor } from '@milkdown/vue'
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
import '@milkdown/theme-nord/style.css'
import 'katex/dist/katex.min.css'
import 'prism-themes/themes/prism-nord.css'
import './style.scss'

const props = defineProps<{
  content: string
  readonly: boolean
}>()

function useSlashPluginView(_view: any) {
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

function tooltipPluginView(_view: any) {
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
