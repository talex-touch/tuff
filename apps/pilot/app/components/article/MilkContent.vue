<script setup>
import { defaultValueCtx, Editor, editorViewOptionsCtx, rootCtx, SchemaReady } from '@milkdown/core'
import { katexOptionsCtx, math } from '@milkdown/plugin-math'
import { prism, prismConfig } from '@milkdown/plugin-prism'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { nord } from '@milkdown/theme-nord'
import { outline, replaceAll } from '@milkdown/utils'
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
import { useRichArticle } from '~/composables/rich-article.ts'
import '@milkdown/theme-nord/style.css'
import '~/components/render/style.css'
import 'prism-themes/themes/prism-nord.css'
import 'katex/dist/katex.min.css'

const props = defineProps(['content', 'disableRich'])
const emits = defineEmits(['outline'])

const editorDom = ref()
let editorInstance = null
let watchStopHandle = null
let renderToken = 0

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
    .use(math)
    .create()

  watchStopHandle = watch(
    () => props.content,
    async (content) => {
      if (!editorInstance)
        return

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

      if (props.disableRich)
        return

      setTimeout(() => {
        if (!editorInstance)
          return

        useRichArticle(editorDom.value)

        const _outline = editorInstance.action(outline)(editorInstance.ctx)

        emits('outline', _outline)
      }, 10)
    },
    { immediate: true },
  )
})

onBeforeUnmount(() => {
  watchStopHandle?.()
  watchStopHandle = null

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
